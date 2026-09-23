import type { Task } from '../../types/task.js';

export type DependencyState = 'satisfied' | 'active' | 'missing' | 'self' | 'cycle' | 'abandoned';
export interface TaskDependencyProjection { taskId: string; predecessors: Array<{ taskId: string; state: DependencyState }>; }

export function detectDependencyCycles(tasks: readonly Task[]): Set<string> {
  const taskIds = new Set(tasks.map((task) => task.id)); const visiting = new Set<string>(); const visited = new Set<string>(); const cycles = new Set<string>(); const stack: string[] = [];
  const visit = (taskId: string) => { if (visiting.has(taskId)) { const start = stack.indexOf(taskId); stack.slice(start).forEach((id) => cycles.add(id)); return; } if (visited.has(taskId)) return; visiting.add(taskId); stack.push(taskId); const task = tasks.find((item) => item.id === taskId); task?.dependencyIds?.filter((id) => taskIds.has(id)).forEach(visit); stack.pop(); visiting.delete(taskId); visited.add(taskId); };
  tasks.forEach((task) => visit(task.id)); return cycles;
}

export function projectTaskDependencyGraph(tasks: readonly Task[]): TaskDependencyProjection[] {
  const byId = new Map(tasks.map((task) => [task.id, task])); const cycles = detectDependencyCycles(tasks);
  return tasks.map((task) => ({ taskId: task.id, predecessors: (task.dependencyIds ?? []).map((dependencyId) => {
    const predecessor = byId.get(dependencyId);
    const state: DependencyState = dependencyId === task.id ? 'self' : cycles.has(task.id) && cycles.has(dependencyId) ? 'cycle' : !predecessor ? 'missing' : predecessor.lifecycleStatus === 'completed' ? 'satisfied' : predecessor.lifecycleStatus === 'abandoned' ? 'abandoned' : 'active';
    return { taskId: dependencyId, state };
  }) }));
}
