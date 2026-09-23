import type { ActivityType, Goal, GoalMilestone, Importance, Task, TaskInput } from '../../types/task.js';
import { clampImportance, normalizeActivityType } from '../../utils/taskScoring.js';
import { createGoalMilestone, normalizeGoalMilestones } from './hierarchy.js';

export interface DecompositionMilestoneDraft {
  id: string;
  title: string;
  description?: string;
  targetDate?: string;
  successCriteria?: string;
  status?: GoalMilestone['status'];
  included: boolean;
  duplicateWarning?: string;
}

export interface DecompositionTaskDraft {
  id: string;
  title: string;
  description?: string;
  importance: Importance;
  deadline?: string;
  estimatedDuration?: number;
  category: ActivityType;
  milestoneDraftId?: string;
  dependencyDraftIds: string[];
  included: boolean;
  duplicateWarning?: string;
}

export interface GoalDecompositionDraft {
  milestones: DecompositionMilestoneDraft[];
  tasks: DecompositionTaskDraft[];
  ambiguities: string[];
  notes: string[];
}

export type GoalDecompositionParseResult = { ok: true; value: GoalDecompositionDraft } | { ok: false; error: string };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MILESTONES = 20;
const MAX_TASKS = 100;

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text && text.length <= max ? text : undefined;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function hasCycle(tasks: DecompositionTaskDraft[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (byId.get(id)?.dependencyDraftIds ?? []).some(visit);
    visiting.delete(id); visited.add(id);
    return cyclic;
  };
  return tasks.some((task) => visit(task.id));
}

/** Strict, bounded parser for model output. It never guesses relationships. */
export function parseGoalDecomposition(raw: string, existingTasks: Task[] = [], existingMilestoneTitles: string[] = []): GoalDecompositionParseResult {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, error: 'AI 返回的不是有效 JSON。请重试。' }; }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: 'AI 返回的计划格式无效。' };
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.milestones) || !Array.isArray(record.tasks)) return { ok: false, error: 'AI 计划必须包含 milestones 和 tasks 数组。' };
  if (record.milestones.length > MAX_MILESTONES || record.tasks.length > MAX_TASKS) return { ok: false, error: 'AI 计划超过安全数量上限。' };
  const milestoneIds = new Set<string>();
  const milestones: DecompositionMilestoneDraft[] = [];
  for (const item of record.milestones) {
    if (!item || typeof item !== 'object') return { ok: false, error: '里程碑格式无效。' };
    const source = item as Record<string, unknown>;
    const id = boundedText(source.id, 120); const title = boundedText(source.title, 240);
    if (!id || !title || milestoneIds.has(id)) return { ok: false, error: '里程碑 ID 必须唯一且标题不能为空。' };
    if (source.targetDate !== null && source.targetDate !== undefined && !validDate(source.targetDate)) return { ok: false, error: '里程碑包含无效日期。' };
    milestoneIds.add(id);
    const duplicate = existingMilestoneTitles.some((existingTitle) => existingTitle.trim() === title);
    milestones.push({ id, title, description: boundedText(source.description, 4_000), targetDate: validDate(source.targetDate) ? source.targetDate : undefined, successCriteria: boundedText(source.successCriteria, 2_000), status: source.status === 'ready' || source.status === 'in_progress' || source.status === 'blocked' ? source.status : 'planned', included: !duplicate, duplicateWarning: duplicate ? `可能与现有里程碑重复：${title}` : undefined });
  }
  const taskIds = new Set<string>();
  const tasks: DecompositionTaskDraft[] = [];
  for (const item of record.tasks) {
    if (!item || typeof item !== 'object') return { ok: false, error: '任务格式无效。' };
    const source = item as Record<string, unknown>;
    const id = boundedText(source.id, 120); const title = boundedText(source.title, 240);
    if (!id || !title || taskIds.has(id)) return { ok: false, error: '任务 ID 必须唯一且标题不能为空。' };
    if (source.deadline !== null && source.deadline !== undefined && !validDate(source.deadline)) return { ok: false, error: '任务包含无效日期。' };
    const milestoneDraftId = source.milestoneDraftId === null || source.milestoneDraftId === undefined ? undefined : boundedText(source.milestoneDraftId, 120);
    if (milestoneDraftId && !milestoneIds.has(milestoneDraftId)) return { ok: false, error: '任务引用了不存在的里程碑。' };
    const dependencies = Array.isArray(source.dependencyDraftIds) ? source.dependencyDraftIds.map((value) => boundedText(value, 120)).filter((value): value is string => Boolean(value)) : [];
    if (dependencies.length > 20 || dependencies.includes(id)) return { ok: false, error: '任务依赖无效或包含自身。' };
    const duration = typeof source.estimatedDuration === 'number' && Number.isFinite(source.estimatedDuration) && source.estimatedDuration > 0 ? Math.min(10_080, Math.round(source.estimatedDuration)) : undefined;
    taskIds.add(id);
    const duplicate = existingTasks.some((task) => task.title.trim() === title);
    tasks.push({ id, title, description: boundedText(source.description, 8_000), importance: clampImportance(typeof source.importance === 'number' ? source.importance : 5), deadline: validDate(source.deadline) ? source.deadline : undefined, estimatedDuration: duration, category: normalizeActivityType(typeof source.category === 'string' ? source.category : undefined), milestoneDraftId, dependencyDraftIds: dependencies, included: !duplicate, duplicateWarning: duplicate ? `可能与现有任务重复：${title}` : undefined });
  }
  if (tasks.some((task) => task.dependencyDraftIds.some((id) => !taskIds.has(id))) || hasCycle(tasks)) return { ok: false, error: '任务依赖引用不存在或形成循环。' };
  const normalizeMessages = (value: unknown) => Array.isArray(value) ? value.slice(0, 20).map((entry) => boundedText(entry, 500)).filter((entry): entry is string => Boolean(entry)) : [];
  return { ok: true, value: { milestones, tasks, ambiguities: normalizeMessages(record.ambiguities), notes: normalizeMessages(record.notes) } };
}

