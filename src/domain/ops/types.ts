import type { Goal, Task } from '../../types/task.js';

export type OpsExecutorKind = 'human' | 'agent' | 'compute' | 'external' | 'hybrid';
export type OpsPlanStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded';
export type OpsUnscheduledReason = 'MISSING_DURATION' | 'MISSING_EXECUTOR' | 'NO_AVAILABILITY' | 'NO_CAPACITY_IN_HORIZON' | 'MISSING_DEPENDENCY' | 'DEPENDENCY_CYCLE' | 'BLOCKED_BY_UNSCHEDULED_PREDECESSOR' | 'INVALID_CONSTRAINT';

export interface OpsAvailabilityWindow { id: string; weekday: 0 | 1 | 2 | 3 | 4 | 5 | 6; startTime: string; endTime: string; }
export interface OpsExecutor { id: string; name: string; kind: OpsExecutorKind; active: boolean; maxParallel: number; availability: OpsAvailabilityWindow[]; }
export interface OpsCommitment { id: string; title: string; executorId: string; start: string; end: string; locked: boolean; source: 'manual' | 'imported'; createdAt: string; updatedAt: string; }
export interface OpsTaskConfig { taskId: string; executorId?: string; effortMinutes?: number; elapsedMinutes?: number; earliestStart?: string; updatedAt: string; }
export interface OpsAllocation { taskId: string; executorId: string; start: string; end: string; effortMinutes: number; elapsedMinutes: number; locked: boolean; source: 'scheduler' | 'manual'; }
export interface OpsUnscheduledTask { taskId: string; reason: OpsUnscheduledReason; details?: string; }
export interface OpsExecutionPlan { id: string; version: number; status: OpsPlanStatus; horizonStart: string; horizonEnd: string; allocations: OpsAllocation[]; unscheduled: OpsUnscheduledTask[]; warnings: string[]; createdAt: string; }
export interface OpsState { schemaVersion: 1; timezone: string; horizonDays: 7 | 14 | 30; executors: OpsExecutor[]; commitments: OpsCommitment[]; taskConfigs: OpsTaskConfig[]; plans: OpsExecutionPlan[]; acceptedPlanId?: string; proposedPlanId?: string; updatedAt: string; }

export interface ResolvedTaskExecution { taskId: string; executorId?: string; effortMinutes?: number; elapsedMinutes?: number; earliestStart?: string; }
export interface OpsScheduleInput { tasks: readonly Task[]; goals: readonly Goal[]; state: OpsState; now: string; horizonStart?: string; horizonEnd?: string; id?: string; }
export interface OpsPlanDiff { unchanged: string[]; newlyScheduled: string[]; moved: string[]; removed: string[]; newlyUnscheduled: string[]; deadlineMisses: string[]; conflicts: string[]; }

export function createDefaultOpsState(now = new Date().toISOString()): OpsState {
  let timezone = 'UTC';
  try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* server / legacy runtime */ }
  return { schemaVersion: 1, timezone, horizonDays: 7, executors: [{ id: 'self', name: '我', kind: 'human', active: true, maxParallel: 1, availability: [] }], commitments: [], taskConfigs: [], plans: [], updatedAt: now };
}
