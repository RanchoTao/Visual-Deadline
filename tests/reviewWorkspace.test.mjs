import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const review = await import('./.compiled/src/domain/review/index.js');
const ops = await import('./.compiled/src/domain/ops/types.js');
const now = '2026-09-24T12:00:00.000Z';
const task = (id, patch = {}) => ({ id, title: id, importance: 5, progress: 0, taskProgress: 0, activityType: 'task', lifecycleStatus: 'active', schemaVersion: 3, createdAt: now, updatedAt: now, ...patch });
const goals = () => [{ id: 'g', title: 'G', category: 'work', priority: 5, linkedTaskIds: [], createdAt: now, updatedAt: now, milestones: [{ id: 'm', title: 'Original milestone', sequence: 1, status: 'completed', createdAt: now, updatedAt: now, completedAt: '2026-09-22T00:00:00.000Z' }] }];
const window = review.createReviewWindow(7, now, 'Asia/Shanghai');
const opsState = ops.createDefaultOpsState(now);
const pressure = (id, timestamp, value, patch = {}) => ({ id, timestamp, pressure: value, currentTaskLoad: 0, activeTaskCount: 0, completedToday: 0, abandonedToday: 0, recoveryRelief: 0, ...patch });

function capturedState(input = {}) {
  return review.synchronizeReviewHistory(review.createDefaultReviewState(now), { tasks: input.tasks ?? [], goals: input.goals ?? [], pressureHistory: input.pressureHistory ?? [], aiArtifacts: input.aiArtifacts ?? [], now });
}

test('review windows use completion and abandonment timestamps, never updatedAt, with an honest empty denominator', () => {
  const metrics = review.deriveReviewMetrics({ tasks: [task('completed', { lifecycleStatus: 'completed', completedAt: '2026-09-23T12:00:00.000Z' }), task('abandoned', { lifecycleStatus: 'abandoned', abandonedAt: '2026-09-22T12:00:00.000Z' }), task('changed-only', { lifecycleStatus: 'active', updatedAt: '2026-09-23T12:00:00.000Z' })], goals: [], pressureHistory: [], opsState, window, now });
  assert.equal(metrics.completedCount, 1); assert.equal(metrics.abandonedCount, 1); assert.equal(metrics.resolvedCount, 2); assert.equal(metrics.completionRate, 50);
  assert.equal(review.deriveReviewMetrics({ tasks: [task('none')], goals: [], pressureHistory: [], opsState, window, now }).completionRate, undefined);
});

test('deadline metrics retain positive and negative deltas, and final hour never includes late completions', () => {
  const metrics = review.deriveReviewMetrics({ tasks: [task('early', { lifecycleStatus: 'completed', completedAt: '2026-09-23T11:30:00.000Z', deadline: '2026-09-23T12:00:00.000Z' }), task('late', { lifecycleStatus: 'completed', completedAt: '2026-09-23T13:00:00.000Z', deadline: '2026-09-23T12:00:00.000Z' }), task('invalid', { lifecycleStatus: 'completed', completedAt: '2026-09-23T11:00:00.000Z', deadline: 'bad' })], goals: [], pressureHistory: [], opsState, window, now });
  assert.equal(metrics.completedWithDeadlineCount, 2); assert.equal(metrics.onTimeCompletionCount, 1); assert.equal(metrics.lastHourCompletionCount, 1); assert.equal(metrics.averageDeadlineDeltaHours, -0.25);
});

