import assert from 'node:assert/strict';
import test from 'node:test';

const { planV2Backfill, readWithV2Shadow, resolveV2ReadMode } = await import('./.compiled/src/domain/v2/index.js');

const goal = (overrides = {}) => ({
  id: 'goal-1', title: 'Beta goal', category: 'work', priority: 8, linkedTaskIds: ['task-1'],
  createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const task = (overrides = {}) => ({
  id: 'task-1', title: 'Beta task', importance: 8, progress: 20, activityType: 'work', lifecycleStatus: 'active',
  schemaVersion: 3, linkedGoalIds: ['goal-1'], createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...overrides,
});
const plan = (goals, tasks, extra = {}) => planV2Backfill({ userId: 'owner-1', sourceSystem: 'visualdeadline-v1', sourceSchemaVersion: '3', goals, tasks, ...extra });

test('planner is deterministic, zero-write, and only promotes reciprocal goal links', () => {
  const result = plan([goal()], [task()]);
  assert.equal(result.writesPerformed, 0);
  assert.equal(result.plannedCounts.goals, 1);
  assert.equal(result.plannedCounts.tasks, 1);
  assert.equal(result.records.find((entry) => entry.entityType === 'task').canonical.goalId, 'goal-1');
  assert.deepEqual(result, plan([goal()], [task()]));

  const oneSided = plan([goal({ linkedTaskIds: [] })], [task()]);
  const taskRecord = oneSided.records.find((entry) => entry.entityType === 'task');
  assert.equal(taskRecord.canonical.goalId, undefined);
  assert.equal(taskRecord.disposition, 'UNRESOLVED');
});

test('planner quarantines invalid parent cycles and retains dependency evidence without repair', () => {
  const result = plan([goal()], [task({ dependencyIds: ['missing', 'task-1'] })], {
    relationshipEvidence: { parentTaskByLegacyId: { 'task-1': 'task-1' } },
  });
  const taskRecord = result.records.find((entry) => entry.entityType === 'task');
  assert.equal(taskRecord.disposition, 'QUARANTINE');
  assert.ok(result.records.some((entry) => entry.entityType === 'task_dependency' && entry.disposition === 'UNRESOLVED' && entry.sourceLegacyId === 'missing->task-1'));
  assert.ok(result.records.some((entry) => entry.entityType === 'task_dependency' && entry.disposition === 'UNRESOLVED' && entry.sourceLegacyId === 'task-1->task-1'));
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

test('read shadow is default-off and never changes caller authority', async () => {
  assert.equal(resolveV2ReadMode(undefined), 'legacy');
  const result = await readWithV2Shadow('shadow', async () => ['legacy'], async () => ['v2'], () => ['DIFF']);
  assert.deepEqual(result.value, ['legacy']);
  assert.equal(result.compared, true);
  assert.deepEqual(result.diagnostics, ['DIFF']);
});
