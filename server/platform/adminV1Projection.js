const safe=(value)=>typeof value==='string'?value.replace(/VD-[0-9A-F]{32}/gi,'[邀请码已隐藏]').slice(0,2000):typeof value==='number'||typeof value==='boolean'||value===null?value:undefined;
const snapshotKeys={status:'status',valid_from:'validFrom',valid_until:'validUntil',expires_at:'expiresAt',amount:'limit',used_count:'used',max_uses:'limit',grant_type:'source',reason:'reason',revoked_at:'revokedAt',enabled:'enabled',superseded_at:'supersededAt'};
export function projectSnapshot(value) {
  if(Array.isArray(value))return value.slice(0,50).map(projectSnapshot);
  if(!value||typeof value!=='object')return null;
  return Object.fromEntries(Object.entries(value).filter(([key])=>Object.hasOwn(snapshotKeys,key)).map(([key,item])=>[snapshotKeys[key],safe(item)]));
}
const quota=(value)=>({policy:value.tier,limit:value.unlimited?null:value.base+value.extra,used:value.used,remaining:value.unlimited?null:value.remaining,resetAt:value.period_end,unlimited:value.unlimited});
function user(row) {
  const plus=row.effective?.allowed===true;
  const grants=(row.admin_grants||[]).map((item)=>({id:item.id,source:({beta:'beta_gift',compensation:'admin_compensation',manual:'admin_grant'})[item.grant_type]||item.grant_type,tier:'plus',status:item.revoked_at?'revoked':null,validFrom:item.valid_from,validUntil:item.valid_until,reason:safe(item.reason)}));
  return {id:row.id,userId:row.id,email:row.email,name:row.display_name,displayName:row.display_name,createdAt:row.created_at,lastActiveAt:null,cohort:row.signup_cohort_id,signupCohort:row.signup_cohort_id,signupSource:row.signup_source,accountStatus:row.account_status,effectiveTier:plus?'plus':'free',effectivePlus:plus,capabilities:plus?['vd.plus']:[],membershipStatus:plus?'active':'inactive',validUntil:row.effective?.validUntil??null,entitlementSources:(row.effective?.sources||[]).map((item)=>({id:item.id,source:item.source_type==='admin_grant'?(grants.find((grant)=>grant.id===item.source_id)?.source||'admin_grant'):item.source_type,tier:'plus',status:item.status,validFrom:item.valid_from,validUntil:item.valid_until,reason:item.reason})),adminGrants:grants,...quota(row.quota),quota:quota(row.quota),aiUsed:row.quota.used,tasksCount:null,goalsCount:null,reviewsCount:null};
}
function audit(row) {
  const command=row.adapter_command;
  return {id:row.id,actor:row.actor_user_id,action:command?.action||row.action,target:command?.target||row.target_id,reason:command?.reason??row.reason??'',before:projectSnapshot(row.before_json),after:projectSnapshot(row.after_json),timestamp:row.created_at,requestId:row.request_id};
}
export function projectRead(resource,page) {
  const project=(row)=>{
    if(['users','entitlements','quotas'].includes(resource))return {...user(row),source:row.effective?.sources?.map((item)=>item.source_type).join(',')||null,status:resource==='entitlements'?(row.effective?.allowed?'active':'inactive'):row.account_status};
    if(resource==='beta-applications')return {id:row.id,email:row.email,name:row.name,organization:row.organization,role:row.role,useCase:row.use_case,source:row.referral_source,createdAt:row.submitted_at,status:row.status,reviewNote:row.review_note,reviewedAt:row.reviewed_at,reviewedBy:row.reviewed_by,history:(row.history||[]).map(item=>({id:item.id,actor:item.actor,action:item.action,status:item.status,reason:safe(item.reason),timestamp:item.timestamp}))};
    if(resource==='invitations')return {id:row.id,code:row.display_prefix,cohort:row.cohort_id,kind:row.kind??null,status:!row.enabled?'disabled':row.expires_at&&Date.parse(row.expires_at)<=Date.parse(page.observedAt)?'expired':row.used_count>=row.max_uses?'exhausted':'active',used:row.used_count,limit:row.max_uses,expiresAt:row.expires_at,createdAt:row.created_at,source:row.created_by,note:row.note};
    if(resource==='bans')return {id:row.id,userId:row.user_id,email:row.email,accountStatus:row.status,reason:row.reason,actor:row.created_by,createdAt:row.created_at,expiresAt:row.expires_at,note:row.note};
    if(resource==='audit')return audit(row);
    if(resource==='feedback')return {id:row.id,userId:row.user_id,email:row.email,kind:row.type,category:row.type,status:row.status,createdAt:row.created_at,caseReference:row.id};
    if(resource==='ai-usage')return {id:row.id,userId:row.user_id,email:row.email,provider:row.provider,model:row.model,feature:row.feature,inputTokens:row.input_tokens,cachedInputTokens:row.cached_input_tokens,outputTokens:row.output_tokens,estimatedCost:row.cost_status==='estimated'?row.estimated_cost_minor:null,currency:row.currency,costStatus:row.cost_status,pricingVersion:row.pricing_version,latencyMs:row.latency_ms,status:row.status,createdAt:row.created_at};
    return {id:row.id};
  };
  const summaryKeys=['adminGrantSupport','contractVersion','closedBeta','totalUsers','pendingApplications','activeInvites','plusUsers','bannedUsers','bannedAccounts','aiCallsToday','aiEstimatedCostToday','callsToday','costToday','currency','observedAt','windowStart','windowEnd','timezone','source','costUnit','dau','wau','mau'];
  return {items:(page.items||[]).map(project),...(page.summary?{summary:Object.fromEntries(Object.entries(page.summary).filter(([key])=>summaryKeys.includes(key)))}:{})};
}
export function projectReceipt(resource,body,original,row,actor,requestId) {
  const command=row?.adapter_command;
  if(!row||row.actor_user_id!==actor||row.request_id!==requestId||command?.contract!=='vd-admin-v1'||command.resource!==resource||command.action!==body.action||command.target!==body.target||command.reason!==body.reason||!row.id||!Number.isFinite(Date.parse(row.created_at))) throw new Error('AUDIT_RECEIPT_MISSING');
  let result={};
  if(resource==='entitlements')result={grantId:original.grant.id,effectivePlus:original.effective.allowed,effectiveTier:original.effective.allowed?'plus':'free',validUntil:original.effective.validUntil??null};
  if(resource==='invitations')result={inviteId:original.invite.id,...(body.action==='create'?{inviteCode:original.invite.code}:{}),expiresAt:original.invite.expires_at,status:original.invite.enabled?'enabled':'disabled'};
  if(resource==='beta-applications')result={status:original.application.status};
  if(resource==='quotas')result=quota(original.quota);
  if(resource==='bans')result={status:original.control.status,expiresAt:original.control.expires_at};
  return {result,auditEvent:audit(row)};
}
