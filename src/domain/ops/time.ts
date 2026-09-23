import type { OpsAvailabilityWindow } from './types.js';

export type ZonedInterval = readonly [start: number, end: number];
type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const dateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function isValidOpsTimezone(timezone: unknown): timezone is string {
  if (typeof timezone !== 'string' || !timezone.trim()) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); return true; } catch { return false; }
}

export function runtimeOpsTimezone(): string {
  try { const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone; return isValidOpsTimezone(timezone) ? timezone : 'UTC'; } catch { return 'UTC'; }
}

export function normalizeOpsTimezone(timezone: unknown): string { return isValidOpsTimezone(timezone) ? timezone : runtimeOpsTimezone(); }

function zonedParts(instant: number, timezone: string): ZonedParts {
  const values = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (kind: Intl.DateTimeFormatPartTypes) => Number(values.find((value) => value.type === kind)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

function sameParts(left: ZonedParts, right: ZonedParts): boolean { return left.year === right.year && left.month === right.month && left.day === right.day && left.hour === right.hour && left.minute === right.minute && left.second === right.second; }

/** Converts a datetime-local value in the supplied IANA timezone to an instant, without browser-timezone parsing. */
export function zonedLocalDateTimeToInstant(value: string, timezone: string): string | undefined {
  if (!isValidOpsTimezone(timezone)) return undefined;
  const matched = dateTimePattern.exec(value); if (!matched) return undefined;
  const parts: ZonedParts = { year: Number(matched[1]), month: Number(matched[2]), day: Number(matched[3]), hour: Number(matched[4]), minute: Number(matched[5]), second: Number(matched[6] ?? 0) };
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  if (new Date(naive).getUTCFullYear() !== parts.year || new Date(naive).getUTCMonth() + 1 !== parts.month || new Date(naive).getUTCDate() !== parts.day) return undefined;
  let instant = naive;
  for (let attempt = 0; attempt < 4; attempt += 1) { const observed = zonedParts(instant, timezone); instant = naive - (Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, observed.second) - instant); }
  // Reject nonexistent local wall times (DST spring-forward); ambiguous fall-back values resolve deterministically.
  return sameParts(zonedParts(instant, timezone), parts) ? new Date(instant).toISOString() : undefined;
}

export function formatOpsInstant(value: string, timezone: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'short', timeStyle: 'short' }): string {
  if (!Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('zh-CN', { ...options, timeZone: normalizeOpsTimezone(timezone) }).format(new Date(value));
}

/** Builds weekly availability in the OPS timezone and returns absolute instant intervals. */
export function buildZonedAvailabilityIntervals(timezone: string, availability: readonly OpsAvailabilityWindow[], horizonStart: number, horizonEnd: number): ZonedInterval[] {
  const normalizedTimezone = normalizeOpsTimezone(timezone); const first = zonedParts(horizonStart, normalizedTimezone); const startOfLocalDay = Date.UTC(first.year, first.month - 1, first.day); const output: ZonedInterval[] = [];
  for (let day = startOfLocalDay - 24 * 60 * 60_000; day <= horizonEnd + 24 * 60 * 60_000; day += 24 * 60 * 60_000) {
    const local = new Date(day); const weekday = local.getUTCDay(); const date = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
    availability.filter((window) => window.weekday === weekday).forEach((window) => { const start = zonedLocalDateTimeToInstant(`${date}T${window.startTime}`, normalizedTimezone); const end = zonedLocalDateTimeToInstant(`${date}T${window.endTime}`, normalizedTimezone); if (start && end && Date.parse(end) > Date.parse(start) && Date.parse(end) > horizonStart && Date.parse(start) < horizonEnd) output.push([Math.max(horizonStart, Date.parse(start)), Math.min(horizonEnd, Date.parse(end))]); });
  }
  return output.sort((left, right) => left[0] - right[0]);
}

export function instantToOpsLocalInput(value: string | undefined, timezone: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  const parts = zonedParts(Date.parse(value), normalizeOpsTimezone(timezone));
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}
