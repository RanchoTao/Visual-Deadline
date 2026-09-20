import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedLegacy, goals, iso, legacyTask, NOW, tasks } from './fixtures/v2RankingLegacyCorpus.mjs';

const v2 = await import('./.compiled/src/domain/v2/index.js');
const { calculateTaskPressure, calculateUrgency } = await import('./.compiled/src/lib/pressureEngine.js');
const { generateDailyQuest } = await import('./.compiled/src/utils/dailyQuest.js');
const { getLegacyPriorityMapTopTasks, getTaskScore } = await import('./.compiled/src/utils/taskScoring.js');

const provenance = { origin: 'user', actor: 'user', confirmation: 'user_confirmed' };
const canonicalTask = (id, overrides = {}) => ({
  id,
  userId: 'user-1',
  title: id,
  status: 'ready',
  importance: 6,
  progress: 0,
  actionable: true,
  provenance,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  version: 1,
  ...overrides,
});
const dependency = (predecessorTaskId, successorTaskId, overrides = {}) => ({
  id: `${predecessorTaskId}->${successorTaskId}`,
  userId: 'user-1',
  predecessorTaskId,
  successorTaskId,
  type: 'blocks',
  provenance,
  createdAt: '2026-09-01T00:00:00.000Z',
  version: 1,
  ...overrides,
});
const rank = (sourceTasks, taskDependencies = [], now = NOW) => v2.rankCanonicalTasks({ userId: 'user-1', tasks: sourceTasks, taskDependencies, now });
const candidate = (result, id) => result.candidates.find((item) => item.taskId === id);

test('frozen corpus preserves all three current legacy selectors', () => {
  const now = new Date(NOW);
  const homeTop3 = [...tasks]
    .filter((task) => task.lifecycleStatus === 'active')
    .sort((left, right) => getTaskScore(right, now) - getTaskScore(left, now))
    .slice(0, 3)
    .map((task) => task.id);
  const priorityMapTop5 = getLegacyPriorityMapTopTasks(tasks, now, 5).map((task) => task.id);
  const dailyQuestTaskIds = generateDailyQuest(tasks, undefined, now).items.flatMap((item) => item.sourceTaskId ? [item.sourceTaskId] : []);
  assert.deepEqual(homeTop3, expectedLegacy.homeTop3);
  assert.deepEqual(priorityMapTop5, expectedLegacy.priorityMapTop5);
  assert.deepEqual(dailyQuestTaskIds, expectedLegacy.dailyQuestTaskIds);
});

test('frozen corpus reports explained differences without repairing relationships', () => {
  const report = v2.buildLegacyRankingShadowComparison({ userId: 'user-1', goals, tasks, legacyHomeTaskIds: expectedLegacy.homeTop3, now: NOW });
  assert.deepEqual(report.canonicalRanking.orderedEligibleTaskIds.slice(0, 5), [
    'overdue-high',
    'malformed-negative-progress',
    'deadline-one-hour',
    'unblocked-by-done',
    'date-only-deadline',
  ]);
  assert.deepEqual(report.home.classifications, ['DIFFERENT_TOP', 'CANONICAL_EXCLUDES_LEGACY', 'LEGACY_EXCLUDES_CANONICAL']);
  assert.deepEqual(report.priorityMap.classifications, ['DIFFERENT_TOP', 'CANONICAL_EXCLUDES_LEGACY', 'LEGACY_EXCLUDES_CANONICAL']);
  assert.deepEqual(report.dailyQuest.classifications, ['DIFFERENT_TOP', 'CANONICAL_EXCLUDES_LEGACY', 'LEGACY_EXCLUDES_CANONICAL']);
  assert.deepEqual(candidate(report.canonicalRanking, 'blocked-high').exclusionReasons, ['DEPENDENCY_BLOCKED']);
  assert.deepEqual(candidate(report.canonicalRanking, 'future-start').exclusionReasons, ['STARTS_IN_FUTURE']);
  assert.equal(candidate(report.canonicalRanking, 'missing-dependency').blockReasons[0].reason, 'MISSING_PREDECESSOR');
  assert.ok(report.canonicalRanking.orderedEligibleTaskIds.includes('one-sided-goal'));
  assert.ok(report.canonicalRanking.orderedEligibleTaskIds.includes('multiple-goals'));
  assert.ok(report.compatibilityDiagnostics.some(({ code }) => code === 'RELATIONSHIP_INCONSISTENT'));
  assert.ok(report.compatibilityDiagnostics.some(({ code }) => code === 'MULTIPLE_GOALS_UNRESOLVED'));
});

