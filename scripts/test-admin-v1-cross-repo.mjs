// Execute the pinned Admin gateway -> VD handler -> real LOCAL PostgreSQL RPCs.
// No provider call, remote DB, real credential, or Admin repository write.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import ts from 'typescript';
import handler from '../server/platform/adminV1.js';

const root=process.env.VD_TEST_ADMIN_REPO;
if(!root)throw new Error('VD_TEST_ADMIN_REPO must point to the pinned, read-only Admin checkout');
const contract=JSON.parse(readFileSync('tests/fixtures/vd-admin-v1-contract.json','utf8'));
for(const [file,expected]of Object.entries(contract.sourceSha256)) {
  const source=readFileSync(resolve(root,file),'utf8').replace(/\r\n/g,'\n');
  assert.equal(createHash('sha256').update(source).digest('hex'),expected,'Admin contract changed: '+file);
}
const source=readFileSync(resolve(root,'src/server/gateway-core.ts'),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createGateway}=await import('data:text/javascript;base64,'+Buffer.from(output).toString('base64'));
const connectionString=process.env.VD_TEST_DATABASE_URL;
const endpoint=new URL(connectionString);
if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname))throw new Error('Refusing non-local database');
const driver=process.env.VD_TEST_PG_DRIVER;
const {default:pg}=await import(driver?pathToFileURL(resolve(driver)).href:'pg');
const pool=new pg.Pool({connectionString,max:6});
const originalEnv={...process.env};const originalFetch=globalThis.fetch;
const actor='b1000000-0000-4000-8000-000000000001';
const support='b1000000-0000-4000-8000-000000000002';
const reviewer='b1000000-0000-4000-8000-000000000003';
const user='b1000000-0000-4000-8000-000000000010';
const app='b2000000-0000-4000-8000-000000000001';
const token='local-contract-fixture';
let checked=0;
const check=(label)=>{checked++;console.log('CROSS_REPO PASS '+label);};
try {
  await pool.query(`insert into auth.users(id,email,created_at)
    select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'cross-v1-'||n||'@example.test',now() from generate_series(1,130) n;
    insert into public.admin_roles(user_id,role,created_by) values
    ('${actor}','owner','${actor}'),('${support}','support','${actor}'),('${reviewer}','reviewer','${actor}');
    insert into public.beta_applications(id,email,email_hash,name,role,use_case) values
    ('${app}','cross-app@example.test',repeat('b',64),'申请人','研究者','管理期限');`);
  const financialBefore=(await pool.query('select count(*)::integer subscriptions from public.subscriptions')).rows[0];
  Object.assign(process.env,{VD_ADMIN_INTERNAL_TOKEN:token,SUPABASE_URL:'https://local-db.invalid',SUPABASE_ANON_KEY:'fixture-anon',SUPABASE_SERVICE_ROLE_KEY:'fixture-service'});
  const statements={
    beta_admin_v1_read:['select public.beta_admin_v1_read($1,$2,$3::jsonb) value',a=>[a.p_actor,a.p_resource,JSON.stringify(a.p_query)]],
    beta_admin_v1_authorize:['select public.beta_admin_v1_authorize($1,$2,$3) value',a=>[a.p_actor,a.p_resource,a.p_write]],
    beta_admin_command:['select public.beta_admin_command($1,$2,$3,$4::jsonb) value',a=>[a.p_actor,a.p_request,a.p_action,JSON.stringify(a.p_input)]],
    beta_admin_v1_audit_receipt:['select public.beta_admin_v1_audit_receipt($1,$2) value',a=>[a.p_actor,a.p_request]],
  };
  globalThis.fetch=async(url,init)=>{
    const parsed=new URL(url);assert.equal(parsed.hostname,'local-db.invalid');
    const name=parsed.pathname.split('/').at(-1);const statement=statements[name];assert.ok(statement,'Unexpected RPC');
    const client=await pool.connect();
    try {
      await client.query('set role service_role');
      const value=(await client.query(statement[0],statement[1](JSON.parse(init.body)))).rows[0].value;
      return new Response(JSON.stringify(value),{status:200});
    }catch(error){return new Response(JSON.stringify({message:error.message}),{status:400});}
    finally{await client.query('reset role');client.release();}
  };
  const transport=async(url,init)=>{
    const request={url:new URL(url).pathname+new URL(url).search,method:init.method||'GET',headers:Object.fromEntries(new Headers(init.headers)),body:init.body?JSON.parse(init.body):undefined};
    const response={headers:{},status(code){this.statusCode=code;return this;},setHeader(k,v){this.headers[k]=v;return this;},end(body){this.body=body;}};
    await handler(request,response);assert.equal(response.headers['Cache-Control'],'no-store');
    return new Response(response.body,{status:response.statusCode,headers:response.headers});
  };
  const gateway=createGateway('https://local-vd.invalid/api/',token,transport);
  const owner={id:actor,role:'owner'};
  for(const resource of ['dashboard','users','beta-applications','invitations','entitlements','quotas','bans','audit','feedback','ai-usage','settings']){
    const page=await gateway.read(resource,owner,new URLSearchParams());assert.ok(Array.isArray(page.items));assert.ok(page.items.length<=100);check('actual Admin gateway accepts '+resource);
  }
  const settings=await gateway.read('settings',owner,new URLSearchParams());assert.deepEqual(settings.summary.adminGrantSupport.grantableTiers,['plus']);
  const ids=[];let cursor;
  do{const query=new URLSearchParams({q:'cross-v1-',limit:'50',...(cursor?{cursor}:{})});const page=await gateway.read('users',owner,query);ids.push(...page.items.map(row=>row.id));cursor=page.nextCursor;}while(cursor);
  assert.equal(ids.length,130);assert.equal(new Set(ids).size,130);assert.deepEqual(ids,[...ids].sort());check('actual gateway traverses all 130 users in 3 stable pages');
  const mutate=(resource,action,target,input={},who=owner,key=randomUUID())=>gateway.mutate(resource,action,who,target,'集成验证',input,key);
  const grant=await mutate('entitlements','grant',user,{tier:'plus',days:7,source:'beta_gift'});assert.equal(grant.result.effectivePlus,true);check('grant accepted with authoritative audit');
  const revoke=await mutate('entitlements','revoke',user,{grantId:grant.result.grantId});assert.equal(revoke.result.effectivePlus,false);check('owned revoke accepted');
  const key=randomUUID();
  const create=await mutate('invitations','create','new',{kind:'personal',limit:1},owner,key);
  assert.match(create.result.inviteCode,/^VD-[0-9A-F]{32}$/);
  assert.deepEqual(await mutate('invitations','create','new',{kind:'personal',limit:1},owner,key),create);check('invite exact original result + audit replay');
  await mutate('invitations','disable',create.result.inviteId);check('invite disable accepted');
  const secret=create.result.inviteCode;
  for(const resource of ['invitations','audit'])assert.ok(!JSON.stringify(await gateway.read(resource,owner,new URLSearchParams())).includes(secret));
  const general=(await pool.query('select result_json from public.admin_command_receipts where actor_user_id=$1 and request_id=$2',[actor,key])).rows[0];assert.ok(!JSON.stringify(general).includes(secret));check('plaintext absent from lists, audit and general receipt');
  for(const action of ['shortlist','approve','reject']){const result=await mutate('beta-applications',action,app,{}, {id:reviewer,role:'owner'});assert.equal(result.auditEvent.actor,reviewer);check('reviewer application '+action);}
  for(const [action,input]of [['adjust',{delta:20}],['reset',{}]]){const result=await mutate('quotas',action,user,input);assert.equal(typeof result.result.remaining,'number');check('quota '+action+' same authoritative snapshot');}
  for(const [action,input]of [['restrict',{}],['suspend',{days:7}],['ban',{}],['unban',{}]]){const result=await mutate('bans',action,user,input);assert.equal(result.auditEvent.target,user);check('account '+action+' exact user-target receipt');}
  const concurrentKey=randomUUID();
  const duplicates=await Promise.all(Array.from({length:5},()=>mutate('entitlements','grant',user,{days:7},owner,concurrentKey)));
  for(const result of duplicates)assert.deepEqual(result,duplicates[0]);
  const counts=(await pool.query(`select (select count(*)::integer from public.admin_command_receipts where actor_user_id=$1 and request_id=$2) receipts,
    (select count(*)::integer from public.admin_audit_log where actor_user_id=$1 and request_id=$2) audits`,[actor,concurrentKey])).rows[0];assert.deepEqual(counts,{receipts:1,audits:1});check('5 concurrent Admin gateway retries produce one mutation and original audit');
  await assert.rejects(mutate('entitlements','grant',user,{days:30},owner,concurrentKey),error=>error.status===409);check('changed command/key reuse rejected 409');
  await assert.rejects(mutate('entitlements','grant',user,{tier:'pro',days:7}),error=>error.status===409);check('Pro rejected 409');
  await assert.rejects(mutate('beta-applications','approve-and-email',app),error=>error.status===409);check('email pending rejected 409');
  await gateway.read('users',{id:support,role:'owner'},new URLSearchParams());
  await assert.rejects(mutate('entitlements','grant',user,{days:7},{id:support,role:'owner'}),error=>error.status===403);check('forged owner header cannot elevate support actor');
  // Revoke while a retry has passed initial authorization but waits on the
  // authoritative advisory lock. It must reauthorize before recovering secrets.
  const holder=await pool.connect();
  try {
    await holder.query('begin');
    await holder.query("select pg_advisory_xact_lock(hashtextextended('admin-command:'||$1::text||':'||$2::text,0))",[actor,key]);
    const queued=mutate('invitations','create','new',{kind:'personal',limit:1},owner,key);
    // Attach the rejection handler immediately, before releasing the lock.
    const denied=assert.rejects(queued,error=>error.status===403);
    let blocked=false;
    for(let n=0;n<100&&!blocked;n++){
      const waits=(await pool.query("select count(*)::integer n from pg_stat_activity where datname=current_database() and wait_event='advisory' and query like '%beta_admin_command%'")).rows[0];
      blocked=waits.n>0;if(!blocked)await new Promise(resolveWait=>setTimeout(resolveWait,20));
    }
    assert.ok(blocked,'queued retry must actually wait on PostgreSQL advisory lock');
    await pool.query('update public.admin_roles set enabled=false where user_id=$1',[actor]);
    await holder.query('commit');await denied;check('actor revoked during advisory wait cannot recover original invite plaintext');
  }finally{await holder.query('rollback');holder.release();}
  await assert.rejects(mutate('invitations','create','new',{kind:'personal',limit:1},owner,key),error=>error.status===403);check('revoked actor cannot replay plaintext');
  const financialAfter=(await pool.query('select count(*)::integer subscriptions from public.subscriptions')).rows[0];assert.deepEqual(financialAfter,financialBefore);check('Admin integration never creates/deletes provider subscriptions');
  console.log(`ADMIN_CROSS_REPO PASS ${checked} checks; pinned ${contract.adminCommit}; real local SQL; no remote/provider calls`);
}finally{globalThis.fetch=originalFetch;process.env=originalEnv;await pool.end();}
