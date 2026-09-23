import type { Goal, Task } from '../../types/task.js';
import { projectTaskDependencyGraph } from './dependencies.js';
import { normalizeOpsState, resolveTaskExecutionConfig } from './normalization.js';
import { buildZonedAvailabilityIntervals } from './time.js';
import type { OpsAllocation, OpsExecutionPlan, OpsScheduleInput, OpsState, OpsUnscheduledTask } from './types.js';

const minute = 60_000;
const validDate = (value: string | undefined) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const overlaps = (start: number, end: number, otherStart: number, otherEnd: number) => start < otherEnd && end > otherStart;
const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
const active = (task: Task) => task.lifecycleStatus === 'active';

export function buildExecutorAvailability(state: OpsState, executorId: string, start: number, end: number): Array<[number, number]> {
  const executor = state.executors.find((entry) => entry.id === executorId);
  if (!executor) return [];
  return buildZonedAvailabilityIntervals(state.timezone, executor.availability, start, end).map(([windowStart, windowEnd]): [number, number] => [windowStart, windowEnd]);
}

function fitsSlot(state: OpsState, executorId: string, start: number, elapsedMinutes: number, allocations: readonly OpsAllocation[]): boolean {
  const end = start + elapsedMinutes * minute; const executor = state.executors.find((entry) => entry.id === executorId);
  if (!executor) return false;
  if (state.commitments.some((commitment) => commitment.executorId === executorId && overlaps(start, end, Date.parse(commitment.start), Date.parse(commitment.end)))) return false;
  const overlapping = allocations.filter((allocation) => allocation.executorId === executorId && overlaps(start, end, Date.parse(allocation.start), Date.parse(allocation.end)));
  const boundaries = [start, end, ...overlapping.flatMap((allocation) => [Math.max(start, Date.parse(allocation.start)), Math.min(end, Date.parse(allocation.end))])].sort((left, right) => left - right);
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const probe = (boundaries[index] + boundaries[index + 1]) / 2;
    if (overlapping.filter((allocation) => Date.parse(allocation.start) <= probe && Date.parse(allocation.end) > probe).length >= executor.maxParallel) return false;
  }
  return true;
}

function findSlot(state: OpsState, executorId: string, earliest: number, end: number, elapsedMinutes: number, allocations: readonly OpsAllocation[]): number | undefined {
  for (const [windowStart, windowEnd] of buildExecutorAvailability(state, executorId, earliest, end)) {
    for (let candidate = Math.max(windowStart, earliest); candidate + elapsedMinutes * minute <= windowEnd; candidate += minute) if (fitsSlot(state, executorId, candidate, elapsedMinutes, allocations)) return candidate;
  }
  return undefined;
}

function candidateOrder(tasks: Task[], goals: readonly Goal[]): Task[] {
  const goalById = new Map(goals.map((goal) => [goal.id, goal]));
  return [...tasks].sort((left, right) => {
    const leftDeadline = validDate(left.deadline) ?? Number.MAX_SAFE_INTEGER; const rightDeadline = validDate(right.deadline) ?? Number.MAX_SAFE_INTEGER;
    if (leftDeadline !== rightDeadline) return leftDeadline - rightDeadline;
    if (left.importance !== right.importance) return right.importance - left.importance;
    const goalPriority = (task: Task) => Math.max(0, ...(task.linkedGoalIds ?? []).map((id) => goalById.get(id)?.priority ?? 0));
    if (goalPriority(left) !== goalPriority(right)) return goalPriority(right) - goalPriority(left);
    if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
    return left.id.localeCompare(right.id);
  });
}

