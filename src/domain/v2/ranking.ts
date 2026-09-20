import { calculateTaskPressure, calculateUrgency } from '../../lib/pressureEngine.js';
import type { Task, TaskDependency, TaskStatus } from './entities.js';
import type { EntityId, UserId } from './shared.js';

export type RankingExclusionReason =
  | 'COMPLETED'
  | 'DEFERRED'
  | 'CANCELLED'
  | 'ARCHIVED'
  | 'PROGRESS_COMPLETE'
  | 'NON_ACTIONABLE'
  | 'DEPENDENCY_BLOCKED'
  | 'STARTS_IN_FUTURE'
  | 'INVALID_DATA';

export type DependencyBlockReason =
  | 'PREDECESSOR_INCOMPLETE'
  | 'MISSING_PREDECESSOR'
  | 'SELF_DEPENDENCY'
  | 'DEPENDENCY_OWNER_MISMATCH';

export type LifecycleEligibility = 'ELIGIBLE' | 'DONE' | 'DEFERRED' | 'CANCELLED' | 'ARCHIVED' | 'INVALID';
export type ProgressEligibility = 'ELIGIBLE' | 'COMPLETE' | 'INVALID';
export type StartAfterState = 'NOT_SET' | 'READY' | 'STARTS_IN_FUTURE' | 'INVALID';
export type DeadlineInterpretation = 'NOT_SET' | 'TIMESTAMP' | 'DATE_ONLY_UTC' | 'INVALID_AS_NO_DEADLINE';

export interface DependencyBlock {
  readonly predecessorTaskId: EntityId;
  readonly reason: DependencyBlockReason;
  readonly predecessorStatus?: TaskStatus;
}

export interface DependencyEvaluation {
  readonly state: 'CLEAR' | 'BLOCKED';
  readonly predecessorTaskIds: readonly EntityId[];
  readonly blocks: readonly DependencyBlock[];
}

export interface RankingScoreComponents {
  readonly importance: number | null;
  readonly urgency: number;
  readonly remainingWorkMultiplier: number | null;
  readonly pressureContribution: number | null;
  readonly totalScore: number | null;
  readonly deadlineInterpretation: DeadlineInterpretation;
}

export interface CanonicalRankingCandidate {
  readonly taskId: EntityId;
  readonly eligible: boolean;
  readonly rank?: number;
  readonly score: RankingScoreComponents;
  readonly blocked: boolean;
  readonly blockReasons: readonly DependencyBlock[];
  readonly dependencyState: DependencyEvaluation;
  readonly startAfterState: StartAfterState;
  readonly lifecycleEligibility: LifecycleEligibility;
  readonly progressEligibility: ProgressEligibility;
  readonly exclusionReasons: readonly RankingExclusionReason[];
  readonly invalidFields: readonly string[];
}

export interface CanonicalRankingResult {
  readonly userId: UserId;
  readonly evaluatedAt: string;
  readonly orderedEligibleTaskIds: readonly EntityId[];
  readonly candidates: readonly CanonicalRankingCandidate[];
}

/** Transient unresolved dependency evidence used only by legacy shadow callers. */
export interface ShadowDependencyEvidence {
  readonly source: 'LEGACY_SHADOW';
  readonly successorTaskId: EntityId;
  readonly predecessorTaskId: EntityId;
  readonly reason: Extract<DependencyBlockReason, 'MISSING_PREDECESSOR' | 'SELF_DEPENDENCY'>;
}

export interface CanonicalRankingRequest {
  readonly userId: UserId;
  readonly tasks: readonly Task[];
  readonly taskDependencies: readonly TaskDependency[];
  readonly shadowDependencyEvidence?: readonly ShadowDependencyEvidence[];
  readonly now: string | number | Date;
}

export interface NowRankingProjection {
  readonly rankedTaskIds: readonly EntityId[];
  readonly currentTaskId?: EntityId;
  readonly nextTaskIds: readonly EntityId[];
}

export interface TasksRankingProjection {
  readonly rankedTaskIds: readonly EntityId[];
}

const VALID_STATUSES = new Set<TaskStatus>(['ready', 'in_progress', 'deferred', 'done', 'cancelled', 'archived']);

function timestamp(value: string | number | Date): number {
  const parsed = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new RangeError('Canonical ranking requires a valid explicit now value.');
  return parsed;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOptionalDate(left?: string, right?: string): number {
  const leftTime = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;
  const safeLeft = Number.isFinite(leftTime) ? leftTime : Number.POSITIVE_INFINITY;
  const safeRight = Number.isFinite(rightTime) ? rightTime : Number.POSITIVE_INFINITY;
  return safeLeft - safeRight;
}

function lifecycleEligibility(status: TaskStatus): LifecycleEligibility {
  if (status === 'ready' || status === 'in_progress') return 'ELIGIBLE';
  if (status === 'done') return 'DONE';
  if (status === 'deferred') return 'DEFERRED';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'archived') return 'ARCHIVED';
  return 'INVALID';
}

