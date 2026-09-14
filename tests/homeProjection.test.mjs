import assert from 'node:assert/strict';

const { buildHomeRecommendationComparison } = await import('./.compiled/src/domain/execution/index.js');
const NOW = Date.parse('2026-09-14T02:00:00.000Z');
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
assert.equal(comparison.rankingRelation, 'exact');
assert.deepEqual(comparison.classifications, ['exact-agreement']);

const completed = task('completed', { lifecycleStatus: 'completed', progress: 40, completedAt: iso(-1000) });
comparison = buildHomeRecommendationComparison([], [completed], [completed], NOW);
assert.ok(comparison.classifications.includes('execution-excludes-legacy-candidate'));
assert.equal(comparison.differences.find((item) => item.taskId === 'completed')?.reason, 'completed');

const prerequisite = task('prerequisite', { importance: 4 });
const blocked = task('blocked', { importance: 10, dependencyIds: ['prerequisite'] });
comparison = buildHomeRecommendationComparison([], [blocked, prerequisite], [blocked, prerequisite], NOW);
assert.equal(comparison.differences.find((item) => item.taskId === 'blocked')?.reason, 'dependency-blocked');
assert.deepEqual(comparison.execution.taskIds, ['prerequisite']);

const future = task('future', { importance: 10, startDate: iso(7 * 86400000) });
comparison = buildHomeRecommendationComparison([], [future], [future], NOW);
assert.equal(comparison.differences.find((item) => item.taskId === 'future')?.reason, 'future-start');

const linkedTask = task('linked');
comparison = buildHomeRecommendationComparison([goal({ linkedTaskIds: ['linked'] })], [linkedTask], [linkedTask], NOW);
assert.ok(comparison.classifications.includes('relationship-data-warning'));
assert.equal(comparison.relationshipWarnings.length, 1);
assert.equal(comparison.agreement, false);

const first = task('first', { importance: 10, deadline: iso(-1000) });
const longImportant = task('long-important', { importance: 9, deadline: undefined });
const overdue = task('overdue', { importance: 5, deadline: iso(-1000) });
comparison = buildHomeRecommendationComparison([], [first, longImportant, overdue], [first, longImportant, overdue], NOW);
assert.equal(comparison.rankingRelation, 'same-top-different-order');
assert.ok(comparison.classifications.includes('same-top-different-order'));
assert.deepEqual(comparison.execution.taskIds, ['first', 'overdue', 'long-important']);
assert.ok(comparison.differences.some((item) => item.kind === 'priority-ordering'));

comparison = buildHomeRecommendationComparison([], [], [], NOW);
assert.equal(comparison.agreement, true);
assert.deepEqual(comparison.legacy.taskIds, []);
assert.deepEqual(comparison.execution.taskIds, []);

const unowned = task('unowned');
comparison = buildHomeRecommendationComparison([], [unowned], [unowned], NOW);
assert.equal(comparison.agreement, true);
assert.deepEqual(comparison.relationshipWarnings, []);

const progressOnly = task('progress-only', { progress: 100 });
comparison = buildHomeRecommendationComparison([], [progressOnly], [progressOnly], NOW);
assert.equal(comparison.differences.find((item) => item.taskId === 'progress-only')?.reason, 'progress-100');

const executionOnly = task('execution-only');
comparison = buildHomeRecommendationComparison([], [executionOnly], [], NOW);
assert.ok(comparison.classifications.includes('legacy-excludes-execution-candidate'));
assert.ok(comparison.classifications.includes('non-comparable'));

console.log('Home recommendation comparison scenarios passed.');