test('immutable event snapshots keep REVIEW stable after Task and Goal edits or deletion', () => {
  const originalTask = task('done', { title: 'Original task', lifecycleStatus: 'completed', completedAt: '2026-09-23T00:00:00.000Z', deadline: '2026-09-23T01:00:00.000Z', reviewNote: 'original fact' });
  const first = capturedState({ tasks: [originalTask], goals: goals(), pressureHistory: [pressure('p', '2026-09-23T02:00:00.000Z', 71, { source: 'task_derived' })] });
  const afterEdit = review.synchronizeReviewHistory(first, { tasks: [{ ...originalTask, title: 'Edited later', reviewNote: 'rewritten later', completedAt: '2026-09-24T01:00:00.000Z', deadline: '2026-09-24T02:00:00.000Z' }], goals: [{ ...goals()[0], milestones: [{ ...goals()[0].milestones[0], title: 'Edited milestone', completedAt: '2026-09-24T03:00:00.000Z' }] }], pressureHistory: [], aiArtifacts: [], now: '2026-09-24T13:00:00.000Z' });
  const afterDelete = review.synchronizeReviewHistory(afterEdit, { tasks: [], goals: [], pressureHistory: [], aiArtifacts: [], now: '2026-09-24T14:00:00.000Z' });
  const taskEvents = afterDelete.events.filter((event) => event.kind === 'task_completed'); const milestoneEvents = afterDelete.events.filter((event) => event.kind === 'milestone_completed');
  assert.equal(taskEvents.length, 1); assert.equal(taskEvents[0].entityTitle, 'Original task'); assert.equal(taskEvents[0].description, 'original fact');
  assert.equal(taskEvents[0].timestamp, '2026-09-23T00:00:00.000Z'); assert.equal(taskEvents[0].deadline, '2026-09-23T01:00:00.000Z');
  assert.equal(taskEvents[0].evidenceSource, 'legacy_backfill');
  assert.equal(milestoneEvents.length, 1);
  assert.equal(afterDelete.events.find((event) => event.kind === 'milestone_completed')?.entityTitle, 'Original milestone');
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], events: afterDelete.events, opsState, window, now });
  assert.equal(metrics.completedCount, 1); assert.equal(metrics.pressureSampleCount, 1); assert.equal(metrics.averagePressure, 71);
  assert.equal(review.buildReviewDailyTrends({ events: afterDelete.events, window }).find((entry) => entry.completedCount === 1)?.averagePressure, 71);
});

test('history snapshots distinguish derived pressure from manual recalibration and remain deterministic newest first', () => {
  const state = capturedState({ tasks: [task('done', { lifecycleStatus: 'completed', completedAt: '2026-09-23T00:00:00.000Z' })], goals: goals(), pressureHistory: [pressure('auto', '2026-09-23T09:00:00.000Z', 50, { source: 'task_derived', eventType: 'auto' }), pressure('cal', '2026-09-23T08:00:00.000Z', 60, { source: 'manual', eventType: 'recalibration' })] });
  const events = review.buildReviewHistoryEvents({ events: state.events, window });
  assert.equal(events.find((event) => event.id === 'pressure:auto')?.kind, 'pressure_sample');
  assert.equal(events.find((event) => event.id === 'pressure:auto')?.pressureSource, 'task_derived');
  assert.equal(events.find((event) => event.id === 'pressure:cal')?.kind, 'pressure_recalibrated');
  assert.equal(events.find((event) => event.id === 'pressure:cal')?.pressureSource, 'manual');
  assert.deepEqual(events, [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || a.id.localeCompare(b.id)));
});

