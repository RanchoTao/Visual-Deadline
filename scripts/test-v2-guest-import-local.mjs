#!/usr/bin/env node
/* PR G guest-import proof. This touches only the local Supabase stack and reuses PR F's apply/ledger runner. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = resolve('.'); const temp = resolve('supabase/.temp/v2-guest-import-test'); mkdirSync(temp, { recursive: true });
const run = (program, args, options = {}) => spawnSync(program, args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...options.env } });
const supabase = (args) => run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `npx --yes supabase@2.117.0 ${args}`]);
const query = (sql, name) => { const file = resolve(temp, `${name}.sql`); writeFileSync(file, sql); const result = supabase(`db query --local --output-format json --file ${relative(root, file).replaceAll('\\', '/')}`); assert.equal(result.status, 0, result.stderr || result.stdout); const start = result.stdout.indexOf('{'); return start < 0 ? [] : JSON.parse(result.stdout.slice(start)).rows; };
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const userId = (suffix) => `70000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const user = (id) => query(`insert into auth.users (id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values (${quote(id)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${quote(`${id}@example.test`)},'not-used',now(),'{}'::jsonb,'{}'::jsonb,now(),now())`, `user-${id}`);
const fixture = (id, options = {}) => { const now = '2026-09-20T00:00:00.000Z'; const goals = [{ id: 'g1', title: 'Guest goal', category: 'work', priority: 8, linkedTaskIds: ['t1', 't2'], createdAt: now, updatedAt: now }, ...(options.ambiguous ? [{ id: 'g2', title: 'Competing goal', category: 'work', priority: 7, linkedTaskIds: ['t1'], createdAt: now, updatedAt: now }] : [])]; const tasks = [{ id: 't1', title: options.changed ? 'changed' : 'Guest task', importance: 8, progress: 0, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: options.ambiguous ? ['g1', 'g2'] : ['g1'], dependencyIds: [], createdAt: now, updatedAt: now }, { id: 't2', title: 'Dependent task', importance: 7, progress: 0, activityType: 'work', lifecycleStatus: 'active', schemaVersion: 3, linkedGoalIds: ['g1'], dependencyIds: options.missingDependency ? ['missing'] : ['t1'], createdAt: now, updatedAt: now }]; return { userId: id, sourceSchemaVersion: '3', goals, tasks }; };
const writeFixture = (name, value) => { const file = resolve(temp, `${name}.json`); writeFileSync(file, JSON.stringify(value)); return file; };
const apply = (name, value, requestId, failAt) => run(process.execPath, ['scripts/v2-local-backfill.mjs', '--input', writeFixture(name, value), '--apply', '--request-id', requestId], { env: failAt ? { VD_V2_FAIL_AT: failAt } : {} });
const count = (id, table, name) => Number(query(`select count(*)::int count from public.${table} where user_id=${quote(id)}::uuid`, name)[0].count);

const reset = supabase('db reset --local'); assert.equal(reset.status, 0, reset.stderr || reset.stdout);
run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx tsc -p tests/tsconfig.life-controller.json']);
const guest = await import(`${pathToFileURL(resolve('tests/.compiled/src/domain/v2/guestImport.js')).href}?${Date.now()}`);

// A/B/C/D: authentication, existing-account, local-only, and cloud-only paths do no canonical writes without confirmation.
const first = userId(1); user(first); const source = fixture(first); assert.equal(count(first, 'v2_tasks', 'signin-alone'), 0);
const memory = new Map([['visualized-deadline.tasks', JSON.stringify(source.tasks)], ['visualized-deadline.goals', JSON.stringify(source.goals)]]); const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: (key) => memory.delete(key) };
const snapshot = guest.captureGuestImportSource(storage, '2026-09-21T00:00:00.000Z'); assert.ok(snapshot); const preview = guest.createGuestImportPreviewFromPending(snapshot, first); assert.equal(preview.plan.writesPerformed, 0); assert.equal(count(first, 'v2_tasks', 'preview-only'), 0);
const existing = userId(2); user(existing); assert.equal(count(existing, 'v2_tasks', 'existing-no-guest'), 0); // cloud-only is intentionally not a guest import path.

// E/F/G/H: confirmation, idempotency, content conflict, multiple-goal ambiguity, and missing dependency stay in PR F's ledger semantics.
let result = apply('confirmed', source, 'guest-confirmed'); assert.equal(result.status, 0, result.stderr); assert.equal(count(first, 'v2_tasks', 'confirmed'), 2);
result = apply('same-source-repeat', source, 'guest-confirmed'); assert.equal(result.status, 0, result.stderr); assert.equal(count(first, 'v2_tasks', 'repeat'), 2);
result = apply('same-id-different-content', fixture(first, { changed: true }), 'guest-confirmed'); assert.equal(result.status, 0, result.stderr); assert.equal(count(first, 'v2_tasks', 'conflict-no-duplicate'), 2);
const ambiguous = userId(3); user(ambiguous); result = apply('ambiguity-missing', fixture(ambiguous, { ambiguous: true, missingDependency: true }), 'guest-ambiguous'); assert.equal(result.status, 0, result.stderr); assert.ok(Number(query(`select count(*)::int count from public.v2_legacy_entity_refs where user_id=${quote(ambiguous)}::uuid and status='quarantined'`, 'ledger-visible')[0].count) > 0);

// I/J: interruption resumes via the same bounded request/ledger; no duplicate target rows are created.
const interrupted = userId(4); user(interrupted); result = apply('interrupted', fixture(interrupted), 'guest-resume', 'after-goal-mappings'); assert.notEqual(result.status, 0); result = apply('resumed', fixture(interrupted), 'guest-resume'); assert.equal(result.status, 0, result.stderr); assert.equal(count(interrupted, 'v2_tasks', 'resumed-count'), 2);

// K: a changed browser source invalidates the reviewed snapshot before any local executor call.
memory.set('visualized-deadline.tasks', JSON.stringify(fixture(first, { changed: true }).tasks)); assert.throws(() => guest.validatePendingGuestImportConfirmation(storage, snapshot, preview, { snapshotId: preview.snapshotId, snapshotChecksum: preview.snapshotChecksum, destinationUserId: first, clientRequestId: 'changed' }, first), /GUEST_IMPORT_SOURCE_CHANGED/); assert.equal(count(first, 'v2_tasks', 'changed-no-extra-write'), 2);

// L: a second authenticated owner has a distinct destination; source IDs do not cross ownership boundaries.
const second = userId(5); user(second); result = apply('second-owner', fixture(second), 'guest-second'); assert.equal(result.status, 0, result.stderr); assert.equal(count(second, 'v2_tasks', 'second-owner-count'), 2); assert.equal(count(first, 'v2_tasks', 'first-owner-still-two'), 2);
console.log('v2 guest import local integration passed: A-L explicit confirmation, snapshot guard, PR F ledger/resume, and owner isolation');