export interface DecompositionMaterializationPlan {
  milestones: GoalMilestone[];
  tasks: { draftId: string; id: string; input: TaskInput }[];
}

/** Allocates all IDs and validates selected review edits before any React state write. */
export function buildGoalDecompositionMaterializationPlan(goal: Goal, draft: GoalDecompositionDraft, now = new Date().toISOString()): DecompositionMaterializationPlan {
  const includedMilestones = draft.milestones.filter((milestone) => milestone.included);
  const ids = new Set<string>();
  if (includedMilestones.some((milestone) => !milestone.title.trim() || ids.has(milestone.id))) throw new Error('请选择具有唯一标题的里程碑。');
  includedMilestones.forEach((milestone) => ids.add(milestone.id));
  const milestoneIdMap = new Map(includedMilestones.map((milestone) => [milestone.id, crypto.randomUUID()]));
  const existingMilestones = normalizeGoalMilestones(goal.milestones, now);
  const milestones = includedMilestones.map((milestone, index) => ({ ...createGoalMilestone({ ...milestone, title: milestone.title, sequence: existingMilestones.length + index + 1 }, now, milestoneIdMap.get(milestone.id)), sequence: existingMilestones.length + index + 1 }));
  const includedTasks = draft.tasks.filter((task) => task.included);
  const taskIds = new Set<string>();
  includedTasks.forEach((task) => {
    if (!task.title.trim() || taskIds.has(task.id) || task.importance < 1 || task.importance > 10 || (task.deadline && !validDate(task.deadline)) || (task.estimatedDuration !== undefined && (!Number.isFinite(task.estimatedDuration) || task.estimatedDuration <= 0))) throw new Error('请修正已选择任务中的标题、重要性、日期或时长。');
    if (task.milestoneDraftId && !milestoneIdMap.has(task.milestoneDraftId)) throw new Error('已选择任务引用了未选择的里程碑。');
    taskIds.add(task.id);
  });
  if (includedTasks.some((task) => task.dependencyDraftIds.some((id) => !taskIds.has(id) || id === task.id)) || hasCycle(includedTasks)) throw new Error('请修正已选择任务之间的依赖。');
  const taskIdMap = new Map(includedTasks.map((task) => [task.id, crypto.randomUUID()]));
  return {
    milestones,
    tasks: includedTasks.map((task) => ({ draftId: task.id, id: taskIdMap.get(task.id)!, input: { title: task.title.trim(), description: task.description, importance: task.importance, deadline: task.deadline, estimatedDuration: task.estimatedDuration, activityType: task.category, dependencyIds: task.dependencyDraftIds.map((id) => taskIdMap.get(id)!), linkedGoalIds: [goal.id], milestoneId: task.milestoneDraftId ? milestoneIdMap.get(task.milestoneDraftId) : undefined, progress: 0, taskProgress: 0, progressMode: 'manual', lifecycleStatus: 'active' } })),
  };
}

export const goalDecompositionSystemPrompt = `You decompose ONE existing goal into an editable plan. Return JSON only, no Markdown.\nSchema:\n{\n  "milestones": [{"id":"milestone-1","title":"...","description":null,"targetDate":null,"successCriteria":null,"status":"planned"}],\n  "tasks": [{"id":"task-1","title":"...","description":null,"importance":5,"deadline":null,"estimatedDuration":60,"category":"research","milestoneDraftId":"milestone-1","dependencyDraftIds":[]}],\n  "ambiguities": [],\n  "notes": []\n}\nCreate 1-10 meaningful outcome/stage milestones when the goal merits decomposition. importance is 1-10 and is NOT urgency. A deadline needs evidence; use null if uncertain. estimatedDuration is minutes; use null if uncertain. Use only prerequisite dependencies, never cycles. Activity categories: task, schedule, entertainment, recovery, study, research, fitness, exercise, work, life, social, other. Do not schedule time, allocate resources, invent a root goal, produce checklist spam, motivation prose, or claim completion.`;
