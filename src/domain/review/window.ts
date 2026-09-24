import type { ReviewWindow, ReviewWindowDays } from './types.js';

export const reviewWindows: readonly ReviewWindowDays[] = [7, 30, 90];
export const isReviewWindowDays = (value: unknown): value is ReviewWindowDays => reviewWindows.includes(value as ReviewWindowDays);

export function normalizeReviewTimezone(timezone: string): string {
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0); return timezone; } catch { return 'UTC'; }
}

function zonedParts(instant: number, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') };
}

function localMidnightInstant(year: number, month: number, day: number, timezone: string): number {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0); let candidate = target;
  for (let index = 0; index < 4; index += 1) { const actual = zonedParts(candidate, timezone); const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second); const next = candidate + (target - represented); if (next === candidate) break; candidate = next; }
  return candidate;
}

const dateKey = (year: number, month: number, day: number) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

export function reviewDateKey(timestamp: string, timezone: string): string | undefined {
  const instant = Date.parse(timestamp); if (!Number.isFinite(instant)) return undefined; const parts = zonedParts(instant, normalizeReviewTimezone(timezone)); return dateKey(parts.year, parts.month, parts.day);
}

export function createReviewWindow(days: ReviewWindowDays, now: string, timezone = 'UTC'): ReviewWindow {
  const parsedEnd = Date.parse(now); const end = Number.isFinite(parsedEnd) ? parsedEnd : Date.now(); const safeTimezone = normalizeReviewTimezone(timezone); const localEnd = zonedParts(end, safeTimezone);
  const dateKeys = Array.from({ length: days }, (_, index) => { const calendar = new Date(Date.UTC(localEnd.year, localEnd.month - 1, localEnd.day - (days - 1 - index))); return dateKey(calendar.getUTCFullYear(), calendar.getUTCMonth() + 1, calendar.getUTCDate()); });
  const [year, month, day] = dateKeys[0].split('-').map(Number);
  return { days, timezone: safeTimezone, start: new Date(localMidnightInstant(year, month, day, safeTimezone)).toISOString(), end: new Date(end).toISOString(), dateKeys };
}

export function reviewWindowIdentity(window: Pick<ReviewWindow, 'days' | 'timezone' | 'start' | 'end'>): string { return `${window.timezone}:${window.days}:${window.start}/${window.end}`; }
export function reviewWindowCalendarIdentity(window: Pick<ReviewWindow, 'days' | 'timezone' | 'dateKeys'>): string { return `${window.timezone}:${window.days}:${window.dateKeys[0]}/${window.dateKeys.at(-1)}`; }
export function formatReviewDateTime(timestamp: string, timezone: string, locale = 'zh-CN'): string { return new Intl.DateTimeFormat(locale, { timeZone: normalizeReviewTimezone(timezone), dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)); }
export function isInsideReviewWindow(timestamp: string | undefined, window: { start: string; end: string }): boolean { const instant = timestamp ? Date.parse(timestamp) : NaN; return Number.isFinite(instant) && instant >= Date.parse(window.start) && instant <= Date.parse(window.end); }