test('canonical score is exactly the established VD pressure score', () => {
  const task = canonicalTask('score', { importance: 8, progress: 25, deadline: iso(86400000) });
  const result = rank([task]);
  const explanation = candidate(result, 'score');
  assert.equal(explanation.score.urgency, 4);
  assert.equal(explanation.score.pressureContribution, 24);
  assert.equal(explanation.score.totalScore, 248);
  assert.equal(explanation.score.pressureContribution, calculateTaskPressure(task, NOW));
});

test('deadline bucket boundaries are table-driven and use explicit now', () => {
  const hour = 3600000;
  const day = 24 * hour;
  const cases = [
    [-1, 7], [0, 6], [hour, 6], [hour + 1, 5], [6 * hour, 5], [6 * hour + 1, 4],
    [day, 4], [day + 1, 3], [3 * day, 3], [3 * day + 1, 2], [7 * day, 2],
    [7 * day + 1, 1], [30 * day, 1], [30 * day + 1, 0.75],
  ];
  for (const [offset, expected] of cases) {
    const task = canonicalTask(`deadline-${offset}`, { deadline: iso(offset) });
    assert.equal(candidate(rank([task]), task.id).score.urgency, expected, `offset ${offset}`);
  }
  assert.equal(calculateUrgency(undefined, NOW), 0.5);
  assert.equal(calculateUrgency('1970-01-01T00:00:00.000Z', 0), 7);
  assert.equal(calculateUrgency('1970-01-01T00:00:00.000Z', new Date(0)), 6);
  assert.equal(candidate(rank([canonicalTask('epoch-zero', { deadline: '1970-01-01T00:00:00.000Z' })], [], 0), 'epoch-zero').score.urgency, 6);
});

test('progress, importance and missing optional fields have explicit boundaries', () => {
  const result = rank([
    canonicalTask('progress-0', { progress: 0, importance: 1 }),
    canonicalTask('progress-99', { progress: 99, importance: 10 }),
    canonicalTask('progress-100', { progress: 100, importance: 10 }),
    canonicalTask('no-optionals'),
  ]);
  assert.equal(candidate(result, 'progress-0').eligible, true);
  assert.equal(candidate(result, 'progress-0').score.importance, 1);
  assert.equal(candidate(result, 'progress-99').eligible, true);
  assert.equal(candidate(result, 'progress-99').score.importance, 10);
  assert.deepEqual(candidate(result, 'progress-100').exclusionReasons, ['PROGRESS_COMPLETE']);
  assert.equal(candidate(result, 'no-optionals').score.urgency, 0.5);
});

test('all lifecycle and actionable exclusions remain structured', () => {
  const result = rank([
    canonicalTask('in-progress', { status: 'in_progress' }),
    canonicalTask('deferred', { status: 'deferred' }),
    canonicalTask('done', { status: 'done' }),
    canonicalTask('cancelled', { status: 'cancelled' }),
    canonicalTask('archived', { status: 'archived' }),
    canonicalTask('parent', { actionable: false }),
  ]);
  assert.equal(candidate(result, 'in-progress').eligible, true);
  assert.deepEqual(candidate(result, 'deferred').exclusionReasons, ['DEFERRED']);
  assert.deepEqual(candidate(result, 'done').exclusionReasons, ['COMPLETED']);
  assert.deepEqual(candidate(result, 'cancelled').exclusionReasons, ['CANCELLED']);
  assert.deepEqual(candidate(result, 'archived').exclusionReasons, ['ARCHIVED']);
  assert.deepEqual(candidate(result, 'parent').exclusionReasons, ['NON_ACTIONABLE']);
});

