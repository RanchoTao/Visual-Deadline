import type { ActivityType, Importance } from '../../types/task.js';
import type { CaptureInterpretation, CaptureTaskDraft } from './types.js';

const categories: ActivityType[] = ['task', 'schedule', 'entertainment', 'recovery', 'study', 'research', 'fitness', 'exercise', 'work', 'life', 'social', 'other'];
const id = (prefix: string, value: unknown, index: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : `${prefix}-${index + 1}`;
const title = (value: unknown) => typeof value === 'string' ? value.trim().slice(0, 240) : '';
const importance = (value: unknown): Importance => Math.max(1, Math.min(10, Math.round(Number(value) || 5))) as Importance;
const category = (value: unknown): ActivityType => categories.includes(value as ActivityType) ? value as ActivityType : 'task';
const date = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(value) ? value : undefined;
const confidence = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1 ? value : undefined;
const list = (value: unknown) => Array.isArray(value) ? value : [];

/** Parses untrusted provider JSON into bounded review drafts; no persistence happens here. */
export function parseCaptureInterpretation(response: string): CaptureInterpretation {
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Record<string, unknown>; } catch { return { goals: [], tasks: [], commitments: [], context: [], ambiguities: [{ id: 'response', text: 'AI 返回无法解析，请修改输入后重试。' }], notes: [] }; }
  const goals = list(raw.goals).map((item, index) => {
    const value = item as Record<string, unknown>; const draftTitle = title(value.title);
    return draftTitle ? { id: id('goal', value.id, index), title: draftTitle, targetDate: date(value.targetDate), category: category(value.category), priority: importance(value.priority), included: value.included !== false, confidence: confidence(value.confidence) } : undefined;
  }).filter(Boolean) as CaptureInterpretation['goals'];
  const goalIds = new Set(goals.map((goal) => goal.id));
  const tasks = list(raw.tasks).map((item, index) => {
    const value = item as Record<string, unknown>; const draftTitle = title(value.title);
    if (!draftTitle) return undefined;
    const minutes = Number(value.estimatedDuration);
    return { id: id('task', value.id, index), title: draftTitle, description: title(value.description) || undefined, importance: importance(value.importance), deadline: date(value.deadline), estimatedDuration: Number.isFinite(minutes) && minutes > 0 && minutes <= 10080 ? Math.round(minutes) : undefined, category: category(value.category), goalDraftId: typeof value.goalDraftId === 'string' && goalIds.has(value.goalDraftId) ? value.goalDraftId : undefined, dependencyDraftIds: list(value.dependencyDraftIds).filter((dep): dep is string => typeof dep === 'string'), included: value.included !== false, confidence: confidence(value.confidence) } satisfies CaptureTaskDraft;
  }).filter(Boolean) as CaptureTaskDraft[];
  const taskIds = new Set(tasks.map((task) => task.id));
  tasks.forEach((task) => { task.dependencyDraftIds = task.dependencyDraftIds.filter((dependency) => dependency !== task.id && taskIds.has(dependency)); });
  const cyclic = new Set<string>();
  const visiting = new Set<string>(); const visited = new Set<string>(); const byId = new Map(tasks.map((task) => [task.id, task]));
  const visit = (task: CaptureTaskDraft) => { if (visiting.has(task.id)) { cyclic.add(task.id); return; } if (visited.has(task.id)) return; visiting.add(task.id); task.dependencyDraftIds.forEach((dependency) => { const target = byId.get(dependency); if (target) { visit(target); if (cyclic.has(target.id)) cyclic.add(task.id); } }); visiting.delete(task.id); visited.add(task.id); };
  tasks.forEach(visit); tasks.forEach((task) => { if (cyclic.has(task.id)) task.dependencyDraftIds = []; });
  const simple = <T extends { id: string }>(key: string, map: (value: Record<string, unknown>, index: number) => T | undefined) => list(raw[key]).map((item, index) => map(item as Record<string, unknown>, index)).filter(Boolean) as T[];
  return { goals, tasks, commitments: simple('commitments', (value, index) => { const valueTitle = title(value.title); return valueTitle ? { id: id('commitment', value.id, index), title: valueTitle, date: date(value.date), included: value.included !== false, confidence: confidence(value.confidence) } : undefined; }), context: simple('context', (value, index) => { const text = title(value.text); return text ? { id: id('context', value.id, index), text, confidence: confidence(value.confidence) } : undefined; }), ambiguities: simple('ambiguities', (value, index) => { const text = title(value.text); return text ? { id: id('ambiguity', value.id, index), text } : undefined; }), notes: list(raw.notes).filter((note): note is string => typeof note === 'string').map((note) => note.slice(0, 500)) };
}
