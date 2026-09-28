export const ADMIN_ROLES = ['owner', 'admin', 'support', 'analyst', 'reviewer'];
export const MUTATING_ADMIN_ROLES = ['owner', 'admin'];
export function normalizeEmail(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
export function validateBetaApplication(input) {
  const value = input && typeof input === 'object' ? input : {}; const email = normalizeEmail(value.email); const name = typeof value.name === 'string' ? value.name.trim() : ''; const role = typeof value.role === 'string' ? value.role.trim() : ''; const useCase = typeof value.useCase === 'string' ? value.useCase.trim() : '';
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || !role || !useCase || !value.acceptedPolicies) throw new Error('APPLICATION_INVALID');
  return { email, name: name.slice(0, 120), organization: typeof value.organization === 'string' ? value.organization.trim().slice(0, 200) || null : null, role: role.slice(0, 120), use_case: useCase.slice(0, 4000), why_interested: typeof value.whyInterested === 'string' ? value.whyInterested.trim().slice(0, 4000) || null : null, referral_source: typeof value.referralSource === 'string' ? value.referralSource.trim().slice(0, 200) || null : null };
}
export function validateInviteCode(value) { const code = typeof value === 'string' ? value.trim().toUpperCase().replace(/\s+/g, '') : ''; if (!/^[A-Z0-9-]{6,64}$/.test(code)) throw new Error('INVITE_INVALID'); return code; }
export function assertInviteAvailable(invite, at = new Date().toISOString()) { if (!invite) throw new Error('INVITE_INVALID'); if (!invite.enabled) throw new Error('INVITE_DISABLED'); if (invite.expires_at && invite.expires_at <= at) throw new Error('INVITE_EXPIRED'); if (invite.used_count >= invite.max_uses) throw new Error('INVITE_EXHAUSTED'); }
export function assertAccountMayOperate(control) { if (control && ['restricted', 'suspended', 'banned'].includes(control.status)) throw new Error('ACCOUNT_BLOCKED'); }
export function assertAdminRole(role, accepted = MUTATING_ADMIN_ROLES) { if (!role || !accepted.includes(role)) throw new Error('ADMIN_REQUIRED'); }
export function assertOwner(role) { if (role !== 'owner') throw new Error('OWNER_REQUIRED'); }
