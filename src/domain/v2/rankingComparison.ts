import type { DailyReview, Goal as LegacyGoal, Task as LegacyTask } from '../../types/task.js';
import { generateDailyQuest } from '../../utils/dailyQuest.js';
import { getLegacyPriorityMapTopTasks } from '../../utils/taskScoring.js';
import { adaptLegacyVisualDeadlineToV2, type CompatibilityDiagnostic, type V2CompatibilityOptions } from './compatibility.js';
import { rankCanonicalTasks, type CanonicalRankingResult, type RankingExclusionReason, type ShadowDependencyEvidence } from './ranking.js';
import type { UserId } from './shared.js';

export type RankingComparisonClassification =
  | 'EXACT_ORDER'
  | 'SAME_TOP_DIFFERENT_ORDER'
  | 'DIFFERENT_TOP'
  | 'CANONICAL_EXCLUDES_LEGACY'
  | 'LEGACY_EXCLUDES_CANONICAL'
  | 'NON_COMPARABLE';

export type RankingComparisonSurface = 'LEGACY_HOME' | 'PRIORITY_MAP' | 'DAILY_QUEST';

export interface RankingSelectionProjection {
  readonly taskIds: readonly string[];
  readonly topTaskId?: string;
}

export interface RankingSelectionDifference {
  readonly kind: 'TOP_TASK' | 'ORDER' | 'CANONICAL_EXCLUSION' | 'LEGACY_EXCLUSION' | 'MISSING_CANONICAL_CANDIDATE';
  readonly taskId?: string;
  readonly legacyRank?: number;
  readonly canonicalRank?: number;
  readonly canonicalExclusionReasons?: readonly RankingExclusionReason[];
}

export interface RankingSurfaceComparison {
  readonly surface: RankingComparisonSurface;
  readonly legacy: RankingSelectionProjection;
  readonly canonical: RankingSelectionProjection;
  readonly agreement: boolean;
  readonly rankingRelation: Extract<RankingComparisonClassification, 'EXACT_ORDER' | 'SAME_TOP_DIFFERENT_ORDER' | 'DIFFERENT_TOP' | 'NON_COMPARABLE'>;
  readonly classifications: readonly RankingComparisonClassification[];
  readonly differences: readonly RankingSelectionDifference[];
}

export interface LegacyRankingShadowResult {
  readonly canonicalRanking: CanonicalRankingResult;
  readonly compatibilityDiagnostics: readonly CompatibilityDiagnostic[];
  readonly home: RankingSurfaceComparison;
  readonly priorityMap: RankingSurfaceComparison;
  readonly dailyQuest: RankingSurfaceComparison;
}

