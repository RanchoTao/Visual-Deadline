import { isInsideReviewWindow, reviewDateKey } from './window.js';
import type { ReviewDailyTrend, ReviewHistoryEvent, ReviewWindow } from './types.js';

export function buildReviewDailyTrends(input: { events: readonly ReviewHistoryEvent[]; window: ReviewWindow }): ReviewDailyTrend[] {
  const dates = input.window.dateKeys;
  const buckets = new Map(dates.map((date) => [date, { date, completedCount: 0, abandonedCount: 0, pressures: [] as number[] }]));
  input.events.filter((event) => isInsideReviewWindow(event.timestamp, input.window)).forEach((event) => { const key = reviewDateKey(event.timestamp, input.window.timezone); const bucket = key ? buckets.get(key) : undefined; if (!bucket) return; if (event.kind === 'task_completed') bucket.completedCount += 1; if (event.kind === 'task_abandoned') bucket.abandonedCount += 1; if ((event.kind === 'pressure_sample' || event.kind === 'pressure_recalibrated') && Number.isFinite(event.pressure)) bucket.pressures.push(event.pressure!); });
  return dates.map((date) => { const bucket = buckets.get(date)!; return { date, completedCount: bucket.completedCount, abandonedCount: bucket.abandonedCount, averagePressure: bucket.pressures.length ? bucket.pressures.reduce((sum, value) => sum + value, 0) / bucket.pressures.length : undefined, maxPressure: bucket.pressures.length ? Math.max(...bucket.pressures) : undefined }; });
}
