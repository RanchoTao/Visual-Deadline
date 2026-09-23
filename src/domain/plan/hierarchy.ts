import type { Goal, GoalMilestone, GoalMilestoneStatus, Task } from '../../types/task.js';

const MILESTONE_STATUSES: readonly GoalMilestoneStatus[] = ['planned', 'ready', 'in_progress', 'completed', 'skipped', 'blocked', 'archived'];

export interface GoalPlanProgress {
  milestoneTotal: number;
  milestoneCompleted: number;
  taskTotal: number;
  taskCompleted: number;
  progress: number;
}

export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function validStatus(value: unknown): value is GoalMilestoneStatus {
  return typeof value === 'string' && MILESTONE_STATUSES.includes(value as GoalMilestoneStatus);
}

function stringOrUndefined(value: unknown, maxLength = 2_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim().slice(0, maxLength);
  return text || undefined;
}

/** Safely normalizes additive milestone data. Duplicate IDs are omitted, never remapped. */
export function normalizeGoalMilestones(value: unknown, now = new Date().toISOString()): GoalMilestone[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const normalized: GoalMilestone[] = [];
  value.forEach((candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    const source = candidate as Partial<GoalMilestone>;
    const id = stringOrUndefined(source.id, 160);
    const title = stringOrUndefined(source.title, 240);
    if (!id || !title || ids.has(id)) return;
    ids.add(id);
    const status = validStatus(source.status) ? source.status : 'planned';
    const completedAt = status === 'completed' && typeof source.completedAt === 'string' ? source.completedAt : undefined;
    normalized.push({
      id,
      title,
      description: stringOrUndefined(source.description),
      sequence: normalized.length + 1,
      targetDate: validDate(source.targetDate) ? source.targetDate : undefined,
      successCriteria: stringOrUndefined(source.successCriteria),
      completionEvidence: stringOrUndefined(source.completionEvidence),
      status,
      createdAt: typeof source.createdAt === 'string' ? source.createdAt : now,
      updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : now,
      completedAt,
    });
  });
  return normalized.sort((left, right) => left.sequence - right.sequence).map((milestone, index) => ({ ...milestone, sequence: index + 1 }));
}

export function createGoalMilestone(input: Partial<GoalMilestone> & { title: string }, now = new Date().toISOString(), id = crypto.randomUUID()): GoalMilestone {
  const title = input.title.trim().slice(0, 240);
  if (!title) throw new Error('里程碑标题不能为空。');
  const status = validStatus(input.status) ? input.status : 'planned';
  return {
    id,
    title,
    description: stringOrUndefined(input.description),
    sequence: Number.isFinite(input.sequence) ? Math.max(1, Math.floor(input.sequence as number)) : 1,
    targetDate: validDate(input.targetDate) ? input.targetDate : undefined,
    successCriteria: stringOrUndefined(input.successCriteria),
    completionEvidence: stringOrUndefined(input.completionEvidence),
    status,
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'completed' ? now : undefined,
  };
}

export function updateGoalMilestone(goal: Goal, milestoneId: string, patch: Partial<GoalMilestone>, now = new Date().toISOString()): Goal {
  const milestones = normalizeGoalMilestones(goal.milestones, now);
  const index = milestones.findIndex((milestone) => milestone.id === milestoneId);
  if (index < 0) throw new Error('未找到要更新的里程碑。');
  const current = milestones[index];
  const nextStatus = patch.status === undefined ? current.status : (validStatus(patch.status) ? patch.status : current.status);
  const nextTitle = patch.title === undefined ? current.title : stringOrUndefined(patch.title, 240);
  if (!nextTitle) throw new Error('里程碑标题不能为空。');
  milestones[index] = {
    ...current,
    title: nextTitle,
    description: patch.description === undefined ? current.description : stringOrUndefined(patch.description),
    targetDate: patch.targetDate === undefined ? current.targetDate : (validDate(patch.targetDate) ? patch.targetDate : undefined),
    successCriteria: patch.successCriteria === undefined ? current.successCriteria : stringOrUndefined(patch.successCriteria),
    completionEvidence: patch.completionEvidence === undefined ? current.completionEvidence : stringOrUndefined(patch.completionEvidence),
    status: nextStatus,
    completedAt: nextStatus === 'completed' ? (current.completedAt ?? now) : undefined,
    updatedAt: now,
  };
  return { ...goal, milestones: normalizeGoalMilestones(milestones, now), updatedAt: now };
}

export function reorderGoalMilestones(goal: Goal, orderedIds: string[], now = new Date().toISOString()): Goal {
  const milestones = normalizeGoalMilestones(goal.milestones, now);
  const byId = new Map(milestones.map((milestone) => [milestone.id, milestone]));
  const seen = new Set<string>();
  const ordered = orderedIds.flatMap((id) => {
    if (seen.has(id) || !byId.has(id)) return [];
    seen.add(id);
    return [byId.get(id)!];
  });
  milestones.forEach((milestone) => { if (!seen.has(milestone.id)) ordered.push(milestone); });
  return { ...goal, milestones: ordered.map((milestone, index) => ({ ...milestone, sequence: index + 1, updatedAt: now })), updatedAt: now };
}

