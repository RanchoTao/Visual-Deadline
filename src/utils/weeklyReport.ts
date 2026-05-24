import type { Task } from '../types/task';
import { calculatePressureLevel, getDerivedTaskStatus } from './taskDerivedState';

export interface WeeklyReport {
  completedThisWeek: number;
  createdThisWeek: number;
  highImportanceThisWeek: number;
  delayedObservationCount: number;
  severeDelayCount: number;
  averageProgress: number;
  summary: string;
}

function getWeekStart(now = new Date()): Date {
  const date = new Date(now);
  const day = date.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - diffToMonday);
  return date;
}

function toTime(value?: string): number | undefined {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

export function generateWeeklyReport(items: Task[], now = new Date()): WeeklyReport {
  const weekStart = getWeekStart(now).getTime();
  const nowTime = now.getTime();

  const completedThisWeek = items.filter((task) => {
    if (task.lifecycleStatus !== 'completed') return false;
    // If completedAt is missing, we approximate with updatedAt to keep weekly stats usable.
    const completedTime = toTime(task.completedAt) ?? toTime(task.updatedAt);
    return typeof completedTime === 'number' && completedTime >= weekStart && completedTime <= nowTime;
  }).length;

  const createdThisWeek = items.filter((task) => {
    const createdTime = toTime(task.createdAt);
    return typeof createdTime === 'number' && createdTime >= weekStart && createdTime <= nowTime;
  }).length;

  const highImportanceThisWeek = items.filter((task) => {
    const createdTime = toTime(task.createdAt);
    return task.importance >= 8 && typeof createdTime === 'number' && createdTime >= weekStart && createdTime <= nowTime;
  }).length;

  const delayedObservationCount = items.filter((task) => getDerivedTaskStatus(task, now) === 'delayed_observation').length;
  const severeDelayCount = items.filter((task) => calculatePressureLevel(task, now) === 'severe_delay').length;

  const averageProgress = items.length === 0 ? 0 : Math.round(items.reduce((sum, task) => sum + task.progress, 0) / items.length);

  let summary = '本周数据还不够多，先从记录和完成一件小事开始。';
  if (completedThisWeek > 0) summary = '你这周已经完成了一部分任务，不是毫无进展。';
  else if (severeDelayCount >= 3) summary = '部分任务已经长期堆积，建议删除、拆分或重新定义。';
  else if (delayedObservationCount >= 3) summary = '当前系统检测到一些延后任务，建议只挑 1-3 件重新启动。';

  return { completedThisWeek, createdThisWeek, highImportanceThisWeek, delayedObservationCount, severeDelayCount, averageProgress, summary };
}

