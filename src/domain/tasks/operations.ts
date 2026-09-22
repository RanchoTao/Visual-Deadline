import type { ActivityType, Goal, LifecycleStatus, Task, TaskInput } from '../../types/task.js';
import { getTaskScore } from '../../utils/taskScoring.js';

export type DeadlineFilter = 'all' | 'overdue' | 'today' | 'soon' | 'has_deadline' | 'no_deadline';
export type TaskSort = 'priority' | 'deadline' | 'importance' | 'updated';
export interface TaskFilters { query: string; lifecycle: LifecycleStatus | 'all'; activityType: ActivityType | 'all'; goalId: string | 'all'; deadline: DeadlineFilter; }
export interface BlockedState { blocked: boolean; blockingTaskIds: string[]; missingDependencyIds: string[]; }
export const defaultTaskFilters: TaskFilters = { query: '', lifecycle: 'active', activityType: 'all', goalId: 'all', deadline: 'all' };

const normalizeIds = (values: readonly string[] | undefined) => [...new Set((values ?? []).filter((value) => typeof value === 'string' && Boolean(value.trim())))];
const toTime = (value?: string) => value ? new Date(value).getTime() : Number.NaN;

export function getDeadlineState(task: Task, now = new Date()): 'terminal' | 'overdue' | 'today' | 'soon' | 'later' | 'no_deadline' {
  if (task.lifecycleStatus !== 'active') return 'terminal';
  const deadline = toTime(task.deadline);
  if (!Number.isFinite(deadline)) return 'no_deadline';
  const nowTime = now.getTime();
  if (deadline < nowTime) return 'overdue';
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  if (deadline <= endOfToday.getTime()) return 'today';
  if (deadline <= nowTime + 3 * 24 * 60 * 60 * 1000) return 'soon';
  return 'later';
}

export function getBlockedState(task: Task, tasks: readonly Task[]): BlockedState {
  const byId = new Map(tasks.map((item) => [item.id, item]));
  const missingDependencyIds: string[] = [];
  const blockingTaskIds: string[] = [];
  normalizeIds(task.dependencyIds).forEach((id) => {
    const predecessor = byId.get(id);
    if (!predecessor) missingDependencyIds.push(id);
    else if (predecessor.lifecycleStatus !== 'completed') blockingTaskIds.push(id);
  });
  return { blocked: blockingTaskIds.length > 0, blockingTaskIds, missingDependencyIds };
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilters, now = new Date()): Task[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return tasks.filter((task) => {
    if (filters.lifecycle !== 'all' && task.lifecycleStatus !== filters.lifecycle) return false;
    if (filters.activityType !== 'all' && task.activityType !== filters.activityType) return false;
    if (filters.goalId !== 'all' && !task.linkedGoalIds?.includes(filters.goalId)) return false;
    if (query && ![task.title, task.description, task.nextAction].some((value) => value?.toLocaleLowerCase().includes(query))) return false;
    if (filters.deadline === 'all') return true;
    const hasDeadline = Number.isFinite(toTime(task.deadline));
    if (filters.deadline === 'has_deadline') return hasDeadline;
    if (filters.deadline === 'no_deadline') return !hasDeadline;
    const state = getDeadlineState(task, now);
    return state === filters.deadline;
  });
}

export function sortTasks(tasks: readonly Task[], sort: TaskSort, now = new Date()): Task[] {
  return [...tasks].sort((left, right) => {
    const leftUpdated = toTime(left.updatedAt); const rightUpdated = toTime(right.updatedAt);
    const leftDeadline = Number.isFinite(toTime(left.deadline)) ? toTime(left.deadline) : Number.POSITIVE_INFINITY;
    const rightDeadline = Number.isFinite(toTime(right.deadline)) ? toTime(right.deadline) : Number.POSITIVE_INFINITY;
    const result = sort === 'priority' ? getTaskScore(right, now) - getTaskScore(left, now)
      : sort === 'deadline' ? leftDeadline - rightDeadline
        : sort === 'importance' ? right.importance - left.importance
          : rightUpdated - leftUpdated;
    return result || left.id.localeCompare(right.id);
  });
}

