import type { ReviewAIReport, ReviewHistoryEvent, ReviewHistoryKind, ReviewMetricsSnapshot, ReviewRecord, ReviewState, ReviewTombstone, ReviewWindowDays } from './types.js';
import { isReviewWindowDays } from './window.js';

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
  return { id: source.id, windowDays: source.windowDays, windowStart: source.windowStart, windowEnd: source.windowEnd, title: source.title.trim(), userNote: optionalString(source.userNote), metrics, aiReport: normalizeReport(source.aiReport), createdAt: source.createdAt, updatedAt: source.updatedAt };
}

function normalizeEvent(value: unknown): ReviewHistoryEvent | undefined {
  if (!value || typeof value !== 'object') return undefined; const source = value as Record<string, unknown>;
  if (!string(source.id, 500) || !iso(source.timestamp) || !iso(source.recordedAt) || !historyKinds.includes(source.kind as ReviewHistoryKind) || !string(source.title, 500)) return undefined;
  const pressureSource = source.pressureSource === 'manual' || source.pressureSource === 'task_derived' || source.pressureSource === 'unknown' ? source.pressureSource : undefined;
  return { id: source.id, timestamp: source.timestamp, recordedAt: source.recordedAt, kind: source.kind as ReviewHistoryKind, title: source.title.trim(), entityTitle: optionalString(source.entityTitle, 240), description: optionalString(source.description, 20000), relatedTaskId: optionalString(source.relatedTaskId, 200), relatedGoalId: optionalString(source.relatedGoalId, 200), reviewId: optionalString(source.reviewId, 200), deadline: iso(source.deadline) ? source.deadline : undefined, importance: finite(source.importance) ? source.importance : undefined, activityType: optionalString(source.activityType, 100), pressure: finite(source.pressure) ? source.pressure : undefined, activeTaskCount: finite(source.activeTaskCount) ? source.activeTaskCount : undefined, pressureSource };
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

export function createDefaultReviewState(now = new Date().toISOString()): ReviewState { return { schemaVersion: 2, defaultWindowDays: 7, reviews: [], events: [], reviewTombstones: [], updatedAt: now }; }

export function normalizeReviewState(value: unknown, now = new Date().toISOString()): ReviewState {
  if (!value || typeof value !== 'object') return createDefaultReviewState(now); const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1 && source.schemaVersion !== 2) return createDefaultReviewState(now);
  const reviews = uniqueById((Array.isArray(source.reviews) ? source.reviews : []).flatMap((value) => { const record = normalizeRecord(value); return record ? [record] : []; }), later);
  const events = uniqueById((Array.isArray(source.events) ? source.events : []).flatMap((value) => { const event = normalizeEvent(value); return event ? [event] : []; }), earlierEvent);
  const reviewTombstones = uniqueById((Array.isArray(source.reviewTombstones) ? source.reviewTombstones : []).flatMap((value) => { const tombstone = normalizeTombstone(value); return tombstone ? [tombstone] : []; }), laterTombstone);
  const deleted = new Set(reviewTombstones.map((entry) => entry.id));
  return { schemaVersion: 2, defaultWindowDays: isReviewWindowDays(source.defaultWindowDays) ? source.defaultWindowDays : 7, reviews: reviews.filter((record) => !deleted.has(record.id)).sort((left, right) => right.createdAt.localeCompare(left.createdAt)), events: events.sort((left, right) => left.recordedAt.localeCompare(right.recordedAt) || left.id.localeCompare(right.id)), reviewTombstones, updatedAt: iso(source.updatedAt) ? source.updatedAt : now };
}

export function mergeReviewStates(local: unknown, cloud: unknown, now = new Date().toISOString()): ReviewState {
  const left = normalizeReviewState(local, now); const right = normalizeReviewState(cloud, now);
  return normalizeReviewState({ schemaVersion: 2, defaultWindowDays: Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right.defaultWindowDays : left.defaultWindowDays, reviews: [...left.reviews, ...right.reviews], events: [...left.events, ...right.events], reviewTombstones: [...left.reviewTombstones, ...right.reviewTombstones], updatedAt: Date.parse(right.updatedAt) > Date.parse(left.updatedAt) ? right.updatedAt : left.updatedAt }, now);
}

export const chooseNewerReviewState = mergeReviewStates;

export function addReviewRecord(state: ReviewState, record: ReviewRecord): ReviewState {
  const reportEvent: ReviewHistoryEvent[] = record.aiReport ? [{ id: `review-ai:${record.id}`, timestamp: record.aiReport.generatedAt, recordedAt: record.createdAt, kind: 'ai_review_generated', title: `AI 复盘报告：${record.title}`, entityTitle: record.title, reviewId: record.id }] : [];
  const savedEvent: ReviewHistoryEvent = { id: `review:${record.id}`, timestamp: record.createdAt, recordedAt: record.createdAt, kind: 'review_saved', title: `保存复盘：${record.title}`, entityTitle: record.title, reviewId: record.id };
  return mergeReviewStates(state, { schemaVersion: 2, defaultWindowDays: record.windowDays, reviews: [record], events: [savedEvent, ...reportEvent], reviewTombstones: [], updatedAt: record.updatedAt }, record.updatedAt);
}

export function deleteReviewRecord(state: ReviewState, id: string, now: string): ReviewState {
  return normalizeReviewState({ ...state, reviews: state.reviews.filter((record) => record.id !== id), reviewTombstones: [...state.reviewTombstones, { id, deletedAt: now }], updatedAt: now }, now);
}

export function createReviewRecord(input: { id: string; windowDays: ReviewWindowDays; windowStart: string; windowEnd: string; metrics: ReviewMetricsSnapshot; userNote?: string; aiReport?: ReviewAIReport; now: string }): ReviewRecord { return { id: input.id, windowDays: input.windowDays, windowStart: input.windowStart, windowEnd: input.windowEnd, title: `近 ${input.windowDays} 天复盘 · ${input.now.slice(0, 10)}`, userNote: input.userNote?.trim() || undefined, metrics: input.metrics, aiReport: input.aiReport, createdAt: input.now, updatedAt: input.now }; }
