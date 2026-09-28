import { assertRateLimit, publicError, requestId, sendJson, sha256, readJson } from '../server/platform/runtime.js';
import { normalizeEmail } from '../server/platform/domain.js';
import * as repository from '../server/platform/repository.js';
import { registerInvitedUser } from '../server/platform/registration.js';

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '仅支持 POST 请求。' }, id); }
  try {
    const input = await readJson(request);
    assertRateLimit({ key: `beta-register:${sha256(normalizeEmail(input.email))}`, limit: 5, windowMs: 60 * 60 * 1000 });
    const result = await registerInvitedUser(input, repository);
    return sendJson(response, 201, { ok: true, requiresEmailVerification: true, ...result, message: result.verificationSent ? '验证邮件已发送，请查收后登录。' : '账号已创建，验证邮件发送失败，请点击重新发送。' }, id);
  } catch (error) {
    if (error instanceof Error && error.message === 'REGISTRATION_INVALID') return sendJson(response, 400, { ok: false, error: '请填写有效邮箱、至少 8 位密码和邀请码。' }, id);
    const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id);
  }
}
