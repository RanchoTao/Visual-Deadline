import type { Goal, Task } from '../../types/task.js';
import { buildCanonicalRankingFromLegacy, compareRankingSelection, type RankingSurfaceComparison } from '../v2/rankingComparison.js';

export interface HomeRecommendationComparison extends RankingSurfaceComparison {
  readonly relationshipWarnings: readonly string[];
}

/**
 * Compatibility entry point for the existing dev-only Home diagnostic. The
 * comparison logic and candidate explanations now come from the v2 contract.
 */
export function buildHomeRecommendationComparison(
  goals: Goal[],
  tasks: Task[],
  legacyRecommendations: Task[],
  now = Date.now(),
): HomeRecommendationComparison {
  const { compatibility, canonicalRanking } = buildCanonicalRankingFromLegacy({ userId: 'home-shadow-comparison', goals, tasks, now });
  const comparison = compareRankingSelection('LEGACY_HOME', legacyRecommendations.map((task) => task.id), canonicalRanking);
  const relationshipWarnings = compatibility.diagnostics
    .filter((diagnostic) => diagnostic.code.startsWith('RELATIONSHIP_') || diagnostic.code === 'MULTIPLE_GOALS_UNRESOLVED')
    .map((diagnostic) => diagnostic.message);
  return { ...comparison, relationshipWarnings };
}
