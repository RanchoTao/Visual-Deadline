import type { Task } from '../types/task';
import { getDisplayProgress } from './taskScoring';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DerivedTaskStatus = 'active' | 'completed' | 'abandoned' | 'delayed_observation';
export type PressureLevel = 'normal' | 'light_delay' | 'accumulated' | 'severe_delay';

function getDeadlineDiffMs(deadline?: string, now = new Date()): number | undefined {
  if (!deadline) return undefined;
  const deadlineMs = new Date(deadline).getTime();
  if (!Number.isFinite(deadlineMs)) return undefined;
  return now.getTime() - deadlineMs;
}

export function getDerivedTaskStatus(task: Task, now = new Date()): DerivedTaskStatus {
  if (task.lifecycleStatus === 'completed') return 'completed';
  if (task.lifecycleStatus === 'abandoned') return 'abandoned';

  const diffMs = getDeadlineDiffMs(task.deadline, now);
  if (typeof diffMs === 'number' && diffMs > 0) return 'delayed_observation';
  return 'active';
}

export function calculatePressureLevel(task: Task, now = new Date()): PressureLevel {
  if (task.lifecycleStatus === 'completed') return 'normal';
  const diffMs = getDeadlineDiffMs(task.deadline, now);
  if (typeof diffMs !== 'number' || diffMs <= 0) return 'normal';

  if (diffMs <= MS_PER_DAY) return 'light_delay';
  if (diffMs <= 7 * MS_PER_DAY) return 'accumulated';
  return 'severe_delay';
}

export function sortActiveTasksByProgress(tasks: Task[], now = new Date()): Task[] {
  return [...tasks].sort((a, b) => {
    const progressDiff = getDisplayProgress(b, now) - getDisplayProgress(a, now);
    if (progressDiff !== 0) return progressDiff;

    const importanceDiff = b.importance - a.importance;
    if (importanceDiff !== 0) return importanceDiff;

    const aHasDeadline = Boolean(a.deadline);
    const bHasDeadline = Boolean(b.deadline);
    if (aHasDeadline !== bHasDeadline) return aHasDeadline ? -1 : 1;

    if (!a.deadline || !b.deadline) return 0;

    const aDeadline = new Date(a.deadline).getTime();
    const bDeadline = new Date(b.deadline).getTime();
    if (!Number.isFinite(aDeadline) && !Number.isFinite(bDeadline)) return 0;
    if (!Number.isFinite(aDeadline)) return 1;
    if (!Number.isFinite(bDeadline)) return -1;
    return aDeadline - bDeadline;
  });
}

