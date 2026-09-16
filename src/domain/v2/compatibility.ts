import { adaptVisualDeadlineExecution, type ExecutionMetadata } from '../execution/adapter.js';
import type { Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import type { Goal, GoalStatus, Task, TaskDependency, TaskStatus } from './entities.js';
import type { EntityProvenance, UserId } from './shared.js';

export type CompatibilitySeverity = 'info' | 'warning' | 'error';
export type SemanticMappingQuality = 'EXACT' | 'AMBIGUOUS' | 'LOSSY';

export interface CompatibilityDiagnostic {
  readonly code:
    | 'LIFECYCLE_AMBIGUOUS'
    | 'LIFECYCLE_LOSSY'
    | 'PROGRESS_CLAMPED'
    | 'PROGRESS_STATUS_CONFLICT'
    | 'GOAL_STATUS_LOSSY'
    | 'RELATIONSHIP_INCONSISTENT'
    | 'RELATIONSHIP_MISSING_TARGET'
    | 'MULTIPLE_GOALS_UNRESOLVED'
    | 'DEPENDENCY_MISSING_TARGET'
    | 'DEPENDENCY_SELF_REFERENCE'
    | 'START_DATE_CONFLICT'
    | 'LEGACY_PROJECT_REFERENCE_IGNORED';
  readonly severity: CompatibilitySeverity;
  readonly entityKind: 'goal' | 'task' | 'task_dependency';
  readonly entityId: string;
  readonly message: string;
}

export interface LifecycleMapping {
  readonly taskId: string;
  readonly sourceStatus: LegacyTask['lifecycleStatus'];
  readonly targetStatus: TaskStatus;
  readonly quality: SemanticMappingQuality;
  readonly reason?: string;
}

export interface UnresolvedRelationship {
  readonly kind: 'goal_task' | 'task_dependency';
  readonly sourceId: string;
  readonly targetId: string;
  readonly reason: 'MISSING_TARGET' | 'ONE_SIDED' | 'MULTIPLE_TARGETS' | 'SELF_REFERENCE';
}

export interface V2CompatibilityResult {
  readonly goals: readonly Goal[];
  readonly milestones: readonly [];
  readonly tasks: readonly Task[];
  readonly taskDependencies: readonly TaskDependency[];
  readonly lifecycleMappings: readonly LifecycleMapping[];
  readonly diagnostics: readonly CompatibilityDiagnostic[];
  readonly unresolvedRelationships: readonly UnresolvedRelationship[];
  readonly writesPerformed: 0;
}

export interface V2CompatibilityOptions {
  readonly executionMetadata?: Readonly<Record<string, ExecutionMetadata>>;
}

const legacyProvenance = (entityKind: 'goal' | 'task' | 'task_dependency', entityId: string, schemaVersion?: number): EntityProvenance => ({
  origin: 'legacy_import',
  actor: 'legacy',
  confirmation: 'unknown',
  legacy: { system: 'visualdeadline-v1', entityKind, entityId, schemaVersion },
});

const mapGoalStatus = (goal: LegacyGoal): { status: GoalStatus; diagnostic?: CompatibilityDiagnostic } => {
  const source = goal.planningStatus;
  if (source === 'completed') return { status: 'completed' };
  if (source === 'archived') return { status: 'archived' };
  if (source === 'waiting' || source === 'blocked') {
    return {
      status: 'paused',
      diagnostic: { code: 'GOAL_STATUS_LOSSY', severity: 'warning', entityKind: 'goal', entityId: goal.id, message: `Legacy goal status ${source} is represented as paused; the source value is retained in compatibility metadata.` },
    };
  }
  return {
    status: 'active',
    diagnostic: source
      ? { code: 'GOAL_STATUS_LOSSY', severity: 'warning', entityKind: 'goal', entityId: goal.id, message: `Legacy goal status ${source} is represented as active; the source value is retained in compatibility metadata.` }
      : undefined,
  };
};

const normalizeProgress = (task: LegacyTask, diagnostics: CompatibilityDiagnostic[]): number => {
  const normalized = Number.isFinite(task.progress) ? Math.min(100, Math.max(0, task.progress)) : 0;
  if (normalized !== task.progress) diagnostics.push({ code: 'PROGRESS_CLAMPED', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Progress ${String(task.progress)} was projected as ${normalized}; persisted legacy data was not changed.` });
  return normalized;
};

const mapLifecycle = (task: LegacyTask, projectedStatus: Exclude<TaskStatus, 'archived'>, progress: number): LifecycleMapping => {
  if (task.lifecycleStatus === 'completed' && progress === 100) return { taskId: task.id, sourceStatus: 'completed', targetStatus: 'done', quality: 'EXACT' };
  if (task.lifecycleStatus === 'completed') return { taskId: task.id, sourceStatus: 'completed', targetStatus: 'done', quality: 'AMBIGUOUS', reason: 'The completed lifecycle conflicts with progress below 100.' };
  if (task.lifecycleStatus === 'abandoned') return { taskId: task.id, sourceStatus: 'abandoned', targetStatus: 'cancelled', quality: 'LOSSY', reason: 'Legacy abandoned does not distinguish cancellation from archival or other terminal intent.' };
  if (progress === 100) return { taskId: task.id, sourceStatus: 'active', targetStatus: projectedStatus, quality: 'AMBIGUOUS', reason: 'Active lifecycle conflicts with 100 percent progress.' };
  return { taskId: task.id, sourceStatus: 'active', targetStatus: projectedStatus, quality: 'AMBIGUOUS', reason: 'Legacy active does not distinguish ready, in_progress, or deferred.' };
};

/**
 * Pure anti-corruption projection over current stores. It performs no writes,
 * creates no Milestones, and does not change the legacy persistence format.
 */
export function adaptLegacyVisualDeadlineToV2(
  userId: UserId,
  legacyGoals: readonly LegacyGoal[],
  legacyTasks: readonly LegacyTask[],
  options: V2CompatibilityOptions = {},
): V2CompatibilityResult {
  const goalsInput = [...legacyGoals];
  const tasksInput = [...legacyTasks];
  const execution = adaptVisualDeadlineExecution(goalsInput, tasksInput, { ...(options.executionMetadata ?? {}) });
  const executionByTaskId = new Map(execution.tasks.map((task) => [task.id, task]));
  const goalIds = new Set(goalsInput.map((goal) => goal.id));
  const taskIds = new Set(tasksInput.map((task) => task.id));
  const diagnostics: CompatibilityDiagnostic[] = [];
  const unresolvedRelationships: UnresolvedRelationship[] = [];

  const goals = goalsInput.map((goal): Goal => {
    const mapped = mapGoalStatus(goal);
    if (mapped.diagnostic) diagnostics.push(mapped.diagnostic);
    return {
      id: goal.id,
      userId,
      title: goal.title,
      status: mapped.status,
      importance: goal.priority,
      startAfter: goal.startDate,
      targetDate: goal.targetDate,
      provenance: legacyProvenance('goal', goal.id),
      compatibility: { sourceLinkedTaskIds: [...goal.linkedTaskIds], sourcePlanningStatus: goal.planningStatus, sourceCategory: goal.category },
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      version: 1,
    };
  });

  for (const task of tasksInput) {
    for (const goalId of task.linkedGoalIds ?? []) {
      const goal = goalsInput.find((candidate) => candidate.id === goalId);
      if (!goal) {
        diagnostics.push({ code: 'RELATIONSHIP_MISSING_TARGET', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Task ${task.id} references missing goal ${goalId}.` });
        unresolvedRelationships.push({ kind: 'goal_task', sourceId: task.id, targetId: goalId, reason: 'MISSING_TARGET' });
      } else if (!goal.linkedTaskIds.includes(task.id)) {
        diagnostics.push({ code: 'RELATIONSHIP_INCONSISTENT', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Task ${task.id} links goal ${goalId}, but the goal does not link back.` });
        unresolvedRelationships.push({ kind: 'goal_task', sourceId: task.id, targetId: goalId, reason: 'ONE_SIDED' });
      }
    }
  }
  for (const goal of goalsInput) {
    for (const taskId of goal.linkedTaskIds) {
      const task = tasksInput.find((candidate) => candidate.id === taskId);
      if (!task) {
        diagnostics.push({ code: 'RELATIONSHIP_MISSING_TARGET', severity: 'warning', entityKind: 'goal', entityId: goal.id, message: `Goal ${goal.id} references missing task ${taskId}.` });
        unresolvedRelationships.push({ kind: 'goal_task', sourceId: goal.id, targetId: taskId, reason: 'MISSING_TARGET' });
      } else if (!(task.linkedGoalIds ?? []).includes(goal.id)) {
        diagnostics.push({ code: 'RELATIONSHIP_INCONSISTENT', severity: 'warning', entityKind: 'goal', entityId: goal.id, message: `Goal ${goal.id} links task ${taskId}, but the task does not link back.` });
        unresolvedRelationships.push({ kind: 'goal_task', sourceId: goal.id, targetId: taskId, reason: 'ONE_SIDED' });
      }
    }
  }

  const lifecycleMappings: LifecycleMapping[] = [];
  const tasks = tasksInput.map((task): Task => {
    const projected = executionByTaskId.get(task.id);
    if (!projected) throw new Error(`Execution adapter did not return legacy task ${task.id}.`);
    const progress = normalizeProgress(task, diagnostics);
    const lifecycle = mapLifecycle(task, projected.status, progress);
    lifecycleMappings.push(lifecycle);
    if (lifecycle.quality !== 'EXACT') diagnostics.push({ code: lifecycle.quality === 'LOSSY' ? 'LIFECYCLE_LOSSY' : 'LIFECYCLE_AMBIGUOUS', severity: 'warning', entityKind: 'task', entityId: task.id, message: lifecycle.reason ?? 'Legacy lifecycle mapping is not exact.' });
    if ((task.lifecycleStatus === 'completed' && progress < 100) || (task.lifecycleStatus === 'active' && progress === 100)) diagnostics.push({ code: 'PROGRESS_STATUS_CONFLICT', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Legacy lifecycle ${task.lifecycleStatus} conflicts with progress ${progress}.` });

    const reconciledGoalIds = projected.goalIds.filter((goalId) => goalIds.has(goalId));
    const goalId = reconciledGoalIds.length === 1 ? reconciledGoalIds[0] : undefined;
    if (reconciledGoalIds.length > 1) {
      diagnostics.push({ code: 'MULTIPLE_GOALS_UNRESOLVED', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Task ${task.id} is linked to multiple goals; no canonical goalId was guessed.` });
      for (const linkedGoalId of reconciledGoalIds) unresolvedRelationships.push({ kind: 'goal_task', sourceId: task.id, targetId: linkedGoalId, reason: 'MULTIPLE_TARGETS' });
    }

    const extra = options.executionMetadata?.[task.id];
    if (extra?.startAfter && task.startDate && extra.startAfter !== task.startDate) diagnostics.push({ code: 'START_DATE_CONFLICT', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Execution startAfter overrides a different legacy startDate for task ${task.id}; both source values remain outside persistence.` });
    if (extra?.projectId) diagnostics.push({ code: 'LEGACY_PROJECT_REFERENCE_IGNORED', severity: 'warning', entityKind: 'task', entityId: task.id, message: `Legacy execution project ${extra.projectId} is compatibility-only and was not promoted to a canonical v2 entity.` });

    return {
      id: task.id,
      userId,
      title: task.title,
      description: task.description,
      status: projected.status,
      importance: task.importance,
      progress,
      actionable: projected.actionable,
      goalId,
      parentTaskId: projected.parentTaskId,
      deadline: task.deadline,
      startAfter: projected.startAfter,
      estimatedMinutes: task.estimatedDuration,
      completedMinutes: projected.completedMinutes,
      nextAction: task.nextAction,
      locked: task.plannerLocked,
      provenance: legacyProvenance('task', task.id, task.schemaVersion),
      compatibility: {
        sourceLifecycleStatus: task.lifecycleStatus,
        sourceLinkedGoalIds: [...(task.linkedGoalIds ?? [])],
        reconciledGoalIds,
        sourceDependencyIds: [...(task.dependencyIds ?? [])],
        executionSource: projected.source,
        sourceCaptureId: projected.sourceCaptureId,
        sourceCreatedByAI: projected.createdByAI,
        sourceProjectId: extra?.projectId,
        sourceSchemaVersion: task.schemaVersion,
      },
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      completedAt: task.completedAt,
      version: 1,
    };
  });

  const taskDependencies: TaskDependency[] = [];
  const seenDependencyIds = new Set<string>();
  for (const task of tasksInput) {
    for (const predecessorTaskId of task.dependencyIds ?? []) {
      if (predecessorTaskId === task.id) {
        diagnostics.push({ code: 'DEPENDENCY_SELF_REFERENCE', severity: 'warning', entityKind: 'task_dependency', entityId: task.id, message: `Task ${task.id} contains a self dependency; no canonical edge was created.` });
        unresolvedRelationships.push({ kind: 'task_dependency', sourceId: task.id, targetId: predecessorTaskId, reason: 'SELF_REFERENCE' });
        continue;
      }
      if (!taskIds.has(predecessorTaskId)) {
        diagnostics.push({ code: 'DEPENDENCY_MISSING_TARGET', severity: 'warning', entityKind: 'task_dependency', entityId: task.id, message: `Task ${task.id} depends on missing task ${predecessorTaskId}; no canonical edge was created.` });
        unresolvedRelationships.push({ kind: 'task_dependency', sourceId: task.id, targetId: predecessorTaskId, reason: 'MISSING_TARGET' });
        continue;
      }
      const id = `legacy-dependency:${predecessorTaskId}->${task.id}`;
      if (seenDependencyIds.has(id)) continue;
      seenDependencyIds.add(id);
      taskDependencies.push({ id, userId, predecessorTaskId, successorTaskId: task.id, type: 'blocks', provenance: legacyProvenance('task_dependency', id), createdAt: task.createdAt, version: 1 });
    }
  }

  return { goals, milestones: [], tasks, taskDependencies, lifecycleMappings, diagnostics, unresolvedRelationships, writesPerformed: 0 };
}
