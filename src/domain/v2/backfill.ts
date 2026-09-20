import type { Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import { checksumValue, stableStringify } from '../../storage/dataSafety.js';
import { adaptLegacyVisualDeadlineToV2, type CompatibilityDiagnostic, type UnresolvedRelationship, type V2CompatibilityOptions } from './compatibility.js';
import type { Goal, Task, TaskDependency } from './entities.js';
import type { UserId } from './shared.js';

/**
 * Planning contract for the deliberately narrow PR F import.  This is pure:
 * it neither imports data nor chooses a database connection.  Callers may
 * inject a cryptographic checksum function (the local admin runner uses
 * SHA-256); the default exists only to make browser-safe planning deterministic.
 */
export type BackfillDisposition = 'CREATE' | 'SKIP' | 'QUARANTINE' | 'UNRESOLVED';
export type BackfillEntityType = 'goal' | 'task' | 'task_dependency';

export interface BackfillWarning {
  readonly code: string;
  readonly entityType: BackfillEntityType;
  readonly sourceLegacyId: string;
  readonly message: string;
}

export interface BackfillSourceRelationshipEvidence {
  /** Explicit source evidence only; current VisualDeadline rows do not infer these fields. */
  readonly parentGoalByLegacyId?: Readonly<Record<string, string | undefined>>;
  readonly parentTaskByLegacyId?: Readonly<Record<string, string | undefined>>;
}

export interface V2BackfillPlannerInput {
  readonly userId: UserId;
  readonly sourceSystem: 'visualdeadline-v1';
  readonly sourceSchemaVersion: string;
  readonly goals: readonly LegacyGoal[];
  readonly tasks: readonly LegacyTask[];
  readonly compatibilityOptions?: V2CompatibilityOptions;
  readonly relationshipEvidence?: BackfillSourceRelationshipEvidence;
  readonly checksum?: (value: unknown) => string;
}

export interface BackfillRecord<T> {
  readonly entityType: BackfillEntityType;
  readonly sourceDomain: 'goals' | 'tasks';
  readonly sourceLegacyId: string;
  readonly sourceChecksum: string;
  readonly disposition: BackfillDisposition;
  readonly canonical?: T;
  readonly warnings: readonly BackfillWarning[];
  readonly unresolvedReferences: readonly UnresolvedRelationship[];
}

export interface V2BackfillPlan {
  readonly writesPerformed: 0;
  readonly sourceCounts: { readonly goals: number; readonly tasks: number; readonly dependencies: number };
  readonly plannedCounts: { readonly goals: number; readonly tasks: number; readonly dependencies: number };
  readonly records: readonly BackfillRecord<Goal | Task | TaskDependency>[];
  readonly diagnostics: readonly CompatibilityDiagnostic[];
  readonly warnings: readonly BackfillWarning[];
  readonly unresolvedRelationships: readonly UnresolvedRelationship[];
  readonly checksum: string;
}

const sortById = <T extends { id: string }>(items: readonly T[]): readonly T[] => [...items].sort((left, right) => left.id.localeCompare(right.id));

const asWarning = (diagnostic: CompatibilityDiagnostic): BackfillWarning => ({
  code: diagnostic.code,
  entityType: diagnostic.entityKind,
  sourceLegacyId: diagnostic.entityId,
  message: diagnostic.message,
});

const cycleMembers = (edges: ReadonlyMap<string, string>): ReadonlySet<string> => {
  const cyclic = new Set<string>();
  for (const initial of edges.keys()) {
    const seen = new Map<string, number>();
    let cursor: string | undefined = initial;
    while (cursor) {
      const prior = seen.get(cursor);
      if (prior !== undefined) {
        for (const [id, order] of seen) if (order >= prior) cyclic.add(id);
        break;
      }
      seen.set(cursor, seen.size);
      cursor = edges.get(cursor);
    }
  }
  return cyclic;
};

const exactGoalTaskLinks = (goals: readonly LegacyGoal[], tasks: readonly LegacyTask[]): ReadonlyMap<string, string> => {
  const goalIds = new Set(goals.map((goal) => goal.id));
  const result = new Map<string, string>();
  for (const task of tasks) {
    const reciprocal = (task.linkedGoalIds ?? []).filter((goalId) => goalIds.has(goalId) && goals.find((goal) => goal.id === goalId)?.linkedTaskIds.includes(task.id));
    if (reciprocal.length === 1) result.set(task.id, reciprocal[0]);
  }
  return result;
};

/** Builds a deterministic, no-write report. Ambiguous and invalid source relations never become canonical FK values. */
export function planV2Backfill(input: V2BackfillPlannerInput): V2BackfillPlan {
  const checksum = input.checksum ?? checksumValue;
  const adapted = adaptLegacyVisualDeadlineToV2(input.userId, input.goals, input.tasks, input.compatibilityOptions);
  const sourceGoals = new Map(input.goals.map((goal) => [goal.id, goal]));
  const sourceTasks = new Map(input.tasks.map((task) => [task.id, task]));
  const exactLinks = exactGoalTaskLinks(input.goals, input.tasks);
  const parentGoals = input.relationshipEvidence?.parentGoalByLegacyId ?? {};
  const parentTasks = input.relationshipEvidence?.parentTaskByLegacyId ?? {};
  const parentGoalEdges = new Map(Object.entries(parentGoals).filter(([child, parent]) => sourceGoals.has(child) && typeof parent === 'string').map(([child, parent]) => [child, parent!]));
  const parentTaskEdges = new Map(Object.entries(parentTasks).filter(([child, parent]) => sourceTasks.has(child) && typeof parent === 'string').map(([child, parent]) => [child, parent!]));
  const cyclicGoals = cycleMembers(parentGoalEdges);
  const cyclicTasks = cycleMembers(parentTaskEdges);
  const records: BackfillRecord<Goal | Task | TaskDependency>[] = [];
  const warnings = adapted.diagnostics.map(asWarning);
  const unresolved = [...adapted.unresolvedRelationships];

  for (const goal of sortById(adapted.goals)) {
    const source = sourceGoals.get(goal.id)!;
    const parentGoalId = parentGoals[goal.id];
    const recordWarnings: BackfillWarning[] = [];
    let disposition: BackfillDisposition = 'CREATE';
    let canonical: Goal = goal;
    if (parentGoalId) {
      if (parentGoalId === goal.id || cyclicGoals.has(goal.id)) {
        disposition = 'QUARANTINE';
        recordWarnings.push({ code: 'PARENT_GOAL_CYCLE', entityType: 'goal', sourceLegacyId: goal.id, message: `Goal ${goal.id} has a self or cyclic parent goal reference and was quarantined.` });
      } else if (!sourceGoals.has(parentGoalId)) {
        disposition = 'QUARANTINE';
        recordWarnings.push({ code: 'PARENT_GOAL_MISSING_TARGET', entityType: 'goal', sourceLegacyId: goal.id, message: `Goal ${goal.id} references missing parent goal ${parentGoalId} and was quarantined.` });
      } else canonical = { ...goal, parentGoalId };
    }
    warnings.push(...recordWarnings);
    records.push({ entityType: 'goal', sourceDomain: 'goals', sourceLegacyId: goal.id, sourceChecksum: checksum(source), disposition, canonical: disposition === 'CREATE' ? canonical : undefined, warnings: recordWarnings, unresolvedReferences: [] });
  }

  for (const task of sortById(adapted.tasks)) {
    const source = sourceTasks.get(task.id)!;
    const recordWarnings: BackfillWarning[] = [];
    let disposition: BackfillDisposition = 'CREATE';
    let canonical: Task = { ...task, goalId: exactLinks.get(task.id) };
    if (task.goalId && !exactLinks.has(task.id)) {
      disposition = 'UNRESOLVED';
      recordWarnings.push({ code: 'GOAL_TASK_NOT_RECIPROCAL', entityType: 'task', sourceLegacyId: task.id, message: `Task ${task.id} has no exactly reciprocal Goal link and will not receive a canonical goal_id.` });
      canonical = { ...canonical, goalId: undefined };
    }
    const parentTaskId = parentTasks[task.id];
    if (parentTaskId) {
      if (parentTaskId === task.id || cyclicTasks.has(task.id)) {
        disposition = 'QUARANTINE';
        recordWarnings.push({ code: 'PARENT_TASK_CYCLE', entityType: 'task', sourceLegacyId: task.id, message: `Task ${task.id} has a self or cyclic parent task reference and was quarantined.` });
      } else if (!sourceTasks.has(parentTaskId)) {
        disposition = 'QUARANTINE';
        recordWarnings.push({ code: 'PARENT_TASK_MISSING_TARGET', entityType: 'task', sourceLegacyId: task.id, message: `Task ${task.id} references missing parent task ${parentTaskId} and was quarantined.` });
      } else canonical = { ...canonical, parentTaskId };
    }
    warnings.push(...recordWarnings);
    records.push({ entityType: 'task', sourceDomain: 'tasks', sourceLegacyId: task.id, sourceChecksum: checksum(source), disposition, canonical: disposition === 'QUARANTINE' ? undefined : canonical, warnings: recordWarnings, unresolvedReferences: unresolved.filter((item) => item.sourceId === task.id) });
  }

  const quarantinedTasks = new Set(records.filter((record) => record.entityType === 'task' && record.disposition === 'QUARANTINE').map((record) => record.sourceLegacyId));
  for (const dependency of sortById(adapted.taskDependencies)) {
    const sourceLegacyId = `${dependency.predecessorTaskId}->${dependency.successorTaskId}`;
    const recordWarnings: BackfillWarning[] = [];
    const dependencyUnresolved = unresolved.filter((item) => item.kind === 'task_dependency' && (item.sourceId === dependency.successorTaskId || item.targetId === dependency.predecessorTaskId));
    const disposition: BackfillDisposition = quarantinedTasks.has(dependency.predecessorTaskId) || quarantinedTasks.has(dependency.successorTaskId) ? 'UNRESOLVED' : 'CREATE';
    if (disposition !== 'CREATE') recordWarnings.push({ code: 'DEPENDENCY_ENDPOINT_QUARANTINED', entityType: 'task_dependency', sourceLegacyId, message: `Dependency ${sourceLegacyId} references a quarantined task and was not created.` });
    warnings.push(...recordWarnings);
    records.push({ entityType: 'task_dependency', sourceDomain: 'tasks', sourceLegacyId, sourceChecksum: checksum({ predecessorTaskId: dependency.predecessorTaskId, successorTaskId: dependency.successorTaskId, type: dependency.type }), disposition, canonical: disposition === 'CREATE' ? dependency : undefined, warnings: recordWarnings, unresolvedReferences: dependencyUnresolved });
  }

  for (const relationship of unresolved) {
    if (relationship.kind !== 'task_dependency') continue;
    const sourceLegacyId = `${relationship.targetId}->${relationship.sourceId}`;
    records.push({ entityType: 'task_dependency', sourceDomain: 'tasks', sourceLegacyId, sourceChecksum: checksum(relationship), disposition: 'UNRESOLVED', warnings: [{ code: `DEPENDENCY_${relationship.reason}`, entityType: 'task_dependency', sourceLegacyId, message: `Legacy dependency ${sourceLegacyId} is unresolved: ${relationship.reason}.` }], unresolvedReferences: [relationship] });
  }

  const ordered = records.sort((left, right) => `${left.entityType}:${left.sourceLegacyId}`.localeCompare(`${right.entityType}:${right.sourceLegacyId}`));
  const sourceCounts = { goals: input.goals.length, tasks: input.tasks.length, dependencies: input.tasks.reduce((count, task) => count + (task.dependencyIds?.length ?? 0), 0) };
  const plannedCounts = {
    goals: ordered.filter((record) => record.entityType === 'goal' && record.disposition === 'CREATE').length,
    tasks: ordered.filter((record) => record.entityType === 'task' && record.disposition !== 'QUARANTINE').length,
    dependencies: ordered.filter((record) => record.entityType === 'task_dependency' && record.disposition === 'CREATE').length,
  };
  return { writesPerformed: 0, sourceCounts, plannedCounts, records: ordered, diagnostics: adapted.diagnostics, warnings, unresolvedRelationships: unresolved, checksum: checksum(stableStringify({ sourceCounts, records: ordered.map((record) => ({ entityType: record.entityType, sourceLegacyId: record.sourceLegacyId, sourceChecksum: record.sourceChecksum, disposition: record.disposition })) })) };
}
