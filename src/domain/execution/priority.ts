import type { ExecutionTask } from './types.js';
import { calculateTaskPressure, calculateUrgency } from '../../lib/pressureEngine.js';

const DAY_MS = 24 * 3_600_000;
const HEAT_WINDOW_MS = 30 * DAY_MS;
export type MatrixQuadrant = 'I' | 'II' | 'III' | 'IV';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Exact importance-urgency-v1 buckets, retained from VD and proven in Wayline. */
export function urgencyWeight(deadline: string | undefined, now = Date.now()): number {
  return calculateUrgency(deadline, now);
}

export function isActiveExecutable(task: ExecutionTask): boolean {
  return task.actionable && !['done', 'cancelled', 'deferred'].includes(task.status) && task.progress < 100;
}

export function isExecutableAt(task: ExecutionTask, now = Date.now()): boolean {
  return isActiveExecutable(task) && (!task.startAfter || new Date(task.startAfter).getTime() <= now);
}

export function isBlocked(task: ExecutionTask, tasks: ExecutionTask[]): boolean {
  const byId = new Map(tasks.map((candidate) => [candidate.id, candidate]));
  return task.dependencies.some((id) => byId.get(id)?.status !== 'done');
}

export function taskPressure(task: ExecutionTask, now = Date.now()): number {
  return calculateTaskPressure(task, now);
}

export function priorityScore(task: ExecutionTask, now = Date.now()): number {
  return taskPressure(task, now) * 10 + task.importance;
}

export function deadlinePosition(deadline: string | undefined, now = Date.now()): number {
  if (!deadline) return 6;
  const due = new Date(deadline).getTime();
  if (!Number.isFinite(due)) return 6;
  const remaining = due - now;
  if (remaining <= 0) return 96;
  if (remaining <= DAY_MS) return 90;
  if (remaining <= 3 * DAY_MS) return 76;
  if (remaining <= 7 * DAY_MS) return 58;
  if (remaining <= 30 * DAY_MS) return 32;
  return 14;
}

export function matrixQuadrant(task: ExecutionTask, now = Date.now()): MatrixQuadrant {
  const important = 8 + ((clamp(Math.round(task.importance), 1, 10) - 1) / 9) * 84 >= 50;
  const urgent = deadlinePosition(task.deadline, now) >= 50;
  return important && urgent ? 'I' : important ? 'II' : urgent ? 'III' : 'IV';
}

export function rankTasks(tasks: ExecutionTask[], now = Date.now()): ExecutionTask[] {
  return tasks.filter(isActiveExecutable).map((task, index) => ({ task, index, blocked: isBlocked(task, tasks), score: priorityScore(task, now) }))
    .sort((a, b) => b.score - a.score || Number(a.blocked) - Number(b.blocked) || b.task.importance - a.task.importance || a.index - b.index)
    .map(({ task }) => task);
}

export function topTasks(tasks: ExecutionTask[], now = Date.now(), limit = 3): ExecutionTask[] {
  return rankTasks(tasks.filter((task) => isExecutableAt(task, now) && !isBlocked(task, tasks)), now).slice(0, limit);
}

export function heatZoneTasks(tasks: ExecutionTask[], now = Date.now(), limit = 12): ExecutionTask[] {
  return tasks.filter((task) => isExecutableAt(task, now) && task.deadline && new Date(task.deadline).getTime() - now <= HEAT_WINDOW_MS)
    .sort((a, b) => (new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()) || b.importance - a.importance).slice(0, limit);
}
