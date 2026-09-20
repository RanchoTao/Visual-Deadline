#!/usr/bin/env node
/* Reproducible PR F local integration suite. It resets only the local Supabase stack. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.'); const temp = resolve('supabase/.temp/v2-local-backfill-test'); mkdirSync(temp, { recursive: true });
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...options.env } });
  if (result.error) throw result.error;
  return result;
};
const supabase = (args) => run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx --yes supabase@2.117.0 ${args}`]);
const rows = (sql, name = 'query') => {
  const file = resolve(temp, `${name}.sql`); writeFileSync(file, sql, 'utf8');
  const result = supabase(`db query --local --output-format json --file ${relative(root, file).replaceAll('\\', '/')}`);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const index = result.stdout.indexOf('{'); return index < 0 ? [] : JSON.parse(result.stdout.slice(index)).rows;
};
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const userId = (number) => `60000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const createUser = (id) => rows(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values (${quote(id)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${quote(`${id}@example.test`)},'not-used',now(),'{}'::jsonb,'{}'::jsonb,now(),now())`, `user-${id}`);
const fixture = (id, options = {}) => {
  const now = '2026-09-20T00:00:00.000Z';
  const goals = [
    { id: 'goal-a', title: 'Goal A', category: 'work', priority: 8, linkedTaskIds: ['task-a', 'task-b'], createdAt: now, updatedAt: now },
    { id: 'goal-b', title: 'Goal B', category: 'work', priority: 7, linkedTaskIds: ['task-c'], createdAt: now, updatedAt: now },
  ];
  const tasks = [
    { id: 'task-a', title: options.changed ? 'Task A changed at source' : 'Task A', importance: 8, progress: 0, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: ['goal-a'], dependencyIds: [], createdAt: now, updatedAt: now },
    { id: 'task-b', title: 'Task B', importance: 7, progress: 10, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: ['goal-a'], dependencyIds: [], createdAt: now, updatedAt: now },
    { id: 'task-c', title: 'Task C', importance: 6, progress: 20, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: ['goal-b'], dependencyIds: ['task-b'], createdAt: now, updatedAt: now },
  ];
  return { userId: id, sourceSchemaVersion: '3', goals, tasks, relationshipEvidence: { parentGoalByLegacyId: { 'goal-b': 'goal-a' }, parentTaskByLegacyId: { 'task-b': 'task-a' } } };
};
const writeFixture = (name, value) => { const file = resolve(temp, `${name}.json`); writeFileSync(file, JSON.stringify(value), 'utf8'); return file; };
const apply = (name, value, requestId, failAt) => {
  const result = run(process.execPath, ['scripts/v2-local-backfill.mjs', '--input', writeFixture(name, value), '--apply', '--request-id', requestId], { env: failAt ? { VD_V2_FAIL_AT: failAt } : {} });
  return { result, report: result.status === 0 ? JSON.parse(result.stdout) : undefined };
};
const count = (sql, name) => Number(rows(sql, name)[0].count);
const expectCompleted = (id, requestId, expectedCreated) => {
  const job = rows(`select status,record_counts from public.v2_import_jobs where user_id=${quote(id)}::uuid and client_request_id=${quote(requestId)}`, `job-${requestId}`)[0];
  assert.equal(job.status, 'completed'); if (expectedCreated !== undefined) assert.equal(Number(job.record_counts.created), expectedCreated);
};

const reset = supabase('db reset --local'); assert.equal(reset.status, 0, reset.stderr || reset.stdout);
const legacyBefore = count("select count(*)::int count from public.goals union all select count(*)::int from public.tasks", 'legacy-before');
assert.equal(legacyBefore, 0, 'local reset must start without legacy records');

// Normal run, actual checksums/reconciliation, fresh same-run parent links, then idempotent resume.
const normalUser = userId(1); createUser(normalUser); const normal = fixture(normalUser); const normalRequest = 'local-normal';
let outcome = apply('normal', normal, normalRequest); assert.equal(outcome.result.status, 0, outcome.result.stderr); assert.equal(outcome.report.summary.created, 6);
expectCompleted(normalUser, normalRequest, 6);
assert.equal(count(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(normalUser)}::uuid and status='migrated' and target_checksum is not null`, 'normal-checksums'), 6);
assert.equal(count(`select count(*)::int count from public.v2_tasks where user_id=${quote(normalUser)}::uuid and parent_task_id is not null`, 'normal-task-parent'), 1);
assert.equal(count(`select count(*)::int count from public.v2_goals where user_id=${quote(normalUser)}::uuid and parent_goal_id is not null`, 'normal-goal-parent'), 1);
outcome = apply('normal-repeat', normal, normalRequest); assert.equal(outcome.result.status, 0, outcome.result.stderr); assert.equal(outcome.report.summary.created, 0); expectCompleted(normalUser, normalRequest, 0);

// A changed source gets durable evidence and is never silently copied over the original canonical target.
outcome = apply('normal-changed', fixture(normalUser, { changed: true }), normalRequest); assert.equal(outcome.result.status, 0, outcome.result.stderr); assert.equal(outcome.report.sourceChanged, 1);
assert.equal(rows(`select title from public.v2_tasks where user_id=${quote(normalUser)}::uuid and provenance #>> '{legacy,entityId}'='task-a'`, 'changed-title')[0].title, 'Task A');
assert.equal(count(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(normalUser)}::uuid and warnings::text like '%SOURCE_CHANGED_AFTER_IMPORT%'`, 'changed-warning'), 1);

// Every named interruption point must leave a resumable local ledger and later converge without duplicate rows.
const failures = ['before-write', 'after-first-goal-batch', 'after-goal-mappings', 'after-first-task-batch', 'after-task-mappings', 'during-dependency-creation', 'before-final-reconciliation'];
for (const [index, point] of failures.entries()) {
  const id = userId(index + 10); const requestId = `failure-${index}`; createUser(id); const input = fixture(id);
  const interrupted = apply(`failure-${index}`, input, requestId, point); assert.notEqual(interrupted.result.status, 0, `${point} must inject a failure`);
  const resumed = apply(`failure-${index}-resume`, input, requestId); assert.equal(resumed.result.status, 0, resumed.result.stderr); expectCompleted(id, requestId);
  assert.equal(count(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(id)}::uuid`, `failure-refs-${index}`), 6);
}

// Cycles are ledger evidence, not persisted dependency edges.
const cycleUser = userId(30); createUser(cycleUser); const cycle = fixture(cycleUser); cycle.goals[0].linkedTaskIds = ['task-a', 'task-b']; cycle.goals[1].linkedTaskIds = [];
cycle.tasks = cycle.tasks.slice(0, 2); cycle.tasks[0].linkedGoalIds = ['goal-a']; cycle.tasks[1].linkedGoalIds = ['goal-a']; cycle.tasks[0].dependencyIds = ['task-b']; cycle.tasks[1].dependencyIds = ['task-a']; cycle.relationshipEvidence = {};
outcome = apply('cycle', cycle, 'cycle'); assert.equal(outcome.result.status, 0, outcome.result.stderr);
assert.equal(count(`select count(*)::int count from public.v2_task_dependencies where user_id=${quote(cycleUser)}::uuid`, 'cycle-dependencies'), 0);
assert.equal(count(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(cycleUser)}::uuid and source_entity_type='task_dependency' and status='quarantined'`, 'cycle-ledger'), 2);

// A duplicate owner/system/kind/source provenance key is a hard resume failure, never a first-wins selection.
const duplicateUser = userId(31); createUser(duplicateUser); const duplicate = fixture(duplicateUser); outcome = apply('duplicate-initial', duplicate, 'duplicate'); assert.equal(outcome.result.status, 0, outcome.result.stderr);
rows(`insert into public.v2_tasks (user_id,title,status,importance,progress,actionable,provenance,version) select user_id,'duplicate provenance','ready',1,0,true,provenance,1 from public.v2_tasks where user_id=${quote(duplicateUser)}::uuid and provenance #>> '{legacy,entityId}'='task-a'`, 'duplicate-insert');
const duplicateAttempt = apply('duplicate-retry', duplicate, 'duplicate'); assert.notEqual(duplicateAttempt.result.status, 0); assert.match(duplicateAttempt.result.stderr, /DUPLICATE_CANONICAL_PROVENANCE/);

// Cross-owner target assignment is rejected by the composite owner FK.
const otherUser = userId(32); createUser(otherUser); rows(`insert into public.v2_goals (user_id,title,status,importance,provenance,version) values (${quote(otherUser)}::uuid,'other','active',1,'{}'::jsonb,1)`, 'other-goal');
const cross = supabase(`db query --local --output-format json "update public.v2_tasks set goal_id=(select id from public.v2_goals where user_id=${quote(otherUser)}::uuid limit 1) where id=(select id from public.v2_tasks where user_id=${quote(normalUser)}::uuid limit 1)"`); assert.notEqual(cross.status, 0, 'cross-user target assignment must be rejected');

// More than one 50-record batch: direct fixture construction keeps this integration run deterministic.
const scaleUser = userId(40); createUser(scaleUser); const scale = fixture(scaleUser); const now = '2026-09-20T00:00:00.000Z'; scale.goals = Array.from({ length: 6 }, (_, index) => ({ id: `scale-goal-${index}`, title: `Scale goal ${index}`, category: 'work', priority: 5, linkedTaskIds: [], createdAt: now, updatedAt: now })); scale.tasks = Array.from({ length: 191 }, (_, index) => { const goal = scale.goals[index % 6]; const id = `scale-task-${index}`; goal.linkedTaskIds.push(id); return { id, title: id, importance: 5, progress: 0, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: [goal.id], dependencyIds: index && index % 25 === 0 ? [`scale-task-${index - 1}`] : [], createdAt: now, updatedAt: now }; }); scale.relationshipEvidence = {};
outcome = apply('scale', scale, 'scale'); assert.equal(outcome.result.status, 0, outcome.result.stderr); assert.equal(outcome.report.summary.created, 204); expectCompleted(scaleUser, 'scale', 204);
assert.equal(count(`select count(*)::int count from public.v2_tasks where user_id=${quote(scaleUser)}::uuid`, 'scale-tasks'), 191);
assert.equal(count(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(scaleUser)}::uuid and status='migrated' and target_checksum is not null`, 'scale-checksums'), 204);

const legacyAfter = count("select count(*)::int count from public.goals union all select count(*)::int from public.tasks", 'legacy-after'); assert.equal(legacyAfter, legacyBefore, 'the local runner must not mutate legacy source tables');
console.log('v2 local backfill integration passed: normal/resume/source-change/failures/cycles/duplicate-provenance/isolation/scale/legacy-unchanged');
