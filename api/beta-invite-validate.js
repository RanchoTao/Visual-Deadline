import { assertRateLimit, publicError, requestId, sendJson, sha256, readJson } from '../server/platform/runtime.js';
import { assertInviteAvailable, validateInviteCode } from '../server/platform/domain.js';
import { validateInvite } from '../server/platform/repository.js';

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '仅支持 POST 请求。' }, id); }
  try { const input = await readJson(request); const code = validateInviteCode(input.code); assertRateLimit({ key: `invite-validation:${sha256(code)}`, limit: 12, windowMs: 60 * 60 * 1000 }); assertInviteAvailable(await validateInvite(sha256(code))); return sendJson(response, 200, { ok: true }, id); }
  catch (error) { const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id); }
}
