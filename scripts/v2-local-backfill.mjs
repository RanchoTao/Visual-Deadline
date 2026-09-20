#!/usr/bin/env node
/*
 * Administrative PR F runner.  It is intentionally a local-only tool: there
 * is no --linked, project-ref, or arbitrary remote database escape hatch.
 * It is not imported by the browser bundle and never changes legacy rows.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const has = (name) => args.includes(name);
const PRODUCTION_REF = 'surspszkoveoqdtevprg';
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
let activeJobId;

function assertLocalOnly(value) {
  if (!value) return;
  if (value.includes(PRODUCTION_REF)) throw new Error('Refusing the audited production Supabase project. PR F is local-only.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Database URL must be a valid local URL.'); }
  if (!localHosts.has(parsed.hostname.toLowerCase())) throw new Error(`Refusing non-local database host ${parsed.hostname}.`);
}

function query(sql) {
  const sqlPath = resolve('supabase/.temp/v2-backfill-query.sql');
  mkdirSync(resolve('supabase/.temp'), { recursive: true });
  writeFileSync(sqlPath, sql, 'utf8');
  let output;
  try {
    output = execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx --yes supabase@2.117.0 db query --local --output-format json --file supabase/.temp/v2-backfill-query.sql'], { cwd: resolve('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = [error?.stdout, error?.stderr].filter(Boolean).join('\n').trim();
    throw new Error(detail || `Local Supabase query failed with exit ${error?.status ?? 'unknown'}.`);
  }
  const start = output.indexOf('{');
  if (start === -1) return [];
  return JSON.parse(output.slice(start)).rows ?? [];
}
function literal(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}
function json(value) { return `${literal(JSON.stringify(value))}::jsonb`; }
function stable(value) {
  if (value === undefined || value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}
function sha256(value) { return `sha256:${createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex')}`; }
function fail(point) { if (process.env.VD_V2_FAIL_AT === point) throw new Error(`Injected local failure at ${point}`); }

async function loadPlanner() {
  const output = resolve('tests/.compiled/src/domain/v2/backfill.js');
  execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx tsc -p tests/tsconfig.life-controller.json'], { stdio: 'inherit' });
  return import(`${pathToFileURL(output).href}?${Date.now()}`);
}
function sourceRows(userId) {
  const user = literal(userId);
  const goals = query(`select data || jsonb_build_object('id', id, 'createdAt', created_at, 'updatedAt', updated_at) as entity from public.goals where user_id = ${user} order by id`).map((row) => row.entity);
  const tasks = query(`select data || jsonb_build_object('id', id, 'createdAt', created_at, 'updatedAt', updated_at) as entity from public.tasks where user_id = ${user} order by id`).map((row) => row.entity);
  return { goals, tasks };
}
function refRows(userId) {
  return query(`select source_entity_type, source_legacy_id, canonical_target_id, source_checksum from public.v2_legacy_entity_refs where user_id = ${literal(userId)} and source_system = 'visualdeadline-v1'`);
}
function canonicalTargetRows(userId) {
  const owner = `${literal(userId)}::uuid`;
  return query(`
    select 'goal' as entity_type, id, provenance #>> '{legacy,entityId}' as legacy_id from public.v2_goals where user_id=${owner}
    union all
    select 'task' as entity_type, id, provenance #>> '{legacy,entityId}' as legacy_id from public.v2_tasks where user_id=${owner}
    union all
    select 'task_dependency' as entity_type, id, replace(provenance #>> '{legacy,entityId}', 'legacy-dependency:', '') as legacy_id from public.v2_task_dependencies where user_id=${owner}
  `).filter((row) => row.legacy_id);
}
function addCanonicalTargets(targets, userId) {
  for (const row of canonicalTargetRows(userId)) if (!targets.has(`${row.entity_type}:${row.legacy_id}`)) targets.set(`${row.entity_type}:${row.legacy_id}`, row.id);
}
function insertRefs(userId, jobId, sourceSchemaVersion, records, targets, status = 'migrated') {
  const values = records.map((record) => {
    const key = `${record.entityType}:${record.sourceLegacyId}`;
    const target = targets.get(key);
    return `(${literal(jobId)}::uuid,${literal(userId)}::uuid,'visualdeadline-v1',${literal(sourceSchemaVersion)},${literal(record.sourceDomain)},${literal(record.entityType)},${literal(record.sourceLegacyId)},${target ? literal(record.entityType) : 'null'},${target ? `${literal(target)}::uuid` : 'null'},${literal(record.sourceChecksum)},${target ? literal(sha256(record.canonical)) : 'null'},${literal(status)},1,${json(record.warnings)},'{}'::jsonb,${json(record.unresolvedReferences)},${json(status === 'migrated' ? {} : { disposition: record.disposition })},'{}'::jsonb,now(),now())`;
  });
  if (values.length) query(`insert into public.v2_legacy_entity_refs (import_job_id,user_id,source_system,source_schema_version,source_domain,source_entity_type,source_legacy_id,canonical_target_type,canonical_target_id,source_checksum,target_checksum,status,attempt_count,warnings,error_detail,unresolved_references,quarantine_metadata,rollback_metadata,attempted_at,completed_at) values ${values.join(',')} on conflict (user_id,source_system,source_domain,source_entity_type,source_legacy_id) do nothing`);
}
function insertGoals(userId, records) {
  if (!records.length) return [];
  const values = records.map(({ canonical }) => `(${literal(userId)}::uuid,null,${literal(canonical.title)},${canonical.description ? literal(canonical.description) : 'null'},${literal(canonical.status)},${canonical.importance},${canonical.horizon ? literal(canonical.horizon) : 'null'},${canonical.successCriteria ? literal(canonical.successCriteria) : 'null'},${canonical.startAfter ? literal(canonical.startAfter) : 'null'}::timestamptz,${canonical.targetDate ? literal(canonical.targetDate) : 'null'}::timestamptz,${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz,${literal(canonical.updatedAt)}::timestamptz,${canonical.archivedAt ? literal(canonical.archivedAt) : 'null'}::timestamptz)`).join(',');
  return query(`insert into public.v2_goals (user_id,parent_goal_id,title,description,status,importance,horizon,success_criteria,start_after,target_at,provenance,version,created_at,updated_at,archived_at) values ${values} returning id, provenance #>> '{legacy,entityId}' as legacy_id`);
}
function linkGoalParents(userId, records, goalIds) {
  for (const record of records) {
    const parent = record.canonical.parentGoalId ? goalIds.get(`goal:${record.canonical.parentGoalId}`) : undefined;
    const child = goalIds.get(`goal:${record.sourceLegacyId}`);
    if (parent && child) query(`update public.v2_goals set parent_goal_id=${literal(parent)}::uuid where user_id=${literal(userId)}::uuid and id=${literal(child)}::uuid`);
  }
}
function insertTasks(userId, records, goalIds, taskIds) {
  if (!records.length) return [];
  const values = records.map(({ canonical }) => {
    const goalId = canonical.goalId ? goalIds.get(`goal:${canonical.goalId}`) : undefined;
    const parentId = canonical.parentTaskId ? taskIds.get(`task:${canonical.parentTaskId}`) : undefined;
    return `(${literal(userId)}::uuid,${goalId ? `${literal(goalId)}::uuid` : 'null'},null,${parentId ? `${literal(parentId)}::uuid` : 'null'},${literal(canonical.title)},${canonical.description ? literal(canonical.description) : 'null'},${literal(canonical.status)},${canonical.importance},${canonical.progress},${canonical.actionable ? 'true' : 'false'},${canonical.deadline ? `${literal(canonical.deadline)}::timestamptz` : 'null'},${canonical.startAfter ? `${literal(canonical.startAfter)}::timestamptz` : 'null'},${canonical.estimatedMinutes ?? 'null'},${canonical.completedMinutes ?? 'null'},${canonical.nextAction ? literal(canonical.nextAction) : 'null'},${canonical.costMinor ?? 'null'},${canonical.locked ? 'true' : 'false'},${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz,${literal(canonical.updatedAt)}::timestamptz,${canonical.completedAt ? `${literal(canonical.completedAt)}::timestamptz` : 'null'},${canonical.archivedAt ? `${literal(canonical.archivedAt)}::timestamptz` : 'null'})`;
  }).join(',');
  return query(`insert into public.v2_tasks (user_id,goal_id,milestone_id,parent_task_id,title,description,status,importance,progress,actionable,deadline_at,start_after,estimated_minutes,completed_minutes,next_action,cost_minor,locked,provenance,version,created_at,updated_at,completed_at,archived_at) values ${values} returning id, provenance #>> '{legacy,entityId}' as legacy_id`);
}
function insertDependencies(userId, records, taskIds) {
  const values = records.map(({ canonical }) => {
    const predecessor = taskIds.get(`task:${canonical.predecessorTaskId}`);
    const successor = taskIds.get(`task:${canonical.successorTaskId}`);
    if (!predecessor || !successor) return null;
    return `(${literal(userId)}::uuid,${literal(predecessor)}::uuid,${literal(successor)}::uuid,'blocks',${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz)`;
  }).filter(Boolean);
  if (!values.length) return [];
  return query(`insert into public.v2_task_dependencies (user_id,predecessor_task_id,successor_task_id,dependency_type,provenance,version,created_at) values ${values.join(',')} on conflict (user_id,predecessor_task_id,successor_task_id,dependency_type) do nothing returning id, provenance #>> '{legacy,entityId}' as legacy_id`);
}

async function main() {
  const startedAt = Date.now();
  assertLocalOnly(option('--database-url'));
  if (has('--linked') || has('--project-ref') || args.some((value) => value.includes(PRODUCTION_REF))) throw new Error('Remote/linked Supabase flags are forbidden by the PR F local-only runner.');
  const fixturePath = option('--input');
  const requestedUserId = option('--user-id');
  if (!fixturePath && !requestedUserId) throw new Error('Provide --input <fixture.json> or --user-id <local auth UUID>.');
  const fixture = fixturePath ? JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) : { userId: requestedUserId, ...sourceRows(requestedUserId) };
  if (!fixture.userId || !Array.isArray(fixture.goals) || !Array.isArray(fixture.tasks)) throw new Error('Fixture must contain userId, goals[], and tasks[].');
  const { planV2Backfill } = await loadPlanner();
  const plan = planV2Backfill({ userId: fixture.userId, sourceSystem: 'visualdeadline-v1', sourceSchemaVersion: fixture.sourceSchemaVersion ?? '3', goals: fixture.goals, tasks: fixture.tasks, relationshipEvidence: fixture.relationshipEvidence, checksum: sha256 });
  const report = { mode: has('--apply') ? 'apply-local' : 'dry-run', sourceCounts: plan.sourceCounts, plannedCounts: plan.plannedCounts, summary: { sources: plan.records.length, planned: plan.records.filter((record) => record.disposition === 'CREATE').length, created: 0, skipped: 0, warnings: plan.warnings.length, unresolved: plan.unresolvedRelationships.length, elapsedMs: Date.now() - startedAt }, records: plan.records.map((record) => ({ entityType: record.entityType, sourceLegacyId: record.sourceLegacyId, sourceChecksum: record.sourceChecksum, disposition: record.disposition, warnings: record.warnings, unresolvedReferences: record.unresolvedReferences })), warnings: plan.warnings, unresolvedRelationships: plan.unresolvedRelationships, planChecksum: plan.checksum, writesPerformed: 0 };
  if (!has('--apply')) return console.log(JSON.stringify(report, null, 2));

  fail('before-write');
  const requestId = option('--request-id') ?? `v2-backfill:${plan.checksum}`;
  const jobRows = query(`insert into public.v2_import_jobs (user_id,source_system,source_schema_version,client_request_id,status,attempt_count,record_counts,warnings,errors,rollback_metadata,attempted_at) values (${literal(fixture.userId)}::uuid,'visualdeadline-v1',${literal(fixture.sourceSchemaVersion ?? '3')},${literal(requestId)},'applying',1,${json(plan.sourceCounts)},${json(plan.warnings)},'[]'::jsonb,${json({ planChecksum: plan.checksum, localOnly: true })},now()) on conflict (user_id,source_system,client_request_id) do update set status='applying',attempt_count=public.v2_import_jobs.attempt_count+1,attempted_at=now() returning id`);
  const jobId = jobRows[0]?.id ?? query(`select id from public.v2_import_jobs where user_id=${literal(fixture.userId)}::uuid and source_system='visualdeadline-v1' and client_request_id=${literal(requestId)}`)[0]?.id;
  if (!jobId) throw new Error('Local import job could not be resolved after creation.');
  activeJobId = jobId;
  const existing = new Map(refRows(fixture.userId).map((row) => [`${row.source_entity_type}:${row.source_legacy_id}`, row]));
  const changed = plan.records.filter((record) => existing.has(`${record.entityType}:${record.sourceLegacyId}`) && existing.get(`${record.entityType}:${record.sourceLegacyId}`).source_checksum !== record.sourceChecksum);
  for (const record of changed) query(`update public.v2_legacy_entity_refs set warnings = warnings || ${json([{ code: 'SOURCE_CHANGED_AFTER_IMPORT', message: 'Source changed after import; canonical row was not overwritten.' }])} where user_id=${literal(fixture.userId)}::uuid and source_system='visualdeadline-v1' and source_entity_type=${literal(record.entityType)} and source_legacy_id=${literal(record.sourceLegacyId)}`);
  const fresh = plan.records.filter((record) => !existing.has(`${record.entityType}:${record.sourceLegacyId}`));
  const targets = new Map([...existing.entries()].filter(([, row]) => row.canonical_target_id).map(([key, row]) => [key, row.canonical_target_id]));
  addCanonicalTargets(targets, fixture.userId);
  const goals = fresh.filter((record) => record.entityType === 'goal' && record.disposition === 'CREATE' && !targets.has(`goal:${record.sourceLegacyId}`));
  const goalRows = insertGoals(fixture.userId, goals);
  fail('after-first-goal-batch');
  for (const row of goalRows) targets.set(`goal:${row.legacy_id}`, row.id);
  addCanonicalTargets(targets, fixture.userId);
  insertRefs(fixture.userId, jobId, fixture.sourceSchemaVersion ?? '3', fresh.filter((record) => record.entityType === 'goal' && record.disposition === 'CREATE'), targets);
  linkGoalParents(fixture.userId, fresh.filter((record) => record.entityType === 'goal' && record.disposition === 'CREATE'), targets);
  fail('after-goal-mappings');
  const tasks = fresh.filter((record) => record.entityType === 'task' && record.disposition !== 'QUARANTINE' && !targets.has(`task:${record.sourceLegacyId}`));
  const taskRows = insertTasks(fixture.userId, tasks, targets, targets);
  fail('after-first-task-batch');
  for (const row of taskRows) targets.set(`task:${row.legacy_id}`, row.id);
  addCanonicalTargets(targets, fixture.userId);
  insertRefs(fixture.userId, jobId, fixture.sourceSchemaVersion ?? '3', fresh.filter((record) => record.entityType === 'task'), targets);
  fail('after-task-mappings');
  const dependencies = fresh.filter((record) => record.entityType === 'task_dependency' && record.disposition === 'CREATE' && !targets.has(`task_dependency:${record.sourceLegacyId}`));
  const dependencyRows = insertDependencies(fixture.userId, dependencies, targets);
  fail('during-dependency-creation');
  for (const row of dependencyRows) targets.set(`task_dependency:${row.legacy_id.replace('legacy-dependency:', '')}`, row.id);
  addCanonicalTargets(targets, fixture.userId);
  insertRefs(fixture.userId, jobId, fixture.sourceSchemaVersion ?? '3', fresh.filter((record) => record.entityType === 'task_dependency' && record.disposition === 'CREATE'), targets);
  const unresolved = fresh.filter((record) => record.disposition !== 'CREATE');
  insertRefs(fixture.userId, jobId, fixture.sourceSchemaVersion ?? '3', unresolved, targets, 'quarantined');
  fail('before-final-reconciliation');
  const finalCounts = query(`select (select count(*) from public.v2_goals where user_id=${literal(fixture.userId)}::uuid) as goals, (select count(*) from public.v2_tasks where user_id=${literal(fixture.userId)}::uuid) as tasks, (select count(*) from public.v2_task_dependencies where user_id=${literal(fixture.userId)}::uuid) as dependencies`)[0];
  query(`update public.v2_import_jobs set status='completed',completed_at=now(),record_counts=${json({ ...plan.sourceCounts, ...finalCounts, created: fresh.length, skipped: plan.records.length - fresh.length, sourceChanged: changed.length, warnings: plan.warnings.length, unresolved: plan.unresolvedRelationships.length })} where id=${literal(jobId)}::uuid`);
  console.log(JSON.stringify({ ...report, summary: { ...report.summary, created: goals.length + tasks.length + dependencies.length, skipped: plan.records.length - fresh.length, elapsedMs: Date.now() - startedAt }, writesPerformed: goals.length + tasks.length + dependencies.length, jobId, reconciliation: finalCounts, sourceChanged: changed.length }, null, 2));
}

main().catch((error) => {
  if (activeJobId) {
    try { query(`update public.v2_import_jobs set status='failed', errors=errors || ${json([{ code: 'LOCAL_APPLY_FAILED', message: error instanceof Error ? error.message : String(error) }])} where id=${literal(activeJobId)}::uuid`); } catch { /* preserve the original failure */ }
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
