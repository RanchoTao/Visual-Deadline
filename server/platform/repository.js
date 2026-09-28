import { serviceJson } from './runtime.js';

const query = (parts) => `?${new URLSearchParams(parts).toString()}`;
export async function findActiveAccountControl(userId, at = new Date().toISOString()) { const rows = await serviceJson(`/rest/v1/account_controls${query({ user_id: `eq.${userId}`, effective_at: `lte.${at}`, superseded_at: 'is.null', or: `(expires_at.is.null,expires_at.gt.${at})`, order: 'effective_at.desc,id.desc', limit: '1' })}`); return rows?.[0]; }
export async function findAdminRole(userId) { const rows = await serviceJson(`/rest/v1/admin_roles${query({ user_id: `eq.${userId}`, enabled: 'eq.true', select: 'role', limit: '1' })}`); return rows?.[0]?.role; }
export async function appendAudit(event) { await serviceJson('/rest/v1/admin_audit_log', { method: 'POST', body: JSON.stringify(event), headers: { Prefer: 'return=minimal' } }); }
export async function submitBetaApplication(row) { const rows = await serviceJson('/rest/v1/beta_applications', { method: 'POST', body: JSON.stringify(row) }); return rows?.[0]; }
export async function validateInvite(codeHash) { const rows = await serviceJson(`/rest/v1/invite_codes${query({ code_hash: `eq.${codeHash}`, select: 'id,enabled,expires_at,max_uses,used_count,cohort_id', limit: '1' })}`); return rows?.[0]; }
export async function redeemInvite({ codeHash, userId, emailHash, signupSource }) { return serviceJson('/rest/v1/rpc/redeem_beta_invite', { method: 'POST', body: JSON.stringify({ p_code_hash: codeHash, p_user_id: userId, p_email_hash: emailHash, p_signup_source: signupSource }) }); }
export async function hasInviteRedemption(userId) { const rows = await serviceJson(`/rest/v1/invite_redemptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`); return Boolean(rows?.length); }
export async function createAuthUser({ email, password }) { return serviceJson('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: false, app_metadata: { vd_beta_preauthorized: true } }) }); }
export async function dispatchVerification(email) { return serviceJson('/auth/v1/resend', { method: 'POST', body: JSON.stringify({ type: 'signup', email }) }); }
export async function assertWorkspaceAdmission(userId) {
  const redemption = await serviceJson(`/rest/v1/invite_redemptions?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`);
  if (redemption?.length) return;
  const existing = await serviceJson(`/rest/v1/beta_existing_users?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
  if (!existing?.length) throw new Error('BETA_INVITE_REQUIRED');
}
export async function deleteAuthUser(userId) { await serviceJson(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }); }
export async function insertFeedback(row) { const rows = await serviceJson('/rest/v1/user_feedback', { method: 'POST', body: JSON.stringify(row) }); return rows?.[0]; }
export async function consumeAIQuota(input) { return serviceJson('/rest/v1/rpc/consume_ai_quota', { method: 'POST', body: JSON.stringify(input) }); }
export async function finalizeAIUsage({ userId, requestId, status, inputTokens = 0, cachedInputTokens = 0, outputTokens = 0, totalTokens = 0, latencyMs, errorCode, model }) { await serviceJson(`/rest/v1/ai_usage_events?user_id=eq.${encodeURIComponent(userId)}&request_id=eq.${encodeURIComponent(requestId)}`, { method: 'PATCH', body: JSON.stringify({ status, ...(model ? { model } : {}), input_tokens: inputTokens, cached_input_tokens: cachedInputTokens, output_tokens: outputTokens, total_tokens: totalTokens, latency_ms: latencyMs, error_code: errorCode || null }), headers: { Prefer: 'return=minimal' } }); }
export async function getFeatureEnabled(key, { userId, cohortId } = {}) { const rows = await serviceJson(`/rest/v1/feature_flags?key=eq.${encodeURIComponent(key)}&select=scope_type,scope_id,enabled`); const match = (scope, id) => rows?.find((row) => row.scope_type === scope && (scope === 'global' || row.scope_id === id)); return match('user', userId)?.enabled ?? match('cohort', cohortId)?.enabled ?? match('global')?.enabled ?? false; }
