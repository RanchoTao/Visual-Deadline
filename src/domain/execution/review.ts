import type { ExecutionProject, ExecutionReviewStatistics, ExecutionReviewSuggestion, ExecutionTask } from './types.js';

const DAY_MS = 86_400_000;
const startOfDay = (now: number) => { const date = new Date(now); return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(); };
const inWindow = (iso: string | undefined, start: number, end: number) => { const value = iso ? new Date(iso).getTime() : NaN; return Number.isFinite(value) && value >= start && value <= end; };

export function reviewWindow(range: 'today' | 'week' | '7d' | '30d', now = Date.now()): { start: number; end: number } {
  if (range === 'today') return { start: startOfDay(now), end: now };
  if (range === 'week') return { start: startOfDay(now) - ((new Date(now).getDay() + 6) % 7) * DAY_MS, end: now };
  return { start: startOfDay(now) - (range === '7d' ? 6 : 29) * DAY_MS, end: now };
}

export function computeReviewStatistics(tasks: ExecutionTask[], projects: ExecutionProject[], range: 'today' | 'week' | '7d' | '30d', now = Date.now()): ExecutionReviewStatistics {
  const { start, end } = reviewWindow(range, now); const executable = tasks.filter((task) => task.actionable);
  const completed = executable.filter((task) => task.status === 'done' && inWindow(task.completedAt, start, end));
  const planned = executable.filter((task) => new Date(task.createdAt).getTime() <= end && task.status !== 'cancelled');
  const deferred = executable.filter((task) => task.status === 'deferred' || (task.deadline && new Date(task.deadline).getTime() < end && !['done', 'cancelled'].includes(task.status)));
  const cancelled = executable.filter((task) => task.status === 'cancelled' && inWindow(task.createdAt, start, end));
  const projectName = new Map(projects.map((project) => [project.id, project.title]));
  const aggregate = (source: ExecutionTask[], measure: (task: ExecutionTask) => number) => source.reduce((map, task) => { if (task.projectId) map.set(task.projectId, (map.get(task.projectId) ?? 0) + measure(task)); return map; }, new Map<string, number>());
  const greatest = (map: Map<string, number>) => { const entry = [...map.entries()].sort((a, b) => b[1] - a[1])[0]; return entry ? projectName.get(entry[0]) : undefined; };
  const timed = completed.filter((task) => task.estimatedMinutes && task.completedMinutes !== undefined);
  return { plannedTasks: planned.length, completedTasks: completed.length, completionRate: planned.length ? Math.round(completed.length / planned.length * 100) : 0, deferredTasks: deferred.length, cancelledTasks: cancelled.length, newTasks: executable.filter((task) => inWindow(task.createdAt, start, end)).length, biggestProgressProject: greatest(aggregate(completed, (task) => task.completedMinutes ?? task.estimatedMinutes ?? 0)), mostDeferredProject: greatest(aggregate(deferred, () => 1)), estimateVarianceMinutes: timed.length ? Math.round(timed.reduce((sum, task) => sum + (task.completedMinutes! - task.estimatedMinutes!), 0) / timed.length) : undefined };
}

export function buildReviewSuggestions(tasks: ExecutionTask[], projects: ExecutionProject[], range: 'today' | 'week' | '7d' | '30d', now = Date.now()): ExecutionReviewSuggestion[] {
  const statistics = computeReviewStatistics(tasks, projects, range, now); const suggestions: ExecutionReviewSuggestion[] = []; const { start } = reviewWindow(range, now);
  if (statistics.estimateVarianceMinutes !== undefined && statistics.estimateVarianceMinutes > 15) suggestions.push({ id: `estimate-${range}-${start}`, title: 'Increase future task estimates', reason: 'Recent actual duration consistently exceeded estimates.', estimateMultiplier: 1.5, status: 'pending' });
  const deferredProject = projects.find((project) => project.title === statistics.mostDeferredProject);
  if (deferredProject) suggestions.push({ id: `focus-${range}-${start}`, title: `Reduce parallel work in ${deferredProject.title}`, reason: 'This project accumulated the most deferrals in the review window.', projectId: deferredProject.id, status: 'pending' });
  return suggestions;
}
