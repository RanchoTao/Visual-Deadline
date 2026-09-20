#!/usr/bin/env node
/* Deterministic local-only fixture: six goals and 191 tasks, including safe and unresolved relations. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = resolve(process.argv[2] ?? 'supabase/.temp/v2-backfill-scale-fixture.json');
const taskCountArgument = process.argv.indexOf('--tasks');
const taskCount = taskCountArgument >= 0 ? Number(process.argv[taskCountArgument + 1]) : 191;
const userArgument = process.argv.indexOf('--user-id');
const userId = userArgument >= 0 ? process.argv[userArgument + 1] : '55555555-5555-4555-8555-555555555555';
if (!Number.isInteger(taskCount) || taskCount < 2 || taskCount > 1000 || !userId) throw new Error('Use a task count from 2 to 1000 and a non-empty user ID.');
mkdirSync(dirname(output), { recursive: true });
const now = '2026-09-20T00:00:00.000Z';
const goals = Array.from({ length: 6 }, (_, index) => ({ id: `scale-goal-${index + 1}`, title: `Scale goal ${index + 1}`, category: 'work', priority: 6 + (index % 5), linkedTaskIds: [], createdAt: now, updatedAt: now }));
const tasks = Array.from({ length: taskCount }, (_, index) => {
  const id = `scale-task-${index + 1}`;
  const goal = goals[index % goals.length];
  goal.linkedTaskIds.push(id);
  return { id, title: `Scale task ${index + 1}${process.env.VD_V2_FIXTURE_CHANGED === '1' && index === 0 ? ' changed after import' : ''}`, importance: 1 + (index % 10), progress: index % 100, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: [goal.id], dependencyIds: index > 0 && index % 11 === 0 ? [`scale-task-${index}`] : [], createdAt: now, updatedAt: now };
});
if (taskCount >= 191) {
  tasks[189].dependencyIds = ['missing-task'];
  tasks[190].dependencyIds = ['scale-task-191'];
}
writeFileSync(output, `${JSON.stringify({ userId, sourceSchemaVersion: '3', goals, tasks }, null, 2)}\n`, 'utf8');
console.log(output);
