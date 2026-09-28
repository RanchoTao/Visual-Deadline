import { randomBytes } from 'node:crypto';
import { assertAccountMayOperate, assertAdminRole, assertOwner } from './domain.js';
import { appendAudit, findActiveAccountControl, findAdminRole } from './repository.js';
import { requireAuthenticatedUser, serviceJson } from './runtime.js';

export async function requireAdmin(request, allowed) { const user = await requireAuthenticatedUser(request); const role = await findAdminRole(user.id); assertAdminRole(role, allowed); assertAccountMayOperate(await findActiveAccountControl(user.id)); return { user, role }; }
export async function requireOwner(request) { const context = await requireAdmin(request, ['owner']); assertOwner(context.role); return context; }
export function makeInviteCode() { return `VD-${randomBytes(16).toString('hex').toUpperCase()}`; }
export async function audit(context, requestId, action, targetType, targetId, after, reason, before) { await appendAudit({ actor_user_id: context.user.id, action, target_type: targetType, target_id: String(targetId), reason: reason || null, before_json: before || null, after_json: after || null, request_id: requestId }); }
export async function effectiveEntitlement(userId, at = new Date().toISOString()) { const rows = await serviceJson(`/rest/v1/entitlements?user_id=eq.${encodeURIComponent(userId)}&capability=eq.vd.plus&status=eq.active&valid_from=lte.${encodeURIComponent(at)}&or=(valid_until.is.null,valid_until.gt.${encodeURIComponent(at)})&order=valid_until.desc.nullsfirst`); return { allowed: Array.isArray(rows) && rows.length > 0, capability: 'vd.plus', sources: rows || [], validUntil: rows?.[0]?.valid_until || undefined }; }
export async function executeAdminCommand(context, requestId, action, input) {
  // Send stable submitted data. The transaction resolves dates/randomness after replay lookup.
  return serviceJson('/rest/v1/rpc/beta_admin_command', { method: 'POST', body: JSON.stringify({
    p_actor: context.user.id, p_request: requestId, p_action: action, p_input: input,
  }) });
}
export async function grantEntitlement(context, requestId, input) {
  if (input.permanent) assertOwner(context.role);
  if (!input.userId || (!input.permanent && !input.validUntil && ![1,7,30,90].includes(input.durationDays))) throw new Error('ADMIN_INPUT_INVALID');
  return executeAdminCommand(context, requestId, 'grant_entitlement', input);
}
export async function revokeEntitlement(context, requestId, grantId, reason) {
  return executeAdminCommand(context, requestId, 'revoke_entitlement', { grantId, reason });
}
export async function createInvite(context, requestId, input) {
  return executeAdminCommand(context, requestId, 'create_invite', input);
}
export async function grantQuota(context, requestId, input) {
  const unlimited = input.unlimited === true;
  if (!input.userId || (!unlimited && (!Number.isInteger(input.amount) || input.amount < 0))) throw new Error('ADMIN_INPUT_INVALID');
  return (await executeAdminCommand(context, requestId, 'grant_quota', input)).grant;
}
export async function resetQuota(context, requestId, input) {
  if (!input.userId) throw new Error('ADMIN_INPUT_INVALID');
  // The database owns the current policy boundary; client-supplied dates/amounts cannot extend reset compensation.
  return (await executeAdminCommand(context, requestId, 'reset_quota', input)).grant;
}
