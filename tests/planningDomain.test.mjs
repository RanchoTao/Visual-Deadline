import assert from 'node:assert/strict';

const { deadlineRisk, projectLegacyPlanningModel, recommendCurrentAction } = await import('./.compiled/src/domain/planning/index.js');
const now = new Date('2026-09-13T12:00:00Z');
const goal = { id: 'goal', title: 'Ship', targetDate: '2026-09-15', category: 'work', priority: 9, linkedTaskIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
const task = (id, deadline, dependencyIds = [], lifecycleStatus = 'active') => ({ id, title: id, importance: 8, deadline, dependencyIds, progress: 0, activityType: 'work', lifecycleStatus, schemaVersion: 3, createdAt: now.toISOString(), updatedAt: now.toISOString(), linkedGoalIds: ['goal'] });

let model = projectLegacyPlanningModel([goal], [task('prerequisite', undefined), task('urgent-blocked', '2026-09-12', ['prerequisite']), task('ready', '2026-09-15')]);
assert.equal(model.paths[0].taskIds.length, 3);
assert.equal(model.dependencies[0].dependentTaskId, 'urgent-blocked');
assert.equal(recommendCurrentAction(model, now)?.task.id, 'ready');
assert.equal(deadlineRisk(model.tasks[2], now), 'high');

model = projectLegacyPlanningModel([goal], [task('prerequisite', undefined, [], 'completed'), task('urgent-blocked', '2026-09-12', ['prerequisite']), task('ready', '2026-09-15')]);
assert.equal(recommendCurrentAction(model, now)?.task.id, 'urgent-blocked');
assert.equal(recommendCurrentAction(model, now)?.risk, 'overdue');

console.log('Canonical planning projection and recommendation scenarios passed.');