export function buildOpsScheduleProposal(input: OpsScheduleInput): OpsExecutionPlan {
  const state = normalizeOpsState(input.state, input.now); const horizonStart = validDate(input.horizonStart) ?? validDate(input.now) ?? 0; const horizonEnd = validDate(input.horizonEnd) ?? horizonStart + state.horizonDays * 24 * 60 * minute;
  const activeTasks = input.tasks.filter(active); const byId = new Map(input.tasks.map((task) => [task.id, task])); const graph = new Map(projectTaskDependencyGraph(input.tasks).map((entry) => [entry.taskId, entry]));
  const accepted = state.plans.find((plan) => plan.id === state.acceptedPlanId); const warnings: string[] = []; const unscheduled: OpsUnscheduledTask[] = []; const allocations: OpsAllocation[] = [];
  // Only structurally valid locks are carried into a replan; invalid ones are visible diagnostics.
  for (const allocation of accepted?.allocations ?? []) {
    if (!allocation.locked) continue;
    const lockedTask = byId.get(allocation.taskId);
    if (!lockedTask || !active(lockedTask) || !state.executors.some((executor) => executor.id === allocation.executorId) || Date.parse(allocation.end) <= Date.parse(allocation.start)) { warnings.push(lockedTask && !active(lockedTask) ? `STALE_TERMINAL_ALLOCATION:${allocation.taskId}` : `LOCKED_CONFLICT:${allocation.taskId}`); continue; }
    allocations.push({ ...allocation });
  }
  const alreadyAllocated = new Set(allocations.map((allocation) => allocation.taskId));
  const pending = candidateOrder(activeTasks.filter((task) => !alreadyAllocated.has(task.id)), input.goals);
  const scheduledEnds = new Map(allocations.map((allocation) => [allocation.taskId, Date.parse(allocation.end)]));
  while (pending.length) {
    let progressed = false;
    for (let index = 0; index < pending.length; index += 1) {
      const task = pending[index]; const dependencies = graph.get(task.id)?.predecessors ?? [];
      if (dependencies.some((entry) => entry.state === 'missing')) { unscheduled.push({ taskId: task.id, reason: 'MISSING_DEPENDENCY' }); pending.splice(index--, 1); progressed = true; continue; }
      if (dependencies.some((entry) => entry.state === 'self' || entry.state === 'cycle')) { unscheduled.push({ taskId: task.id, reason: 'DEPENDENCY_CYCLE' }); pending.splice(index--, 1); progressed = true; continue; }
      if (dependencies.some((entry) => entry.state === 'abandoned')) { unscheduled.push({ taskId: task.id, reason: 'BLOCKED_BY_UNSCHEDULED_PREDECESSOR', details: '已放弃的前置任务不会自动满足依赖。' }); pending.splice(index--, 1); progressed = true; continue; }
      const activePredecessors = dependencies.filter((entry) => entry.state === 'active');
      if (activePredecessors.some((entry) => pending.some((candidate) => candidate.id === entry.taskId))) continue;
      if (activePredecessors.some((entry) => !scheduledEnds.has(entry.taskId))) { unscheduled.push({ taskId: task.id, reason: 'BLOCKED_BY_UNSCHEDULED_PREDECESSOR' }); pending.splice(index--, 1); progressed = true; continue; }
      const config = resolveTaskExecutionConfig(task, state);
      if (!config.effortMinutes || !config.elapsedMinutes) { unscheduled.push({ taskId: task.id, reason: 'MISSING_DURATION' }); pending.splice(index--, 1); progressed = true; continue; }
      const executor = state.executors.find((entry) => entry.id === config.executorId && entry.active);
      if (!executor) { unscheduled.push({ taskId: task.id, reason: 'MISSING_EXECUTOR' }); pending.splice(index--, 1); progressed = true; continue; }
      if (!executor.availability.length) { unscheduled.push({ taskId: task.id, reason: 'NO_AVAILABILITY' }); pending.splice(index--, 1); progressed = true; continue; }
      const predecessorEnd = Math.max(horizonStart, ...activePredecessors.map((entry) => scheduledEnds.get(entry.taskId) ?? horizonStart));
      const legacyStart = validDate(task.startDate) ?? horizonStart; const earliest = Math.max(horizonStart, predecessorEnd, validDate(config.earliestStart) ?? horizonStart, legacyStart);
      const slot = findSlot(state, executor.id, earliest, horizonEnd, config.elapsedMinutes, allocations);
      if (slot === undefined) unscheduled.push({ taskId: task.id, reason: 'NO_CAPACITY_IN_HORIZON' });
      else { const allocation = { taskId: task.id, executorId: executor.id, start: iso(slot), end: iso(slot + config.elapsedMinutes * minute), effortMinutes: config.effortMinutes, elapsedMinutes: config.elapsedMinutes, locked: false, source: 'scheduler' as const }; allocations.push(allocation); scheduledEnds.set(task.id, slot + config.elapsedMinutes * minute); if (validDate(task.deadline) !== undefined && slot + config.elapsedMinutes * minute > validDate(task.deadline)!) warnings.push(`DEADLINE_MISS:${task.id}`); }
      pending.splice(index--, 1); progressed = true;
    }
    if (!progressed) pending.splice(0).forEach((task) => unscheduled.push({ taskId: task.id, reason: 'BLOCKED_BY_UNSCHEDULED_PREDECESSOR' }));
  }
  const nextVersion = Math.max(0, ...state.plans.map((plan) => plan.version)) + 1;
  return { id: input.id ?? `ops-plan-${horizonStart}`, version: nextVersion, status: 'proposed', horizonStart: iso(horizonStart), horizonEnd: iso(horizonEnd), allocations, unscheduled, warnings, createdAt: input.now };
}

