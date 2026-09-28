export const CONTRACT = 'vd-admin-v1';
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AdminV1Error extends Error {
  constructor(status, code, message = '管理请求无法执行。') { super(message); this.status = status; this.code = code; }
}

const reject=(code='ADMIN_COMMAND_UNSUPPORTED')=>{throw new AdminV1Error(code==='PRO_NOT_SUPPORTED'?409:400,code);};
const date=(value)=>value===undefined || (typeof value==='string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)));
export function mapCommand(resource,body) {
  const {action,target,reason,input}=body;
  if(typeof action!=='string'||typeof target!=='string'||typeof reason!=='string'||!reason.trim()||reason.length>500||!input||typeof input!=='object'||Array.isArray(input)) reject('ADMIN_INPUT_INVALID');
  if(resource==='restricted-content') reject('RESTRICTED_CONTENT_DISABLED');
  if(resource==='email'||(resource==='beta-applications'&&['approve-and-email','resend'].includes(action))) throw new AdminV1Error(409,'EMAIL_INTEGRATION_PENDING','邮件事务尚未接入，未执行操作。');
  if(target!=='new'&&!UUID.test(target)) reject('ADMIN_INPUT_INVALID');
  const allowed=(keys)=>{if(Object.keys(input).some((key)=>!keys.includes(key))) reject('ADMIN_INPUT_INVALID');};
  let mapped; let data;
  if(resource==='entitlements'&&action==='grant') {
    allowed(['tier','days','validUntil','permanent','source']);
    if(input.tier==='pro') reject('PRO_NOT_SUPPORTED');
    if(input.tier!==undefined&&input.tier!=='plus') reject('ADMIN_INPUT_INVALID');
    const sources={beta_gift:'beta',admin_grant:'manual',admin_compensation:'compensation',promotion:'promotion',testing:'testing'};
    if(input.source!==undefined&&!Object.hasOwn(sources,input.source)) reject('ADMIN_INPUT_INVALID');
    if(!UUID.test(target)||!date(input.validUntil)|| (input.permanent!==undefined&&typeof input.permanent!=='boolean')) reject('ADMIN_INPUT_INVALID');
    if(input.days!==undefined&&![1,7,30,90].includes(input.days)) reject('ADMIN_INPUT_INVALID');
    if(Number(Boolean(input.permanent))+Number(input.validUntil!==undefined)+Number(input.days!==undefined)!==1) reject('ADMIN_INPUT_INVALID');
    mapped='grant_entitlement'; data={userId:target,reason,grantType:sources[input.source]||'manual',...(input.days!==undefined?{durationDays:input.days}:{}),...(input.validUntil!==undefined?{validUntil:input.validUntil}:{}),...(input.permanent?{permanent:true}:{})};
  } else if(resource==='entitlements'&&action==='revoke') {
    allowed(['grantId']); if(!UUID.test(target)||!UUID.test(input.grantId)) reject('GRANT_ID_REQUIRED');
    mapped='revoke_entitlement'; data={grantId:input.grantId,reason};
    // The SQL dispatcher verifies grant ownership against _adminV1.target.
  } else if(resource==='invitations'&&action==='create') {
    allowed(['kind','cohort','limit','expiresAt','note']);
    if(target!=='new'||(input.kind!==undefined&&!['personal','group','operations'].includes(input.kind))||(input.cohort!==undefined&&!UUID.test(input.cohort))||!date(input.expiresAt)||(input.limit!==undefined&&(!Number.isInteger(input.limit)||input.limit<1))||(input.note!==undefined&&(typeof input.note!=='string'||input.note.length>1000))) reject('ADMIN_INPUT_INVALID');
    mapped='create_invite'; data={maxUses:input.limit??1,reason,...(input.cohort?{cohortId:input.cohort}:{}),...(input.expiresAt?{expiresAt:input.expiresAt}:{}),...(input.note?{note:input.note}:{})};
  } else if(resource==='invitations'&&['disable','revoke'].includes(action)) {
    allowed([]); if(!UUID.test(target)) reject('ADMIN_INPUT_INVALID'); mapped='disable_invite'; data={inviteId:target,reason};
  } else if(resource==='beta-applications'&&['shortlist','approve','reject'].includes(action)) {
    allowed([]); if(!UUID.test(target)) reject('ADMIN_INPUT_INVALID'); mapped='review_application'; data={applicationId:target,status:{shortlist:'shortlisted',approve:'approved',reject:'rejected'}[action],reviewNote:reason};
  } else if(resource==='quotas'&&action==='adjust') {
    allowed(['delta','unlimited']); if(!UUID.test(target)||(input.unlimited!==undefined&&typeof input.unlimited!=='boolean')||(input.unlimited===true&&input.delta!==undefined)||(input.unlimited!==true&&(!Number.isInteger(input.delta)||input.delta<0))) reject('ADMIN_INPUT_INVALID');
    mapped='grant_quota'; data={userId:target,reason,...(input.unlimited===true?{unlimited:true}:{amount:input.delta})};
  } else if(resource==='quotas'&&action==='reset') {
    allowed([]); if(!UUID.test(target)) reject('ADMIN_INPUT_INVALID'); mapped='reset_quota'; data={userId:target,reason};
  } else if(resource==='bans'&&['restrict','suspend','ban','unban'].includes(action)) {
    allowed(['reasonCode','days']); if(!UUID.test(target)||(input.reasonCode!==undefined&&(typeof input.reasonCode!=='string'||input.reasonCode.length>100))||(input.days!==undefined&&(!Number.isInteger(input.days)||input.days<1||input.days>365||action==='unban'))) reject('ADMIN_INPUT_INVALID');
    // Relative duration is resolved inside the existing command transaction, not Node.
    mapped=action==='unban'?'unban':'set_account_control'; data={userId:target,reason,...(action!=='unban'?{status:{restrict:'restricted',suspend:'suspended',ban:'banned'}[action]}:{}),...(input.reasonCode!==undefined?{reasonCode:input.reasonCode}:{}),...(input.days!==undefined?{durationDays:input.days}:{})};
  } else reject();
  return {action:mapped,input:{...data,_adminV1:{contract:CONTRACT,resource,action,target,reason,input}}};
}
