import type { AISettings } from './aiClient';
import { requestChatCompletion } from './aiClient';
import type { IntakeAssetReference, TaskDraft } from '../types/intake';

export interface AIProvider {
  understandImage(asset: IntakeAssetReference, signal?: AbortSignal): Promise<string>;
  extractDocument(asset: IntakeAssetReference, signal?: AbortSignal): Promise<string>;
  transcribeAudio(asset: IntakeAssetReference, signal?: AbortSignal): Promise<string>;
  compileTaskDrafts(input: string, signal?: AbortSignal): Promise<unknown>;
}

export class ConfiguredChatProvider implements AIProvider {
  constructor(private readonly settings: AISettings) {}
  understandImage(asset: IntakeAssetReference) { return this.unsupported('图像理解', asset); }
  extractDocument(asset: IntakeAssetReference) { return this.unsupported('文档提取', asset); }
  transcribeAudio(asset: IntakeAssetReference) { return this.unsupported('语音转写', asset); }
  compileTaskDrafts(input: string) { return requestChatCompletion(this.settings, '将输入编译为 JSON 任务草稿。不要创建正式任务。', input).then(JSON.parse); }
  private unsupported(capability: string, asset: IntakeAssetReference): Promise<string> {
    return Promise.reject(new Error(`${capability} Provider 尚未配置：${asset.fileName}`));
  }
}

export function validateTaskDraft(value: unknown): TaskDraft {
  if (!value || typeof value !== 'object') throw new Error('TaskDraft 必须是对象。');
  const item = value as Record<string, unknown>;
  if (typeof item.title !== 'string' || !item.title.trim()) throw new Error('TaskDraft.title 无效。');
  const importance = Number(item.importance);
  const confidence = Number(item.confidence);
  if (!Number.isFinite(importance) || importance < 1 || importance > 10 || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('TaskDraft 评分无效。');
  return { title: item.title.trim(), description: typeof item.description === 'string' ? item.description : undefined, projectId: typeof item.projectId === 'string' ? item.projectId : undefined, dueAt: typeof item.dueAt === 'string' ? item.dueAt : undefined, importance, estimatedMinutes: typeof item.estimatedMinutes === 'number' ? item.estimatedMinutes : undefined, subtasks: Array.isArray(item.subtasks) ? item.subtasks.filter((entry): entry is string => typeof entry === 'string') : [], sourceRefs: Array.isArray(item.sourceRefs) ? item.sourceRefs.filter((entry): entry is string => typeof entry === 'string') : [], confidence, ambiguities: Array.isArray(item.ambiguities) ? item.ambiguities.filter((entry): entry is string => typeof entry === 'string') : [] };
}

export class TaskCompiler {
  constructor(private readonly provider: AIProvider) {}
  async compile(input: { text: string; extractedContent: string[] }, signal?: AbortSignal): Promise<TaskDraft[]> {
    const raw = await this.provider.compileTaskDrafts(JSON.stringify(input), signal);
    if (!Array.isArray(raw)) throw new Error('AI 返回必须是 TaskDraft 数组。');
    return raw.map(validateTaskDraft);
  }
}