test('7/30/90 windows use local calendar dates and preserve DST semantics', () => {
  const spring = review.createReviewWindow(7, '2026-03-08T16:00:00.000Z', 'America/New_York');
  assert.equal(spring.start, '2026-03-02T05:00:00.000Z');
  assert.deepEqual(spring.dateKeys, ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08']);
  assert.notEqual(Date.parse(spring.end) - Date.parse(spring.start), 7 * 24 * 60 * 60 * 1000);
  for (const days of [7, 30, 90]) { const current = review.createReviewWindow(days, '2026-11-01T17:00:00.000Z', 'America/New_York'); assert.equal(current.dateKeys.length, days); assert.equal(current.dateKeys.at(-1), '2026-11-01'); assert.equal(new Set(current.dateKeys).size, days); }
});

test('daily trends use the exact timezone calendar buckets across a DST transition', () => {
  const dstWindow = review.createReviewWindow(7, '2026-03-08T16:00:00.000Z', 'America/New_York');
  const state = capturedState({ tasks: [task('before', { lifecycleStatus: 'completed', completedAt: '2026-03-08T04:30:00.000Z' }), task('after', { lifecycleStatus: 'completed', completedAt: '2026-03-08T07:30:00.000Z' })] });
  const trends = review.buildReviewDailyTrends({ events: state.events, window: dstWindow });
  assert.equal(trends.find((entry) => entry.date === '2026-03-07')?.completedCount, 1);
  assert.equal(trends.find((entry) => entry.date === '2026-03-08')?.completedCount, 1);
});

test('REVIEW advances across canonical-zone midnight and persists local date metadata', () => {
  const before = review.createReviewWindow(7, '2026-09-24T15:59:59.000Z', 'Asia/Shanghai');
  const after = review.createReviewWindow(7, '2026-09-24T16:00:00.000Z', 'Asia/Shanghai');
  assert.equal(before.dateKeys.at(-1), '2026-09-24'); assert.equal(after.dateKeys.at(-1), '2026-09-25');
  assert.notEqual(review.reviewWindowCalendarIdentity(before), review.reviewWindowCalendarIdentity(after));
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], opsState, window: after, now: after.end });
  const record = review.createReviewRecord({ id: 'midnight', window: after, metrics, now: '2026-09-24T16:00:01.000Z' });
  assert.equal(record.timezone, 'Asia/Shanghai'); assert.equal(record.windowStartDate, after.dateKeys[0]); assert.equal(record.windowEndDate, '2026-09-25'); assert.equal(record.savedDate, '2026-09-25'); assert.match(record.title, /2026-09-25/);
  assert.equal(review.reviewDateKey('2026-09-24T16:30:00.000Z', 'Asia/Shanghai'), '2026-09-25');
});

test('normalization retains all review records and migrates schema 1 without a 100-record cap', () => {
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], opsState, window, now });
  const record = review.createReviewRecord({ id: 'one', window, metrics, now });
  const many = review.normalizeReviewState({ schemaVersion: 1, defaultWindowDays: 7, updatedAt: now, reviews: Array.from({ length: 205 }, (_, index) => ({ ...record, id: `r-${index}`, createdAt: new Date(Date.parse(now) + index).toISOString(), updatedAt: now })) });
  assert.equal(many.schemaVersion, 3); assert.equal(many.reviews.length, 205); assert.equal(many.events.length, 0);
  assert.equal(review.normalizeReviewState({ schemaVersion: 1, defaultWindowDays: 7, updatedAt: now, reviews: [{ ...record, id: '', windowEnd: window.start }] }).reviews.length, 0);
});

test('row pagination loads complete REVIEW history despite a smaller server page cap', async () => {
  const source = Array.from({ length: 1205 }, (_, index) => ({ id: `row-${index}` })); const offsets = [];
  const rows = await review.collectReviewRowPages(async (offset) => { offsets.push(offset); return { data: source.slice(offset, offset + 200), total: source.length }; });
  assert.equal(rows.length, source.length); assert.deepEqual(offsets, [0, 200, 400, 600, 800, 1000, 1200]); assert.equal(rows.at(-1).id, 'row-1204');
});

test('concurrent device states merge records and events by identity, while permanent-delete tombstones prevent resurrection', () => {
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], opsState, window, now });
  const recordA = review.createReviewRecord({ id: 'a', window, metrics, now: '2026-09-24T12:01:00.000Z' });
  const recordB = review.createReviewRecord({ id: 'b', window, metrics, now: '2026-09-24T12:02:00.000Z' });
  const deviceA = review.addReviewRecord(review.createDefaultReviewState(now), recordA);
  const deviceB = review.addReviewRecord(review.createDefaultReviewState(now), recordB);
  const merged = review.mergeReviewStates(deviceA, deviceB);
  assert.deepEqual(merged.reviews.map((entry) => entry.id).sort(), ['a', 'b']); assert.equal(merged.events.length, 2);
  const archived = review.deleteReviewRecord(merged, 'a', '2026-09-24T12:03:00.000Z');
  assert.deepEqual(review.mergeReviewStates(deviceA, archived).reviews.map((entry) => entry.id), ['b']);
  assert.ok(review.mergeReviewStates(deviceA, archived).events.some((event) => event.reviewId === 'a'));
  const archiveThenDelete = review.deleteReviewRecord(review.archiveReviewRecord(merged, 'a', '2026-09-24T12:02:00.000Z', 'archive-before-delete'), 'a', '2026-09-24T12:03:00.000Z');
  assert.equal(archiveThenDelete.reviewArchiveEvents.some((event) => event.reviewId === 'a'), false);
});

