import type { ActivityType, Importance, LifecycleStatus, Task } from '../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const activityTypes: ActivityType[] = ['task', 'schedule', 'entertainment', 'recovery', 'study', 'fitness', 'social', 'other'];
const lifecycleStatuses: LifecycleStatus[] = ['active', 'completed', 'abandoned'];

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

export function normalizeActivityType(activityType?: string): ActivityType {
  return activityTypes.includes(activityType as ActivityType) ? (activityType as ActivityType) : 'task';
}

export function normalizeLifecycleStatus(status?: string): LifecycleStatus {
  return lifecycleStatuses.includes(status as LifecycleStatus) ? (status as LifecycleStatus) : 'active';
}

export function getActivityTypeLabel(activityType: ActivityType): string {
  const labels: Record<ActivityType, string> = {
    task: '任务',
    schedule: '日程',
    entertainment: '娱乐',
    recovery: '恢复',
    study: '学习',
    fitness: '运动',
    social: '社交',
    other: '其他',
  };
  return labels[activityType];
}

export function getLifecycleStatusLabel(status: LifecycleStatus): string {
  return status === 'completed' ? '已完成' : status === 'abandoned' ? '已放弃' : '进行中';
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
  return task.lifecycleStatus === 'completed' || clampProgress(task.progress) >= 100;
}

export function isTaskActive(task: Task): boolean {
  return task.lifecycleStatus === 'active';
}

export function getRecommendedTask(tasks: Task[], now = new Date()): Task | undefined {
  return tasks
    .filter(isTaskActive)
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

export function getPulseDuration(task: Task): number {
  if (!isTaskActive(task)) return 0;
  const urgency = getUrgencyScore(task.deadline);
  if (urgency >= 50) return 1.15;
  if (urgency >= 40) return 1.45;
  if (urgency >= 30) return 1.9;
  if (urgency >= 20) return 2.8;
  return 4.2;
}

export function calculatePressureIndex(tasks: Task[], subjectivePressure: number, now = new Date()): number {
  const activeTasks = tasks.filter(isTaskActive);
  const taskPressure = activeTasks.reduce((sum, task) => {
    const urgency = getUrgencyScore(task.deadline, now) / 50;
    const importance = task.importance / 10;
    const unfinished = 1 - clampProgress(task.progress) / 100;
    return sum + (urgency * 14 + importance * 12) * Math.max(unfinished, 0.25);
  }, 0);

  const reliefScore = tasks.reduce((sum, task) => {
    const completionRelief = task.lifecycleStatus === 'completed' ? 4 : 0;
    const recoveryRelief = task.lifecycleStatus !== 'abandoned' && ['recovery', 'entertainment'].includes(task.activityType) ? 5 : 0;
    return sum + completionRelief + recoveryRelief;
  }, 0);

  return Math.min(100, Math.max(0, Math.round(subjectivePressure + taskPressure - reliefScore)));
}

export function getPressureInterpretation(totalPressure: number): string {
  if (totalPressure <= 30) return '平稳';
  if (totalPressure <= 60) return '可控';
  if (totalPressure <= 80) return '高压';
  return '过载';
}
