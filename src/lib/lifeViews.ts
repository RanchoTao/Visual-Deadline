import type { GoalDependency, LifeNode } from '../types/lifePlanning';
import type { Goal, Task } from '../types/task';

export type ScheduleStatus = 'active' | 'blocked' | 'completed' | 'overdue' | 'planned';
export interface ScheduleRow { id: string; kind: 'goal' | 'task'; title: string; groupId: string; groupTitle: string; start?: Date; end?: Date; progress: number; status: ScheduleStatus; dependencyIds: string[]; source: Goal | Task }

const date = (value?: string) => { if (!value) return undefined; const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value); return Number.isNaN(parsed.getTime()) ? undefined : parsed; };
const clamp = (value: number) => Math.max(0, Math.min(100, value));

/** A single adapter is the source of truth for both Life OS projections. */
export function projectLifeData(goals: Goal[], tasks: Task[], savedNodes: LifeNode[], savedDependencies: GoalDependency[]) {
  const savedByGoal = new Map(savedNodes.filter((node) => node.sourceGoalId).map((node) => [node.sourceGoalId!, node]));
  const goalNodes: LifeNode[] = goals.map((goal, index) => {
    const existing = savedByGoal.get(goal.id);
    return existing || { id: `goal-${goal.id}`, sourceGoalId: goal.id, layer: goal.lifeLayer || 'long_term', title: goal.title, status: goal.planningStatus || 'secondary', domain: goal.category, importance: goal.priority, startDate: goal.startDate || goal.createdAt.slice(0, 10), deadline: goal.targetDate, pathId: 'main', pathName: '主线', pathStatus: goal.planningStatus === 'archived' ? 'abandoned' : goal.planningStatus === 'completed' ? 'completed' : 'active', displayOrder: index, current: goal.planningStatus === 'focus' };
  });
  const goalNodeIds = new Set(goalNodes.map((node) => node.id));
  const retained = savedNodes.filter((node) => !node.sourceGoalId || !goals.some((goal) => goal.id === node.sourceGoalId));
  const nodes = [...goalNodes, ...retained].map((node, index, all) => { const samePathPrevious = all.slice(0, index).filter((item) => (item.pathId || 'main') === (node.pathId || 'main')).at(-1); return { ...node, predecessorId: node.predecessorId || (node.parentId && all.some((item) => item.id === node.parentId) ? node.parentId : samePathPrevious?.id), displayOrder: node.displayOrder ?? index }; });
  const dependencies = savedDependencies.filter((edge) => nodes.some((node) => node.id === edge.sourceId) && nodes.some((node) => node.id === edge.targetId));
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const rows: ScheduleRow[] = [];
  goals.forEach((goal) => {
    const linked = tasks.filter((task) => task.linkedGoalIds?.includes(goal.id) || goal.linkedTaskIds.includes(task.id));
    const start = date(goal.startDate || goal.createdAt); const end = date(goal.targetDate);
    if (start || end) rows.push({ id: `goal-${goal.id}`, kind: 'goal', title: goal.title, groupId: goal.id, groupTitle: goal.title, start, end: end || start, progress: linked.length ? Math.round(linked.reduce((sum, task) => sum + task.progress, 0) / linked.length) : goal.planningStatus === 'completed' ? 100 : 0, status: goal.planningStatus === 'completed' ? 'completed' : end && end < today ? 'overdue' : 'active', dependencyIds: [], source: goal });
  });
  tasks.forEach((task) => {
    const groupId = task.linkedGoalIds?.find((id) => goalById.has(id)) || 'ungrouped';
    const start = date(task.startDate || task.createdAt); const end = date(task.deadline);
    rows.push({ id: `task-${task.id}`, kind: 'task', title: task.title, groupId, groupTitle: goalById.get(groupId)?.title || '未归属项目', start: task.startDate ? start : end ? start : undefined, end, progress: clamp(task.progress), status: task.lifecycleStatus === 'completed' ? 'completed' : task.lifecycleStatus === 'abandoned' ? 'blocked' : end && end < today ? 'overdue' : 'active', dependencyIds: task.dependencyIds || [], source: task });
  });
  return { nodes, dependencies, schedule: rows, unscheduled: rows.filter((row) => !row.end), scheduled: rows.filter((row) => row.end), goalNodeIds };
}

export function scheduleRange(rows: ScheduleRow[], zoom: 'day' | 'week' | 'month' | 'quarter', now = new Date()) {
  const dated = rows.flatMap((row) => [row.start, row.end]).filter((value): value is Date => Boolean(value));
  const padding = { day: 3, week: 14, month: 45, quarter: 120 }[zoom];
  const min = new Date(Math.min(now.getTime(), ...dated.map((item) => item.getTime()))); const max = new Date(Math.max(now.getTime(), ...dated.map((item) => item.getTime())));
  min.setDate(min.getDate() - padding); max.setDate(max.getDate() + padding);
  return { start: min, end: max, days: Math.max(1, Math.ceil((max.getTime() - min.getTime()) / 86400000)) };
}