test('archive preserves complete records, unarchives, and converges across devices without tombstones', () => {
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], opsState, window, now });
  const report = { content: 'full report', generatedAt: '2026-09-24T11:59:00.000Z', provider: 'deepseek', model: 'deepseek-chat', inputFingerprint: `sha256-${'a'.repeat(64)}`, windowIdentity: review.reviewWindowIdentity(window) };
  const record = review.createReviewRecord({ id: 'archive-me', window, metrics, userNote: 'keep every field', aiReport: report, now });
  const base = review.addReviewRecord(review.createDefaultReviewState(now), record); const storedRecord = base.reviews[0];
  const archived = review.archiveReviewRecord(base, record.id, '2026-09-24T12:01:00.000Z', 'archive-1');
  assert.equal(archived.reviews.length, 1); assert.deepEqual(archived.reviews[0], storedRecord); assert.equal(review.isReviewArchived(archived, record.id), true); assert.equal(archived.reviewTombstones.length, 0);
  const merged = review.mergeReviewStates(base, archived); assert.equal(review.isReviewArchived(merged, record.id), true); assert.deepEqual(merged.reviews[0], storedRecord);
  const restored = review.unarchiveReviewRecord(merged, record.id, '2026-09-24T12:02:00.000Z', 'archive-2');
  assert.equal(review.isReviewArchived(restored, record.id), false); assert.deepEqual(restored.reviews[0].aiReport, report); assert.equal(restored.reviews[0].userNote, 'keep every field');
});

test('live lifecycle capture preserves repeated task completion and abandonment occurrences', () => {
  const active = task('repeat');
  const completedOnce = { ...active, lifecycleStatus: 'completed', completedAt: '2026-09-24T01:00:00.000Z' };
  let state = review.captureTaskLifecycleTransition(review.createDefaultReviewState(now), { previous: active, next: completedOnce, recordedAt: completedOnce.completedAt, eventId: 'complete-1' });
  const restored = { ...completedOnce, lifecycleStatus: 'active', completedAt: undefined, updatedAt: '2026-09-24T02:00:00.000Z' };
  state = review.captureTaskLifecycleTransition(state, { previous: completedOnce, next: restored, recordedAt: restored.updatedAt, eventId: 'restore-1' });
  const completedTwice = { ...restored, lifecycleStatus: 'completed', completedAt: '2026-09-24T03:00:00.000Z' };
  state = review.captureTaskLifecycleTransition(state, { previous: restored, next: completedTwice, recordedAt: completedTwice.completedAt, eventId: 'complete-2' });
  const abandonedOnce = { ...active, lifecycleStatus: 'abandoned', abandonedAt: '2026-09-24T04:00:00.000Z' };
  state = review.captureTaskLifecycleTransition(state, { previous: active, next: abandonedOnce, recordedAt: abandonedOnce.abandonedAt, eventId: 'abandon-1' });
  const restoredAgain = { ...abandonedOnce, lifecycleStatus: 'active', abandonedAt: undefined, updatedAt: '2026-09-24T05:00:00.000Z' };
  const abandonedTwice = { ...restoredAgain, lifecycleStatus: 'abandoned', abandonedAt: '2026-09-24T06:00:00.000Z' };
  state = review.captureTaskLifecycleTransition(state, { previous: restoredAgain, next: abandonedTwice, recordedAt: abandonedTwice.abandonedAt, eventId: 'abandon-2' });
  assert.deepEqual(state.events.filter((event) => event.kind === 'task_completed').map((event) => event.id), ['complete-1', 'complete-2']);
  assert.deepEqual(state.events.filter((event) => event.kind === 'task_abandoned').map((event) => event.id), ['abandon-1', 'abandon-2']);
  assert.ok(state.events.every((event) => event.evidenceSource === 'captured_live'));
});

