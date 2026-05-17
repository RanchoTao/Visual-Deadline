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

export async function callBackendAI(request: BackendAIRequest): Promise<BackendAIResponse> {
  const session = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('请先登录后再使用 VD Cloud AI。');

  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(request),
  });

  let payload: BackendAIResponse | BackendAIErrorResponse | undefined;
  try {
    payload = (await response.json()) as BackendAIResponse | BackendAIErrorResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok || !payload?.ok) {
    const message = payload && 'error' in payload && payload.error ? payload.error : `VD Cloud AI 请求失败：${response.status}`;
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
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${normalized.apiKey}`,
    },
    body: JSON.stringify({
      model: normalized.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });

  let payload: ChatCompletionResponse | undefined;
  try {
    payload = (await response.json()) as ChatCompletionResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
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