export function detectOpsConflicts(plan: OpsExecutionPlan, tasks: readonly Task[], state: OpsState): string[] {
  const normalized = normalizeOpsState(state); const taskById = new Map(tasks.map((task) => [task.id, task])); const conflicts: string[] = [];
  const graph = new Map(projectTaskDependencyGraph(tasks).map((entry) => [entry.taskId, entry])); const allocationByTask = new Map(plan.allocations.map((allocation) => [allocation.taskId, allocation]));
  plan.allocations.forEach((allocation) => { const executor = normalized.executors.find((entry) => entry.id === allocation.executorId); const task = taskById.get(allocation.taskId); const start = Date.parse(allocation.start); const end = Date.parse(allocation.end); if (!task) conflicts.push(`DELETED_TASK:${allocation.taskId}`); if (!executor) conflicts.push(`MISSING_EXECUTOR:${allocation.taskId}`); if (end <= start) conflicts.push(`INVALID_ALLOCATION:${allocation.taskId}`); if (executor && !buildExecutorAvailability(normalized, executor.id, start, end).some(([windowStart, windowEnd]) => windowStart <= start && windowEnd >= end)) conflicts.push(`OUTSIDE_AVAILABILITY:${allocation.taskId}`); normalized.commitments.filter((commitment) => commitment.executorId === allocation.executorId && overlaps(start, end, Date.parse(commitment.start), Date.parse(commitment.end))).forEach((commitment) => conflicts.push(`${allocation.locked ? 'LOCKED_' : ''}COMMITMENT_COLLISION:${allocation.taskId}:${commitment.id}`)); if (task?.deadline && end > Date.parse(task.deadline)) conflicts.push(`DEADLINE_MISS:${allocation.taskId}`);
    for (const predecessor of graph.get(allocation.taskId)?.predecessors ?? []) { if (predecessor.state === 'missing') conflicts.push(`MISSING_PREDECESSOR:${allocation.taskId}:${predecessor.taskId}`); else if (predecessor.state === 'self') conflicts.push(`SELF_DEPENDENCY:${allocation.taskId}`); else if (predecessor.state === 'cycle') conflicts.push(`DEPENDENCY_CYCLE:${allocation.taskId}`); else if (predecessor.state === 'abandoned') conflicts.push(`ABANDONED_PREDECESSOR:${allocation.taskId}:${predecessor.taskId}`); else if (predecessor.state === 'active') { const predecessorAllocation = allocationByTask.get(predecessor.taskId); if (!predecessorAllocation) conflicts.push(`ACTIVE_PREDECESSOR_UNSCHEDULED:${allocation.taskId}:${predecessor.taskId}`); else if (Date.parse(predecessorAllocation.end) > start) conflicts.push(`DEPENDENCY_TIMING:${allocation.taskId}:${predecessor.taskId}`); } }
  });
  normalized.executors.forEach((executor) => { const lane = plan.allocations.filter((allocation) => allocation.executorId === executor.id); lane.forEach((allocation) => { const midpoint = (Date.parse(allocation.start) + Date.parse(allocation.end)) / 2; const concurrent = lane.filter((other) => Date.parse(other.start) <= midpoint && Date.parse(other.end) > midpoint); if (concurrent.length > executor.maxParallel) conflicts.push(`${concurrent.every((other) => other.locked) ? 'LOCKED_CAPACITY_CONFLICT' : 'CAPACITY_CONFLICT'}:${executor.id}`); }); });
  return [...new Set(conflicts)];
}