function deadlineInterpretation(deadline?: string): DeadlineInterpretation {
  if (!deadline) return 'NOT_SET';
  if (!Number.isFinite(new Date(deadline).getTime())) return 'INVALID_AS_NO_DEADLINE';
  return /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? 'DATE_ONLY_UTC' : 'TIMESTAMP';
}

function collectDependencyIds(
  task: Task,
  dependencies: readonly TaskDependency[],
  shadowEvidence: readonly ShadowDependencyEvidence[],
): EntityId[] {
  const canonicalIds = dependencies.filter((edge) => edge.successorTaskId === task.id).map((edge) => edge.predecessorTaskId);
  const shadowIds = shadowEvidence.filter((evidence) => evidence.successorTaskId === task.id).map((evidence) => evidence.predecessorTaskId);
  return [...new Set([...canonicalIds, ...shadowIds])].sort(compareText);
}

function evaluateDependencies(
  task: Task,
  dependencies: readonly TaskDependency[],
  shadowEvidence: readonly ShadowDependencyEvidence[],
  taskById: ReadonlyMap<EntityId, Task>,
): DependencyEvaluation {
  const predecessorTaskIds = collectDependencyIds(task, dependencies, shadowEvidence);
  const blocks: DependencyBlock[] = [];

  for (const predecessorTaskId of predecessorTaskIds) {
    const unresolved = shadowEvidence.find((evidence) => evidence.successorTaskId === task.id && evidence.predecessorTaskId === predecessorTaskId);
    if (unresolved) {
      blocks.push({ predecessorTaskId, reason: unresolved.reason, predecessorStatus: unresolved.reason === 'SELF_DEPENDENCY' ? task.status : undefined });
      continue;
    }
    if (predecessorTaskId === task.id) {
      blocks.push({ predecessorTaskId, reason: 'SELF_DEPENDENCY', predecessorStatus: task.status });
      continue;
    }
    const predecessor = taskById.get(predecessorTaskId);
    if (!predecessor) {
      blocks.push({ predecessorTaskId, reason: 'MISSING_PREDECESSOR' });
      continue;
    }
    const edgeHasOwnerMismatch = dependencies.some((edge) => edge.successorTaskId === task.id && edge.predecessorTaskId === predecessorTaskId && edge.userId !== task.userId);
    if (predecessor.userId !== task.userId || edgeHasOwnerMismatch) {
      blocks.push({ predecessorTaskId, reason: 'DEPENDENCY_OWNER_MISMATCH', predecessorStatus: predecessor.status });
      continue;
    }
    if (predecessor.status !== 'done') blocks.push({ predecessorTaskId, reason: 'PREDECESSOR_INCOMPLETE', predecessorStatus: predecessor.status });
  }

  return { state: blocks.length > 0 ? 'BLOCKED' : 'CLEAR', predecessorTaskIds, blocks };
}