test('startAfter before/equal/after now is deterministic', () => {
  const result = rank([
    canonicalTask('before', { startAfter: iso(-1) }),
    canonicalTask('equal', { startAfter: iso(0) }),
    canonicalTask('after', { startAfter: iso(1) }),
  ]);
  assert.equal(candidate(result, 'before').startAfterState, 'READY');
  assert.equal(candidate(result, 'equal').startAfterState, 'READY');
  assert.deepEqual(candidate(result, 'after').exclusionReasons, ['STARTS_IN_FUTURE']);
});

test('dependency complete/incomplete/missing states are explicit', () => {
  const sourceTasks = [
    canonicalTask('done', { status: 'done', progress: 100 }),
    canonicalTask('open'),
    canonicalTask('after-done'),
    canonicalTask('after-open'),
    canonicalTask('after-missing'),
  ];
  const result = rank(sourceTasks, [dependency('done', 'after-done'), dependency('open', 'after-open'), dependency('missing', 'after-missing')]);
  assert.equal(candidate(result, 'after-done').dependencyState.state, 'CLEAR');
  assert.equal(candidate(result, 'after-open').blockReasons[0].reason, 'PREDECESSOR_INCOMPLETE');
  assert.equal(candidate(result, 'after-missing').blockReasons[0].reason, 'MISSING_PREDECESSOR');
});

test('legacy compatibility dependency metadata never controls canonical ranking', () => {
  const compatibility = {
    sourceLifecycleStatus: 'active',
    sourceLinkedGoalIds: [],
    reconciledGoalIds: [],
    sourceDependencyIds: ['open'],
    executionSource: 'legacy-vd',
    sourceCreatedByAI: false,
    sourceSchemaVersion: 3,
  };
  const open = canonicalTask('open');
  const withCompatibility = canonicalTask('dependent', { compatibility });
  const withoutCompatibility = canonicalTask('dependent');
  assert.deepEqual(rank([open, withCompatibility]), rank([open, withoutCompatibility]));
  assert.deepEqual(
    rank([open, withCompatibility], [dependency('open', 'dependent')]),
    rank([open, withoutCompatibility], [dependency('open', 'dependent')]),
  );
  assert.equal(candidate(rank([open, withCompatibility]), 'dependent').dependencyState.state, 'CLEAR');
  assert.equal(candidate(rank([open, withCompatibility], [dependency('open', 'dependent')]), 'dependent').dependencyState.state, 'BLOCKED');
});

test('legacy shadow translates unresolved missing and self dependencies explicitly', () => {
  const missing = legacyTask('legacy-missing', { dependencyIds: ['missing-predecessor'] });
  const self = legacyTask('legacy-self', { dependencyIds: ['legacy-self'] });
  const { canonicalRanking } = v2.buildCanonicalRankingFromLegacy({ userId: 'user-1', goals: [], tasks: [missing, self], now: NOW });
  assert.equal(candidate(canonicalRanking, 'legacy-missing').blockReasons[0].reason, 'MISSING_PREDECESSOR');
  assert.equal(candidate(canonicalRanking, 'legacy-self').blockReasons[0].reason, 'SELF_DEPENDENCY');
  assert.deepEqual(candidate(canonicalRanking, 'legacy-missing').exclusionReasons, ['DEPENDENCY_BLOCKED']);
  assert.deepEqual(candidate(canonicalRanking, 'legacy-self').exclusionReasons, ['DEPENDENCY_BLOCKED']);
});

test('same scores use deadline, createdAt, then stable ID instead of input order', () => {
  const tieB = canonicalTask('tie-b', { deadline: iso(20 * 86400000) });
  const tieA = canonicalTask('tie-a', { deadline: iso(20 * 86400000) });
  assert.deepEqual(rank([tieB, tieA]).orderedEligibleTaskIds, ['tie-a', 'tie-b']);
  assert.deepEqual(rank([tieA, tieB]).orderedEligibleTaskIds, ['tie-a', 'tie-b']);
});

test('canonical ranking is read-only and deterministic', () => {
  const sourceTasks = [canonicalTask('b'), canonicalTask('a')];
  const edges = [dependency('a', 'b')];
  const before = structuredClone({ sourceTasks, edges });
  assert.deepEqual(rank(sourceTasks, edges), rank(sourceTasks, edges));
  assert.deepEqual({ sourceTasks, edges }, before);
});

