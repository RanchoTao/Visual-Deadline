import { MUTATING_ADMIN_ROLES } from '../server/platform/domain.js';
import { executeAdminCommand, createInvite, effectiveEntitlement, grantEntitlement, grantQuota, resetQuota, requireAdmin, requireOwner } from '../server/platform/admin.js';
import { publicError, readJson, requestId, sendJson, serviceJson } from '../server/platform/runtime.js';

const list = (path) => serviceJson(`/rest/v1/${path}`);
export default async function handler(request, response) {
  const id = requestId(request);
  if (!['GET', 'POST'].includes(request.method)) { response.setHeader('Allow', 'GET, POST'); return sendJson(response, 405, { ok: false, error: '请求方法不受支持。' }, id); }
  try {
    const input = request.method === 'POST' ? await readJson(request) : Object.fromEntries(new URL(request.url, 'http://localhost').searchParams); const action = input.action;
    const mutable = ['grant_entitlement', 'revoke_entitlement', 'create_invite', 'disable_invite', 'review_application', 'set_account_control', 'unban', 'grant_quota', 'reset_quota', 'set_feature_flag']; const context = await (action === 'set_feature_flag' ? requireOwner(request) : requireAdmin(request, mutable.includes(action) ? MUTATING_ADMIN_ROLES : undefined));
    if (request.method === 'GET') {
      if (action === 'users') return sendJson(response, 200, { ok: true, users: await list('profiles?select=id,user_id,email,display_name,signup_cohort_id,signup_source&order=created_at.desc&limit=100') }, id);
      if (action === 'user_detail') { const userId = input.userId; return sendJson(response, 200, { ok: true, profile: (await list(`profiles?id=eq.${encodeURIComponent(userId)}&select=id,user_id,email,display_name,signup_cohort_id,signup_source`))?.[0], entitlement: await effectiveEntitlement(userId), controls: await list(`account_controls?user_id=eq.${encodeURIComponent(userId)}&order=effective_at.desc`), quotaGrants: await list(`ai_quota_grants?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc`) }, id); }
      if (action === 'entitlement') return sendJson(response, 200, { ok: true, ...(await effectiveEntitlement(input.userId)) }, id);
      if (action === 'ai_usage') return sendJson(response, 200, { ok: true, events: await list(`ai_usage_events?user_id=eq.${encodeURIComponent(input.userId)}&order=created_at.desc&limit=100`) }, id);
      if (action === 'applications') return sendJson(response, 200, { ok: true, applications: await list('beta_applications?order=submitted_at.desc&limit=100') }, id);
      if (action === 'invites') return sendJson(response, 200, { ok: true, invites: await list('invite_codes?select=id,display_prefix,cohort_id,max_uses,used_count,enabled,expires_at,created_at,note&order=created_at.desc&limit=100') }, id);
      if (action === 'account_controls') return sendJson(response, 200, { ok: true, controls: await list(`account_controls?user_id=eq.${encodeURIComponent(input.userId)}&order=effective_at.desc`) }, id);
      if (action === 'audit') return sendJson(response, 200, { ok: true, events: await list('admin_audit_log?order=created_at.desc&limit=100') }, id);
      throw new Error('ADMIN_INPUT_INVALID');
    }
    if (action === 'grant_entitlement') return sendJson(response, 200, { ok: true, ...(await grantEntitlement(context, id, input) ) }, id);
    if (action === 'revoke_entitlement') return sendJson(response, 200, { ok: true, ...(await executeAdminCommand(context, id, action, input)) }, id);
    if (action === 'create_invite') return sendJson(response, 201, { ok: true, ...(await createInvite(context, id, input)) }, id);
    if (action === 'disable_invite' || action === 'review_application' || action === 'set_account_control' || action === 'unban' || action === 'set_feature_flag') return sendJson(response, 200, { ok: true, ...(await executeAdminCommand(context, id, action, input)) }, id);
    if (action === 'grant_quota') return sendJson(response, 201, { ok: true, grant: await grantQuota(context, id, input) }, id);
    if (action === 'reset_quota') return sendJson(response, 201, { ok: true, grant: await resetQuota(context, id, input) }, id);
    throw new Error('ADMIN_INPUT_INVALID');
  } catch (error) { if (error instanceof Error && error.message === 'ADMIN_INPUT_INVALID') return sendJson(response, 400, { ok: false, error: '管理员请求参数无效。' }, id); const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message, ...(error?.message === 'IDEMPOTENCY_KEY_REUSED' ? { code: 'IDEMPOTENCY_KEY_REUSED' } : {}) }, id); }
}
