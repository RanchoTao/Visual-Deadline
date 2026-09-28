import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFileSync } from 'node:fs';
import handler, { parseReadQuery } from '../server/platform/adminV1.js';
import { mapCommand } from '../server/platform/adminV1Commands.js';
import { projectRead, projectReceipt } from '../server/platform/adminV1Projection.js';

const contract=JSON.parse(readFileSync(new URL('./fixtures/vd-admin-v1-contract.json',import.meta.url)));
const actor='11111111-1111-4111-8111-111111111111';
const user='33333333-3333-4333-8333-333333333333';
const record='44444444-4444-4444-8444-444444444444';
const requestId='77777777-7777-4777-8777-777777777777';
const originalEnv={...process.env}; const originalFetch=globalThis.fetch;
let calls=[]; let backend;
before(()=>{
  Object.assign(process.env,{VD_ADMIN_INTERNAL_TOKEN:'fixture-internal-token',SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'});
  globalThis.fetch=async(url,init)=>{
    const name=new URL(url).pathname.split('/').at(-1); const args=JSON.parse(init.body); calls.push({name,args});
    try { return new Response(JSON.stringify(await backend(name,args)),{status:200}); }
    catch(error) { return new Response(JSON.stringify({message:error.message}),{status:400}); }
  };
});
after(()=>{globalThis.fetch=originalFetch; process.env=originalEnv;});
async function invoke(resource,{method='GET',headers={},body,query='',path,requestQuery}={}) {
  const req={url:path||`/api/v1/admin/${resource}${method==='POST'?'/actions':''}${query}`,method,body,query:requestQuery,headers:{authorization:'Bearer fixture-internal-token','x-admin-actor':actor,'x-admin-role':'owner','x-admin-contract':'vd-admin-v1',...headers}};
  const res={headers:{},status(code){this.statusCode=code;return this;},setHeader(key,value){this.headers[key]=value;return this;},end(value){this.body=JSON.parse(value);}};
  await handler(req,res); assert.equal(res.headers['Cache-Control'],'no-store'); return res;
}
const quota={tier:'free',base:20,extra:10,used:3,remaining:27,unlimited:false,period_end:'2026-10-01T00:00:00Z'};
const userRow={id:user,email:'fixture@example.test',display_name:'契约样例',created_at:'2026-09-28T00:00:00Z',signup_cohort_id:null,signup_source:'invite',account_status:'active',effective:{allowed:false,sources:[]},quota,admin_grants:[]};
const sourceRows={
  users:userRow,entitlements:userRow,quotas:userRow,
  'beta-applications':{id:record,email:'fixture@example.test',name:'申请人',role:'开发者',use_case:'期限规划',status:'pending'},
  invitations:{id:record,display_prefix:'VD-ABCD',enabled:true,used_count:0,max_uses:1,kind:'personal'},
  bans:{id:record,user_id:user,status:'banned'},
  audit:{id:record,actor_user_id:actor,action:'membership_grant',target_id:user,created_at:'2026-09-28T00:00:00Z',request_id:requestId},
  feedback:{id:record,user_id:user,type:'bug',status:'new'},
  'ai-usage':{id:record,user_id:user,provider:'deepseek',model:'deepseek-chat',feature:'review',cost_status:'unknown',estimated_cost_minor:null,status:'succeeded'},
};
for(const [description,headers,status,code] of [
  ['missing token',{authorization:''},401,'INTERNAL_AUTH_REQUIRED'],
  ['wrong token',{authorization:'Bearer other-fixture'},401,'INTERNAL_AUTH_INVALID'],
  ['browser access token',{authorization:'Bearer browser-fixture'},401,'INTERNAL_AUTH_INVALID'],
  ['missing contract',{'x-admin-contract':''},426,'ADMIN_CONTRACT_UNSUPPORTED'],
  ['wrong contract',{'x-admin-contract':'vd-admin-v2'},426,'ADMIN_CONTRACT_UNSUPPORTED'],
  ['missing actor',{'x-admin-actor':''},400,'ADMIN_ACTOR_INVALID'],
  ['invalid actor',{'x-admin-actor':'owner'},400,'ADMIN_ACTOR_INVALID'],
]) test(`Admin v1 rejects ${description} before any DB read`,async()=>{
  calls=[]; const res=await invoke('users',{headers}); assert.equal(res.statusCode,status); assert.equal(res.body.code,code); assert.equal(calls.length,0);
});
test('unconfigured internal credential fails closed',async()=>{
  delete process.env.VD_ADMIN_INTERNAL_TOKEN;
  try {assert.equal((await invoke('users')).body.code,'INTERNAL_AUTH_NOT_CONFIGURED');}
  finally{process.env.VD_ADMIN_INTERNAL_TOKEN='fixture-internal-token';}
});
for(const code of ['ADMIN_REQUIRED','ADMIN_FORBIDDEN','ACCOUNT_BLOCKED'])test(`authoritative ${code} wins over forged owner header`,async()=>{
  backend=()=>{throw new Error(code);}; const res=await invoke('users');assert.equal(res.statusCode,403);assert.equal(res.body.code,code);
});
for(const resource of ['dashboard',...Object.keys(sourceRows),'settings'])test(`Admin v1 ${resource} matches exported read contract`,async()=>{
  backend=(name,args)=>{assert.equal(name,'beta_admin_v1_read');assert.equal(args.p_actor,actor);assert.equal(args.p_resource,resource);return {items:sourceRows[resource]?[{...sourceRows[resource],code_hash:'PRIVATE',password:'PRIVATE',task_content:'PRIVATE',raw_jwt:'PRIVATE'}]:[],observedAt:'2026-09-28T00:00:00Z',summary:resource==='settings'?contract.samples.settings.summary:undefined};};
  const res=await invoke(resource);assert.equal(res.statusCode,200);
  for(const key of contract.read.required)assert.ok(Object.hasOwn(res.body,key));
  for(const row of res.body.items)assert.equal(typeof row.id,'string');
  assert.ok(!JSON.stringify(res.body).includes('PRIVATE'));
  if(resource==='settings'){assert.deepEqual(res.body.summary.adminGrantSupport.grantableTiers,['plus']);assert.equal(res.body.summary.providerReadiness.deepseek.ready,null);}
});
test('rewritten Function route preserves resource and read filters',async()=>{
  backend=(name,args)=>{assert.equal(args.p_resource,'users');assert.equal(args.p_query.q,'样例');return {items:[],observedAt:'2026-09-28T00:00:00Z'};};
  assert.equal((await invoke('users',{path:'/api/admin-v1?vdResource=users&q=%E6%A0%B7%E4%BE%8B'})).statusCode,200);
});
test('Vercel req.query-only filters survive internal rewrite without ambiguous arrays',async()=>{
  backend=(name,args)=>{assert.equal(args.p_query.q,'样例');assert.equal(args.p_query.limit,25);return {items:[]};};
  assert.equal((await invoke('users',{path:'/api/admin-v1',requestQuery:{vdResource:'users',q:'样例',limit:'25'}})).statusCode,200);
  assert.equal((await invoke('users',{path:'/api/admin-v1',requestQuery:{vdResource:'users',q:['a','b']}})).statusCode,400);
});
test('keyset cursor traverses beyond 100 records, remains ordered and filter-bound',async()=>{
  const ids=Array.from({length:123},(_,n)=>`88888888-0000-4000-8000-${String(n+1).padStart(12,'0')}`);
  backend=(name,args)=>{const rows=ids.filter(id=>!args.p_query.after||id>args.p_query.after);return {items:rows.slice(0,args.p_query.limit).map(id=>({...userRow,id})),nextId:rows.length>args.p_query.limit?rows[args.p_query.limit-1]:null};};
  const loaded=[];let cursor;
  do{const res=await invoke('users',{query:`?limit=50${cursor?'&cursor='+cursor:''}`});assert.equal(res.statusCode,200);loaded.push(...res.body.items.map(r=>r.id));cursor=res.body.nextCursor;}while(cursor);
  assert.deepEqual(loaded,ids);assert.equal(new Set(loaded).size,123);
  const page=await invoke('users',{query:'?limit=50'});
  assert.equal((await invoke('users',{query:'?limit=50&q=changed&cursor='+page.body.nextCursor})).body.code,'ADMIN_CURSOR_INVALID');
  assert.equal((await invoke('audit',{query:'?limit=50&cursor='+page.body.nextCursor})).body.code,'ADMIN_CURSOR_INVALID');
});
for(const query of ['limit=101','limit=0','id=invalid','cohort=invalid','cursor=garbage'])test(`invalid read query ${query}`,()=>{
  assert.throws(()=>parseReadQuery('users',new URLSearchParams(query)),error=>error.status===400);
});
const cases=[
  ['entitlements','grant',user,{days:7,source:'beta_gift'},'grant_entitlement'],
  ['entitlements','revoke',user,{grantId:record},'revoke_entitlement'],
  ['invitations','create','new',{kind:'personal',limit:1},'create_invite'],
  ['invitations','disable',record,{},'disable_invite'],
  ['invitations','revoke',record,{},'disable_invite'],
  ['beta-applications','shortlist',record,{},'review_application'],
  ['beta-applications','approve',record,{},'review_application'],
  ['beta-applications','reject',record,{},'review_application'],
  ['quotas','adjust',user,{delta:20},'grant_quota'],
  ['quotas','reset',user,{},'reset_quota'],
  ['bans','restrict',user,{},'set_account_control'],
  ['bans','suspend',user,{days:7},'set_account_control'],
  ['bans','ban',user,{},'set_account_control'],
  ['bans','unban',user,{},'unban'],
];
function resultFor(action,input){
  if(action==='grant_entitlement'||action==='revoke_entitlement')return {grant:{id:record},effective:{allowed:true,validUntil:null}};
  if(action==='create_invite'||action==='disable_invite')return {invite:{id:record,enabled:action==='create_invite',code:'VD-'+ 'A'.repeat(32),expires_at:null}};
  if(action==='review_application')return {application:{status:input.status}};
  if(action==='grant_quota'||action==='reset_quota')return {quota};
  return {control:{status:input.status||'active',expires_at:null}};
}
for(const [resource,action,target,input,domainAction]of cases)test(`Admin ${resource}/${action} dispatches existing command and returns committed audit`,async()=>{
  const body={action,target,reason:'操作理由',input,requestId};let committed;calls=[];
  backend=(name,args)=>{
    if(name==='beta_admin_v1_authorize')return 'owner';
    if(name==='beta_admin_command'){assert.equal(args.p_action,domainAction);assert.equal(args.p_request,requestId);committed={id:record,actor_user_id:actor,request_id:requestId,adapter_command:args.p_input._adminV1,created_at:'2026-09-28T00:00:00Z',before_json:{status:'old',code_hash:'PRIVATE'},after_json:{status:'new',note:'PRIVATE'}};return resultFor(domainAction,args.p_input);}
    assert.equal(name,'beta_admin_v1_audit_receipt');return committed;
  };
  const res=await invoke(resource,{method:'POST',body,headers:{'idempotency-key':requestId}});assert.equal(res.statusCode,200);
  assert.deepEqual(calls.map(c=>c.name),['beta_admin_v1_authorize','beta_admin_command','beta_admin_v1_audit_receipt']);
  for(const key of contract.mutation.required)assert.ok(Object.hasOwn(res.body,key));
  for(const key of contract.mutation.auditRequired)assert.ok(Object.hasOwn(res.body.auditEvent,key));
  assert.equal(res.body.auditEvent.actor,actor);assert.equal(res.body.auditEvent.action,action);assert.equal(res.body.auditEvent.target,target);assert.equal(res.body.auditEvent.reason,body.reason);
  assert.ok(!JSON.stringify(res.body).includes('PRIVATE'));
  if(action!=='create')assert.ok(!JSON.stringify(res.body).includes('VD-'+ 'A'.repeat(32)));
});
test('audit receipt is mandatory, not manufactured from request',async()=>{
  const body={action:'grant',target:user,reason:'理由',input:{days:7},requestId};
  backend=(name,args)=>name==='beta_admin_v1_authorize'?'owner':name==='beta_admin_command'?resultFor(args.p_action,args.p_input):null;
  const res=await invoke('entitlements',{method:'POST',body});assert.equal(res.statusCode,502);assert.equal(res.body.code,'AUDIT_RECEIPT_MISSING');assert.equal(res.body.auditEvent,undefined);
});
test('mismatched committed audit cannot be relabeled from a later request',()=>{
  const body={action:'grant',target:user,reason:'理由',input:{days:7}};
  const row={id:record,actor_user_id:actor,request_id:requestId,created_at:'2026-09-28T00:00:00Z',adapter_command:{contract:'vd-admin-v1',resource:'entitlements',action:'grant',target:user,reason:'other'}};
  assert.throws(()=>projectReceipt('entitlements',body,{grant:{id:record}},row,actor,requestId),/AUDIT_RECEIPT_MISSING/);
});
test('key/body UUID mismatch is rejected without mutation',async()=>{
  calls=[];const res=await invoke('quotas',{method:'POST',headers:{'idempotency-key':record},body:{requestId,action:'reset',target:user,reason:'理由',input:{}}});assert.equal(res.body.code,'IDEMPOTENCY_KEY_MISMATCH');assert.equal(calls.length,0);
});
test('explicit unsupported actions and Pro fail closed before dispatcher',async()=>{
  backend=()=> 'owner';
  for(const [resource,action,input,code]of [['entitlements','grant',{tier:'pro',days:7},'PRO_NOT_SUPPORTED'],['beta-applications','approve-and-email',{},'EMAIL_INTEGRATION_PENDING'],['beta-applications','resend',{},'EMAIL_INTEGRATION_PENDING'],['email','resend',{},'EMAIL_INTEGRATION_PENDING'],['invitations','enable',{},'ADMIN_COMMAND_UNSUPPORTED'],['invitations','expire',{},'ADMIN_COMMAND_UNSUPPORTED']]){
    calls=[];const res=await invoke(resource,{method:'POST',body:{action,target:user,reason:'理由',input,requestId}});assert.ok(res.statusCode>=400&&res.statusCode<500);assert.equal(res.body.code,code);assert.ok(!calls.some(c=>c.name==='beta_admin_command'));
  }
});
test('unknown resource and restricted content remain disabled',async()=>{
  backend=(name,args)=>{throw new Error(args.p_resource==='restricted-content'?'RESTRICTED_CONTENT_DISABLED':'ADMIN_RESOURCE_UNSUPPORTED');};
  assert.equal((await invoke('restricted-content')).statusCode,403);assert.equal((await invoke('infrastructure')).statusCode,501);
});
test('unsafe grant/absolute quota/provider writes are not accepted',()=>{
  for(const [resource,action,input]of [['entitlements','grant',{days:7,subscriptionId:record}],['entitlements','grant',{days:7,source:'subscription'}],['quotas','adjust',{limit:200}],['quotas','adjust',{delta:-20}],['entitlements','revoke',{}]])assert.throws(()=>mapCommand(resource,{action,target:user,reason:'理由',input}));
});
test('safe projection preserves union evidence and unknown cost, hides all private fields',()=>{
  const rows=projectRead('users',{items:[{...userRow,effective:{allowed:true,validUntil:null,sources:[{id:record,source_type:'legacy_membership',source_id:'legacy',status:'active',valid_until:null}]},quota:{...quota,unlimited:true}}]});
  assert.equal(rows.items[0].effectiveTier,'plus');assert.equal(rows.items[0].entitlementSources[0].source,'legacy_membership');assert.equal(rows.items[0].limit,null);assert.equal(rows.items[0].lastActiveAt,null);
  const page=projectRead('ai-usage',{items:[sourceRows['ai-usage']],summary:{secret:'PRIVATE',aiEstimatedCostToday:null}});assert.equal(page.items[0].estimatedCost,null);assert.deepEqual(page.summary,{aiEstimatedCostToday:null});
});
test('exported fixtures have exact receipt/read shape expected by pinned Admin gateway',()=>{
  for(const name of ['users','invitations','settings'])assert.ok(Array.isArray(contract.samples[name].items));
  const receipt=contract.samples.grant;for(const key of contract.mutation.auditRequired)assert.ok(Object.hasOwn(receipt.auditEvent,key));
  assert.equal(typeof receipt.result,'object');assert.equal(receipt.auditEvent.actor,actor);
  assert.ok(Number.isFinite(Date.parse(receipt.auditEvent.timestamp)));
  assert.deepEqual(Object.keys(receipt).sort(),[...contract.mutation.required].sort());
});
