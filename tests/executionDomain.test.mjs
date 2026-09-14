import assert from 'node:assert/strict';

const domain = await import('./.compiled/src/domain/execution/index.js');
const NOW = Date.parse('2026-09-14T02:00:00.000Z');
const iso = (offset) => new Date(NOW + offset).toISOString();
const task = (overrides = {}) => ({ id: crypto.randomUUID(), title: 'task', goalIds: [], createdAt: iso(-2 * 86400000), deadline: iso(86400000), importance: 8, progress: 0, status: 'ready', actionable: true, dependencies: [], source: 'manual', createdByAI: false, ...overrides });

const {
  adaptVisualDeadlineExecution, applyReviewSuggestion, buildReviewSuggestions, computeReviewStatistics,
  heatZoneTasks, materializeExecutionCapture, migrateLegacyWorkspaceProject, priorityScore, taskPressure,
  topTasks, transitionExecutionTask, urgencyWeight,
} = domain;

// Golden values are the proven Wayline priority contract, not PR #117's proposed formula.
assert.equal(urgencyWeight(iso(-1), NOW), 7);
assert.equal(urgencyWeight(iso(60 * 60000), NOW), 6);
assert.equal(urgencyWeight(iso(24 * 60 * 60000), NOW), 4);
assert.equal(urgencyWeight(iso(40 * 86400000), NOW), 0.75);
assert.equal(taskPressure(task({ importance: 8, progress: 25, deadline: iso(86400000) }), NOW), 24);
assert.equal(priorityScore(task({ importance: 8, progress: 25, deadline: iso(86400000) }), NOW), 248);

const completedByProgress = task({ id: 'complete-progress', progress: 100, status: 'ready', importance: 10 });
const nonActionable = task({ id: 'parent', actionable: false, importance: 10 });
const future = task({ id: 'future', startAfter: iso(7 * 86400000), importance: 10 });
const prerequisite = task({ id: 'pre', importance: 7 });
const blocked = task({ id: 'blocked', importance: 10, dependencies: ['pre'] });
assert.deepEqual(topTasks([completedByProgress, nonActionable, future, blocked, prerequisite], NOW).map((item) => item.id), ['pre']);
assert.deepEqual(heatZoneTasks([future, prerequisite], NOW).map((item) => item.id), ['pre']);

const capture = { id: 'capture-voice', inputType: 'voice', result: { title: 'Prepare exam', deadline: iso(86400000), importance: 8, actionable: false, suggestedTasks: [{ title: 'Read chapter', importance: 7, actionable: true }, { title: 'Practice', importance: 8, actionable: true, dependsOnIndexes: [0] }] } };
let sequence = 0;
const created = materializeExecutionCapture(capture, iso(0), (prefix) => `${prefix}-${++sequence}`);
assert.equal(created.projects.length, 1);
assert.equal(created.tasks.filter((item) => !item.actionable).length, 1);
assert.equal(created.tasks[1].parentTaskId, created.tasks[0].id);
assert.equal(created.tasks[2].dependencies[0], created.tasks[1].id);
assert.equal(created.tasks[1].source, 'ai');
assert.equal(created.tasks[1].sourceCaptureId, 'capture-voice');
sequence = 0;
const direct = materializeExecutionCapture({ id: 'capture-text', inputType: 'text', result: { title: 'Email advisor', actionable: true, estimatedDuration: 20, suggestedTasks: [] } }, iso(0), (prefix) => `${prefix}-${++sequence}`);
assert.equal(direct.projects.length, 0);
assert.equal(direct.tasks.length, 1);
assert.equal(direct.tasks[0].estimatedMinutes, 20);
assert.equal(direct.tasks[0].source, 'text');

const started = transitionExecutionTask(task({ id: 'transition' }), 'in_progress', iso(0));
const done = transitionExecutionTask(started, 'done', iso(0));
assert.equal(started.status, 'in_progress');
assert.equal(done.progress, 100);
assert.equal(done.completedAt, iso(0));

const project = { id: 'goal', title: 'Ship', targetDate: iso(2 * 86400000), category: 'work', priority: 9, linkedTaskIds: ['goal-side'], createdAt: iso(-86400000), updatedAt: iso(-86400000) };
const goalSide = { id: 'goal-side', title: 'Goal-side link', importance: 8, progress: 0, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, createdAt: iso(-86400000), updatedAt: iso(-86400000) };
const taskSide = { ...goalSide, id: 'task-side', linkedGoalIds: ['goal'] };
const adapted = adaptVisualDeadlineExecution([project], [goalSide, taskSide]);
assert.deepEqual(adapted.tasks.find((item) => item.id === 'goal-side').goalIds, ['goal']);
assert.ok(adapted.relationshipWarnings.some((warning) => warning.includes('does not link back')));
assert.equal(adapted.tasks.find((item) => item.id === 'task-side').projectId, 'goal');

const reviewProject = { id: 'p', title: 'Project', createdAt: iso(-2 * 86400000), importance: 8, status: 'active' };
const reviewTasks = [task({ id: 'done', projectId: 'p', status: 'done', progress: 100, completedAt: iso(-3600000), estimatedMinutes: 50, completedMinutes: 80 }), task({ id: 'planned', projectId: 'p', estimatedMinutes: 50 }), task({ id: 'late', projectId: 'p', deadline: iso(-86400000), importance: 5 }), task({ id: 'deferred', projectId: 'p', status: 'deferred' })];
const stats = computeReviewStatistics(reviewTasks, [reviewProject], '7d', NOW);
assert.equal(stats.completedTasks, 1); assert.equal(stats.deferredTasks, 2); assert.equal(stats.estimateVarianceMinutes, 30);
const suggestions = buildReviewSuggestions(reviewTasks, [reviewProject], '7d', NOW);
assert.equal(suggestions.length, 2);
assert.equal(applyReviewSuggestion(reviewTasks, suggestions[0]).find((item) => item.id === 'planned').estimatedMinutes, 75);
assert.equal(applyReviewSuggestion(reviewTasks, suggestions[1]).find((item) => item.id === 'late').status, 'deferred');

const legacy = migrateLegacyWorkspaceProject({ id: 'legacy', title: 'Legacy project', createdAt: iso(-86400000), deadline: iso(86400000), status: 'active', source: 'agent', tasks: [{ id: 'legacy-task', title: 'Legacy task', priority: 'critical', estimatedHours: 2, completedHours: .5, progress: .25, status: 'todo', dependencies: [] }] });
assert.equal(legacy.tasks[0].id, 'legacy-task'); assert.equal(legacy.tasks[0].estimatedMinutes, 120); assert.equal(legacy.tasks[0].progress, 25); assert.equal(legacy.tasks[0].source, 'legacy'); assert.equal(legacy.tasks[0].createdByAI, true);

console.log('Wayline execution parity scenarios passed.');
