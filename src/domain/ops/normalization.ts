import type { Task } from '../../types/task.js';
import { createDefaultOpsState, type OpsAvailabilityWindow, type OpsExecutionPlan, type OpsExecutor, type OpsExecutorKind, type OpsState, type OpsTaskConfig, type ResolvedTaskExecution } from './types.js';
import { normalizeOpsTimezone } from './time.js';

const kinds = new Set<OpsExecutorKind>(['human', 'agent', 'compute', 'external', 'hybrid']);
const horizons = new Set([7, 14, 30]);
const unscheduledReasons = new Set(['MISSING_DURATION', 'MISSING_EXECUTOR', 'NO_AVAILABILITY', 'NO_CAPACITY_IN_HORIZON', 'MISSING_DEPENDENCY', 'DEPENDENCY_CYCLE', 'BLOCKED_BY_UNSCHEDULED_PREDECESSOR', 'INVALID_CONSTRAINT']);
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const iso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function isValidAvailability(value: unknown): value is OpsAvailabilityWindow {
  if (!isRecord(value) || !id(value.id) || !Number.isInteger(value.weekday) || (value.weekday as number) < 0 || (value.weekday as number) > 6 || typeof value.startTime !== 'string' || typeof value.endTime !== 'string') return false;
  return hhmm.test(value.startTime) && hhmm.test(value.endTime) && value.startTime < value.endTime;
}

function normalizeExecutor(value: unknown, ids: Set<string>): OpsExecutor | undefined {
  if (!isRecord(value) || !id(value.id) || ids.has(value.id) || typeof value.name !== 'string' || !value.name.trim() || !kinds.has(value.kind as OpsExecutorKind) || !Number.isInteger(value.maxParallel) || (value.maxParallel as number) < 1) return undefined;
  ids.add(value.id);
  const windows = Array.isArray(value.availability) ? value.availability.filter(isValidAvailability) : [];
  const seen = new Set<string>();
  const unique = windows.filter((window) => !seen.has(window.id) && Boolean(seen.add(window.id))).sort((left, right) => left.weekday - right.weekday || left.startTime.localeCompare(right.startTime));
  // Overlapping weekly windows are merged, never treated as additional capacity.
  const availability = unique.reduce<OpsAvailabilityWindow[]>((merged, window) => { const previous = merged.at(-1); if (previous && previous.weekday === window.weekday && window.startTime <= previous.endTime) { previous.endTime = previous.endTime > window.endTime ? previous.endTime : window.endTime; } else merged.push({ ...window }); return merged; }, []);
  return { id: value.id, name: value.name.trim(), kind: value.kind as OpsExecutorKind, active: value.active !== false, maxParallel: value.maxParallel as number, availability };
}

function normalizePlan(value: unknown, executorIds: Set<string>, planIds: Set<string>): OpsExecutionPlan | undefined {
  if (!isRecord(value) || !id(value.id) || planIds.has(value.id) || !Number.isInteger(value.version) || !iso(value.horizonStart) || !iso(value.horizonEnd) || Date.parse(value.horizonEnd) <= Date.parse(value.horizonStart)) return undefined;
  const status = value.status;
  if (!['proposed', 'accepted', 'rejected', 'superseded'].includes(status as string)) return undefined;
  planIds.add(value.id);
  const allocationIds = new Set<string>();
  const allocations = Array.isArray(value.allocations) ? value.allocations.flatMap((allocation) => {
    if (!isRecord(allocation) || !id(allocation.taskId) || allocationIds.has(allocation.taskId) || !id(allocation.executorId) || !executorIds.has(allocation.executorId) || !iso(allocation.start) || !iso(allocation.end) || Date.parse(allocation.end) <= Date.parse(allocation.start) || !positive(allocation.effortMinutes) || !positive(allocation.elapsedMinutes) || !['scheduler', 'manual'].includes(allocation.source as string)) return [];
    allocationIds.add(allocation.taskId);
    return [{ taskId: allocation.taskId, executorId: allocation.executorId, start: allocation.start, end: allocation.end, effortMinutes: allocation.effortMinutes as number, elapsedMinutes: allocation.elapsedMinutes as number, locked: allocation.locked === true, source: allocation.source as 'scheduler' | 'manual' }];
  }) : [];
  const unscheduled = Array.isArray(value.unscheduled) ? value.unscheduled.flatMap((entry) => isRecord(entry) && id(entry.taskId) && typeof entry.reason === 'string' && unscheduledReasons.has(entry.reason) ? [{ taskId: entry.taskId, reason: entry.reason as OpsExecutionPlan['unscheduled'][number]['reason'], details: typeof entry.details === 'string' ? entry.details : undefined }] : []) : [];
  return { id: value.id, version: value.version as number, status: status as OpsExecutionPlan['status'], horizonStart: value.horizonStart, horizonEnd: value.horizonEnd, allocations, unscheduled, warnings: Array.isArray(value.warnings) ? value.warnings.filter((warning): warning is string => typeof warning === 'string') : [], createdAt: iso(value.createdAt) ? value.createdAt : value.horizonStart };
}