test('malformed canonical progress and startAfter are invalid rather than guessed', () => {
  const result = rank([
    canonicalTask('negative', { progress: -1 }),
    canonicalTask('over', { progress: 101 }),
    canonicalTask('nan', { progress: Number.NaN }),
    canonicalTask('bad-start', { startAfter: 'not-a-date' }),
  ]);
  for (const id of ['negative', 'over', 'nan', 'bad-start']) assert.ok(candidate(result, id).exclusionReasons.includes('INVALID_DATA'));
  assert.throws(() => rank([], [], 'not-a-date'), /valid explicit now/);
});

test('date-only deadline preserves JavaScript UTC parsing and is documented in output', () => {
  const dateOnly = canonicalTask('date-only', { deadline: '2026-09-17' });
  const timestamp = canonicalTask('timestamp', { deadline: '2026-09-17T00:00:00.000Z' });
  const result = rank([dateOnly, timestamp]);
  assert.equal(candidate(result, 'date-only').score.deadlineInterpretation, 'DATE_ONLY_UTC');
  assert.equal(candidate(result, 'timestamp').score.deadlineInterpretation, 'TIMESTAMP');
  assert.equal(candidate(result, 'date-only').score.urgency, candidate(result, 'timestamp').score.urgency);
  const invalidDeadline = candidate(rank([canonicalTask('invalid-deadline', { deadline: 'not-a-date' })]), 'invalid-deadline');
  assert.equal(invalidDeadline.score.deadlineInterpretation, 'INVALID_AS_NO_DEADLINE');
  assert.equal(invalidDeadline.score.urgency, 0.5);
  assert.equal(invalidDeadline.eligible, true);
});

test('empty, fewer-than-three and more-than-three corpora are bounded without ambiguity', () => {
  assert.deepEqual(rank([]).orderedEligibleTaskIds, []);
  assert.equal(v2.projectNowRanking(rank([canonicalTask('one'), canonicalTask('two')])).rankedTaskIds.length, 2);
  assert.equal(v2.projectNowRanking(rank([canonicalTask('a'), canonicalTask('b'), canonicalTask('c'), canonicalTask('d')])).rankedTaskIds.length, 3);
});

test('NOW and TASKS consume the same ordered canonical IDs', () => {
  const result = rank([canonicalTask('c'), canonicalTask('a'), canonicalTask('b')]);
  const nowProjection = v2.projectNowRanking(result, result.orderedEligibleTaskIds.length);
  const tasksProjection = v2.projectTasksRanking(result);
  assert.deepEqual(nowProjection.rankedTaskIds, tasksProjection.rankedTaskIds);
});

test('comparison classifications distinguish all required cases', () => {
  const result = rank([canonicalTask('a', { importance: 10 }), canonicalTask('b', { importance: 8 }), canonicalTask('c', { importance: 6 }), canonicalTask('done', { status: 'done', progress: 100 })]);
  assert.deepEqual(v2.compareRankingSelection('LEGACY_HOME', ['a', 'b', 'c'], result).classifications, ['EXACT_ORDER']);
  assert.ok(v2.compareRankingSelection('LEGACY_HOME', ['a', 'c', 'b'], result).classifications.includes('SAME_TOP_DIFFERENT_ORDER'));
  assert.ok(v2.compareRankingSelection('LEGACY_HOME', ['b', 'a', 'c'], result).classifications.includes('DIFFERENT_TOP'));
  assert.ok(v2.compareRankingSelection('LEGACY_HOME', ['done'], result).classifications.includes('CANONICAL_EXCLUDES_LEGACY'));
  assert.ok(v2.compareRankingSelection('LEGACY_HOME', ['b'], result).classifications.includes('LEGACY_EXCLUDES_CANONICAL'));
  assert.ok(v2.compareRankingSelection('LEGACY_HOME', ['not-present'], result).classifications.includes('NON_COMPARABLE'));
});

test('legacy getTaskScore remains unchanged for the frozen score case', () => {
  const legacy = legacyTask('legacy-score', { importance: 8, progress: 25, deadline: iso(86400000) });
  assert.equal(getTaskScore(legacy, new Date(NOW)), 248);
});
