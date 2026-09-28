import {randomUUID} from 'node:crypto';
import {ApiError,authenticateUser,readBody,rpc,assertAccountNormal} from '../server/admin/runtime.js';
const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 60_000;
const MAX_REQUESTS_PER_USER_PER_HOUR = 60;
const MAX_AUTH_HEADER_LENGTH = 8_500;
const DEEPSEEK_PROVIDER = 'deepseek';
const SUPPORTED_MODES = new Set(['task_advice', 'daily_plan', 'pressure_analysis', 'capture_interpret', 'goal_decompose']);
const hourlyRequestCounts = new Map();

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function readEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  return typeof value === 'string' ? value.trim() : '';
}

function getAuthorizationHeader(request) {
  const header = request.headers.authorization || request.headers.Authorization;
  return typeof header === 'string' ? header : '';
}

function getBearerToken(request) {
  const header = getAuthorizationHeader(request);
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  return match?.[1]?.trim() || '';
}

function getApproximateHeaderSize(request) {
  return Object.entries(request.headers || {}).reduce((total, [key, value]) => {
    const normalizedValue = Array.isArray(value) ? value.join(',') : String(value ?? '');
    return total + key.length + normalizedValue.length + 4;
  }, 0);
}

function getUsageKey(userId) {
  return `${userId}:${new Date().toISOString().slice(0, 13)}`;
}

function checkRateLimit(userId) {
  // Per-instance burst friction only. Commercial quota is enforced by the PostgreSQL reservation.
  const key = getUsageKey(userId);
  for(const oldKey of hourlyRequestCounts.keys()) if(!oldKey.endsWith(new Date().toISOString().slice(0,13))) hourlyRequestCounts.delete(oldKey);
  const used = hourlyRequestCounts.get(key) || 0;
  if (used >= MAX_REQUESTS_PER_USER_PER_HOUR) return false;
  hourlyRequestCounts.set(key, used + 1);
  return true;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是 JSON 对象。';
  if (!SUPPORTED_MODES.has(payload.mode)) return 'mode 必须是 task_advice、daily_plan、pressure_analysis、capture_interpret 或 goal_decompose。';
  if (typeof payload.message !== 'string' || !payload.message.trim()) return 'message 不能为空。';
  if (payload.message.length > MAX_MESSAGE_LENGTH) return `message 不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`;

  if (payload.context !== undefined) {
    if (!payload.context || typeof payload.context !== 'object' || Array.isArray(payload.context)) return 'context 必须是对象。';
    const contextLength = JSON.stringify(payload.context).length;
    if (contextLength > MAX_CONTEXT_LENGTH) return `context 不能超过 ${MAX_CONTEXT_LENGTH} 个字符。`;
  }

  return '';
}

function buildUserContent(payload) {
  return JSON.stringify(
    {
      mode: payload.mode,
      message: payload.message,
      context: payload.context || {},
    },
    null,
    2,
  );
}

