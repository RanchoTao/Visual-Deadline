import crypto from 'node:crypto';
import { booleanFlag, normalizeProviderEnvironment, resolveCatalog, validateCatalogIsolation } from './domain.js';

export function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function recurringRuntime() {
  const environment = normalizeProviderEnvironment(readEnv('PADDLE_ENVIRONMENT'));
  const suffix = environment === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const isolation = validateCatalogIsolation(environment, (name) => readEnv(name));
  const apiKey = readEnv(`PADDLE_API_KEY_${suffix}`, 'PADDLE_API_KEY');
  const webhookSecret = readEnv(`PADDLE_WEBHOOK_SECRET_${suffix}`, 'PADDLE_WEBHOOK_SECRET');
  return {
    environment,
    apiBaseUrl: environment === 'production' ? 'https://api.paddle.com' : 'https://sandbox-api.paddle.com',
    apiKey,
    webhookSecret,
    isolation,
    checkoutEnabled: booleanFlag(readEnv('VD_RECURRING_BILLING_ENABLED'), false),
    processingEnabled: booleanFlag(readEnv('VD_RECURRING_BILLING_PROCESSING_ENABLED'), false),
    reconciliationEnabled: booleanFlag(readEnv('VD_RECURRING_BILLING_RECONCILIATION_ENABLED'), false),
    catalog: (planCode) => resolveCatalog(planCode, environment, (name) => readEnv(name)),
  };
}

export function supabaseRuntime() {
  return {
    url: readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, ''),
    anonKey: readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
    serviceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export function verifyPaddleSignature(rawBody, signatureHeader, secret, now = Date.now(), toleranceSeconds = 5) {
  if (!signatureHeader || typeof signatureHeader !== 'string' || !secret) return false;
  const values = signatureHeader.split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});
  const timestamp = Number(values.ts?.[0]);
  const signatures = values.h1 || [];
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(now / 1000) - timestamp) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}:${rawBody}`, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
  });
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export async function parseHttpResponse(result) {
  const text = await result.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 500) }; }
  }
  if (!result.ok) {
    const detail = body?.error?.detail || body?.error?.code || body?.message || body?.hint || `HTTP ${result.status}`;
    const error = new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    error.status = result.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

export async function authenticateUser(request, storage) {
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !storage.url || !storage.anonKey) return null;
  const result = await fetch(`${storage.url}/auth/v1/user`, { headers: { apikey: storage.anonKey, Authorization: `Bearer ${token}` } });
  return result.ok ? result.json() : null;
}
