import assert from 'node:assert/strict';
import test from 'node:test';

const { planV2Backfill, readWithV2Shadow, resolveV2ReadMode, compareVisualDeadlineShadow } = await import('./.compiled/src/domain/v2/index.js');

const goal = (overrides = {}) => ({
  id: 'goal-1', title: 'Beta goal', category: 'work', priority: 8, linkedTaskIds: ['task-1'],
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const task = (overrides = {}) => ({
  id: 'task-1', title: 'Beta task', importance: 8, progress: 20, activityType: 'work', lifecycleStatus: 'active',
  schemaVersion: 3, linkedGoalIds: ['goal-1'], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const plan = (goals, tasks, extra = {}) => planV2Backfill({ userId: 'owner-1', sourceSystem: 'visualdeadline-v1', sourceSchemaVersion: '3', goals, tasks, ...extra });

const record = (result, entityType, sourceLegacyId) => result.records.find((entry) => entry.entityType === entityType && entry.sourceLegacyId === sourceLegacyId);

test('planner is deterministic, zero-write, and only promotes one reciprocal goal candidate', () => {
  const result = plan([goal()], [task()]);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.plannedCounts.goals, 1);
  assert.equal(result.plannedCounts.tasks, 1);
  assert.equal(result.records.find((entry) => entry.entityType === 'task').canonical.goalId, 'goal-1');
  assert.deepEqual(result, plan([goal()], [task()]));

  const oneSided = plan([goal({ linkedTaskIds: [] })], [task()]);
  const taskRecord = record(oneSided, 'task', 'task-1');
  assert.equal(taskRecord.canonical.goalId, undefined);
  assert.equal(taskRecord.disposition, 'UNRESOLVED');
});

test('full goal evidence leaves one-sided, missing, and all multiple candidates unresolved', () => {
  const goalOnly = plan([goal({ linkedTaskIds: ['task-1'] })], [task({ linkedGoalIds: [] })]);
  assert.equal(record(goalOnly, 'task', 'task-1').canonical.goalId, undefined);
  assert.equal(record(goalOnly, 'task', 'task-1').disposition, 'UNRESOLVED');
  const multiple = plan(
    [goal({ id: 'goal-1' }), goal({ id: 'goal-2', linkedTaskIds: ['task-1'] })],
    [task({ linkedGoalIds: ['goal-1'] })],
  );
  const taskRecord = record(multiple, 'task', 'task-1');
  assert.equal(taskRecord.canonical.goalId, undefined);
  assert.equal(taskRecord.disposition, 'UNRESOLVED');
  assert.equal(taskRecord.unresolvedReferences.filter((item) => item.reason === 'MULTIPLE_TARGETS').length, 2);
  const missing = plan([goal({ id: 'goal-1', linkedTaskIds: [] })], [task({ linkedGoalIds: ['missing-goal'] })]);
  assert.equal(record(missing, 'task', 'task-1').unresolvedReferences[0].reason, 'MISSING_TARGET');
});

test('planner retains unresolved dependency evidence and excludes cycles without repair', () => {
  const result = plan([goal()], [task({ dependencyIds: ['missing', 'task-1'] })], {
    relationshipEvidence: { parentTaskByLegacyId: { 'task-1': 'task-1' } },
  });
  const taskRecord = record(result, 'task', 'task-1');
  assert.equal(taskRecord.disposition, 'UNRESOLVED');
  assert.equal(taskRecord.canonical.parentTaskId, undefined);
  assert.ok(result.records.some((entry) => entry.entityType === 'task_dependency' && entry.disposition === 'UNRESOLVED' && entry.sourceLegacyId === 'missing->task-1'));
  assert.ok(result.records.some((entry) => entry.entityType === 'task_dependency' && entry.disposition === 'UNRESOLVED' && entry.sourceLegacyId === 'task-1->task-1'));
  const twoCycle = plan([goal({ linkedTaskIds: ['a', 'b'] })], [task({ id: 'a', linkedGoalIds: ['goal-1'], dependencyIds: ['b'] }), task({ id: 'b', linkedGoalIds: ['goal-1'], dependencyIds: ['a'] })]);
  assert.equal(twoCycle.plannedCounts.dependencies, 0);
  assert.equal(twoCycle.records.filter((entry) => entry.entityType === 'task_dependency' && entry.disposition === 'UNRESOLVED').length, 2);
  const threeCycle = plan([goal({ linkedTaskIds: ['a', 'b', 'c'] })], [task({ id: 'a', linkedGoalIds: ['goal-1'], dependencyIds: ['c'] }), task({ id: 'b', linkedGoalIds: ['goal-1'], dependencyIds: ['a'] }), task({ id: 'c', linkedGoalIds: ['goal-1'], dependencyIds: ['b'] })]);
  assert.equal(threeCycle.plannedCounts.dependencies, 0);
});

test('planner accepts only explicit valid parent evidence for goals and tasks', () => {
  const result = plan(
    [goal({ id: 'parent-goal', linkedTaskIds: [] }), goal({ id: 'child-goal', linkedTaskIds: [] })],
    [task({ id: 'parent-task', linkedGoalIds: [] }), task({ id: 'child-task', linkedGoalIds: [] })],
    { relationshipEvidence: { parentGoalByLegacyId: { 'child-goal': 'parent-goal' }, parentTaskByLegacyId: { 'child-task': 'parent-task' } } },
  );
  assert.equal(result.records.find((entry) => entry.sourceLegacyId === 'child-goal').canonical.parentGoalId, 'parent-goal');
  assert.equal(result.records.find((entry) => entry.sourceLegacyId === 'child-task').canonical.parentTaskId, 'parent-task');
});

test('planner leaves missing and cyclic parent relationships unlinked', () => {
  const result = plan(
    [goal({ id: 'a', linkedTaskIds: [] }), goal({ id: 'b', linkedTaskIds: [] })],
    [task({ id: 'a-task', linkedGoalIds: [] }), task({ id: 'b-task', linkedGoalIds: [] })],
    { relationshipEvidence: { parentGoalByLegacyId: { a: 'b', b: 'a' }, parentTaskByLegacyId: { 'a-task': 'b-task', 'b-task': 'a-task' } } },
  );
  assert.equal(record(result, 'goal', 'a').canonical.parentGoalId, undefined);
  assert.equal(record(result, 'task', 'a-task').canonical.parentTaskId, undefined);
  assert.ok(result.warnings.some((item) => item.code === 'PARENT_GOAL_CYCLE'));
  assert.ok(result.warnings.some((item) => item.code === 'PARENT_TASK_CYCLE'));
});

test('planner accepts UUID-shaped legacy source IDs and stable source checksums', () => {
  const uuid = '8ed2f1f0-9702-4d16-8d10-18e32c93adf3';
  const source = task({ id: uuid, linkedGoalIds: [] });
  const first = plan([], [source]);
  const second = plan([], [{ ...source, updatedAt: source.updatedAt }]);
  assert.equal(record(first, 'task', uuid).sourceLegacyId, uuid);
  assert.equal(first.checksum, second.checksum);
  assert.equal(record(first, 'task', uuid).sourceChecksum, record(second, 'task', uuid).sourceChecksum);
});

test('read shadow is default-off and never changes caller authority', async () => {
  assert.equal(resolveV2ReadMode(undefined), 'legacy');
  const result = await readWithV2Shadow('shadow', async () => ['legacy'], async () => ['v2'], () => ['DIFF']);
  assert.deepEqual(result.value, ['legacy']);
  assert.equal(result.compared, true);
  assert.deepEqual(result.diagnostics, ['DIFF']);
});

test('VisualDeadline shadow comparator is pure, deterministic and detects mapping and relationship drift', () => {
  const legacy = { goals: [{ legacyId: 'g', status: 'active', importance: 8 }], tasks: [{ legacyId: 't', status: 'ready', importance: 9, progress: 20, goalLegacyId: 'g' }], dependencies: [{ predecessorLegacyId: 'p', successorLegacyId: 't', type: 'blocks' }] };
  const canonical = { goals: [{ legacyId: 'g', status: 'paused', importance: 8 }], tasks: [{ legacyId: 't', status: 'ready', importance: 9, progress: 30 }], dependencies: [] };
  const expected = ['DEPENDENCY_COUNT_MISMATCH', 'DEPENDENCY_MISSING:p->t:blocks', 'GOAL_MISMATCH:g:status', 'TASK_MISMATCH:t:goalLegacyId', 'TASK_MISMATCH:t:progress'];
  assert.deepEqual(compareVisualDeadlineShadow(legacy, canonical), expected);
  assert.deepEqual(compareVisualDeadlineShadow(legacy, canonical), expected);
});

test('VisualDeadline shadow comparator reports deterministic count and extra-canonical diagnostics', () => {
  const legacy = { goals: [{ legacyId: 'g', status: 'active', importance: 1 }], tasks: [], dependencies: [] };
  const canonical = { goals: [{ legacyId: 'g', status: 'active', importance: 1 }, { legacyId: 'extra-g', status: 'active', importance: 1 }], tasks: [{ legacyId: 'extra-t', status: 'ready', importance: 1, progress: 0 }], dependencies: [{ predecessorLegacyId: 'extra-t', successorLegacyId: 'extra-t', type: 'blocks' }] };
  assert.deepEqual(compareVisualDeadlineShadow(legacy, canonical), ['DEPENDENCY_COUNT_MISMATCH', 'DEPENDENCY_EXTRA:extra-t->extra-t:blocks', 'GOAL_COUNT_MISMATCH', 'GOAL_MAPPING_EXTRA:extra-g', 'TASK_COUNT_MISMATCH', 'TASK_MAPPING_EXTRA:extra-t']);
});
