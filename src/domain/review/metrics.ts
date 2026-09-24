import type { Goal, PressureHistoryRecord, Task } from '../../types/task.js';
import { detectOpsConflicts } from '../ops/scheduler.js';
import type { OpsState } from '../ops/types.js';
import { isInsideReviewWindow } from './window.js';
import type { ReviewHistoryEvent, ReviewMetricsSnapshot } from './types.js';

const hour = 60 * 60 * 1000;
const valid = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
export function calculatePressureVolatility(values: readonly number[]): number | undefined { if (!values.length) return undefined; const mean = average([...values])!; return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length); }

export function deriveReviewMetrics(input: { tasks: readonly Task[]; goals: readonly Goal[]; pressureHistory: readonly PressureHistoryRecord[]; events?: readonly ReviewHistoryEvent[]; opsState: OpsState; window: { start: string; end: string }; now: string }): ReviewMetricsSnapshot {
  const historical = input.events?.filter((event) => isInsideReviewWindow(event.timestamp, input.window));
  const completed = historical ? historical.filter((event) => event.kind === 'task_completed') : input.tasks.filter((task) => task.lifecycleStatus === 'completed' && isInsideReviewWindow(task.completedAt, input.window));
  const abandoned = historical ? historical.filter((event) => event.kind === 'task_abandoned') : input.tasks.filter((task) => task.lifecycleStatus === 'abandoned' && isInsideReviewWindow(task.abandonedAt, input.window));
  const deadlineTasks = completed.filter((entry) => valid(entry.deadline) !== undefined);
  const deltas = deadlineTasks.map((entry) => (Date.parse(entry.deadline!) - Date.parse('timestamp' in entry ? entry.timestamp : entry.completedAt!)) / hour);
  const pressureSamples = historical ? historical.filter((event) => (event.kind === 'pressure_sample' || event.kind === 'pressure_recalibrated') && Number.isFinite(event.pressure)) : input.pressureHistory.filter((sample) => isInsideReviewWindow(sample.timestamp, input.window) && Number.isFinite(sample.pressure));
  const accepted = input.opsState.plans.find((plan) => plan.id === input.opsState.acceptedPlanId && plan.status === 'accepted');
  const milestones = input.goals.flatMap((goal) => goal.milestones ?? []);
  const denominator = completed.length + abandoned.length;
  const completedWithDeadlineCount = deadlineTasks.length;
  const onTimeCompletionCount = deltas.filter((delta) => delta >= 0).length;
  return {
    resolvedCount: denominator, completedCount: completed.length, abandonedCount: abandoned.length, completionRate: denominator ? completed.length / denominator * 100 : undefined,
    completedWithDeadlineCount, onTimeCompletionCount, onTimeRate: completedWithDeadlineCount ? onTimeCompletionCount / completedWithDeadlineCount * 100 : undefined,
    averageDeadlineDeltaHours: average(deltas), lastHourCompletionCount: deltas.filter((delta) => delta >= 0 && delta <= 1).length,
    pressureSampleCount: pressureSamples.length, averagePressure: average(pressureSamples.map((sample) => sample.pressure!)), maxPressure: pressureSamples.length ? Math.max(...pressureSamples.map((sample) => sample.pressure!)) : undefined, pressureVolatility: calculatePressureVolatility(pressureSamples.map((sample) => sample.pressure!)), highPressureSampleCount: pressureSamples.filter((sample) => sample.pressure! >= 81).length,
    activeTaskCount: input.tasks.filter((task) => task.lifecycleStatus === 'active').length, currentOverdueTaskCount: input.tasks.filter((task) => task.lifecycleStatus === 'active' && (valid(task.deadline) ?? Infinity) < Date.parse(input.now)).length,
    currentGoalCount: input.goals.length, currentMilestoneCount: milestones.length, currentCompletedMilestoneCount: milestones.filter((milestone) => milestone.status === 'completed').length,
    currentScheduledTaskCount: accepted?.allocations.length ?? 0, currentUnscheduledTaskCount: accepted?.unscheduled.length ?? 0, currentConflictCount: accepted ? detectOpsConflicts(accepted, input.tasks, input.opsState).length : 0,
  };
}
