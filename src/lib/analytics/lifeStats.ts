import type { ActivityType, AIArtifact, Goal, PressureHistoryRecord, Task } from '../../types/task';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

export type CategoryStat = { category: ActivityType; count: number; ratio: number };
export type DailyCount = { date: string; count: number };

function dateKey(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function countCompletedTasks(tasks: Task[]): number {
  return tasks.filter((task) => task.lifecycleStatus === 'completed').length;
}

export function countAbandonedTasks(tasks: Task[]): number {
  return tasks.filter((task) => task.lifecycleStatus === 'abandoned').length;
}

export function countOverdueTasks(tasks: Task[], now = new Date()): number {
  return tasks.filter((task) => task.lifecycleStatus === 'active' && task.deadline && new Date(task.deadline).getTime() < now.getTime()).length;
}

export function calculateCompletionRate(tasks: Task[]): number {
  const resolved = tasks.filter((task) => task.lifecycleStatus === 'completed' || task.lifecycleStatus === 'abandoned');
  if (resolved.length === 0) return 0;
  return Math.round((countCompletedTasks(tasks) / resolved.length) * 100);
}

export function calculateAverageCompletionLeadHours(tasks: Task[]): number {
  const leads = tasks.flatMap((task) => {
    if (!task.completedAt || !task.deadline) return [];
    const completedAt = new Date(task.completedAt).getTime();
    const deadline = new Date(task.deadline).getTime();
    if (!Number.isFinite(completedAt) || !Number.isFinite(deadline)) return [];
    return [(deadline - completedAt) / MS_PER_HOUR];
  });
  return Math.round(average(leads) * 10) / 10;
}

export function calculateLastMinuteCompletionRatio(tasks: Task[]): number {
  const completedWithDeadline = tasks.filter((task) => task.completedAt && task.deadline);
  if (completedWithDeadline.length === 0) return 0;
  const lastMinute = completedWithDeadline.filter((task) => {
    const completedAt = new Date(task.completedAt as string).getTime();
    const deadline = new Date(task.deadline as string).getTime();
    return deadline - completedAt >= 0 && deadline - completedAt <= MS_PER_HOUR;
  }).length;
  return Math.round((lastMinute / completedWithDeadline.length) * 100);
}

export function calculateDeadlineSurvivalRatio(tasks: Task[]): number {
  const completedWithDeadline = tasks.filter((task) => task.completedAt && task.deadline);
  if (completedWithDeadline.length === 0) return 0;
  const survived = completedWithDeadline.filter((task) => new Date(task.completedAt as string).getTime() <= new Date(task.deadline as string).getTime()).length;
  return Math.round((survived / completedWithDeadline.length) * 100);
}

export function calculateAverageImportance(tasks: Task[]): number {
  return Math.round(average(tasks.map((task) => task.importance)) * 10) / 10;
}

export function calculateDailyCompletionHeatmap(tasks: Task[], days = 28, now = new Date()): DailyCount[] {
  const counts = new Map<string, number>();
  tasks.forEach((task) => {
    if (!task.completedAt) return;
    const key = dateKey(task.completedAt);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getTime() - (days - index - 1) * MS_PER_DAY);
    const key = dateKey(date.toISOString()) as string;
    return { date: key, count: counts.get(key) ?? 0 };
  });
}

export function calculateConsecutiveUsageDays(pressureHistory: PressureHistoryRecord[], now = new Date()): number {
  const usedDates = new Set(pressureHistory.map((record) => dateKey(record.timestamp)).filter(Boolean));
  let streak = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    const key = dateKey(new Date(now.getTime() - offset * MS_PER_DAY).toISOString());
    if (!key || !usedDates.has(key)) break;
    streak += 1;
  }
  return streak;
}

export function calculateAverageDailyPressure(pressureHistory: PressureHistoryRecord[], days = 7, now = new Date()): number {
  const since = now.getTime() - days * MS_PER_DAY;
  const values = pressureHistory.filter((record) => new Date(record.timestamp).getTime() >= since).map((record) => record.pressure);
  return Math.round(average(values));
}

export function calculateCategoryDistribution(tasks: Task[]): CategoryStat[] {
  const counts = new Map<ActivityType, number>();
  tasks.forEach((task) => counts.set(task.activityType, (counts.get(task.activityType) ?? 0) + 1));
  const total = Math.max(1, tasks.length);
  return [...counts.entries()].map(([category, count]) => ({ category, count, ratio: Math.round((count / total) * 100) })).sort((a, b) => b.count - a.count);
}

export function getCurrentLifeFocus(tasks: Task[]): string {
  const active = tasks.filter((task) => task.lifecycleStatus === 'active');
  if (active.length === 0) return '恢复 / 观察';
  const [top] = calculateCategoryDistribution(active);
  return top ? top.category : '未形成中心';
}

export function calculateGoalProgress(goals: Goal[], tasks: Task[]): number {
  if (goals.length === 0) return 0;
  const goalScores = goals.map((goal) => {
    const linkedTasks = tasks.filter((task) => goal.linkedTaskIds.includes(task.id) || task.linkedGoalIds?.includes(goal.id));
    if (linkedTasks.length === 0) return 0;
    return linkedTasks.filter((task) => task.lifecycleStatus === 'completed').length / linkedTasks.length;
  });
  return Math.round(average(goalScores) * 100);
}

export function getLatestAIInsight(aiArtifacts: AIArtifact[]): string {
  const latest = aiArtifacts.find((artifact) => artifact.kind === 'review' || artifact.kind === 'task-analysis');
  if (!latest) return '尚未生成 AI 观察。VD 会在这里保留冷静、第三人称的行为分析。';
  return `${latest.content.replace(/[#*_`>-]/g, '').trim().slice(0, 96)}${latest.content.length > 96 ? '…' : ''}`;
}