export function deleteMilestoneWithTaskCleanup(goals: Goal[], tasks: Task[], goalId: string, milestoneId: string, now = new Date().toISOString()): { goals: Goal[]; tasks: Task[] } {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal || !normalizeGoalMilestones(goal.milestones, now).some((milestone) => milestone.id === milestoneId)) throw new Error('未找到要删除的里程碑。');
  return {
    goals: goals.map((item) => item.id === goalId ? { ...item, milestones: normalizeGoalMilestones(item.milestones, now).filter((milestone) => milestone.id !== milestoneId).map((milestone, index) => ({ ...milestone, sequence: index + 1 })), updatedAt: now } : item),
    tasks: tasks.map((task) => task.milestoneId === milestoneId ? { ...task, milestoneId: undefined, updatedAt: now } : task),
  };
}

export function assignTaskToMilestone(goals: Goal[], tasks: Task[], taskId: string, goalId: string, milestoneId: string, now = new Date().toISOString()): { goals: Goal[]; tasks: Task[] } {
  const goal = goals.find((item) => item.id === goalId);
  const task = tasks.find((item) => item.id === taskId);
  if (!goal || !task || !normalizeGoalMilestones(goal.milestones, now).some((milestone) => milestone.id === milestoneId)) throw new Error('任务、目标或里程碑无效。');
  return {
    goals: goals.map((item) => item.id === goalId ? { ...item, linkedTaskIds: [...new Set([...item.linkedTaskIds, taskId])], updatedAt: now } : item),
    tasks: tasks.map((item) => item.id === taskId ? { ...item, milestoneId, linkedGoalIds: [...new Set([...(item.linkedGoalIds ?? []), goalId])], updatedAt: now } : item),
  };
}

export function unassignTaskFromMilestone(tasks: Task[], taskId: string, now = new Date().toISOString()): Task[] {
  return tasks.map((task) => task.id === taskId ? { ...task, milestoneId: undefined, updatedAt: now } : task);
}

export function deleteGoalWithPlanCleanup(goals: Goal[], tasks: Task[], goalId: string, now = new Date().toISOString()): { goals: Goal[]; tasks: Task[] } {
  const goal = goals.find((item) => item.id === goalId);
  if (!goal) return { goals, tasks };
  const milestoneIds = new Set(normalizeGoalMilestones(goal.milestones, now).map((milestone) => milestone.id));
  return {
    goals: goals.filter((item) => item.id !== goalId),
    tasks: tasks.map((task) => {
      const linkedGoalIds = task.linkedGoalIds?.filter((id) => id !== goalId);
      const milestoneId = task.milestoneId && milestoneIds.has(task.milestoneId) ? undefined : task.milestoneId;
      return linkedGoalIds?.length !== task.linkedGoalIds?.length || milestoneId !== task.milestoneId ? { ...task, linkedGoalIds, milestoneId, updatedAt: now } : task;
    }),
  };
}

export function projectGoalPlanProgress(goal: Goal, tasks: Task[]): GoalPlanProgress {
  const milestones = normalizeGoalMilestones(goal.milestones);
  const milestoneIds = new Set(milestones.map((milestone) => milestone.id));
  const relatedTasks = tasks.filter((task) => task.linkedGoalIds?.includes(goal.id) || (task.milestoneId && milestoneIds.has(task.milestoneId)));
  const milestoneCompleted = milestones.filter((milestone) => milestone.status === 'completed').length;
  const taskCompleted = relatedTasks.filter((task) => task.lifecycleStatus === 'completed').length;
  // A goal with milestones is projected from milestone completion only; task completion remains a separate, visible count.
  const progress = milestones.length
    ? Math.round((milestoneCompleted / milestones.length) * 100)
    : relatedTasks.length ? Math.round((taskCompleted / relatedTasks.length) * 100) : 0;
  return { milestoneTotal: milestones.length, milestoneCompleted, taskTotal: relatedTasks.length, taskCompleted, progress };
}

export function validatePlanHierarchy(goals: Goal[], tasks: Task[]): PlanValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const milestones = new Map<string, string>();
  goals.forEach((goal) => {
    const seen = new Set<string>();
    (goal.milestones ?? []).forEach((milestone) => {
      if (seen.has(milestone.id) || milestones.has(milestone.id)) warnings.push(`重复里程碑 ID：${milestone.id}`);
      else milestones.set(milestone.id, goal.id);
      seen.add(milestone.id);
    });
  });
  tasks.forEach((task) => {
    if (task.milestoneId && !milestones.has(task.milestoneId)) warnings.push(`任务“${task.title}”引用了不存在的里程碑。`);
    if (task.milestoneId && milestones.has(task.milestoneId) && !task.linkedGoalIds?.includes(milestones.get(task.milestoneId)!)) errors.push(`任务“${task.title}”缺少里程碑所属目标链接。`);
  });
  return { valid: errors.length === 0, errors, warnings };
}
