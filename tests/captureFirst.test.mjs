import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { parseCaptureInterpretation } = await import('./.compiled/src/domain/capture/parser.js');
const { buildCaptureMaterializationPlan } = await import('./.compiled/src/domain/capture/materializer.js');
const { validateCaptureReview } = await import('./.compiled/src/domain/capture/review.js');

test('capture parser preserves independent streams and refuses fabricated dependency edges', () => {
  const result = parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'goal-health', title: '保持每周三次锻炼', category: 'fitness', priority: 8 }], tasks: [{ id: 'task-report', title: '提交报告', importance: 9, category: 'work', dependencyDraftIds: ['task-missing'] }, { id: 'task-self', title: '整理资料', importance: 5, dependencyDraftIds: ['task-self'] }], commitments: [{ id: 'meeting', title: '周三客户会议', date: '2026-09-23' }], context: [{ id: 'ticket', text: '车票已经买好' }] }));
  assert.equal(result.goals.length, 1); assert.equal(result.tasks.length, 2); assert.equal(result.commitments.length, 1); assert.equal(result.context[0].text, '车票已经买好');
  assert.deepEqual(result.tasks.map((task) => task.dependencyDraftIds), [[], []]);
});

test('capture materialization is confirm-only, duplicate-aware, and maps only selected valid relationships', () => {
  const review = parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'g', title: '完成毕业论文', category: 'study', priority: 9 }], tasks: [{ id: 'a', title: '写大纲', importance: 8, category: 'study', goalDraftId: 'g' }, { id: 'b', title: '撰写第一章', importance: 8, category: 'study', goalDraftId: 'g', dependencyDraftIds: ['a'] }, { id: 'duplicate', title: '已有任务', importance: 5, category: 'task' }], commitments: [{ id: 'c', title: '周五答辩' }], context: [] }));
  const plan = buildCaptureMaterializationPlan(review, [{ id: 'existing', title: '已有任务' }], []);
  assert.equal(plan.goals.length, 1); assert.equal(plan.tasks.length, 2); assert.deepEqual(plan.tasks[1].dependencyDraftIds, ['a']); assert.equal(plan.skippedCommitments.length, 1); assert.match(plan.duplicateWarnings[0], /已有任务/);
});

test('owner transition contract clears capture-bearing ephemeral UI before the next owner renders', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  assert.match(app, /setPendingCapture\(undefined\)/);
  assert.match(app, /claimCaptureTransfer\(session\.user\.id\)/);
  assert.match(app, /capture\.ownerKey !== `user:\$\{session\.user\.id\}`/);
});

test('parser rejects duplicate IDs and malformed JSON', () => { assert.throws(() => parseCaptureInterpretation('{'), /JSON/); assert.throws(() => parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'x', title: 'A' }, { id: 'x', title: 'B' }] })), /重复/); assert.throws(() => parseCaptureInterpretation(JSON.stringify({ tasks: [{ id: 'x', title: 'A' }, { id: 'x', title: 'B' }] })), /重复/); });
test('parser rejects impossible date and preserves standalone task', () => { const result = parseCaptureInterpretation(JSON.stringify({ tasks: [{ id: 'a', title: '独立任务', deadline: '2026-99-99', importance: 99, category: 'task' }] })); assert.equal(result.tasks[0].deadline, undefined); assert.equal(result.tasks[0].importance, 10); assert.equal(result.tasks[0].goalDraftId, undefined); });
test('edited review values control materialization', () => { const review = parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'g1', title: 'A', priority: 2, category: 'task' }, { id: 'g2', title: 'B', priority: 3, category: 'research' }], tasks: [{ id: 't', title: 'T', importance: 5, category: 'task' }] })); const task = review.tasks[0]; Object.assign(task, { importance: 9, deadline: '2026-10-01', category: 'research', goalDraftId: 'g2', description: 'edited', estimatedDuration: 60 }); const plan = buildCaptureMaterializationPlan(review, [], []); assert.equal(plan.tasks[0].input.importance, 9); assert.equal(plan.tasks[0].input.activityType, 'research'); assert.equal(plan.tasks[0].input.deadline, '2026-10-01'); assert.deepEqual(plan.tasks[0].input.linkedGoalIds, ['g2']); });
test('review validation blocks empty manual task, excluded goal links, and cycles', () => { const base = parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'g', title: 'G', priority: 5, category: 'task' }], tasks: [{ id: 'a', title: 'A', importance: 5, category: 'task' }, { id: 'b', title: 'B', importance: 5, category: 'task' }] })); base.goals[0].included = false; Object.assign(base.tasks[0], { title: '', goalDraftId: 'g', dependencyDraftIds: ['b'] }); base.tasks[1].dependencyDraftIds = ['a']; assert.ok(validateCaptureReview(base).length > 0); });
test('excluded drafts do not materialize and context remains non-materialized', () => { const review = parseCaptureInterpretation(JSON.stringify({ goals: [{ id: 'g', title: 'skip', priority: 5, category: 'task', included: false }], tasks: [{ id: 't', title: 'skip', importance: 5, category: 'task', included: false }], context: [{ id: 'c', text: '已完成' }] })); review.goals[0].included = false; review.tasks[0].included = false; const plan = buildCaptureMaterializationPlan(review, [], []); assert.equal(plan.goals.length, 0); assert.equal(plan.tasks.length, 0); });
