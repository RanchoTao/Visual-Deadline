const zonedFormatterCache = new Map<string, Intl.DateTimeFormat>();

export interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function resolveTimezone(candidate?: string): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timezone = candidate?.trim() || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date(0));
    return timezone;
  } catch {
    return fallback;
  }
}

function getZonedFormatter(timezone: string): Intl.DateTimeFormat {
  const safeTimezone = resolveTimezone(timezone);
  const cached = zonedFormatterCache.get(safeTimezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  zonedFormatterCache.set(safeTimezone, formatter);
  return formatter;
}

export function getZonedDateParts(date: Date, timezone: string): ZonedDateParts {
  const parts = getZonedFormatter(timezone).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
  };
}

export function getZonedDateKey(date: Date, timezone: string): string {
  const { year, month, day } = getZonedDateParts(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getZonedClockMinutes(date: Date, timezone: string): number {
  const { hour, minute } = getZonedDateParts(date, timezone);
  return hour * 60 + minute;
}

export function parseClockMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export function formatZonedDateTime(timestamp: string, timezone: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '时间无效';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: resolveTimezone(timezone),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '未知';
  const rounded = Math.floor(minutes);
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  if (hours === 0) return `${remainder} 分钟`;
  if (remainder === 0) return `${hours} 小时`;
  return `${hours} 小时 ${remainder} 分钟`;
}
