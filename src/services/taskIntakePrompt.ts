import type { LifecycleStatus, TaskInput, Task } from '../types/task';
import { clampImportance, clampProgress, normalizeActivityType } from '../utils/taskScoring';

export const taskIntakeSystemPrompt = `你是 Visual Deadline（VD）的任务结构化引擎。

你的工作是把用户的自然语言转换为结构化任务草稿。

规则：
- 只提取具体可执行的任务。
- 在有用时推断任务类型、拆分建议、阶段和里程碑。
- 不要为模糊背景创建任务。
- 仅在有证据时推断合理的重要性。
- 仅在用户陈述或强烈暗示时间时推断截止时间。
- “今晚”“明天”“本周五”等模糊时间必须用提供的当前时间解析。
- 截止时间不明确时使用 null。
- 任务标题、描述、拆分、阶段、里程碑和 notes 必须使用简体中文。
- 不要编造过多任务，也不要提供激励建议。
- 仅返回有效 JSON。

JSON 结构如下：

{
  "tasks": [
    {
      "title": "string",
      "description": "string | null",
      "importance": 1,
      "deadline": "ISO string | null",
      "progress": 0,
      "activityType": "study | research | exercise | social | work | life | recovery | entertainment | other",
      "lifecycleStatus": "active",
      "decomposition": ["string"],
      "stages": ["string"],
      "milestoneSuggestions": ["string"]
    }
  ],
  "notes": "string"
}

如果没有找到可执行任务：
{
  "tasks": [],
  "notes": "没有识别到明确任务。"
}`;

export interface TaskIntakePromptPayload {
  currentTime: string;
  input: string;
  existingTaskTitles: string[];
}

export interface TaskIntakeResult {
  tasks: TaskInput[];
  notes: string;
  rawJson: string;
}

function stripJsonFences(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

function normalizeDeadline(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value !== 'string') return undefined;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString();
}

function normalizeLifecycleStatus(_value: unknown): LifecycleStatus {
  return 'active';
}

function normalizeTaskDraft(value: unknown): TaskInput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const draft = value as Record<string, unknown>;
  const title = typeof draft.title === 'string' ? draft.title.trim() : '';
  if (!title) return undefined;

  const description = typeof draft.description === 'string' && draft.description.trim() ? draft.description.trim() : undefined;
  const importance = clampImportance(typeof draft.importance === 'number' ? draft.importance : Number(draft.importance));
  const progress = clampProgress(typeof draft.progress === 'number' ? draft.progress : Number(draft.progress ?? 0));
  const deadline = normalizeDeadline(draft.deadline);
  const activityType = normalizeActivityType(typeof draft.activityType === 'string' ? draft.activityType : undefined);
  const decomposition = Array.isArray(draft.decomposition) ? draft.decomposition.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 8) : undefined;
  const stages = Array.isArray(draft.stages) ? draft.stages.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 8) : undefined;
  const milestoneSuggestions = Array.isArray(draft.milestoneSuggestions) ? draft.milestoneSuggestions.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 8) : undefined;

  return {
    title,
    description,
    importance,
    deadline,
    progress,
    taskProgress: progress,
    progressMode: deadline && progress === 0 ? 'auto' : 'manual',
    decomposition,
    stages,
    milestoneSuggestions,
    activityType,
    lifecycleStatus: normalizeLifecycleStatus(draft.lifecycleStatus),
  };
}

export function buildTaskIntakeUserPrompt(payload: TaskIntakePromptPayload): string {
  return JSON.stringify(
    {
      currentTime: payload.currentTime,
      userInput: payload.input,
      existingTaskTitles: payload.existingTaskTitles,
      instruction: '把用户输入转换为确认前的任务草稿；工作较大时可给出拆分、阶段和里程碑。所有面向用户的文本必须为简体中文。仅返回有效 JSON，不要直接创建任务。',
    },
    null,
    2,
  );
}

export function createTaskIntakePayload(input: string, tasks: Task[]): TaskIntakePromptPayload {
  return {
    currentTime: new Date().toISOString(),
    input,
    existingTaskTitles: tasks.filter((task) => task.lifecycleStatus === 'active').slice(0, 20).map((task) => task.title),
  };
}

export function parseTaskIntakeResponse(content: string): TaskIntakeResult {
  const rawJson = stripJsonFences(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('AI 返回内容不是有效 JSON，请重新整理或调整输入。');
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回 JSON 结构无效。');
  const payload = parsed as { tasks?: unknown; notes?: unknown };
  if (!Array.isArray(payload.tasks)) throw new Error('AI 返回 JSON 中缺少 tasks 数组。');

  return {
    tasks: payload.tasks.map(normalizeTaskDraft).filter((task): task is TaskInput => Boolean(task)),
    notes: typeof payload.notes === 'string' && payload.notes.trim() ? payload.notes.trim() : '',
    rawJson,
  };
}
