import type { ReviewAIReport, ReviewArchiveEvent, ReviewEvidenceSource, ReviewHistoryEvent, ReviewHistoryKind, ReviewMetricsSnapshot, ReviewRecord, ReviewState, ReviewTombstone, ReviewWindow } from './types.js';
import { isReviewWindowDays, normalizeReviewTimezone, reviewDateKey } from './window.js';
import { reviewBackfillIdentity, reviewEventIdentity } from './history.js';

const historyKinds: readonly ReviewHistoryKind[] = ['task_completed', 'task_abandoned', 'milestone_completed', 'review_saved', 'ai_review_generated', 'pressure_sample', 'pressure_recalibrated', 'legacy_ai'];
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const string = (value: unknown, max = 4000): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const optionalString = (value: unknown, max = 4000) => string(value, max) ? value.trim() : undefined;
const metricKeys: (keyof ReviewMetricsSnapshot)[] = ['resolvedCount', 'completedCount', 'abandonedCount', 'completedWithDeadlineCount', 'onTimeCompletionCount', 'lastHourCompletionCount', 'pressureSampleCount', 'highPressureSampleCount', 'activeTaskCount', 'currentOverdueTaskCount', 'currentGoalCount', 'currentMilestoneCount', 'currentCompletedMilestoneCount', 'currentScheduledTaskCount', 'currentUnscheduledTaskCount', 'currentConflictCount'];
const optionalMetricKeys: (keyof ReviewMetricsSnapshot)[] = ['completionRate', 'onTimeRate', 'averageDeadlineDeltaHours', 'averagePressure', 'maxPressure', 'pressureVolatility'];

function normalizeMetrics(value: unknown): ReviewMetricsSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  if (!metricKeys.every((key) => finite(source[key]))) return undefined;
  if (!optionalMetricKeys.every((key) => source[key] === undefined || (typeof source[key] === 'number' && Number.isFinite(source[key]) && (key === 'completionRate' || key === 'onTimeRate' ? source[key] >= 0 && source[key] <= 100 : true)))) return undefined;
  return { ...Object.fromEntries(metricKeys.map((key) => [key, source[key]])), ...Object.fromEntries(optionalMetricKeys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]])) } as unknown as ReviewMetricsSnapshot;
}

function normalizeReport(value: unknown): ReviewAIReport | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  return string(source.content, 20000) && iso(source.generatedAt) ? { content: source.content.trim(), generatedAt: source.generatedAt, model: optionalString(source.model, 200), provider: optionalString(source.provider, 200), inputFingerprint: optionalString(source.inputFingerprint, 200), windowIdentity: optionalString(source.windowIdentity, 500) } : undefined;
}

function normalizeRecord(value: unknown): ReviewRecord | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  if (!string(source.id, 200) || !isReviewWindowDays(source.windowDays) || !iso(source.windowStart) || !iso(source.windowEnd) || Date.parse(source.windowStart) >= Date.parse(source.windowEnd) || !string(source.title, 240) || !iso(source.createdAt) || !iso(source.updatedAt)) return undefined;
  const metrics = normalizeMetrics(source.metrics); if (!metrics) return undefined;
  const timezone = normalizeReviewTimezone(typeof source.timezone === 'string' ? source.timezone : 'UTC');
  const windowStartDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.windowStartDate)) ? String(source.windowStartDate) : reviewDateKey(source.windowStart, timezone)!;
  const windowEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.windowEndDate)) ? String(source.windowEndDate) : reviewDateKey(source.windowEnd, timezone)!;
  const savedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(source.savedDate)) ? String(source.savedDate) : reviewDateKey(source.createdAt, timezone)!;
  return { id: source.id, windowDays: source.windowDays, windowStart: source.windowStart, windowEnd: source.windowEnd, timezone, windowStartDate, windowEndDate, savedDate, title: source.title.trim(), userNote: optionalString(source.userNote), metrics, aiReport: normalizeReport(source.aiReport), createdAt: source.createdAt, updatedAt: source.updatedAt };
}

