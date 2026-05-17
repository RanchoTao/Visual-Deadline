const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 60_000;
const MAX_REQUESTS_PER_USER_PER_DAY = 20;
const DEEPSEEK_PROVIDER = 'deepseek';
const SUPPORTED_MODES = new Set(['task_advice', 'daily_plan', 'pressure_analysis']);
const dailyRequestCounts = new Map();

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function readEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : undefined);
  return typeof value === 'string' ? value.trim() : '';
}

function getBearerToken(request) {
  const header = request.headers.authorization || request.headers.Authorization;
  if (typeof header !== 'string') return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;

  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function verifySupabaseToken(accessToken) {
  const supabaseUrl = readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
  const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('SUPABASE_CONFIG_MISSING');

  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  const user = await response.json();
  return typeof user?.id === 'string' ? user : null;
}

function getUsageKey(userId) {
  return `${userId}:${new Date().toISOString().slice(0, 10)}`;
}

function checkRateLimit(userId) {
  // TODO: Move this placeholder limit to a Supabase table or another durable store.
  // Vercel function memory is per warm instance and can reset/rebalance between invocations.
  const key = getUsageKey(userId);
  const used = dailyRequestCounts.get(key) || 0;
  if (used >= MAX_REQUESTS_PER_USER_PER_DAY) return false;
  dailyRequestCounts.set(key, used + 1);
  return true;
}

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是 JSON 对象。';
  if (!SUPPORTED_MODES.has(payload.mode)) return 'mode 必须是 task_advice、daily_plan 或 pressure_analysis。';
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
      const upstreamMessage = typeof data?.error?.message === 'string' ? data.error.message : `DeepSeek returned ${response.status}`;
      const error = new Error(upstreamMessage);
      error.status = response.status;
      throw error;
    }

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('DeepSeek 未返回有效内容。');

    return { content, model };
  } finally {
    clearTimeout(timeoutId);
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, error: '只支持 POST 请求。' });
  }

  try {
    const accessToken = getBearerToken(request);
    if (!accessToken) return sendJson(response, 401, { ok: false, error: '缺少 Supabase 登录凭证。' });

    const user = await verifySupabaseToken(accessToken);
    if (!user) return sendJson(response, 401, { ok: false, error: 'Supabase 登录凭证无效或已过期。' });

    const payload = await readJsonBody(request);
    const validationError = validatePayload(payload);
    if (validationError) return sendJson(response, 400, { ok: false, error: validationError });

    if (!checkRateLimit(user.id)) return sendJson(response, 429, { ok: false, error: '今日 AI 请求次数已达上限（20 次）。请明天再试。' });

    const result = await callDeepSeek(payload);
    return sendJson(response, 200, {
      ok: true,
      content: result.content,
      model: result.model,
      provider: DEEPSEEK_PROVIDER,
    });
  } catch (error) {
    if (error?.message === 'SUPABASE_CONFIG_MISSING') return sendJson(response, 500, { ok: false, error: '服务端 Supabase 环境变量未配置。' });
    if (error?.message === 'UNSUPPORTED_PROVIDER') return sendJson(response, 500, { ok: false, error: '当前服务端 AI_PROVIDER 暂不支持。' });
    if (error?.message === 'DEEPSEEK_API_KEY_MISSING') return sendJson(response, 500, { ok: false, error: '服务端 DeepSeek API Key 未配置。' });
    if (error?.name === 'AbortError') return sendJson(response, 504, { ok: false, error: 'AI 请求超时，请稍后重试。' });

    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    const message = error instanceof Error && error.message ? error.message : 'AI 服务暂时不可用，请稍后重试。';
    return sendJson(response, status >= 500 ? 502 : status, { ok: false, error: message });
  }
}
