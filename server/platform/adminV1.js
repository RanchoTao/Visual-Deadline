import { createHash, timingSafeEqual } from 'node:crypto';
import { readEnv, readJson, sendJson, serviceJson } from './runtime.js';
import { projectRead, projectReceipt } from './adminV1Projection.js';
import { CONTRACT, UUID, AdminV1Error, mapCommand } from './adminV1Commands.js';
export { CONTRACT, UUID, AdminV1Error };
export function header(request, name) {
  const key = Object.keys(request.headers || {}).find((item) => item.toLowerCase() === name.toLowerCase());
  return typeof request.headers?.[key] === 'string' ? request.headers[key] : '';
}
// The rewrite marker selects a protocol, not an authentication boundary. The
// delegated handler still requires the internal token, contract, actor and DB role.
export function isAdminV1Request(request) {
  const url = new URL(request.url, 'http://internal.invalid');
  if (/^\/api\/v1\/admin\/([a-z-]+)(\/actions)?$/.test(url.pathname)) return true;
  if (url.pathname !== '/api/admin' || header(request, 'x-admin-contract') !== CONTRACT) return false;
  const values = url.searchParams.getAll('vdAdminV1');
  const value = request.query?.vdAdminV1;
  if (values.length > 1 || Array.isArray(value)) return false;
  if (value !== undefined && typeof value !== 'string') return false;
  if (values.length && value !== undefined && values[0] !== value) return false;
  return (value ?? values[0]) === 'true';
}
export function authenticateInternal(request) {
  const match = header(request,'authorization').match(/^Bearer ([^\s]+)$/i);
  if (!match) throw new AdminV1Error(401,'INTERNAL_AUTH_REQUIRED','需要内部服务凭据。');
  const expected = readEnv('VD_ADMIN_INTERNAL_TOKEN');
  if (!expected) throw new AdminV1Error(503,'INTERNAL_AUTH_NOT_CONFIGURED','内部管理服务尚未配置。');
  const digest = (value) => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(digest(match[1]),digest(expected))) throw new AdminV1Error(401,'INTERNAL_AUTH_INVALID','内部服务凭据无效。');
  if (header(request,'x-admin-contract') !== CONTRACT) throw new AdminV1Error(426,'ADMIN_CONTRACT_UNSUPPORTED','管理接口版本不受支持。');
  const actor = header(request,'x-admin-actor');
  if (!UUID.test(actor)) throw new AdminV1Error(400,'ADMIN_ACTOR_INVALID','需要有效的管理员编号。');
  // X-Admin-Role is intentionally ignored. SQL resolves enabled roles + Auth identity.
  return actor.toLowerCase();
}
export const rpc = (name, body) => serviceJson('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify(body)});
function parseRoute(request) {
  const url = new URL(request.url,'http://internal.invalid');
  // Vercel may expose rewritten query fields on req.query rather than req.url.
  for(const key of ['q','cursor','id','status','cohort','limit']) {
    const value=request.query?.[key];
    if(Array.isArray(value)||url.searchParams.getAll(key).length>1) throw new AdminV1Error(400,'ADMIN_QUERY_INVALID');
    if(!url.searchParams.has(key)&&typeof value==='string') url.searchParams.set(key,value);
  }
  const match = url.pathname.match(/^\/api\/v1\/admin\/([a-z-]+)(\/actions)?$/);
  if (match) return {resource:match[1],actions:Boolean(match[2]),query:url.searchParams};
  // Keep the former internal parser shape for contract fixtures; it is no longer
  // a deployed physical function. The shared entrypoint needs the explicit marker.
  if (url.pathname !== '/api/admin-v1' && !(url.pathname === '/api/admin' && isAdminV1Request(request))) throw new AdminV1Error(404,'ADMIN_RESOURCE_UNSUPPORTED');
  const single = (key) => {
    const value = request.query?.[key] ?? url.searchParams.get(key);
    if (Array.isArray(value) || url.searchParams.getAll(key).length>1) throw new AdminV1Error(400,'ADMIN_INPUT_INVALID');
    if (request.query?.[key] !== undefined && url.searchParams.has(key) && request.query[key] !== url.searchParams.get(key)) throw new AdminV1Error(400,'ADMIN_INPUT_INVALID');
    return value;
  };
  const resource=single('vdResource');
  if(typeof resource!=='string'||!/^[-a-z]+$/.test(resource)) throw new AdminV1Error(400,'ADMIN_RESOURCE_UNSUPPORTED');
  return {resource,actions:single('vdOperation')==='actions',query:url.searchParams};
}
const fingerprint = (resource,filters) => createHash('sha256').update(JSON.stringify([resource,filters])).digest('hex');
export function parseReadQuery(resource, query) {
  const limit = query.has('limit') ? Number(query.get('limit')) : 50;
  if (!Number.isInteger(limit) || limit<1 || limit>100) throw new AdminV1Error(400,'ADMIN_QUERY_INVALID');
  const filters = {id:query.get('id')||null,q:query.get('q')||null,status:query.get('status')||null,cohort:query.get('cohort')||null,limit};
  if ((filters.id && !UUID.test(filters.id)) || (filters.cohort && !UUID.test(filters.cohort)) || (filters.q?.length>200) || (filters.status?.length>40)) throw new AdminV1Error(400,'ADMIN_QUERY_INVALID');
  const hash = fingerprint(resource,filters); let after = null;
  if (query.has('cursor')) {
    try {
      if (query.get('cursor').length>256) throw new Error();
      const cursor = JSON.parse(Buffer.from(query.get('cursor'),'base64url').toString());
      if (cursor.v!==1 || cursor.h!==hash || !UUID.test(cursor.id)) throw new Error();
      after=cursor.id;
    } catch { throw new AdminV1Error(400,'ADMIN_CURSOR_INVALID','分页游标无效或不属于此查询。'); }
  }
  return {filters,after,hash};
}
function readiness() {
  const configured = (key) => Boolean(readEnv(key));
  // Presence is configuration evidence, NOT staging/provider acceptance.
  return {
    deepseek:{configured:configured('DEEPSEEK_API_KEY'),ready:null},
    turnstile:{configured:configured('TURNSTILE_SECRET_KEY'),ready:null},
    email:{ready:null,status:'EMAIL_INTEGRATION_PENDING'},
    paddle:{ready:null,rolloutEnabled:readEnv('VD_RECURRING_BILLING_ENABLED')==='true'},
    durableRateLimit:{ready:false,status:'RATE_LIMIT_UNAVAILABLE'},
  };
}
export default async function handler(request,response) {
  let id;
  try {
    const actor=authenticateInternal(request); const route=parseRoute(request);
    if (request.method==='GET' && !route.actions) {
      const parsed=parseReadQuery(route.resource,route.query);
      const result=await rpc('beta_admin_v1_read',{p_actor:actor,p_resource:route.resource,p_query:{...parsed.filters,after:parsed.after}});
      const page=projectRead(route.resource,result);
      if(result.nextId) page.nextCursor=Buffer.from(JSON.stringify({v:1,h:parsed.hash,id:result.nextId})).toString('base64url');
      if(route.resource==='settings') page.summary={...page.summary,providerReadiness:readiness()};
      return sendJson(response,200,page);
    }
    if (request.method!=='POST' || !route.actions) throw new AdminV1Error(405,'ADMIN_METHOD_UNSUPPORTED');
    let body;
    try { body=await readJson(request); } catch(error) {
      if(error instanceof SyntaxError) throw new AdminV1Error(400,'ADMIN_INPUT_INVALID');
      throw error;
    }
    if (!body || typeof body!=='object' || Array.isArray(body) || JSON.stringify(body).length>30000) throw new AdminV1Error(400,'ADMIN_INPUT_INVALID');
    const key=header(request,'idempotency-key'); const supplied=body.requestId;
    if ((key && !UUID.test(key)) || (supplied!==undefined && (typeof supplied!=='string'||!UUID.test(supplied))) || (!key && !supplied)) throw new AdminV1Error(400,'IDEMPOTENCY_KEY_REQUIRED');
    if (key && supplied && key.toLowerCase()!==supplied.toLowerCase()) throw new AdminV1Error(400,'IDEMPOTENCY_KEY_MISMATCH');
    id=(key||supplied).toLowerCase();
    await rpc('beta_admin_v1_authorize',{p_actor:actor,p_resource:route.resource,p_write:true});
    const command=mapCommand(route.resource,body);
    const original=await rpc('beta_admin_command',{p_actor:actor,p_request:id,p_action:command.action,p_input:command.input});
    const audit=await rpc('beta_admin_v1_audit_receipt',{p_actor:actor,p_request:id});
    return sendJson(response,200,projectReceipt(route.resource,body,original,audit,actor,id),id);
  } catch(error) {
    const codes={ADMIN_REQUIRED:403,OWNER_REQUIRED:403,ACCOUNT_BLOCKED:403,ADMIN_FORBIDDEN:403,ADMIN_INPUT_INVALID:400,ADMIN_QUERY_INVALID:400,ADMIN_RESOURCE_UNSUPPORTED:501,ADMIN_COMMAND_UNSUPPORTED:501,EMAIL_INTEGRATION_PENDING:409,RESTRICTED_CONTENT_DISABLED:403,IDEMPOTENCY_KEY_REUSED:409,ADMIN_NOT_FOUND:404,AUDIT_RECEIPT_MISSING:502,PERMANENT_TESTING_ONLY:400,PRO_NOT_SUPPORTED:409,PLATFORM_STORAGE_NOT_CONFIGURED:503};
    const storageCode=error?.body?.code;
    const code=error instanceof AdminV1Error?error.code:Object.hasOwn(codes,error?.message)?error.message:
      typeof storageCode==='string'&&(storageCode.startsWith('22')||storageCode==='23514')?'ADMIN_INPUT_INVALID':
      storageCode==='23503'?'ADMIN_NOT_FOUND':'ADMIN_UPSTREAM_UNAVAILABLE';
    return sendJson(response,error instanceof AdminV1Error?error.status:codes[code]||502,{code,error:error instanceof AdminV1Error?error.message:'管理服务拒绝请求，请凭请求编号核查。'},id);
  }
}