function normalizeEvent(value: unknown): ReviewHistoryEvent | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  if (!string(source.id, 500) || !iso(source.timestamp) || !iso(source.recordedAt) || !historyKinds.includes(source.kind as ReviewHistoryKind) || !string(source.title, 500)) return undefined;
  const kind = source.kind as ReviewHistoryKind;
  const evidenceSource: ReviewEvidenceSource = source.evidenceSource === 'captured_live' || source.evidenceSource === 'legacy_backfill' || source.evidenceSource === 'derived' ? source.evidenceSource : kind === 'review_saved' || kind === 'ai_review_generated' ? 'captured_live' : kind === 'pressure_sample' || kind === 'pressure_recalibrated' ? 'derived' : 'legacy_backfill';
  const pressureSource = source.pressureSource === 'manual' || source.pressureSource === 'task_derived' || source.pressureSource === 'unknown' ? source.pressureSource : undefined;
  return { id: source.id, timestamp: source.timestamp, recordedAt: source.recordedAt, evidenceSource, kind, title: source.title.trim(), entityTitle: optionalString(source.entityTitle, 240), description: optionalString(source.description, 20000), relatedTaskId: optionalString(source.relatedTaskId, 200), relatedGoalId: optionalString(source.relatedGoalId, 200), relatedMilestoneId: optionalString(source.relatedMilestoneId, 200), reviewId: optionalString(source.reviewId, 200), deadline: iso(source.deadline) ? source.deadline : undefined, importance: finite(source.importance) ? source.importance : undefined, activityType: optionalString(source.activityType, 100), pressure: finite(source.pressure) ? source.pressure : undefined, activeTaskCount: finite(source.activeTaskCount) ? source.activeTaskCount : undefined, pressureSource };
}

function normalizeArchiveEvent(value: unknown): ReviewArchiveEvent | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  return string(source.id, 200) && string(source.reviewId, 200) && typeof source.archived === 'boolean' && iso(source.changedAt) ? { id: source.id, reviewId: source.reviewId, archived: source.archived, changedAt: source.changedAt } : undefined;
}

function normalizeTombstone(value: unknown): ReviewTombstone | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  return string(source.id, 200) && iso(source.deletedAt) ? { id: source.id, deletedAt: source.deletedAt } : undefined;
}

function uniqueById<T extends { id: string }>(values: T[], choose: (left: T, right: T) => T): T[] {
  const map = new Map<string, T>(); values.forEach((value) => map.set(value.id, map.has(value.id) ? choose(map.get(value.id)!, value) : value)); return [...map.values()];
}

const later = <T extends { updatedAt: string }>(left: T, right: T) => Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right : left;
const laterTombstone = (left: ReviewTombstone, right: ReviewTombstone) => Date.parse(right.deletedAt) > Date.parse(left.deletedAt) ? right : left;
const earlierEvent = (left: ReviewHistoryEvent, right: ReviewHistoryEvent) => Date.parse(right.recordedAt) < Date.parse(left.recordedAt) ? right : left;

function uniqueEvents(values: ReviewHistoryEvent[]): ReviewHistoryEvent[] {
  const map = new Map<string, ReviewHistoryEvent>(); values.forEach((value) => { const identity = reviewEventIdentity(value); map.set(identity, map.has(identity) ? earlierEvent(map.get(identity)!, value) : value); });
  const merged = [...map.values()]; const capturedOccurrences = new Set(merged.filter((event) => event.evidenceSource === 'captured_live').map((event) => `${reviewBackfillIdentity(event)}:${event.timestamp}`));
  return merged.filter((event) => event.evidenceSource === 'captured_live' || !capturedOccurrences.has(`${reviewBackfillIdentity(event)}:${event.timestamp}`));
}

export function createDefaultReviewState(now = new Date().toISOString()): ReviewState { return { schemaVersion: 3, defaultWindowDays: 7, reviews: [], events: [], reviewArchiveEvents: [], reviewTombstones: [], updatedAt: now }; }

export function normalizeReviewState(value: unknown, now = new Date().toISOString()): ReviewState {
  if (!value || typeof value !== 'object') return createDefaultReviewState(now); const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1 && source.schemaVersion !== 2 && source.schemaVersion !== 3) return createDefaultReviewState(now);
  const reviews = uniqueById((Array.isArray(source.reviews) ? source.reviews : []).flatMap((value) => { const record = normalizeRecord(value); return record ? [record] : []; }), later);
  const events = uniqueEvents((Array.isArray(source.events) ? source.events : []).flatMap((value) => { const event = normalizeEvent(value); return event ? [event] : []; }));
  const reviewArchiveEvents = uniqueById((Array.isArray(source.reviewArchiveEvents) ? source.reviewArchiveEvents : []).flatMap((value) => { const event = normalizeArchiveEvent(value); return event ? [event] : []; }), (left, right) => right.changedAt > left.changedAt ? right : left);
  const reviewTombstones = uniqueById((Array.isArray(source.reviewTombstones) ? source.reviewTombstones : []).flatMap((value) => { const tombstone = normalizeTombstone(value); return tombstone ? [tombstone] : []; }), laterTombstone);
  const deleted = new Set(reviewTombstones.map((entry) => entry.id));
  return { schemaVersion: 3, defaultWindowDays: isReviewWindowDays(source.defaultWindowDays) ? source.defaultWindowDays : 7, reviews: reviews.filter((record) => !deleted.has(record.id)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), events: events.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id)), reviewArchiveEvents: reviewArchiveEvents.sort((left, right) => left.changedAt.localeCompare(right.changedAt) || left.id.localeCompare(right.id)), reviewTombstones, updatedAt: iso(source.updatedAt) ? source.updatedAt : now };
}

