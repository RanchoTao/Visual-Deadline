import { assertRateLimit, getBearerToken, publicError, requestId, requireAuthenticatedUser, sendJson, sha256, readJson } from '../server/platform/runtime.js';
import { insertFeedback } from '../server/platform/repository.js';

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '仅支持 POST 请求。' }, id); }
  try {
    const input = await readJson(request); const user = getBearerToken(request) ? await requireAuthenticatedUser(request) : undefined; const type = ['bug', 'feedback', 'feature_request', 'report'].includes(input.type) ? input.type : ''; const message = typeof input.message === 'string' ? input.message.trim() : '';
    if (!type || !message || message.length > 10000) throw new Error('FEEDBACK_INVALID'); assertRateLimit({ key: `feedback:${user?.id || sha256(String(request.headers?.['x-forwarded-for'] || 'unknown'))}`, limit: 5, windowMs: 60 * 60 * 1000 });
    await insertFeedback({ user_id: user?.id || null, type, message, route: typeof input.route === 'string' ? input.route.slice(0, 500) : null, app_version: typeof input.appVersion === 'string' ? input.appVersion.slice(0, 120) : null, viewport: input.viewport && typeof input.viewport === 'object' ? input.viewport : null, metadata: null });
    return sendJson(response, 201, { ok: true, message: '反馈已提交，感谢你的帮助。' }, id);
  } catch (error) { if (error instanceof Error && error.message === 'FEEDBACK_INVALID') return sendJson(response, 400, { ok: false, error: '请填写有效的反馈内容。' }, id); const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id); }
}
