import type { ReviewWindowDays } from './types.js';

const day = 24 * 60 * 60 * 1000;
export const reviewWindows: readonly ReviewWindowDays[] = [7, 30, 90];
export const isReviewWindowDays = (value: unknown): value is ReviewWindowDays => reviewWindows.includes(value as ReviewWindowDays);
export function createReviewWindow(days: ReviewWindowDays, now: string) { const end = Date.parse(now); const safeEnd = Number.isFinite(end) ? end : Date.now(); return { days, start: new Date(safeEnd - days * day).toISOString(), end: new Date(safeEnd).toISOString() }; }
export function isInsideReviewWindow(timestamp: string | undefined, window: { start: string; end: string }): boolean { const instant = timestamp ? Date.parse(timestamp) : NaN; return Number.isFinite(instant) && instant >= Date.parse(window.start) && instant <= Date.parse(window.end); }
