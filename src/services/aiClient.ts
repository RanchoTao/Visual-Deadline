import { supabase } from '../lib/supabaseClient';

export type AIProvider = 'openai-compatible' | 'deepseek-compatible';
export type BackendAIMode = 'task_advice' | 'daily_plan' | 'pressure_analysis';

export interface AISettings {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface BackendAIRequest {
  mode: BackendAIMode;
  message: string;
  context?: {
    tasks?: unknown[];
    goals?: unknown[];
    pressure?: unknown;
  };
}

export interface BackendAIResponse {
  ok: true;
  content: string;
  model: string;
  provider: 'deepseek';
}

interface RequestChatCompletionOptions {
  mode?: BackendAIMode;
  context?: BackendAIRequest['context'];
}

export const defaultAISettings: AISettings = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
};

const BACKEND_AI_URL = '/api/ai';
const MAX_SAFE_BEARER_TOKEN_LENGTH = 8_192;
const JWT_LIKE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const LARGE_HEADER_STATUS_CODES = new Set([431, 494]);
const LARGE_HEADER_MESSAGE = 'VD Cloud AI 请求失败：请求头过大或登录状态异常。请重新登录；如果仍然失败，请清除本地缓存后再试。';

export function getProviderDefaults(provider: AIProvider): Pick<AISettings, 'baseUrl' | 'model'> {
  if (provider === 'deepseek-compatible') return { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' };
  return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
}

export function normalizeAISettings(settings: Partial<AISettings> | null | undefined): AISettings {
  const provider: AIProvider = settings?.provider === 'deepseek-compatible' ? 'deepseek-compatible' : 'openai-compatible';
  const defaults = getProviderDefaults(provider);
  return {
    provider,
    baseUrl: settings?.baseUrl?.trim() || defaults.baseUrl,
    apiKey: settings?.apiKey || '',
    model: settings?.model?.trim() || defaults.model,
  };
}

export function isDeveloperAIKeyMode(settings: Partial<AISettings> | null | undefined): boolean {
  return Boolean(settings?.apiKey?.trim());
}

export function getAIConnectionLabel(settings: Partial<AISettings> | null | undefined): string {
  return isDeveloperAIKeyMode(settings) ? '开发者模式：使用本地 API Key' : 'VD Cloud AI 已启用';
}

export function isCloudAIAuthStateError(error: unknown): boolean {
  return error instanceof Error && /请求头过大|登录状态异常|重新登录|本地缓存/.test(error.message);
}

export async function resetCloudAIAuthState(): Promise<void> {
  await supabase.auth.clearLocalAuthState();
}

interface ChatCompletionChoice {
  message?: { content?: string };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
  error?: { message?: string };
}

interface BackendAIErrorResponse {
  ok?: false;
  error?: string;
}

function buildBackendMessage(systemPrompt: string, userPrompt: string): string {
  return JSON.stringify(
    {
      systemInstructions: systemPrompt,
      userRequest: userPrompt,
    },
    null,
    2,
  );
}

function isSafeBearerToken(token: unknown): token is string {
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_SAFE_BEARER_TOKEN_LENGTH && JWT_LIKE_PATTERN.test(token);
}

function trimForLog(text: string, maxLength = 2_000): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function logAIRequestFailure(details: { url: string; method: string; bodyLength: number; status: number; responseText: string; hasSession?: boolean; isLoggedIn?: boolean }): void {
  console.error('[VD_AI_REQUEST_FAILED]', {
    url: details.url,
    method: details.method,
    bodyLength: details.bodyLength,
    status: details.status,
    responseText: trimForLog(details.responseText),
    hasSession: details.hasSession,
    isLoggedIn: details.isLoggedIn,
  });
}

function logAIRequestStart(details: { url: string; method: string; bodyLength: number; hasSession?: boolean; isLoggedIn?: boolean; tokenLength?: number }): void {
  console.info('[VD_AI_REQUEST_START]', details);
}

function parseJsonResponse<T>(text: string): T | undefined {
  try {
    return text ? JSON.parse(text) as T : undefined;
  } catch (error) {
    console.error('[VD_AI_RESPONSE_PARSE_ERROR]', { error, text: trimForLog(text) });
    return undefined;
  }
}

function getLargeHeaderMessage(status: number): string | undefined {
  return LARGE_HEADER_STATUS_CODES.has(status) ? LARGE_HEADER_MESSAGE : undefined;
}

export async function callBackendAI(request: BackendAIRequest): Promise<BackendAIResponse> {
  const session = await supabase.auth.getSession();
  if (!isSafeBearerToken(session?.access_token)) {
    await resetCloudAIAuthState();
    throw new Error(LARGE_HEADER_MESSAGE);
  }

  const requestBody = JSON.stringify(request);
  logAIRequestStart({
    url: BACKEND_AI_URL,
    method: 'POST',
    bodyLength: requestBody.length,
    hasSession: Boolean(session),
    isLoggedIn: Boolean(session?.user?.id),
    tokenLength: session.access_token.length,
  });

  const response = await fetch(BACKEND_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: requestBody,
  });

  const responseText = await response.text();
  const payload = parseJsonResponse<BackendAIResponse | BackendAIErrorResponse>(responseText);

  if (!response.ok || !payload?.ok) {
    logAIRequestFailure({ url: BACKEND_AI_URL, method: 'POST', bodyLength: requestBody.length, status: response.status, responseText, hasSession: Boolean(session), isLoggedIn: Boolean(session?.user?.id) });
    const message = getLargeHeaderMessage(response.status)
      || (payload && 'error' in payload && payload.error ? payload.error : `VD Cloud AI 请求失败：${response.status}`);
    if (getLargeHeaderMessage(response.status)) await resetCloudAIAuthState();
    throw new Error(message);
  }

  return payload;
}

async function requestBrowserChatCompletion(settings: AISettings, systemPrompt: string, userPrompt: string): Promise<string> {
  const normalized = normalizeAISettings(settings);
  if (!normalized.apiKey.trim()) throw new Error('缺少 API Key，请先完成 AI 设置。');
  if (!normalized.baseUrl.trim()) throw new Error('缺少服务地址，请检查 AI 设置。');
  if (!normalized.model.trim()) throw new Error('缺少模型名称，请检查 AI 设置。');

  const endpoint = `${normalized.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const requestBody = JSON.stringify({
    model: normalized.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.2,
  });
  logAIRequestStart({ url: endpoint, method: 'POST', bodyLength: requestBody.length });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalized.apiKey}`,
    },
    body: requestBody,
  });

  const responseText = await response.text();
  const payload = parseJsonResponse<ChatCompletionResponse>(responseText);

  if (!response.ok) {
    logAIRequestFailure({ url: endpoint, method: 'POST', bodyLength: requestBody.length, status: response.status, responseText });
    const message = payload?.error?.message || (response.status === 401 ? 'API Key 无效或无权限。' : `AI 服务返回错误：${response.status}`);
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI 服务未返回有效分析内容。');
  return content;
}

export async function requestChatCompletion(settings: AISettings, systemPrompt: string, userPrompt: string, options: RequestChatCompletionOptions = {}): Promise<string> {
  const normalized = normalizeAISettings(settings);
  if (normalized.apiKey.trim()) return requestBrowserChatCompletion(normalized, systemPrompt, userPrompt);

  const response = await callBackendAI({
    mode: options.mode ?? 'task_advice',
    message: buildBackendMessage(systemPrompt, userPrompt),
    context: options.context,
  });
  return response.content;
}
