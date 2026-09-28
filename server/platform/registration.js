import { assertInviteAvailable, normalizeEmail, validateInviteCode } from './domain.js';
import { sha256 } from './runtime.js';

// Dispatch is outside the database transaction. A committed redemption is retained
// on dispatch failure, so the new user can safely request a resend without reusing an invite.
export async function registerInvitedUser(input, repository) {
  const email = normalizeEmail(input.email);
  const password = typeof input.password === 'string' ? input.password : '';
  const codeHash = sha256(validateInviteCode(input.inviteCode));
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw new Error('REGISTRATION_INVALID');
  assertInviteAvailable(await repository.validateInvite(codeHash));
  const created = await repository.createAuthUser({ email, password });
  const userId = created?.id || created?.user?.id;
  if (!userId) throw new Error('REGISTRATION_FAILED');
  try { await repository.redeemInvite({ codeHash, userId, emailHash: sha256(email), signupSource: 'invite' }); }
  catch (error) {
    // A lost RPC response may follow a successful commit. Never delete a redeemed
    // account (or compensate an unknown outcome) merely because transport failed.
    const redeemed = await repository.hasInviteRedemption(userId);
    if (!redeemed) { await repository.deleteAuthUser(userId); throw error; }
  }
  try { await repository.dispatchVerification(email); return { verificationSent: true }; }
  catch { return { verificationSent: false }; }
}
