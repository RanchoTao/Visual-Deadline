import assert from 'node:assert/strict';
const { planSevenDays } = await import(process.argv[2]);

const resource = { date: '2026-08-26', availableMinutes: 180, discretionaryBudget: 100, source: 'manual' };
const task = (id, status = 'focus', minutes = 60) => ({ id, layer: 'task', title: id, status, domain: 'study', importance: 9, nextAction: `start ${id}`, resourceBudget: { minutesPerWeek: minutes } });
const base = { nodes: [], dependencies: [], resource, recentEvents: [], lockedTasks: [] };

// A: a large Goal Space still produces at most four Focus goals.
let result = planSevenDays({ ...base, nodes: Array.from({ length: 20 }, (_, i) => ({ ...task(`g${i}`), layer: 'stage' })) });
assert.ok(result.activeGoals.filter((goal) => goal.recommendedStatus === 'focus').length <= 4);

// B: eight hours of candidates cannot enter a three-hour execution window.
result = planSevenDays({ ...base, nodes: Array.from({ length: 8 }, (_, i) => task(`t${i}`, 'focus', 60)) });
assert.ok(result.taskSequence.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= 180);
assert.ok(result.warnings.some((warning) => warning.includes('可用时间不足')));

// C/G: unmet requires blocks a task; completing the dependency unlocks it.
const blocked = task('after'); const prerequisite = { ...task('before'), layer: 'milestone', status: 'focus' };
const dependency = { id: 'dep', sourceId: 'before', targetId: 'after', type: 'requires', critical: true };
result = planSevenDays({ ...base, nodes: [prerequisite, blocked], dependencies: [dependency] });
assert.equal(result.taskSequence.some((item) => item.sourceTaskId === 'after'), false);
result = planSevenDays({ ...base, nodes: [{ ...prerequisite, status: 'completed' }, blocked], dependencies: [dependency] });
assert.equal(result.taskSequence.some((item) => item.sourceTaskId === 'after'), true);

// D: repeated postponement is present in context and calibrates the estimate upward.
result = planSevenDays({ ...base, resource: { ...resource, availableMinutes: 300 }, nodes: [task('late')], recentEvents: Array.from({ length: 3 }, (_, i) => ({ id: `${i}`, timestamp: '', type: 'task_postponed', entityId: 'late' })) });
assert.equal(result.taskSequence[0].estimatedMinutes, 90);

// E: a locked task survives replanning even when it exceeds the available window.
const locked = { id: 'locked', sourceTaskId: 'locked-source', goalId: 'g', title: 'locked', nextAction: 'do', date: '2026-08-26', estimatedMinutes: 240, importance: 10, locked: true, reason: 'user lock' };
result = planSevenDays({ ...base, lockedTasks: [locked] });
assert.equal(result.taskSequence[0].id, 'locked');

console.log('Life Planner scenarios A–E and G passed.');
