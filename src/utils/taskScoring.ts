import type { Importance, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export function clampProgress(progress?: number): number {
  if (typeof progress !== 'number' || Number.isNaN(progress)) return 0;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function clampImportance(importance?: number): Importance {
  if (typeof importance !== 'number' || Number.isNaN(importance)) return 5;

  const rounded = Math.round(importance);
  return Math.min(10, Math.max(1, rounded)) as Importance;
}

export function migrateLegacyImportance(importance?: number): Importance {
  const clampedImportance = clampImportance(importance);
  return clampedImportance <= 5 ? (clampedImportance * 2 as Importance) : clampedImportance;
}

export function getUrgencyScore(deadline?: string, now = new Date()): number {
  if (!deadline) return 0;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 0;

  const diff = deadlineTime - now.getTime();

  if (diff < 0) return 50;
  if (diff <= MS_PER_DAY) return 40;
  if (diff <= 3 * MS_PER_DAY) return 30;
  if (diff <= 7 * MS_PER_DAY) return 20;
  return 10;
}

export function getTaskScore(task: Task, now = new Date()): number {
  return task.importance * 10 + getUrgencyScore(task.deadline, now);
}

export function isTaskComplete(task: Task): boolean {
  return clampProgress(task.progress) >= 100;
}

export function getRecommendedTask(tasks: Task[], now = new Date()): Task | undefined {
  return tasks
    .filter((task) => !isTaskComplete(task))
    .sort((a, b) => getTaskScore(b, now) - getTaskScore(a, now))[0];
}

export function getRecommendationReason(task: Task, now = new Date()): string {
  const urgencyScore = getUrgencyScore(task.deadline, now);

  if (task.importance >= 8 && urgencyScore >= 30) return '重要性高，截止时间较近';
  if (urgencyScore >= 40) return '截止时间很近';
  if (task.importance >= 8 && urgencyScore <= 20) return '长期重要任务，适合提前推进';
  if (task.importance >= 7) return '重要性较高，值得优先推进';
  if (urgencyScore >= 30) return '截止时间较近，建议尽快处理';
  return '当前节奏合适，可以稳步推进';
}

export function getUrgencyPosition(deadline?: string, now = new Date()): number {
  if (!deadline) return 6;

  const deadlineTime = new Date(deadline).getTime();
  if (Number.isNaN(deadlineTime)) return 6;

  const diff = deadlineTime - now.getTime();
  if (diff <= 0) return 96;
  if (diff <= MS_PER_DAY) return 90;
  if (diff <= 3 * MS_PER_DAY) return 76;
  if (diff <= 7 * MS_PER_DAY) return 58;
  if (diff <= 30 * MS_PER_DAY) return 32;
  return 14;
}

export function getImportancePosition(importance: Task['importance']): number {
  return 8 + ((importance - 1) / 9) * 84;
}
