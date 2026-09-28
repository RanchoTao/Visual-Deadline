import { assertRateLimit, publicError, readEnv, readJson, requestId, requireAuthenticatedUser, sendJson } from '../server/platform/runtime.js';
import { assertAccountMayOperate } from '../server/platform/domain.js';
import { assertWorkspaceAdmission, consumeAIQuota, finalizeAIUsage, findActiveAccountControl } from '../server/platform/repository.js';

const MAX_MESSAGE_LENGTH = 12_000;
const MAX_CONTEXT_LENGTH = 60_000;
const SUPPORTED_MODES = new Set(['task_advice', 'daily_plan', 'pressure_analysis', 'capture_interpret', 'goal_decompose']);
const MODE_FEATURE = { task_advice: 'task_analysis', daily_plan: 'daily_plan', pressure_analysis: 'pressure_analysis', capture_interpret: 'capture_interpret', goal_decompose: 'goal_roadmap' };

function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') return '请求体必须是 JSON 对象。';
  if (!SUPPORTED_MODES.has(payload.mode)) return '请求模式无效。';
  if (typeof payload.message !== 'string' || !payload.message.trim()) return 'message 不能为空。';
  if (payload.message.length > MAX_MESSAGE_LENGTH) return `message 不能超过 ${MAX_MESSAGE_LENGTH} 个字符。`;
  if (payload.context !== undefined && (!payload.context || typeof payload.context !== 'object' || Array.isArray(payload.context) || JSON.stringify(payload.context).length > MAX_CONTEXT_LENGTH)) return 'context 无效或过长。';
  return '';
}
function providerConfig() {
  const provider = readEnv('VD_AI_PROVIDER') || 'deepseek'; const apiKey = readEnv('DEEPSEEK_API_KEY'); const baseUrl = readEnv('DEEPSEEK_API_BASE_URL') || readEnv('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com'; const model = readEnv('DEEPSEEK_MODEL') || 'deepseek-chat';
  if (provider !== 'deepseek') throw new Error('UNSUPPORTED_PROVIDER'); if (!apiKey) throw new Error('DEEPSEEK_API_KEY_MISSING'); return { provider, apiKey, baseUrl: baseUrl.replace(/\/+$/, ''), model };
}
async function callDeepSeek(payload, config) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: config.model, messages: [{ role: 'system', content: '你是 Visual Deadline 的规划助手。仅分析提供的任务、目标和压力 JSON。请使用简洁、实用、结构化的简体中文回复；不得声称已直接修改数据。' }, { role: 'user', content: JSON.stringify({ mode: payload.mode, message: payload.message, context: payload.context || {} }) }], temperature: 0.4 }) });
    const data = await response.json().catch(() => undefined); if (!response.ok) { const error = new Error(typeof data?.error?.message === 'string' ? data.error.message : 'AI 服务暂时不可用。'); error.status = response.status; throw error; }
    const content = data?.choices?.[0]?.message?.content?.trim(); if (!content) throw new Error('AI_EMPTY_RESPONSE'); return { content, usage: data?.usage || {} };
  } finally { clearTimeout(timeout); }
}

export default async function handler(request, response) {
  const id = requestId(request); if (request.method !== 'POST') { response.setHeader('Allow', 'POST'); return sendJson(response, 405, { ok: false, error: '只支持 POST 请求。' }, id); }
  let user; let quotaReserved = false; const startedAt = Date.now(); let config;
  try {
    user = await requireAuthenticatedUser(request); await assertWorkspaceAdmission(user.id); assertAccountMayOperate(await findActiveAccountControl(user.id)); const payload = await readJson(request); const validation = validatePayload(payload); if (validation) return sendJson(response, 400, { ok: false, error: validation }, id);
    assertRateLimit({ key: `ai:${user.id}`, limit: 30, windowMs: 60 * 60 * 1000 }); config = providerConfig(); quotaReserved = (await consumeAIQuota({ p_user_id: user.id, p_request_id: id, p_provider: config.provider, p_model: config.model, p_feature: MODE_FEATURE[payload.mode] })) === true;
    if (!quotaReserved) return sendJson(response, 429, { ok: false, error: '本周期 AI 使用额度已用完。' }, id);
    const result = await callDeepSeek(payload, config); const usage = result.usage; await finalizeAIUsage({ userId: user.id, requestId: id, status: 'succeeded', inputTokens: Number(usage.prompt_tokens) || 0, cachedInputTokens: Number(usage.prompt_cache_hit_tokens) || 0, outputTokens: Number(usage.completion_tokens) || 0, totalTokens: Number(usage.total_tokens) || 0, latencyMs: Date.now() - startedAt });
    return sendJson(response, 200, { ok: true, content: result.content, model: config.model, provider: config.provider }, id);
  } catch (error) {
    if (user && quotaReserved) await finalizeAIUsage({ userId: user.id, requestId: id, status: 'failed', latencyMs: Date.now() - startedAt, errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN' }).catch(() => undefined);
    if (error instanceof Error && error.message === 'DEEPSEEK_API_KEY_MISSING') return sendJson(response, 503, { ok: false, error: '服务端 AI 服务尚未配置。' }, id);
    if (error instanceof Error && error.message === 'UNSUPPORTED_PROVIDER') return sendJson(response, 503, { ok: false, error: '当前 AI 服务暂不可用。' }, id);
    if (error?.name === 'AbortError') return sendJson(response, 504, { ok: false, error: 'AI 请求超时，请稍后重试。' }, id);
    const [status, message] = publicError(error); return sendJson(response, status, { ok: false, error: message }, id);
  }
}
