import assert from 'node:assert/strict';

const { buildHomeRecommendationComparison } = await import('./.compiled/src/domain/execution/index.js');
const NOW = Date.parse('2026-09-16T12:00:00.000Z');
const iso = (offset) => new Date(NOW + offset).toISOString();
const task = (id, overrides = {}) => ({
  id,
  title: id,
  importance: 8,
  deadline: iso(86400000),
  progress: 0,
  activityType: 'work',
  lifecycleStatus: 'active',
  schemaVersion: 3,
  createdAt: iso(-86400000),
  updatedAt: iso(-86400000),
  ...overrides,
});
const goal = (overrides = {}) => ({
  id: 'goal',
  title: 'Goal',
  category: 'work',
  priority: 8,
  linkedTaskIds: [],
  createdAt: iso(-86400000),
  updatedAt: iso(-86400000),
  ...overrides,
});

const agree = task('agree');
let comparison = buildHomeRecommendationComparison([], [agree], [agree], NOW);
assert.equal(comparison.agreement, true);
assert.equal(comparison.rankingRelation, 'EXACT_ORDER');
assert.deepEqual(comparison.classifications, ['EXACT_ORDER']);
assert.deepEqual(comparison.canonical.taskIds, ['agree']);

const completed = task('completed', { lifecycleStatus: 'completed', progress: 100, completedAt: iso(-1000) });
comparison = buildHomeRecommendationComparison([], [completed], [completed], NOW);
assert.ok(comparison.classifications.includes('CANONICAL_EXCLUDES_LEGACY'));
assert.deepEqual(comparison.differences.find((item) => item.taskId === 'completed')?.canonicalExclusionReasons, ['COMPLETED', 'PROGRESS_COMPLETE', 'NON_ACTIONABLE']);

const prerequisite = task('prerequisite', { importance: 4 });
const blocked = task('blocked', { importance: 10, dependencyIds: ['prerequisite'] });
comparison = buildHomeRecommendationComparison([], [blocked, prerequisite], [blocked, prerequisite], NOW);
assert.deepEqual(comparison.canonical.taskIds, ['prerequisite']);
assert.deepEqual(comparison.differences.find((item) => item.taskId === 'blocked')?.canonicalExclusionReasons, ['DEPENDENCY_BLOCKED']);

const future = task('future', { importance: 10, startDate: iso(7 * 86400000) });
comparison = buildHomeRecommendationComparison([], [future], [future], NOW);
assert.deepEqual(comparison.differences.find((item) => item.taskId === 'future')?.canonicalExclusionReasons, ['STARTS_IN_FUTURE']);

const linkedTask = task('linked');
comparison = buildHomeRecommendationComparison([goal({ linkedTaskIds: ['linked'] })], [linkedTask], [linkedTask], NOW);
assert.equal(comparison.relationshipWarnings.length, 1);
assert.equal(comparison.agreement, true);

comparison = buildHomeRecommendationComparison([], [], [], NOW);
assert.equal(comparison.agreement, true);
assert.deepEqual(comparison.canonical.taskIds, []);

console.log('Home canonical shadow comparison scenarios passed.');