function explainCandidate(
  task: Task,
  request: CanonicalRankingRequest,
  now: number,
  taskById: ReadonlyMap<EntityId, Task>,
): CanonicalRankingCandidate {
  const invalidFields: string[] = [];
  if (task.userId !== request.userId) invalidFields.push('userId');
  if (!task.id) invalidFields.push('id');
  if (!task.title) invalidFields.push('title');
  if (!VALID_STATUSES.has(task.status)) invalidFields.push('status');
  if (!Number.isFinite(task.importance) || task.importance < 1 || task.importance > 10) invalidFields.push('importance');
  if (!Number.isFinite(task.progress) || task.progress < 0 || task.progress > 100) invalidFields.push('progress');
  if (typeof task.actionable !== 'boolean') invalidFields.push('actionable');

  const lifecycle = lifecycleEligibility(task.status);
  const progress: ProgressEligibility = !Number.isFinite(task.progress) || task.progress < 0 || task.progress > 100
    ? 'INVALID'
    : task.progress >= 100 ? 'COMPLETE' : 'ELIGIBLE';
  let startAfterState: StartAfterState = 'NOT_SET';
  if (task.startAfter) {
    const startsAt = new Date(task.startAfter).getTime();
    if (!Number.isFinite(startsAt)) {
      startAfterState = 'INVALID';
      invalidFields.push('startAfter');
    } else startAfterState = startsAt > now ? 'STARTS_IN_FUTURE' : 'READY';
  }

  const dependencyState = evaluateDependencies(task, request.taskDependencies, request.shadowDependencyEvidence ?? [], taskById);
  const exclusionReasons: RankingExclusionReason[] = [];
  if (lifecycle === 'DONE') exclusionReasons.push('COMPLETED');
  if (lifecycle === 'DEFERRED') exclusionReasons.push('DEFERRED');
  if (lifecycle === 'CANCELLED') exclusionReasons.push('CANCELLED');
  if (lifecycle === 'ARCHIVED') exclusionReasons.push('ARCHIVED');
  if (progress === 'COMPLETE') exclusionReasons.push('PROGRESS_COMPLETE');
  if (!task.actionable) exclusionReasons.push('NON_ACTIONABLE');
  if (dependencyState.state === 'BLOCKED') exclusionReasons.push('DEPENDENCY_BLOCKED');
  if (startAfterState === 'STARTS_IN_FUTURE') exclusionReasons.push('STARTS_IN_FUTURE');
  if (lifecycle === 'INVALID' || progress === 'INVALID' || startAfterState === 'INVALID' || invalidFields.length > 0) exclusionReasons.push('INVALID_DATA');

  const scoreInputsValid = !invalidFields.includes('importance') && !invalidFields.includes('progress');
  const scoringNow = new Date(now);
  const urgency = calculateUrgency(task.deadline, scoringNow);
  const pressureContribution = scoreInputsValid ? calculateTaskPressure(task, scoringNow) : null;
  const totalScore = pressureContribution === null ? null : pressureContribution * 10 + task.importance;
  return {
    taskId: task.id,
    eligible: exclusionReasons.length === 0,
    score: {
      importance: Number.isFinite(task.importance) ? task.importance : null,
      urgency,
      remainingWorkMultiplier: Number.isFinite(task.progress) ? 1 - Math.min(100, Math.max(0, task.progress)) / 100 : null,
      pressureContribution,
      totalScore,
      deadlineInterpretation: deadlineInterpretation(task.deadline),
    },
    blocked: dependencyState.state === 'BLOCKED',
    blockReasons: dependencyState.blocks,
    dependencyState,
    startAfterState,
    lifecycleEligibility: lifecycle,
    progressEligibility: progress,
    exclusionReasons,
    invalidFields: [...new Set(invalidFields)],
  };
}

/**
 * Read-only canonical selector. Numeric priority is the established VD
 * importance-urgency-v1 pressure score; eligibility and blockers are separate.
 */
export function rankCanonicalTasks(request: CanonicalRankingRequest): CanonicalRankingResult {
  const now = timestamp(request.now);
  const taskById = new Map(request.tasks.map((task) => [task.id, task]));
  const explained = request.tasks.map((task) => ({ task, candidate: explainCandidate(task, request, now, taskById) }));
  const ranked = explained.filter(({ candidate }) => candidate.eligible).sort((left, right) => {
    const leftScore = left.candidate.score.totalScore ?? Number.NEGATIVE_INFINITY;
    const rightScore = right.candidate.score.totalScore ?? Number.NEGATIVE_INFINITY;
    return rightScore - leftScore
      || (right.candidate.score.pressureContribution ?? 0) - (left.candidate.score.pressureContribution ?? 0)
      || right.candidate.score.urgency - left.candidate.score.urgency
      || right.task.importance - left.task.importance
      || compareOptionalDate(left.task.deadline, right.task.deadline)
      || compareOptionalDate(left.task.createdAt, right.task.createdAt)
      || compareText(left.task.id, right.task.id);
  });
  const rankByTaskId = new Map(ranked.map(({ task }, index) => [task.id, index + 1]));
  const candidates = explained.map(({ candidate }) => ({ ...candidate, rank: rankByTaskId.get(candidate.taskId) }))
    .sort((left, right) => (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY) || compareText(left.taskId, right.taskId));

  return {
    userId: request.userId,
    evaluatedAt: new Date(now).toISOString(),
    orderedEligibleTaskIds: ranked.map(({ task }) => task.id),
    candidates,
  };
}

export function projectNowRanking(result: CanonicalRankingResult, queueLimit = 3): NowRankingProjection {
  const rankedTaskIds = result.orderedEligibleTaskIds.slice(0, Math.max(0, queueLimit));
  return { rankedTaskIds, currentTaskId: rankedTaskIds[0], nextTaskIds: rankedTaskIds.slice(1) };
}

export function projectTasksRanking(result: CanonicalRankingResult): TasksRankingProjection {
  return { rankedTaskIds: result.orderedEligibleTaskIds };
}