test('live milestone capture preserves complete-active-complete occurrences while edits remain single', () => {
  const planned = { ...goals()[0].milestones[0], status: 'planned', completedAt: undefined };
  const first = { ...planned, status: 'completed', completedAt: '2026-09-24T01:00:00.000Z' };
  let state = review.captureMilestoneLifecycleTransition(review.createDefaultReviewState(now), { goalId: 'g', previous: planned, next: first, recordedAt: first.completedAt, eventId: 'milestone-1' });
  state = review.captureMilestoneLifecycleTransition(state, { goalId: 'g', previous: first, next: { ...first, title: 'edited' }, recordedAt: '2026-09-24T02:00:00.000Z', eventId: 'milestone-edit' });
  const restored = { ...first, status: 'in_progress', completedAt: undefined };
  const second = { ...restored, status: 'completed', completedAt: '2026-09-24T03:00:00.000Z' };
  state = review.captureMilestoneLifecycleTransition(state, { goalId: 'g', previous: restored, next: second, recordedAt: second.completedAt, eventId: 'milestone-2' });
  assert.deepEqual(state.events.map((event) => event.id), ['milestone-1', 'milestone-2']);
});

test('logical event identity deduplicates legacy timestamp ids across devices without rewriting the earliest snapshot', () => {
  const legacy = { id: 'task-completed:same:2026-09-23T00:00:00.000Z', kind: 'task_completed', timestamp: '2026-09-23T00:00:00.000Z', recordedAt: '2026-09-23T01:00:00.000Z', evidenceSource: 'legacy_backfill', title: '任务完成：Original', entityTitle: 'Original', relatedTaskId: 'same' };
  const current = { ...legacy, id: 'task-completed:same', timestamp: '2026-09-24T00:00:00.000Z', recordedAt: '2026-09-24T01:00:00.000Z', title: '任务完成：Edited', entityTitle: 'Edited' };
  const merged = review.mergeReviewStates({ ...review.createDefaultReviewState(now), events: [legacy] }, { ...review.createDefaultReviewState(now), events: [current] });
  assert.equal(merged.events.length, 1); assert.equal(merged.events[0].id, legacy.id); assert.equal(merged.events[0].entityTitle, 'Original');
});

test('captured occurrence replaces only its exact legacy backfill while repeated live occurrences remain distinct', () => {
  const timestamp = '2026-09-23T00:00:00.000Z';
  const backfill = { id: 'task-completed:same', kind: 'task_completed', timestamp, recordedAt: '2026-09-24T00:00:00.000Z', evidenceSource: 'legacy_backfill', title: '任务完成：Backfill', relatedTaskId: 'same' };
  const captured = { ...backfill, id: 'capture-1', recordedAt: timestamp, evidenceSource: 'captured_live', title: '任务完成：Captured' };
  const repeated = { ...captured, id: 'capture-2', timestamp: '2026-09-24T01:00:00.000Z', recordedAt: '2026-09-24T01:00:00.000Z' };
  const merged = review.mergeReviewStates({ ...review.createDefaultReviewState(now), events: [backfill] }, { ...review.createDefaultReviewState(now), events: [captured, repeated] });
  assert.deepEqual(merged.events.map((event) => event.id), ['capture-1', 'capture-2']);
});

test('AI report records preserve response-time provenance and bind a deterministic SHA-256 input/window identity', async () => {
  const input = { window, metrics: { completedCount: 1 }, resolvedTasks: [{ id: 'x' }] };
  const fingerprint = await review.fingerprintReviewAnalysisInput(input); const identity = review.reviewWindowIdentity(window);
  assert.match(fingerprint, /^sha256-[0-9a-f]{64}$/); assert.equal(fingerprint, await review.fingerprintReviewAnalysisInput(input)); assert.notEqual(fingerprint, await review.fingerprintReviewAnalysisInput({ ...input, resolvedTasks: [{ id: 'y' }] }));
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], opsState, window, now });
  const report = { content: 'report', generatedAt: '2026-09-24T11:59:00.000Z', provider: 'deepseek', model: 'deepseek-chat', inputFingerprint: fingerprint, windowIdentity: identity };
  const record = review.createReviewRecord({ id: 'ai', window, metrics, aiReport: report, now });
  assert.deepEqual(review.normalizeReviewState({ ...review.createDefaultReviewState(now), reviews: [record] }).reviews[0].aiReport, report);
  assert.notEqual(record.aiReport.generatedAt, record.createdAt);
  assert.throws(() => review.createReviewRecord({ id: 'bad-ai', window, metrics, aiReport: { ...report, model: undefined }, now }), /REVIEW_AI_PROVENANCE_INCOMPLETE/);
});

