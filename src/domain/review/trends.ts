import type { PressureHistoryRecord, Task } from '../../types/task.js';
import type { ReviewDailyTrend } from './types.js';

const day = 24 * 60 * 60 * 1000;
const keyFor = (timestamp: string, timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(timestamp));
export function buildReviewDailyTrends(input: { tasks: readonly Task[]; pressureHistory: readonly PressureHistoryRecord[]; window: { start: string; end: string; days: number }; timezone: string }): ReviewDailyTrend[] {
  const end = Date.parse(input.window.end); const start = Date.parse(input.window.start); const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: input.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }); const dates = Array.from({ length: input.window.days }, (_, index) => formatter.format(new Date(start + index * day)));
  const buckets = new Map(dates.map((date) => [date, { date, completedCount: 0, abandonedCount: 0, pressures: [] as number[] }]));
  input.tasks.forEach((task) => { if (task.completedAt && Date.parse(task.completedAt) >= start && Date.parse(task.completedAt) <= end) { const bucket = buckets.get(keyFor(task.completedAt, input.timezone)); if (bucket) bucket.completedCount += 1; } if (task.abandonedAt && Date.parse(task.abandonedAt) >= start && Date.parse(task.abandonedAt) <= end) { const bucket = buckets.get(keyFor(task.abandonedAt, input.timezone)); if (bucket) bucket.abandonedCount += 1; } });
  input.pressureHistory.forEach((sample) => { const timestamp = Date.parse(sample.timestamp); if (timestamp >= start && timestamp <= end && Number.isFinite(sample.pressure)) buckets.get(keyFor(sample.timestamp, input.timezone))?.pressures.push(sample.pressure); });
  return dates.map((date) => { const bucket = buckets.get(date)!; return { date, completedCount: bucket.completedCount, abandonedCount: bucket.abandonedCount, averagePressure: bucket.pressures.length ? bucket.pressures.reduce((sum, value) => sum + value, 0) / bucket.pressures.length : undefined, maxPressure: bucket.pressures.length ? Math.max(...bucket.pressures) : undefined }; });
}
