import type { Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import { checksumValue, stableStringify } from '../../storage/dataSafety.js';
import { adaptLegacyVisualDeadlineToV2, type CompatibilityDiagnostic, type UnresolvedRelationship, type V2CompatibilityOptions } from './compatibility.js';
import type { Goal, Task, TaskDependency } from './entities.js';
import type { UserId } from './shared.js';

/** Pure, no-write import plan. The admin runner injects SHA-256; the fallback is deterministic only. */
export type BackfillDisposition = 'CREATE' | 'SKIP' | 'QUARANTINE' | 'UNRESOLVED';
export type BackfillEntityType = 'goal' | 'task' | 'task_dependency';
export interface BackfillWarning { readonly code: string; readonly entityType: BackfillEntityType; readonly sourceLegacyId: string; readonly message: string; }
export interface BackfillSourceRelationshipEvidence { readonly parentGoalByLegacyId?: Readonly<Record<string, string | undefined>>; readonly parentTaskByLegacyId?: Readonly<Record<string, string | undefined>>; }
export interface V2BackfillPlannerInput {
  readonly userId: UserId; readonly sourceSystem: 'visualdeadline-v1'; readonly sourceSchemaVersion: string;
  readonly goals: readonly LegacyGoal[]; readonly tasks: readonly LegacyTask[]; readonly compatibilityOptions?: V2CompatibilityOptions;
  readonly relationshipEvidence?: BackfillSourceRelationshipEvidence; readonly checksum?: (value: unknown) => string;
}
export interface BackfillRecord<T> {
  readonly entityType: BackfillEntityType; readonly sourceDomain: 'goals' | 'tasks'; readonly sourceLegacyId: string;
  readonly sourceChecksum: string; readonly disposition: BackfillDisposition; readonly canonical?: T;
  readonly warnings: readonly BackfillWarning[]; readonly unresolvedReferences: readonly UnresolvedRelationship[];
}
export interface V2BackfillPlan {
  readonly writesPerformed: 0; readonly sourceCounts: { readonly goals: number; readonly tasks: number; readonly dependencies: number };
  readonly plannedCounts: { readonly goals: number; readonly tasks: number; readonly dependencies: number };
  readonly records: readonly BackfillRecord<Goal | Task | TaskDependency>[]; readonly diagnostics: readonly CompatibilityDiagnostic[];
  readonly warnings: readonly BackfillWarning[]; readonly unresolvedRelationships: readonly UnresolvedRelationship[]; readonly checksum: string;
}

const sorted = <T extends { id: string }>(items: readonly T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
const warning = (code: string, entityType: BackfillEntityType, sourceLegacyId: string, message: string): BackfillWarning => ({ code, entityType, sourceLegacyId, message });
const diagnosticWarning = (item: CompatibilityDiagnostic): BackfillWarning => warning(item.code, item.entityKind, item.entityId, item.message);
const relation = (kind: UnresolvedRelationship['kind'], sourceId: string, targetId: string, reason: UnresolvedRelationship['reason']): UnresolvedRelationship => ({ kind, sourceId, targetId, reason });
const uniqueRelationships = (items: readonly UnresolvedRelationship[]): readonly UnresolvedRelationship[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.sourceId}:${item.targetId}:${item.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const cyclicNodes = (edges: ReadonlyMap<string, string>): ReadonlySet<string> => {
  const output = new Set<string>();
  for (const start of edges.keys()) {
    const seen = new Map<string, number>(); let cursor: string | undefined = start;
    while (cursor) { const prior = seen.get(cursor); if (prior !== undefined) { for (const [id, order] of seen) if (order >= prior) output.add(id); break; } seen.set(cursor, seen.size); cursor = edges.get(cursor); }
  }
  return output;
};
const dependencyCycles = (edges: readonly TaskDependency[]): ReadonlySet<string> => {
  const successors = new Map<string, string[]>();
  for (const edge of edges) successors.set(edge.predecessorTaskId, [...(successors.get(edge.predecessorTaskId) ?? []), edge.successorTaskId]);
  const reaches = (from: string, target: string): boolean => {
    const pending = [from]; const seen = new Set<string>();
    while (pending.length) { const current = pending.pop()!; if (current === target) return true; if (seen.has(current)) continue; seen.add(current); pending.push(...(successors.get(current) ?? [])); }
    return false;
  };
  return new Set(edges.filter((edge) => reaches(edge.successorTaskId, edge.predecessorTaskId)).map((edge) => edge.id));
};

/** Builds the complete source evidence set; a task goal FK is allowed only for one reciprocal, conflict-free candidate. */
export function planV2Backfill(input: V2BackfillPlannerInput): V2BackfillPlan {
  const checksum = input.checksum ?? checksumValue;
  const adapted = adaptLegacyVisualDeadlineToV2(input.userId, input.goals, input.tasks, input.compatibilityOptions);
  const goalsById = new Map(input.goals.map((item) => [item.id, item]));
  const tasksById = new Map(input.tasks.map((item) => [item.id, item]));
  const parentGoals = input.relationshipEvidence?.parentGoalByLegacyId ?? {}; const parentTasks = input.relationshipEvidence?.parentTaskByLegacyId ?? {};
  const parentGoalCycles = cyclicNodes(new Map(Object.entries(parentGoals).filter(([child, parent]) => goalsById.has(child) && typeof parent === 'string').map(([child, parent]) => [child, parent!])));
  const parentTaskCycles = cyclicNodes(new Map(Object.entries(parentTasks).filter(([child, parent]) => tasksById.has(child) && typeof parent === 'string').map(([child, parent]) => [child, parent!])));
  const records: BackfillRecord<Goal | Task | TaskDependency>[] = [];
  const warnings = adapted.diagnostics.map(diagnosticWarning); const unresolved = [...adapted.unresolvedRelationships];
  const invalidParentGoals = new Set(Object.entries(parentGoals).filter(([child, parent]) => parent === child || !parent || !goalsById.has(parent) || parentGoalCycles.has(child)).map(([child]) => child));
  const invalidParentTasks = new Set(Object.entries(parentTasks).filter(([child, parent]) => parent === child || !parent || !tasksById.has(parent) || parentTaskCycles.has(child)).map(([child]) => child));

  for (const goal of sorted(adapted.goals)) {
    const parent = parentGoals[goal.id]; const itemWarnings: BackfillWarning[] = []; const itemUnresolved: UnresolvedRelationship[] = [];
    let canonical: Goal = goal; let disposition: BackfillDisposition = 'CREATE';
    if (parent) {
      if (invalidParentGoals.has(goal.id) || invalidParentGoals.has(parent)) {
        disposition = 'UNRESOLVED'; itemWarnings.push(warning(parentGoalCycles.has(goal.id) || parent === goal.id ? 'PARENT_GOAL_CYCLE' : 'PARENT_GOAL_MISSING_TARGET', 'goal', goal.id, `Goal parent ${parent} is not safely migratable; parent_goal_id remains NULL.`)); itemUnresolved.push(relation('goal_task', goal.id, parent, parentGoalCycles.has(goal.id) || parent === goal.id ? 'CYCLE' : 'MISSING_TARGET'));
      } else canonical = { ...goal, parentGoalId: parent };
    }
    warnings.push(...itemWarnings); unresolved.push(...itemUnresolved);
    records.push({ entityType: 'goal', sourceDomain: 'goals', sourceLegacyId: goal.id, sourceChecksum: checksum(goalsById.get(goal.id)), disposition, canonical, warnings: itemWarnings, unresolvedReferences: itemUnresolved });
  }

  for (const task of sorted(adapted.tasks)) {
    const source = tasksById.get(task.id)!; const itemWarnings: BackfillWarning[] = []; const itemUnresolved: UnresolvedRelationship[] = [];
    const taskCandidates = new Set(source.linkedGoalIds ?? []);
    for (const goal of input.goals) if (goal.linkedTaskIds.includes(task.id)) taskCandidates.add(goal.id);
    const candidates = [...taskCandidates].sort(); let confirmedGoalId: string | undefined;
    if (candidates.length === 1) {
      const candidate = candidates[0]; const goal = goalsById.get(candidate);
      if (goal && (source.linkedGoalIds ?? []).includes(candidate) && goal.linkedTaskIds.includes(task.id)) confirmedGoalId = candidate;
      else { itemWarnings.push(warning(goal ? 'GOAL_TASK_ONE_SIDED' : 'GOAL_TASK_MISSING_TARGET', 'task', task.id, `Goal relationship ${task.id} -> ${candidate} is not confirmed; goal_id remains NULL.`)); itemUnresolved.push(relation('goal_task', task.id, candidate, goal ? 'ONE_SIDED' : 'MISSING_TARGET')); }
    } else if (candidates.length > 1) {
      itemWarnings.push(warning('MULTIPLE_GOALS_UNRESOLVED', 'task', task.id, `Task ${task.id} has ${candidates.length} Goal candidates; no canonical goal_id was selected.`));
      for (const candidate of candidates) itemUnresolved.push(relation('goal_task', task.id, candidate, 'MULTIPLE_TARGETS'));
    }
    let canonical: Task = { ...task, goalId: confirmedGoalId }; let disposition: BackfillDisposition = itemUnresolved.length ? 'UNRESOLVED' : 'CREATE';
    const parent = parentTasks[task.id];
    if (parent) {
      if (invalidParentTasks.has(task.id) || invalidParentTasks.has(parent)) {
        disposition = 'UNRESOLVED'; itemWarnings.push(warning(parentTaskCycles.has(task.id) || parent === task.id ? 'PARENT_TASK_CYCLE' : 'PARENT_TASK_MISSING_TARGET', 'task', task.id, `Task parent ${parent} is not safely migratable; parent_task_id remains NULL.`)); itemUnresolved.push(relation('goal_task', task.id, parent, parentTaskCycles.has(task.id) || parent === task.id ? 'CYCLE' : 'MISSING_TARGET'));
      } else canonical = { ...canonical, parentTaskId: parent };
    }
    warnings.push(...itemWarnings); unresolved.push(...itemUnresolved);
    records.push({ entityType: 'task', sourceDomain: 'tasks', sourceLegacyId: task.id, sourceChecksum: checksum(source), disposition, canonical, warnings: itemWarnings, unresolvedReferences: uniqueRelationships([...itemUnresolved, ...adapted.unresolvedRelationships.filter((item) => item.kind === 'goal_task' && item.sourceId === task.id)]) });
  }

  const safeTasks = new Set(records.filter((record) => record.entityType === 'task' && record.canonical).map((record) => record.sourceLegacyId));
  const validDependencies = adapted.taskDependencies.filter((edge) => safeTasks.has(edge.predecessorTaskId) && safeTasks.has(edge.successorTaskId));
  const cyclicDependencies = dependencyCycles(validDependencies);
  for (const edge of sorted(adapted.taskDependencies)) {
    const sourceLegacyId = `${edge.predecessorTaskId}->${edge.successorTaskId}`; const itemWarnings: BackfillWarning[] = []; const itemUnresolved: UnresolvedRelationship[] = [];
    let disposition: BackfillDisposition = 'CREATE';
    if (!safeTasks.has(edge.predecessorTaskId) || !safeTasks.has(edge.successorTaskId)) { disposition = 'UNRESOLVED'; itemWarnings.push(warning('DEPENDENCY_ENDPOINT_UNRESOLVED', 'task_dependency', sourceLegacyId, `Dependency ${sourceLegacyId} has an unresolved endpoint.`)); }
    if (cyclicDependencies.has(edge.id)) { disposition = 'UNRESOLVED'; itemWarnings.push(warning('DEPENDENCY_CYCLE', 'task_dependency', sourceLegacyId, `Dependency ${sourceLegacyId} participates in a cycle and was not persisted.`)); itemUnresolved.push(relation('task_dependency', edge.successorTaskId, edge.predecessorTaskId, 'CYCLE')); }
    warnings.push(...itemWarnings); unresolved.push(...itemUnresolved);
    records.push({ entityType: 'task_dependency', sourceDomain: 'tasks', sourceLegacyId, sourceChecksum: checksum({ predecessorTaskId: edge.predecessorTaskId, successorTaskId: edge.successorTaskId, type: edge.type }), disposition, canonical: disposition === 'CREATE' ? edge : undefined, warnings: itemWarnings, unresolvedReferences: itemUnresolved });
  }
  for (const item of adapted.unresolvedRelationships.filter((item) => item.kind === 'task_dependency')) {
    const sourceLegacyId = `${item.targetId}->${item.sourceId}`;
    records.push({ entityType: 'task_dependency', sourceDomain: 'tasks', sourceLegacyId, sourceChecksum: checksum(item), disposition: 'UNRESOLVED', warnings: [warning(`DEPENDENCY_${item.reason}`, 'task_dependency', sourceLegacyId, `Legacy dependency ${sourceLegacyId} is unresolved: ${item.reason}.`)], unresolvedReferences: [item] });
  }
  const ordered = records.sort((a, b) => `${a.entityType}:${a.sourceLegacyId}`.localeCompare(`${b.entityType}:${b.sourceLegacyId}`));
  const sourceCounts = { goals: input.goals.length, tasks: input.tasks.length, dependencies: input.tasks.reduce((sum, task) => sum + (task.dependencyIds?.length ?? 0), 0) };
  const plannedCounts = { goals: ordered.filter((item) => item.entityType === 'goal' && item.canonical).length, tasks: ordered.filter((item) => item.entityType === 'task' && item.canonical).length, dependencies: ordered.filter((item) => item.entityType === 'task_dependency' && item.disposition === 'CREATE').length };
  return { writesPerformed: 0, sourceCounts, plannedCounts, records: ordered, diagnostics: adapted.diagnostics, warnings, unresolvedRelationships: unresolved, checksum: checksum(stableStringify({ sourceCounts, records: ordered.map((item) => ({ entityType: item.entityType, sourceLegacyId: item.sourceLegacyId, sourceChecksum: item.sourceChecksum, disposition: item.disposition })) })) };
}
