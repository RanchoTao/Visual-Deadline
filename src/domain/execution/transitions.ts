import type { ExecutionStatus, ExecutionTask } from './types.js';

export function transitionExecutionTask(task: ExecutionTask, status: ExecutionStatus, now = new Date().toISOString()): ExecutionTask {
  if (task.status === 'done' || task.status === 'cancelled') return task;
  return { ...task, status, progress: status === 'done' ? 100 : task.progress, completedAt: status === 'done' ? task.completedAt ?? now : undefined };
}

export function applyReviewSuggestion(tasks: ExecutionTask[], suggestion: { projectId?: string; estimateMultiplier?: number }): ExecutionTask[] {
  return suggestion.estimateMultiplier ? tasks.map((task) => task.status !== 'done' && task.estimatedMinutes ? { ...task, estimatedMinutes: Math.round(task.estimatedMinutes * suggestion.estimateMultiplier!) } : task)
    : suggestion.projectId ? tasks.map((task) => task.projectId === suggestion.projectId && task.importance <= 5 && task.status === 'ready' ? { ...task, status: 'deferred' } : task) : tasks;
}
