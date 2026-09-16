import assert from 'node:assert/strict';
import test from 'node:test';

const { adaptLegacyVisualDeadlineToV2, V2_PERSISTENCE_STAGING } = await import('./.compiled/src/domain/v2/index.js');

const baseGoal = (overrides = {}) => ({
  id: 'goal-1',
  title: 'Ship v2',
  category: 'work',
  priority: 9,
  linkedTaskIds: [],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

const baseTask = (overrides = {}) => ({
  id: 'task-1',
  title: 'Define contracts',
  importance: 8,
  progress: 20,
  activityType: 'work',
  lifecycleStatus: 'active',
  schemaVersion: 3,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
  ...overrides,
});

const adapt = (goals = [], tasks = [], executionMetadata = undefined) =>
  adaptLegacyVisualDeadlineToV2('owner-1', goals, tasks, { executionMetadata });

test('active lifecycle projects to ready and exposes ambiguity', () => {
  const result = adapt([], [baseTask()]);
  assert.equal(result.tasks[0].status, 'ready');
  assert.equal(result.lifecycleMappings[0].quality, 'AMBIGUOUS');
  assert.match(result.lifecycleMappings[0].reason, /ready, in_progress, or deferred/);
});

test('completed lifecycle maps exactly to done at 100 percent', () => {
  const result = adapt([], [baseTask({ lifecycleStatus: 'completed', progress: 100 })]);
  assert.equal(result.tasks[0].status, 'done');
  assert.equal(result.lifecycleMappings[0].quality, 'EXACT');
});

test('abandoned lifecycle maps lossily to cancelled', () => {
  const result = adapt([], [baseTask({ lifecycleStatus: 'abandoned' })]);
  assert.equal(result.tasks[0].status, 'cancelled');
  assert.equal(result.lifecycleMappings[0].quality, 'LOSSY');
  assert.ok(result.diagnostics.some(({ code }) => code === 'LIFECYCLE_LOSSY'));
});

test('deadline and legacy startDate are preserved', () => {
  const result = adapt([], [baseTask({ deadline: '2026-10-01', startDate: '2026-09-20' })]);
  assert.equal(result.tasks[0].deadline, '2026-10-01');
  assert.equal(result.tasks[0].startAfter, '2026-09-20');
});

test('execution startAfter is explicit and reports a conflicting legacy startDate', () => {
  const result = adapt([], [baseTask({ startDate: '2026-09-20' })], { 'task-1': { startAfter: '2026-09-21' } });
  assert.equal(result.tasks[0].startAfter, '2026-09-21');
  assert.ok(result.diagnostics.some(({ code }) => code === 'START_DATE_CONFLICT'));
});

test('progress below zero is bounded without changing the source', () => {
  const source = baseTask({ progress: -4 });
  const result = adapt([], [source]);
  assert.equal(result.tasks[0].progress, 0);
  assert.equal(source.progress, -4);
  assert.ok(result.diagnostics.some(({ code }) => code === 'PROGRESS_CLAMPED'));
});

test('progress above 100 is bounded', () => {
  const result = adapt([], [baseTask({ progress: 140 })]);
  assert.equal(result.tasks[0].progress, 100);
  assert.ok(result.diagnostics.some(({ code }) => code === 'PROGRESS_CLAMPED'));
});

test('a consistent goal link becomes canonical goalId', () => {
  const result = adapt(
    [baseGoal({ linkedTaskIds: ['task-1'] })],
    [baseTask({ linkedGoalIds: ['goal-1'] })],
  );
  assert.equal(result.tasks[0].goalId, 'goal-1');
  assert.equal(result.unresolvedRelationships.length, 0);
});

test('a standalone task remains outside a goal', () => {
  const result = adapt([baseGoal()], [baseTask()]);
  assert.equal(result.tasks[0].goalId, undefined);
  assert.deepEqual(result.tasks[0].compatibility.reconciledGoalIds, []);
});

test('a one-sided goal link is retained and diagnosed', () => {
  const result = adapt([baseGoal({ linkedTaskIds: ['task-1'] })], [baseTask()]);
  assert.equal(result.tasks[0].goalId, 'goal-1');
  assert.ok(result.diagnostics.some(({ code }) => code === 'RELATIONSHIP_INCONSISTENT'));
  assert.ok(result.unresolvedRelationships.some(({ reason }) => reason === 'ONE_SIDED'));
});

test('a missing goal remains diagnostic rather than a fabricated relationship', () => {
  const result = adapt([], [baseTask({ linkedGoalIds: ['missing-goal'] })]);
  assert.equal(result.tasks[0].goalId, undefined);
  assert.ok(result.diagnostics.some(({ code }) => code === 'RELATIONSHIP_MISSING_TARGET'));
});

test('legacy IDs and owner identity are preserved', () => {
  const result = adapt([baseGoal()], [baseTask()]);
  assert.equal(result.goals[0].id, 'goal-1');
  assert.equal(result.tasks[0].id, 'task-1');
  assert.equal(result.goals[0].userId, 'owner-1');
  assert.equal(result.tasks[0].userId, 'owner-1');
});

test('legacy data never fabricates Milestones', () => {
  const result = adapt([baseGoal({ linkedTaskIds: ['task-1'] })], [baseTask({ linkedGoalIds: ['goal-1'] })]);
  assert.deepEqual(result.milestones, []);
  assert.equal(result.tasks[0].milestoneId, undefined);
});

test('dependency edges are deterministic and missing/self references are unresolved', () => {
  const result = adapt([], [
    baseTask({ id: 'predecessor' }),
    baseTask({ id: 'successor', dependencyIds: ['predecessor', 'missing', 'successor'] }),
  ]);
  assert.deepEqual(result.taskDependencies.map(({ id }) => id), ['legacy-dependency:predecessor->successor']);
  assert.ok(result.diagnostics.some(({ code }) => code === 'DEPENDENCY_MISSING_TARGET'));
  assert.ok(result.diagnostics.some(({ code }) => code === 'DEPENDENCY_SELF_REFERENCE'));
});

test('adapter performs zero writes and leaves nested legacy arrays unchanged', () => {
  const goals = [baseGoal({ linkedTaskIds: ['task-1'] })];
  const tasks = [baseTask({ linkedGoalIds: [], dependencyIds: [] })];
  const before = structuredClone({ goals, tasks });
  const result = adapt(goals, tasks);
  assert.equal(result.writesPerformed, 0);
  assert.deepEqual({ goals, tasks }, before);
});

test('adapter output is deterministic', () => {
  const goals = [baseGoal({ linkedTaskIds: ['task-1'] })];
  const tasks = [baseTask({ linkedGoalIds: ['goal-1'], dependencyIds: [] })];
  assert.deepEqual(adapt(goals, tasks), adapt(goals, tasks));
});

test('multiple valid legacy goals remain unresolved instead of choosing one', () => {
  const goals = [
    baseGoal({ id: 'goal-1', linkedTaskIds: ['task-1'] }),
    baseGoal({ id: 'goal-2', linkedTaskIds: ['task-1'] }),
  ];
  const result = adapt(goals, [baseTask({ linkedGoalIds: ['goal-1', 'goal-2'] })]);
  assert.equal(result.tasks[0].goalId, undefined);
  assert.ok(result.diagnostics.some(({ code }) => code === 'MULTIPLE_GOALS_UNRESOLVED'));
});

test('legacy Project metadata stays compatibility-only', () => {
  const result = adapt([], [baseTask()], { 'task-1': { projectId: 'wayline-project', sourceCaptureId: 'capture-1', createdByAI: true } });
  assert.equal(result.tasks[0].goalId, undefined);
  assert.equal(result.tasks[0].compatibility.sourceProjectId, 'wayline-project');
  assert.equal(result.tasks[0].compatibility.sourceCaptureId, 'capture-1');
  assert.equal(result.tasks[0].compatibility.sourceCreatedByAI, true);
  assert.ok(result.diagnostics.some(({ code }) => code === 'LEGACY_PROJECT_REFERENCE_IGNORED'));
});

test('OPS and REVIEW persistence remain deferred until their consumers need them', () => {
  const byId = Object.fromEntries(V2_PERSISTENCE_STAGING.map((item) => [item.id, item]));
  assert.equal(byId.ops_resource_model.stage, 'DEFERRED');
  assert.match(byId.ops_resource_model.becomesRequiredWhen, /OPS consumes/);
  assert.equal(byId.review_history.stage, 'DEFERRED');
  assert.match(byId.review_history.becomesRequiredWhen, /REVIEW migration/);
});