async function callDeepSeek(payload) {
  const apiKey = readEnv('DEEPSEEK_API_KEY');
  const baseUrl = readEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com';
  const model = readEnv('DEEPSEEK_MODEL') || 'deepseek-chat';
  const provider = readEnv('AI_PROVIDER') || DEEPSEEK_PROVIDER;

  if (provider !== DEEPSEEK_PROVIDER) throw new Error('UNSUPPORTED_PROVIDER');
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY_MISSING');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              "You are Visual Deadline's AI planning assistant. Analyze task, goal, and pressure data only from the provided JSON. Be concise, practical, structured, and respond in Simplified Chinese unless the user asks otherwise. Never claim to modify data directly.",
          },
          { role: 'user', content: buildUserContent(payload) },
        ],
        temperature: 0.4,
      }),
    });

    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      data = undefined;
    }

    if (!response.ok) {
      console.error('[VD_API_AI_REQUEST_FAILED]', {status:response.status});
      const error = new Error('AI_PROVIDER_REJECTED');
      error.status = response.status;
      throw error;
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('DeepSeek 未返回有效内容。');

    const integer=value=>Number.isSafeInteger(value)&&value>=0?value:null;
    return { content, model, usage:{inputTokens:integer(data?.usage?.prompt_tokens),outputTokens:integer(data?.usage?.completion_tokens),cachedTokens:integer(data?.usage?.prompt_cache_hit_tokens)} };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, error: '只支持 POST 请求。' });
  }

  let reservation;
  let providerSucceeded=false;
  try {
    const headerSize = getApproximateHeaderSize(request);
    const authorizationHeader = getAuthorizationHeader(request);
    if (headerSize > 12_000 || authorizationHeader.length > MAX_AUTH_HEADER_LENGTH) {
      console.error('[VD_API_AI_HEADER_TOO_LARGE]', { headerSize, authorizationHeaderLength: authorizationHeader.length, url: request.url || '/api/ai' });
      return sendJson(response, 431, { ok: false, error: '请求头过大或登录状态异常。请重新登录；如果仍然失败，请清除本地缓存后再试。' });
    }

    const accessToken = getBearerToken(request);
    if (!accessToken) return sendJson(response, 401, { ok: false, error: '缺少 Supabase 登录凭证。' });

    const user = await authenticateUser(request);
    await assertAccountNormal(user.id);

    const payload = await readBody(request,100000);
    const validationError = validatePayload(payload);
    if (validationError) return sendJson(response, 400, { ok: false, error: validationError });

    if (!checkRateLimit(user.id)) return sendJson(response, 429, { ok: false, error: '请求过于频繁，请稍后重试。' });
    const requestId=randomUUID();
    await rpc('ai_reserve',{p_user:user.id,p_request:requestId,p_mode:payload.mode,p_provider:DEEPSEEK_PROVIDER,p_model:readEnv('DEEPSEEK_MODEL')||'deepseek-chat'});
    reservation={userId:user.id,requestId,started:Date.now()};

    const result = await callDeepSeek(payload);
    providerSucceeded=true;
    await rpc('ai_settle',{p_user:user.id,p_request:requestId,p_status:'succeeded',p_usage:{...result.usage,latencyMs:Date.now()-reservation.started}});
    reservation=undefined;
    return sendJson(response, 200, {
      ok: true,
      content: result.content,
      model: result.model,
      provider: DEEPSEEK_PROVIDER,
    });
  } catch (error) {
    if(reservation && !providerSucceeded) {
      try {await rpc('ai_settle',{p_user:reservation.userId,p_request:reservation.requestId,p_status:error?.name==='AbortError'?'cancelled':'failed',p_usage:{latencyMs:Date.now()-reservation.started,errorCode:'PROVIDER_OR_SETTLEMENT_FAILED'}});}
      catch {console.error('[VD_API_AI_SETTLEMENT_PENDING]',{requestId:reservation.requestId});}
    }
    if(error instanceof ApiError) return sendJson(response,error.status,{ok:false,error:error.code==='AI_QUOTA_EXHAUSTED'?'当前 AI 配额已用尽。':error.code==='ACCOUNT_BLOCKED'?'账号当前禁止云端写入和 AI 请求。':'认证或配额服务暂时不可用。'});
    if (error?.message === 'SUPABASE_CONFIG_MISSING') return sendJson(response, 500, { ok: false, error: '服务端 Supabase 环境变量未配置。' });
    if (error?.message === 'UNSUPPORTED_PROVIDER') return sendJson(response, 500, { ok: false, error: '当前服务端 AI_PROVIDER 暂不支持。' });
    if (error?.message === 'DEEPSEEK_API_KEY_MISSING') return sendJson(response, 500, { ok: false, error: '服务端 DeepSeek API Key 未配置。' });
    if (error?.name === 'AbortError') return sendJson(response, 504, { ok: false, error: 'AI 请求超时，请稍后重试。' });

    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    const message = 'AI 服务暂时不可用，请稍后重试。';
    return sendJson(response, status >= 500 ? 502 : status, { ok: false, error: message });
  }
}
