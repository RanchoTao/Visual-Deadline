import type { Goal, Task } from '../../types/task.js';
import { adaptVisualDeadlineExecution } from './adapter.js';
import { isActiveExecutable, isBlocked, isExecutableAt, topTasks } from './priority.js';
import type { ExecutionTask } from './types.js';

export type HomeComparisonClassification =
  | 'exact-agreement'
  | 'same-top-different-order'
  | 'different-top-task'
  | 'execution-excludes-legacy-candidate'
  | 'legacy-excludes-execution-candidate'
  | 'relationship-data-warning'
  | 'non-comparable';

export type HomeRankingRelation =
  | 'exact'
  | 'same-top-different-order'
  | 'different-top'
  | 'non-comparable';

export type HomeProjectionDifferenceReason =
  | 'completed'
  | 'progress-100'
  | 'non-actionable'
  | 'dependency-blocked'
  | 'future-start'
  | 'lower-ranked'
  | 'legacy-not-in-top-three';

export interface HomeProjectionDifference {
  kind: 'top-task' | 'priority-ordering' | 'execution-exclusion' | 'legacy-exclusion';
  taskId?: string;
  legacyRank?: number;
  executionRank?: number;
  reason?: HomeProjectionDifferenceReason;
}

export interface HomeRecommendationProjection {
  taskIds: string[];
  topTaskId?: string;
}

export interface HomeRecommendationComparison {
  legacy: HomeRecommendationProjection;
  execution: HomeRecommendationProjection;
  agreement: boolean;
  rankingRelation: HomeRankingRelation;
  classifications: HomeComparisonClassification[];
  differences: HomeProjectionDifference[];
  relationshipWarnings: string[];
}

function sameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function executionExclusionReason(
  sourceTask: Task | undefined,
  executionTask: ExecutionTask | undefined,
  executionTasks: ExecutionTask[],
  now: number,
): HomeProjectionDifferenceReason {
  if (sourceTask?.lifecycleStatus === 'completed') return 'completed';
  if ((sourceTask?.progress ?? executionTask?.progress ?? 0) >= 100) return 'progress-100';
  if (!executionTask || !isActiveExecutable(executionTask)) return 'non-actionable';
  if (!isExecutableAt(executionTask, now)) return 'future-start';
  if (isBlocked(executionTask, executionTasks)) return 'dependency-blocked';
  return 'lower-ranked';
}

/**
 * Compares the authoritative legacy Home projection with the execution-domain
 * projection without mutating either model or reproducing either ranking formula.
 */
export function buildHomeRecommendationComparison(
  goals: Goal[],
  tasks: Task[],
  legacyRecommendations: Task[],
  now = Date.now(),
): HomeRecommendationComparison {
  const adapted = adaptVisualDeadlineExecution(goals, tasks);
  const executionRecommendations = topTasks(adapted.tasks, now, 3);
  const legacyIds = legacyRecommendations.map((task) => task.id);
  const executionIds = executionRecommendations.map((task) => task.id);
  const legacyIdSet = new Set(legacyIds);
  const executionIdSet = new Set(executionIds);
  const sourceById = new Map(tasks.map((task) => [task.id, task]));
  const executionById = new Map(adapted.tasks.map((task) => [task.id, task]));
  const differences: HomeProjectionDifference[] = [];
  const classifications = new Set<HomeComparisonClassification>();

  const orderMatches = sameOrder(legacyIds, executionIds);
  const sameTop = legacyIds[0] === executionIds[0];
  const structurallyComparable = legacyIds.length === executionIds.length;
  let rankingRelation: HomeRankingRelation;

  if (!structurallyComparable) {
    rankingRelation = 'non-comparable';
    classifications.add('non-comparable');
  } else if (orderMatches) {
    rankingRelation = 'exact';
  } else if (sameTop) {
    rankingRelation = 'same-top-different-order';
    classifications.add('same-top-different-order');
  } else {
    rankingRelation = 'different-top';
    classifications.add('different-top-task');
  }

  if (!sameTop && (legacyIds[0] || executionIds[0])) {
    differences.push({ kind: 'top-task', legacyRank: legacyIds[0] ? 1 : undefined, executionRank: executionIds[0] ? 1 : undefined });
  }

  for (const taskId of legacyIds) {
    if (executionIdSet.has(taskId)) continue;
    classifications.add('execution-excludes-legacy-candidate');
    differences.push({
      kind: 'execution-exclusion',
      taskId,
      legacyRank: legacyIds.indexOf(taskId) + 1,
      reason: executionExclusionReason(sourceById.get(taskId), executionById.get(taskId), adapted.tasks, now),
    });
  }

  for (const taskId of executionIds) {
    if (legacyIdSet.has(taskId)) continue;
    classifications.add('legacy-excludes-execution-candidate');
    differences.push({
      kind: 'legacy-exclusion',
      taskId,
      executionRank: executionIds.indexOf(taskId) + 1,
      reason: 'legacy-not-in-top-three',
    });
  }

  for (const taskId of executionIds) {
    const legacyRank = legacyIds.indexOf(taskId);
    const executionRank = executionIds.indexOf(taskId);
    if (legacyRank >= 0 && legacyRank !== executionRank) {
      differences.push({
        kind: 'priority-ordering',
        taskId,
        legacyRank: legacyRank + 1,
        executionRank: executionRank + 1,
        reason: 'lower-ranked',
      });
    }
  }

  if (adapted.relationshipWarnings.length > 0) classifications.add('relationship-data-warning');
  if (classifications.size === 0) classifications.add('exact-agreement');

  return {
    legacy: { taskIds: legacyIds, topTaskId: legacyIds[0] },
    execution: { taskIds: executionIds, topTaskId: executionIds[0] },
    agreement: classifications.size === 1 && classifications.has('exact-agreement'),
    rankingRelation,
    classifications: [...classifications],
    differences,
    relationshipWarnings: adapted.relationshipWarnings,
  };
}
