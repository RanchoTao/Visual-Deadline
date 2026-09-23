import type { OpsExecutionPlan, OpsState } from './types.js';
import { buildExecutorAvailability } from './scheduler.js';

export interface OpsCapacityProjection { executorId: string; availabilityMinutes: number; scheduledElapsedMinutes: number; commitmentMinutes: number; allocationCount: number; unscheduledCount: number; maxParallel: number; utilization: number; }

export function projectOpsCapacity(state: OpsState, plan: OpsExecutionPlan | undefined): OpsCapacityProjection[] {
  if (!plan) return state.executors.map((executor) => ({ executorId: executor.id, availabilityMinutes: 0, scheduledElapsedMinutes: 0, commitmentMinutes: 0, allocationCount: 0, unscheduledCount: 0, maxParallel: executor.maxParallel, utilization: 0 }));
  const start = Date.parse(plan.horizonStart); const end = Date.parse(plan.horizonEnd);
  return state.executors.map((executor) => {
    const availabilityMinutes = buildExecutorAvailability(state, executor.id, start, end).reduce((total, [windowStart, windowEnd]) => total + (windowEnd - windowStart) / 60_000, 0);
    const allocations = plan.allocations.filter((allocation) => allocation.executorId === executor.id); const commitments = state.commitments.filter((commitment) => commitment.executorId === executor.id && Date.parse(commitment.start) < end && Date.parse(commitment.end) > start);
    const scheduledElapsedMinutes = allocations.reduce((total, allocation) => total + allocation.elapsedMinutes, 0); const commitmentMinutes = commitments.reduce((total, commitment) => total + Math.max(0, Math.min(end, Date.parse(commitment.end)) - Math.max(start, Date.parse(commitment.start))) / 60_000, 0);
    const assignedUnscheduled = plan.unscheduled.filter((item) => state.taskConfigs.find((config) => config.taskId === item.taskId)?.executorId === executor.id).length;
    const capacity = availabilityMinutes * executor.maxParallel;
    return { executorId: executor.id, availabilityMinutes, scheduledElapsedMinutes, commitmentMinutes, allocationCount: allocations.length, unscheduledCount: assignedUnscheduled, maxParallel: executor.maxParallel, utilization: capacity ? Math.round(scheduledElapsedMinutes / capacity * 1000) / 10 : 0 };
  });
}

export function allocationBarPercent(start: string, end: string, horizonStart: string, horizonEnd: string): { left: number; width: number } {
  const range = Date.parse(horizonEnd) - Date.parse(horizonStart); if (!range) return { left: 0, width: 0 }; const left = Math.max(0, Math.min(100, (Date.parse(start) - Date.parse(horizonStart)) / range * 100)); const right = Math.max(left, Math.min(100, (Date.parse(end) - Date.parse(horizonStart)) / range * 100)); return { left, width: Math.max(1, right - left) };
}
