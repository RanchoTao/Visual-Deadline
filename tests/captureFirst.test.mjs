import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { parseCaptureInterpretation } = await import('./.compiled/src/domain/capture/parser.js');
const { buildCaptureMaterializationPlan } = await import('./.compiled/src/domain/capture/materializer.js');

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