export interface LegacyRankingShadowRequest {
  readonly userId: UserId;
  readonly goals: readonly LegacyGoal[];
  readonly tasks: readonly LegacyTask[];
  readonly legacyHomeTaskIds: readonly string[];
  readonly now: string | number | Date;
  readonly previousDailyReview?: DailyReview;
  readonly compatibility?: V2CompatibilityOptions;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

export function compareRankingSelection(
  surface: RankingComparisonSurface,
  legacyTaskIds: readonly string[],
  canonicalRanking: CanonicalRankingResult,
): RankingSurfaceComparison {
  const legacyIds = unique(legacyTaskIds);
  const canonicalIds = canonicalRanking.orderedEligibleTaskIds.slice(0, legacyIds.length || canonicalRanking.orderedEligibleTaskIds.length);
  const classifications = new Set<RankingComparisonClassification>();
  const differences: RankingSelectionDifference[] = [];
  let rankingRelation: RankingSurfaceComparison['rankingRelation'];

  if (sameOrder(legacyIds, canonicalIds)) rankingRelation = 'EXACT_ORDER';
  else if (!legacyIds[0] || !canonicalIds[0]) rankingRelation = 'NON_COMPARABLE';
  else if (legacyIds[0] === canonicalIds[0]) rankingRelation = 'SAME_TOP_DIFFERENT_ORDER';
  else rankingRelation = 'DIFFERENT_TOP';
  classifications.add(rankingRelation);

  if (rankingRelation === 'DIFFERENT_TOP' || rankingRelation === 'NON_COMPARABLE') {
    differences.push({ kind: 'TOP_TASK', legacyRank: legacyIds[0] ? 1 : undefined, canonicalRank: canonicalIds[0] ? 1 : undefined });
  }

  const candidateById = new Map(canonicalRanking.candidates.map((candidate) => [candidate.taskId, candidate]));
  const canonicalSet = new Set(canonicalIds);
  const legacySet = new Set(legacyIds);
  for (const taskId of legacyIds) {
    if (canonicalSet.has(taskId)) continue;
    const candidate = candidateById.get(taskId);
    if (!candidate) {
      classifications.add('NON_COMPARABLE');
      differences.push({ kind: 'MISSING_CANONICAL_CANDIDATE', taskId, legacyRank: legacyIds.indexOf(taskId) + 1 });
    } else if (!candidate.eligible) {
      classifications.add('CANONICAL_EXCLUDES_LEGACY');
      differences.push({ kind: 'CANONICAL_EXCLUSION', taskId, legacyRank: legacyIds.indexOf(taskId) + 1, canonicalExclusionReasons: candidate.exclusionReasons });
    } else {
      differences.push({ kind: 'ORDER', taskId, legacyRank: legacyIds.indexOf(taskId) + 1, canonicalRank: candidate.rank });
    }
  }
  for (const taskId of canonicalIds) {
    if (legacySet.has(taskId)) continue;
    classifications.add('LEGACY_EXCLUDES_CANONICAL');
    differences.push({ kind: 'LEGACY_EXCLUSION', taskId, canonicalRank: canonicalIds.indexOf(taskId) + 1 });
  }
  for (const taskId of canonicalIds) {
    const legacyRank = legacyIds.indexOf(taskId);
    const canonicalRank = canonicalIds.indexOf(taskId);
    if (legacyRank >= 0 && legacyRank !== canonicalRank) differences.push({ kind: 'ORDER', taskId, legacyRank: legacyRank + 1, canonicalRank: canonicalRank + 1 });
  }

  return {
    surface,
    legacy: { taskIds: legacyIds, topTaskId: legacyIds[0] },
    canonical: { taskIds: canonicalIds, topTaskId: canonicalIds[0] },
    agreement: classifications.size === 1 && classifications.has('EXACT_ORDER'),
    rankingRelation,
    classifications: [...classifications],
    differences,
  };
}

export function buildCanonicalRankingFromLegacy(request: Omit<LegacyRankingShadowRequest, 'legacyHomeTaskIds' | 'previousDailyReview'>) {
  const compatibility = adaptLegacyVisualDeadlineToV2(request.userId, request.goals, request.tasks, request.compatibility);
  const shadowDependencyEvidence: ShadowDependencyEvidence[] = compatibility.unresolvedRelationships
    .filter((relationship) => relationship.kind === 'task_dependency' && (relationship.reason === 'MISSING_TARGET' || relationship.reason === 'SELF_REFERENCE'))
    .map((relationship) => ({
      source: 'LEGACY_SHADOW',
      successorTaskId: relationship.sourceId,
      predecessorTaskId: relationship.targetId,
      reason: relationship.reason === 'SELF_REFERENCE' ? 'SELF_DEPENDENCY' : 'MISSING_PREDECESSOR',
    }));
  const canonicalRanking = rankCanonicalTasks({
    userId: request.userId,
    tasks: compatibility.tasks,
    taskDependencies: compatibility.taskDependencies,
    shadowDependencyEvidence,
    now: request.now,
  });
  return { compatibility, canonicalRanking };
}

/** Full read-only shadow report. Existing legacy selectors remain the references. */
export function buildLegacyRankingShadowComparison(request: LegacyRankingShadowRequest): LegacyRankingShadowResult {
  const { compatibility, canonicalRanking } = buildCanonicalRankingFromLegacy(request);
  const now = request.now instanceof Date ? request.now : new Date(request.now);
  if (!Number.isFinite(now.getTime())) throw new RangeError('Ranking comparison requires a valid explicit now value.');
  const priorityMapIds = getLegacyPriorityMapTopTasks(request.tasks, now, 5).map((task) => task.id);
  const dailyQuestIds = generateDailyQuest([...request.tasks], request.previousDailyReview, now).items.flatMap((item) => item.sourceTaskId ? [item.sourceTaskId] : []);

  return {
    canonicalRanking,
    compatibilityDiagnostics: compatibility.diagnostics,
    home: compareRankingSelection('LEGACY_HOME', request.legacyHomeTaskIds, canonicalRanking),
    priorityMap: compareRankingSelection('PRIORITY_MAP', priorityMapIds, canonicalRanking),
    dailyQuest: compareRankingSelection('DAILY_QUEST', dailyQuestIds, canonicalRanking),
  };
}