export function normalizeOpsState(raw: unknown, fallbackNow = new Date().toISOString()): OpsState {
  const fallback = createDefaultOpsState(fallbackNow);
  if (!isRecord(raw) || raw.schemaVersion !== 1) return fallback;
  const executorIds = new Set<string>();
  const executors = Array.isArray(raw.executors) ? raw.executors.flatMap((value) => { const next = normalizeExecutor(value, executorIds); return next ? [next] : []; }) : [];
  if (!executors.some((executor) => executor.id === 'self')) executors.unshift(fallback.executors[0]);
  const validExecutorIds = new Set(executors.map((executor) => executor.id));
  const commitmentIds = new Set<string>();
  const commitments = Array.isArray(raw.commitments) ? raw.commitments.flatMap((value) => {
    if (!isRecord(value) || !id(value.id) || commitmentIds.has(value.id) || !id(value.title) || !id(value.executorId) || !validExecutorIds.has(value.executorId) || !iso(value.start) || !iso(value.end) || Date.parse(value.end) <= Date.parse(value.start) || !['manual', 'imported'].includes(value.source as string)) return [];
    commitmentIds.add(value.id); return [{ id: value.id, title: value.title.trim(), executorId: value.executorId, start: value.start, end: value.end, locked: value.locked !== false, source: value.source as 'manual' | 'imported', createdAt: iso(value.createdAt) ? value.createdAt : fallbackNow, updatedAt: iso(value.updatedAt) ? value.updatedAt : fallbackNow }];
  }) : [];
  const configIds = new Set<string>();
  const taskConfigs = Array.isArray(raw.taskConfigs) ? raw.taskConfigs.flatMap((value): OpsTaskConfig[] => {
    if (!isRecord(value) || !id(value.taskId) || configIds.has(value.taskId) || (value.executorId !== undefined && (!id(value.executorId) || !validExecutorIds.has(value.executorId))) || (value.effortMinutes !== undefined && !positive(value.effortMinutes)) || (value.elapsedMinutes !== undefined && !positive(value.elapsedMinutes)) || (value.earliestStart !== undefined && !iso(value.earliestStart))) return [];
    configIds.add(value.taskId); return [{ taskId: value.taskId, executorId: value.executorId as string | undefined, effortMinutes: value.effortMinutes as number | undefined, elapsedMinutes: value.elapsedMinutes as number | undefined, earliestStart: value.earliestStart as string | undefined, updatedAt: iso(value.updatedAt) ? value.updatedAt : fallbackNow }];
  }) : [];
  const planIds = new Set<string>();
  const plans = Array.isArray(raw.plans) ? raw.plans.flatMap((value) => { const plan = normalizePlan(value, validExecutorIds, planIds); return plan ? [plan] : []; }) : [];
  const acceptedPlanId = typeof raw.acceptedPlanId === 'string' && plans.some((plan) => plan.id === raw.acceptedPlanId && plan.status === 'accepted') ? raw.acceptedPlanId : undefined;
  const proposedPlanId = typeof raw.proposedPlanId === 'string' && plans.some((plan) => plan.id === raw.proposedPlanId && plan.status === 'proposed') ? raw.proposedPlanId : undefined;
  return { schemaVersion: 1, timezone: normalizeOpsTimezone(raw.timezone), horizonDays: horizons.has(raw.horizonDays as number) ? raw.horizonDays as 7 | 14 | 30 : 7, executors, commitments, taskConfigs, plans, acceptedPlanId, proposedPlanId, updatedAt: iso(raw.updatedAt) ? raw.updatedAt : fallbackNow };
}

export function chooseNewerOpsState(local: unknown, cloud: unknown): OpsState {
  const normalizedLocal = normalizeOpsState(local);
  const normalizedCloud = normalizeOpsState(cloud);
  return Date.parse(normalizedCloud.updatedAt) > Date.parse(normalizedLocal.updatedAt) ? normalizedCloud : normalizedLocal;
}

export function resolveTaskExecutionConfig(task: Task, state: OpsState): ResolvedTaskExecution {
  const config = state.taskConfigs.find((entry) => entry.taskId === task.id);
  const effortMinutes = config?.effortMinutes ?? task.estimatedDuration;
  return { taskId: task.id, executorId: config?.executorId ?? 'self', effortMinutes: positive(effortMinutes) ? effortMinutes : undefined, elapsedMinutes: positive(config?.elapsedMinutes) ? config.elapsedMinutes : positive(effortMinutes) ? effortMinutes : undefined, earliestStart: config?.earliestStart };
}