export function mergeReviewStates(local: unknown, cloud: unknown, now = new Date().toISOString()): ReviewState {
  const left = normalizeReviewState(local, now); const right = normalizeReviewState(cloud, now);
  return normalizeReviewState({ schemaVersion: 3, defaultWindowDays: Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right.defaultWindowDays : left.defaultWindowDays, reviews: [...left.reviews, ...right.reviews], events: [...left.events, ...right.events], reviewArchiveEvents: [...left.reviewArchiveEvents, ...right.reviewArchiveEvents], reviewTombstones: [...left.reviewTombstones, ...right.reviewTombstones], updatedAt: Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right.updatedAt : left.updatedAt }, now);
}

export const chooseNewerReviewState = mergeReviewStates;

export function addReviewRecord(state: ReviewState, record: ReviewRecord): ReviewState {
  const reportEvent: ReviewHistoryEvent[] = record.aiReport ? [{ id: `review-ai:${record.id}`, timestamp: record.aiReport.generatedAt, recordedAt: record.createdAt, evidenceSource: 'captured_live', kind: 'ai_review_generated', title: `AI 复盘报告：${record.title}`, entityTitle: record.title, reviewId: record.id }] : [];
  const savedEvent: ReviewHistoryEvent = { id: `review:${record.id}`, timestamp: record.createdAt, recordedAt: record.createdAt, evidenceSource: 'captured_live', kind: 'review_saved', title: `保存复盘：${record.title}`, entityTitle: record.title, reviewId: record.id };
  return mergeReviewStates(state, { schemaVersion: 3, defaultWindowDays: record.windowDays, reviews: [record], events: [savedEvent, ...reportEvent], reviewArchiveEvents: [], reviewTombstones: [], updatedAt: record.updatedAt }, record.updatedAt);
}

export function isReviewArchived(state: ReviewState, reviewId: string): boolean {
  return state.reviewArchiveEvents.filter((event) => event.reviewId === reviewId).sort((left, right) => left.changedAt.localeCompare(right.changedAt) || left.id.localeCompare(right.id)).at(-1)?.archived ?? false;
}

function changeReviewArchiveState(state: ReviewState, reviewId: string, archived: boolean, now: string, eventId = `review-archive:${crypto.randomUUID()}`): ReviewState {
  if (!state.reviews.some((record) => record.id === reviewId) || isReviewArchived(state, reviewId) === archived) return state;
  return normalizeReviewState({ ...state, reviewArchiveEvents: [...state.reviewArchiveEvents, { id: eventId, reviewId, archived, changedAt: now }], updatedAt: now }, now);
}

export function archiveReviewRecord(state: ReviewState, reviewId: string, now: string, eventId?: string): ReviewState { return changeReviewArchiveState(state, reviewId, true, now, eventId); }
export function unarchiveReviewRecord(state: ReviewState, reviewId: string, now: string, eventId?: string): ReviewState { return changeReviewArchiveState(state, reviewId, false, now, eventId); }

export function deleteReviewRecord(state: ReviewState, id: string, now: string): ReviewState {
  return normalizeReviewState({ ...state, reviews: state.reviews.filter((record) => record.id !== id), reviewArchiveEvents: state.reviewArchiveEvents.filter((event) => event.reviewId !== id), reviewTombstones: [...state.reviewTombstones, { id, deletedAt: now }], updatedAt: now }, now);
}

export function hasCompleteReviewAIProvenance(report: ReviewAIReport): boolean {
  return iso(report.generatedAt) && string(report.provider, 200) && string(report.model, 200) && /^sha256-[0-9a-f]{64}$/.test(report.inputFingerprint ?? '') && string(report.windowIdentity, 500);
}

export function createReviewRecord(input: { id: string; window: ReviewWindow; metrics: ReviewMetricsSnapshot; userNote?: string; aiReport?: ReviewAIReport; now: string }): ReviewRecord {
  if (input.aiReport && !hasCompleteReviewAIProvenance(input.aiReport)) throw new Error('REVIEW_AI_PROVENANCE_INCOMPLETE');
  const savedDate = reviewDateKey(input.now, input.window.timezone)!;
  return { id: input.id, windowDays: input.window.days, windowStart: input.window.start, windowEnd: input.window.end, timezone: input.window.timezone, windowStartDate: input.window.dateKeys[0], windowEndDate: input.window.dateKeys.at(-1)!, savedDate, title: `近 ${input.window.days} 天复盘 · ${savedDate}`, userNote: input.userNote?.trim() || undefined, metrics: input.metrics, aiReport: input.aiReport, createdAt: input.now, updatedAt: input.now };
}