test('review AI payload is bounded, based on immutable facts, and excludes profile data', () => {
  const state = capturedState({ tasks: Array.from({ length: 60 }, (_, index) => task(`t-${index}`, { lifecycleStatus: 'completed', completedAt: '2026-09-23T00:00:00.000Z' })) });
  const metrics = review.deriveReviewMetrics({ tasks: [], goals: [], pressureHistory: [], events: state.events, opsState, window, now });
  const input = review.buildReviewAnalysisInput({ window, metrics, tasks: [], events: state.events, opsState });
  assert.equal(input.resolvedTasks.length, 50); assert.equal(JSON.stringify(input).includes('UserProfile'), false); assert.match(review.reviewAnalysisSystemPrompt, /事实与解释/); assert.match(review.reviewAnalysisSystemPrompt, /心理健康诊断/);
});

test('REVIEW wiring uses row-level cloud persistence, real AI provenance, and an intentional pressure recalibration entry', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/ReviewPage.tsx', import.meta.url), 'utf8');
  const cloud = readFileSync(new URL('../src/lib/cloudSync.ts', import.meta.url), 'utf8');
  const client = readFileSync(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
  const ai = readFileSync(new URL('../src/services/aiClient.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20260924034628_v2_review_history.sql', import.meta.url), 'utf8');
  const rlsTest = readFileSync(new URL('../supabase/tests/review_history_rls_test.sql', import.meta.url), 'utf8');
  assert.match(app, /synchronizeReviewHistory/); assert.match(app, /saveCloudReviewState/); assert.match(app, /onRecalibrate=\{openRecalibration\}/);
  assert.match(page, /重新校准压力/); assert.match(page, /requestChatCompletionWithProvenance/); assert.match(page, /inputFingerprint/); assert.match(page, /windowIdentity/); assert.match(page, /Archive/); assert.match(page, /formatReviewDateTime/); assert.match(page, /evidenceLabels/);
  assert.doesNotMatch(page, /nowRef|toLocaleString|slice\(0,\s*10\)/);
  assert.doesNotMatch(cloud.match(/saveCloudProfile[\s\S]*$/)?.[0] ?? '', /reviewState: input\.reviewState/);
  assert.match(cloud, /review_records/); assert.match(cloud, /review_events/); assert.match(cloud, /review_archive_events/); assert.match(cloud, /review_tombstones/); assert.match(cloud, /resolution=ignore-duplicates/); assert.doesNotMatch(cloud, /supabase-schema\.sql/); assert.match(cloud, /20260924034628_v2_review_history\.sql/);
  assert.match(cloud, /loadAllReviewRows/); assert.match(cloud, /offset=\$\{offset\}/); assert.match(client, /count=exact/); assert.match(client, /Content-Range/);
  assert.match(cloud, /if \(profileData\?\.reviewState\) await saveCloudReviewState\(reviewState, session, owner\)/);
  assert.match(ai, /generatedAt: new Date\(\)\.toISOString\(\), model: response\.model, provider: response\.provider/);
  for (const table of ['review_records', 'review_events', 'review_archive_events', 'review_tombstones']) { assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`)); assert.match(migration, new RegExp(`create policy ${table}_select_own`)); }
  for (const contract of ['owner inserts own ReviewRecord', 'cross-user REVIEW select returns no rows', 'forged REVIEW user_id insert is denied', 'anonymous REVIEW select is denied', 'authenticated REVIEW update is denied', 'authenticated REVIEW delete is denied']) assert.match(rlsTest, new RegExp(contract));
});
