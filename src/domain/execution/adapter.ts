import type { Goal, Task } from '../../types/task.js';
import type { ExecutionProject, ExecutionSource, ExecutionTask } from './types.js';

export interface ExecutionMetadata {
  actionable?: boolean;
  parentTaskId?: string;
  startAfter?: string;
  projectId?: string;
  source?: ExecutionSource;
  sourceCaptureId?: string;
  createdByAI?: boolean;
  completedMinutes?: number;
}

export interface AdaptedExecutionModel {
  projects: ExecutionProject[];
  tasks: ExecutionTask[];
  relationshipWarnings: string[];
}

const clampProgress = (value: number) => Math.min(100, Math.max(0, value));
const distinct = (items: string[]) => [...new Set(items)];

/**
 * Reconciles both legacy relationship directions. A relationship is retained if
 * either side declares it; disagreement is surfaced for later repair, never
 * silently resolved by dropping one side.
 */
export function adaptVisualDeadlineExecution(goals: Goal[], tasks: Task[], metadata: Record<string, ExecutionMetadata> = {}): AdaptedExecutionModel {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const warnings: string[] = [];
  const membership = new Map<string, string[]>();
  for (const task of tasks) {
    const taskLinks = task.linkedGoalIds ?? [];
    for (const goalId of taskLinks) {
      if (!goalById.has(goalId)) warnings.push(`Task ${task.id} references missing goal ${goalId}.`);
      else membership.set(task.id, distinct([...(membership.get(task.id) ?? []), goalId]));
    }
  }
  for (const goal of goals) {
    for (const taskId of goal.linkedTaskIds) {
      if (!taskById.has(taskId)) warnings.push(`Goal ${goal.id} references missing task ${taskId}.`);
      else {
        const taskLinks = taskById.get(taskId)!.linkedGoalIds ?? [];
        if (!taskLinks.includes(goal.id)) warnings.push(`Goal ${goal.id} links task ${taskId}, but the task does not link back.`);
        membership.set(taskId, distinct([...(membership.get(taskId) ?? []), goal.id]));
      }
    }
  }
  for (const task of tasks) for (const goalId of task.linkedGoalIds ?? []) {
    const goal = goalById.get(goalId);
    if (goal && !goal.linkedTaskIds.includes(task.id)) warnings.push(`Task ${task.id} links goal ${goalId}, but the goal does not link back.`);
  }
  const projects = goals.map((goal): ExecutionProject => ({ id: goal.id, title: goal.title, createdAt: goal.createdAt, deadline: goal.targetDate, importance: goal.priority, status: goal.planningStatus === 'completed' ? 'completed' : goal.planningStatus === 'waiting' || goal.planningStatus === 'blocked' ? 'paused' : 'active' }));
  const executionTasks = tasks.map((task): ExecutionTask => {
    const extra = metadata[task.id] ?? {};
    const progress = clampProgress(task.progress);
    const status = task.lifecycleStatus === 'completed' || progress === 100 ? 'done' : task.lifecycleStatus === 'abandoned' ? 'cancelled' : 'ready';
    const goalIds = membership.get(task.id) ?? [];
    const projectId = extra.projectId && goalById.has(extra.projectId) ? extra.projectId : goalIds[0];
    if (extra.projectId && !goalById.has(extra.projectId)) warnings.push(`Task ${task.id} metadata references missing project ${extra.projectId}.`);
    return { id: task.id, title: task.title, description: task.description, projectId, goalIds, parentTaskId: extra.parentTaskId, createdAt: task.createdAt, deadline: task.deadline, startAfter: extra.startAfter ?? task.startDate, importance: task.importance, estimatedMinutes: task.estimatedDuration, completedMinutes: extra.completedMinutes, progress, status, actionable: extra.actionable ?? (task.lifecycleStatus === 'active' && progress < 100), dependencies: (task.dependencyIds ?? []).filter((id) => id !== task.id), source: extra.source ?? 'legacy-vd', sourceCaptureId: extra.sourceCaptureId, createdByAI: extra.createdByAI ?? false, completedAt: task.completedAt };
  });
  return { projects, tasks: executionTasks, relationshipWarnings: distinct(warnings) };
}