export function validateTaskDraft(input: TaskInput, tasks: readonly Task[], goals: readonly Goal[], taskId?: string): { errors: string[]; dependencyIds: string[]; linkedGoalIds: string[] } {
  const errors: string[] = [];
  const dependencyIds = normalizeIds(input.dependencyIds);
  const linkedGoalIds = normalizeIds(input.linkedGoalIds);
  if (!input.title.trim()) errors.push('请填写任务标题。');
  if (!Number.isFinite(input.importance) || input.importance < 1 || input.importance > 10) errors.push('重要性必须在 1 到 10 之间。');
  if (!Number.isFinite(input.progress) || input.progress < 0 || input.progress > 100) errors.push('进度必须在 0 到 100 之间。');
  if (input.deadline && !Number.isFinite(toTime(input.deadline))) errors.push('截止时间无效。');
  if (input.estimatedDuration !== undefined && (!Number.isFinite(input.estimatedDuration) || input.estimatedDuration <= 0)) errors.push('预计时长必须是正分钟数。');
  const goalIds = new Set(goals.map((goal) => goal.id));
  if (linkedGoalIds.some((id) => !goalIds.has(id))) errors.push('关联的目标已不存在。');
  const candidateId = taskId ?? '__new_task__';
  const knownIds = new Set(tasks.map((task) => task.id));
  if (dependencyIds.includes(candidateId)) errors.push('任务不能依赖自己。');
  if (dependencyIds.some((id) => !knownIds.has(id))) errors.push('前置任务不存在。');
  const graph = new Map(tasks.filter((task) => task.id !== candidateId).map((task) => [task.id, normalizeIds(task.dependencyIds)]));
  graph.set(candidateId, dependencyIds);
  if (hasCycle(graph)) errors.push('前置任务不能形成循环依赖。');
  return { errors, dependencyIds, linkedGoalIds };
}

function hasCycle(graph: Map<string, string[]>): boolean {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) if (graph.has(next) && visit(next)) return true;
    visiting.delete(id); visited.add(id); return false;
  };
  return [...graph.keys()].some(visit);
}

export function reconcileTaskGoalLinks(tasks: readonly Task[], goals: readonly Goal[], task: Task, previousGoalIds: readonly string[] = []): { tasks: Task[]; goals: Goal[] } {
  const nextGoalIds = normalizeIds(task.linkedGoalIds);
  const changedGoalIds = new Set([...previousGoalIds, ...nextGoalIds]);
  const nextTasks = tasks.some((item) => item.id === task.id) ? tasks.map((item) => item.id === task.id ? { ...task, linkedGoalIds: nextGoalIds } : item) : [{ ...task, linkedGoalIds: nextGoalIds }, ...tasks];
  const nextGoals = goals.map((goal) => {
    if (!changedGoalIds.has(goal.id)) return goal;
    const withoutTask = goal.linkedTaskIds.filter((id) => id !== task.id);
    return { ...goal, linkedTaskIds: nextGoalIds.includes(goal.id) ? [...withoutTask, task.id] : withoutTask, updatedAt: task.updatedAt };
  });
  return { tasks: nextTasks, goals: nextGoals };
}

export function deleteTaskWithReferences(tasks: readonly Task[], goals: readonly Goal[], taskId: string, updatedAt: string): { tasks: Task[]; goals: Goal[] } {
  return {
    tasks: tasks.filter((task) => task.id !== taskId).map((task) => task.dependencyIds?.includes(taskId) ? { ...task, dependencyIds: task.dependencyIds.filter((id) => id !== taskId), updatedAt } : task),
    goals: goals.map((goal) => goal.linkedTaskIds.includes(taskId) ? { ...goal, linkedTaskIds: goal.linkedTaskIds.filter((id) => id !== taskId), updatedAt } : goal),
  };
}

export function transitionTaskLifecycle(task: Task, lifecycleStatus: LifecycleStatus, now = new Date().toISOString()): Task {
  if (lifecycleStatus === 'completed') return { ...task, lifecycleStatus, progress: 100, taskProgress: 100, progressMode: 'manual', completedAt: now, abandonedAt: undefined, updatedAt: now };
  if (lifecycleStatus === 'abandoned') return { ...task, lifecycleStatus, completedAt: undefined, abandonedAt: now, updatedAt: now };
  return { ...task, lifecycleStatus: 'active', progress: task.progress >= 100 ? 0 : task.progress, taskProgress: (task.taskProgress ?? task.progress) >= 100 ? 0 : task.taskProgress, completedAt: undefined, abandonedAt: undefined, updatedAt: now };
}

/** Explicit status selection wins when editing an existing task. */
export function applyTaskEditLifecycle(task: Task, input: TaskInput, now = new Date().toISOString()): Task {
  return transitionTaskLifecycle({ ...task, ...input, completedAt: undefined, abandonedAt: undefined, updatedAt: now }, input.lifecycleStatus, now);
}
