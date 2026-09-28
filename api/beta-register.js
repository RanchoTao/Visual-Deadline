import { assertRateLimit, publicError, requestId, sendJson, sha256, readJson } from '../server/platform/runtime.js';
import { assertInviteAvailable, normalizeEmail, validateInviteCode } from '../server/platform/domain.js';
import { createAuthUser, deleteAuthUser, redeemInvite, validateInvite } from '../server/platform/repository.js';

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '仅支持 POST 请求。' }, id); }
  let createdUserId;
  try {
    const input = await readJson(request); const email = normalizeEmail(input.email); const password = typeof input.password === 'string' ? input.password : ''; const code = validateInviteCode(input.inviteCode);
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) throw new Error('REGISTRATION_INVALID');
    assertRateLimit({ key: `beta-register:${sha256(email)}`, limit: 5, windowMs: 60 * 60 * 1000 }); const codeHash = sha256(code); assertInviteAvailable(await validateInvite(codeHash));
    const created = await createAuthUser({ email, password }); createdUserId = created?.id || created?.user?.id; if (!createdUserId) throw new Error('REGISTRATION_FAILED');
    await redeemInvite({ codeHash, userId: createdUserId, emailHash: sha256(email), signupSource: 'invite' });
    return sendJson(response, 201, { ok: true, requiresEmailVerification: true, message: '注册成功，请查收验证邮件后登录。' }, id);
  } catch (error) {
    if (createdUserId) { try { await deleteAuthUser(createdUserId); } catch { /* no invite is consumed when rollback cleanup is required */ } }
    if (error instanceof Error && error.message === 'REGISTRATION_INVALID') return sendJson(response, 400, { ok: false, error: '请填写有效邮箱、至少 8 位密码和邀请码。' }, id);
    const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id);
  }
}
