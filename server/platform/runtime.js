import { createHash, randomUUID } from 'node:crypto';

export function readEnv(name) { return typeof process.env[name] === 'string' ? process.env[name].trim() : ''; }
export function requestId(request) { const incoming = request.headers?.['x-request-id']; return typeof incoming === 'string' && /^[0-9a-f-]{36}$/i.test(incoming) ? incoming : randomUUID(); }
export function sha256(value) { return createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex'); }
export function sendJson(response, status, body, id) { response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); if (id) response.setHeader('X-Request-Id', id); response.end(JSON.stringify({ ...body, requestId: id })); }
export async function readJson(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8'); return raw ? JSON.parse(raw) : {};
}
export function getBearerToken(request) { const header = request.headers?.authorization || request.headers?.Authorization; const match = typeof header === 'string' ? header.match(/^Bearer\s+([^\s]+)$/i) : null; return match?.[1] || ''; }
export function getSupabaseConfig() {
  const url = readEnv('SUPABASE_URL').replace(/\/+$/, ''); const anonKey = readEnv('SUPABASE_ANON_KEY'); const serviceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) throw new Error('PLATFORM_STORAGE_NOT_CONFIGURED');
  return { url, anonKey, serviceKey };
}
export async function requireAuthenticatedUser(request) {
  const token = getBearerToken(request); if (!token) throw new Error('AUTH_REQUIRED');
  const { url, anonKey } = getSupabaseConfig();
  const result = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error('AUTH_REQUIRED');
  const user = await result.json(); if (!user?.id) throw new Error('AUTH_REQUIRED'); return user;
}
export function serviceRequest(path, init = {}) {
  const { url, serviceKey } = getSupabaseConfig(); const headers = new Headers(init.headers); headers.set('apikey', serviceKey); headers.set('Authorization', `Bearer ${serviceKey}`); headers.set('Content-Type', 'application/json'); headers.set('Prefer', headers.get('Prefer') || 'return=representation');
  return fetch(`${url}${path}`, { ...init, headers });
}
export async function serviceJson(path, init = {}) {
  const response = await serviceRequest(path, init); const text = await response.text(); let body; try { body = text ? JSON.parse(text) : undefined; } catch { body = undefined; }
  if (!response.ok) { const error = new Error(typeof body?.message === 'string' ? body.message : `PLATFORM_STORAGE_${response.status}`); error.status = response.status; error.body = body; throw error; }
  return body;
}
export function isProductionRuntime() { return readEnv('VERCEL_ENV') === 'production' || readEnv('NODE_ENV') === 'production'; }
const buckets = new Map();
export function assertRateLimit({ key, limit, windowMs }) {
  // The in-memory limiter is development-only; production must wire a durable adapter.
  if (isProductionRuntime()) throw new Error('RATE_LIMIT_UNAVAILABLE');
  const now = Date.now(); const current = buckets.get(key); const state = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  if (state.count >= limit) throw new Error('RATE_LIMITED'); state.count += 1; buckets.set(key, state);
}
export async function verifyTurnstile(token, remoteIp) {
  const secret = readEnv('TURNSTILE_SECRET_KEY');
  if (!secret) { if (isProductionRuntime()) throw new Error('TURNSTILE_REQUIRED'); if (readEnv('VD_ALLOW_TURNSTILE_BYPASS') !== 'true') throw new Error('TURNSTILE_REQUIRED'); return; }
  const params = new URLSearchParams({ secret, response: token || '' }); if (remoteIp) params.set('remoteip', remoteIp);
  const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const verdict = await result.json(); if (!result.ok || !verdict?.success) throw new Error('TURNSTILE_INVALID');
}
export function publicError(error) {
  const messages = { AUTH_REQUIRED: [401, '请先登录。'], PLATFORM_STORAGE_NOT_CONFIGURED: [503, '服务端数据存储尚未配置。'], RATE_LIMITED: [429, '请求过于频繁，请稍后再试。'], RATE_LIMIT_UNAVAILABLE: [503, '服务端保护尚未配置，请稍后再试。'], TURNSTILE_REQUIRED: [503, '人机验证尚未配置，请稍后再试。'], TURNSTILE_INVALID: [400, '人机验证未通过，请重试。'], INVITE_INVALID: [400, '邀请码无效。'], INVITE_DISABLED: [400, '当前邀请码已停用。'], INVITE_EXPIRED: [400, '邀请码已过期。'], INVITE_EXHAUSTED: [400, '邀请码使用次数已满。'], INVITE_ALREADY_REDEEMED: [409, '该账户已兑换过邀请码。'], ACCOUNT_BLOCKED: [403, '当前账户无法执行此操作。'], ADMIN_REQUIRED: [403, '需要管理员权限。'], OWNER_REQUIRED: [403, '需要所有者权限。'] };
  const code = error instanceof Error ? error.message : ''; return messages[code] || [500, '服务暂时不可用，请稍后再试。'];
}
