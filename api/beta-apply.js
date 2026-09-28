import { assertRateLimit, publicError, requestId, sendJson, sha256, verifyTurnstile, readJson } from '../server/platform/runtime.js';
import { validateBetaApplication } from '../server/platform/domain.js';
import { submitBetaApplication } from '../server/platform/repository.js';

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '仅支持 POST 请求。' }, id); }
  try {
    const input = await readJson(request); const application = validateBetaApplication(input); const ip = typeof request.headers?.['x-forwarded-for'] === 'string' ? request.headers['x-forwarded-for'].split(',')[0] : 'unknown';
    assertRateLimit({ key: `beta-application:${sha256(`${application.email}:${ip}`)}`, limit: 3, windowMs: 24 * 60 * 60 * 1000 });
    await verifyTurnstile(typeof input.turnstileToken === 'string' ? input.turnstileToken : '', ip);
    await submitBetaApplication({ ...application, email_hash: sha256(application.email) });
    return sendJson(response, 201, { ok: true, message: '申请已提交。我们会通过邮件通知审核结果。' }, id);
  } catch (error) {
    if (error instanceof Error && error.message === 'APPLICATION_INVALID') return sendJson(response, 400, { ok: false, error: '请完整填写必填项并同意相关协议。' }, id);
    if (error?.status === 409) return sendJson(response, 409, { ok: false, error: '该邮箱已有待处理的内测申请。' }, id);
    const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id);
  }
}
