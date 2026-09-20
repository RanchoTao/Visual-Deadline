#!/usr/bin/env node
/* Local-only administrative backfill. It has no remote, linked, or browser execution path. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2); const option = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined; const has = (name) => args.includes(name);
const PRODUCTION_REF = 'surspszkoveoqdtevprg'; const BATCH_SIZE = 50; const localHosts = new Set(['127.0.0.1', 'localhost', '::1']); let activeJobId;
const literal = (value) => value === null || value === undefined ? 'null' : typeof value === 'boolean' ? (value ? 'true' : 'false') : typeof value === 'number' ? (Number.isFinite(value) ? String(value) : 'null') : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => `${literal(JSON.stringify(value))}::jsonb`;
const stable = (value) => value === undefined || value === null || typeof value !== 'object' ? JSON.stringify(value ?? null) : Array.isArray(value) ? `[${value.map(stable).join(',')}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const sha256 = (value) => `sha256:${createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex')}`;
const chunks = (items, size = BATCH_SIZE) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, index * size + size));
const fail = (point) => { if (process.env.VD_V2_FAIL_AT === point) throw new Error(`Injected local failure at ${point}`); };

function assertLocalOnly(value) {
  if (!value) return;
  if (value.includes(PRODUCTION_REF)) throw new Error('Refusing the audited production Supabase project. PR F is local-only.');
  let url; try { url = new URL(value); } catch { throw new Error('Database URL must be a valid local URL.'); }
  if (!localHosts.has(url.hostname.toLowerCase())) throw new Error(`Refusing non-local database host ${url.hostname}.`);
}
function query(sql) {
  mkdirSync(resolve('supabase/.temp'), { recursive: true }); writeFileSync(resolve('supabase/.temp/v2-backfill-query.sql'), sql, 'utf8');
  let output; try { output = execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx --yes supabase@2.117.0 db query --local --output-format json --file supabase/.temp/v2-backfill-query.sql'], { cwd: resolve('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (error) { throw new Error([error?.stdout, error?.stderr].filter(Boolean).join('\n').trim() || `Local Supabase query failed with exit ${error?.status ?? 'unknown'}.`); }
  const index = output.indexOf('{'); return index < 0 ? [] : JSON.parse(output.slice(index)).rows ?? [];
}
async function loadPlanner() {
  const output = resolve('tests/.compiled/src/domain/v2/backfill.js'); execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx tsc -p tests/tsconfig.life-controller.json'], { stdio: 'inherit' });
  return import(`${pathToFileURL(output).href}?${Date.now()}`);
}
function sourceRows(userId) {
  const user = literal(userId);
  return {
    goals: query(`select data || jsonb_build_object('id', id, 'createdAt', created_at, 'updatedAt', updated_at) entity from public.goals where user_id=${user} order by id`).map((row) => row.entity),
    tasks: query(`select data || jsonb_build_object('id', id, 'createdAt', created_at, 'updatedAt', updated_at) entity from public.tasks where user_id=${user} order by id`).map((row) => row.entity),
  };
}
function refs(userId) { return query(`select source_entity_type,source_legacy_id,canonical_target_type,canonical_target_id,source_checksum from public.v2_legacy_entity_refs where user_id=${literal(userId)}::uuid and source_system='visualdeadline-v1'`); }
function provenanceRows(userId) {
  const owner = `${literal(userId)}::uuid`; const provenance = (kind, id = "provenance #>> '{legacy,entityId}'") => `provenance #>> '{legacy,system}'='visualdeadline-v1' and provenance #>> '{legacy,entityKind}'='${kind}' and ${id} is not null`;
  return query(`select 'goal' entity_type,id,provenance #>> '{legacy,entityId}' legacy_id from public.v2_goals where user_id=${owner} and ${provenance('goal')}
    union all select 'task',id,provenance #>> '{legacy,entityId}' from public.v2_tasks where user_id=${owner} and ${provenance('task')}
    union all select 'task_dependency',id,replace(provenance #>> '{legacy,entityId}','legacy-dependency:','') from public.v2_task_dependencies where user_id=${owner} and ${provenance('task_dependency')}`);
}
function addProvenanceTargets(targets, userId) {
  for (const row of provenanceRows(userId)) {
    const key = `${row.entity_type}:${row.legacy_id}`; const previous = targets.get(key);
    if (previous && previous !== row.id) throw new Error(`DUPLICATE_CANONICAL_PROVENANCE:${key}`);
    targets.set(key, row.id);
  }
}
function insertGoalRows(userId, records) {
  let created = 0;
  for (const batch of chunks(records)) { if (!batch.length) continue; const values = batch.map(({ canonical }) => `(${literal(userId)}::uuid,null,${literal(canonical.title)},${canonical.description ? literal(canonical.description) : 'null'},${literal(canonical.status)},${canonical.importance},${canonical.horizon ? literal(canonical.horizon) : 'null'},${canonical.successCriteria ? literal(canonical.successCriteria) : 'null'},${canonical.startAfter ? `${literal(canonical.startAfter)}::timestamptz` : 'null'},${canonical.targetDate ? `${literal(canonical.targetDate)}::timestamptz` : 'null'},${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz,${literal(canonical.updatedAt)}::timestamptz,${canonical.archivedAt ? `${literal(canonical.archivedAt)}::timestamptz` : 'null'})`).join(','); query(`insert into public.v2_goals (user_id,parent_goal_id,title,description,status,importance,horizon,success_criteria,start_after,target_at,provenance,version,created_at,updated_at,archived_at) values ${values}`); created += batch.length; fail('after-first-goal-batch'); }
  return created;
}
function insertTaskRows(userId, records, targets) {
  let created = 0;
  for (const batch of chunks(records)) { if (!batch.length) continue; const values = batch.map(({ canonical }) => { const goal = canonical.goalId ? targets.get(`goal:${canonical.goalId}`) : undefined; return `(${literal(userId)}::uuid,${goal ? `${literal(goal)}::uuid` : 'null'},null,null,${literal(canonical.title)},${canonical.description ? literal(canonical.description) : 'null'},${literal(canonical.status)},${canonical.importance},${canonical.progress},${canonical.actionable ? 'true' : 'false'},${canonical.deadline ? `${literal(canonical.deadline)}::timestamptz` : 'null'},${canonical.startAfter ? `${literal(canonical.startAfter)}::timestamptz` : 'null'},${canonical.estimatedMinutes ?? 'null'},${canonical.completedMinutes ?? 'null'},${canonical.nextAction ? literal(canonical.nextAction) : 'null'},${canonical.costMinor ?? 'null'},${canonical.locked ? 'true' : 'false'},${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz,${literal(canonical.updatedAt)}::timestamptz,${canonical.completedAt ? `${literal(canonical.completedAt)}::timestamptz` : 'null'},${canonical.archivedAt ? `${literal(canonical.archivedAt)}::timestamptz` : 'null'})`; }).join(','); query(`insert into public.v2_tasks (user_id,goal_id,milestone_id,parent_task_id,title,description,status,importance,progress,actionable,deadline_at,start_after,estimated_minutes,completed_minutes,next_action,cost_minor,locked,provenance,version,created_at,updated_at,completed_at,archived_at) values ${values}`); created += batch.length; fail('after-first-task-batch'); }
  return created;
}
function insertDependencyRows(userId, records, targets) {
  let created = 0;
  for (const batch of chunks(records)) { const values = batch.map(({ canonical }) => { const predecessor = targets.get(`task:${canonical.predecessorTaskId}`); const successor = targets.get(`task:${canonical.successorTaskId}`); if (!predecessor || !successor) throw new Error(`DEPENDENCY_ENDPOINT_UNRESOLVED:${canonical.predecessorTaskId}->${canonical.successorTaskId}`); return `(${literal(userId)}::uuid,${literal(predecessor)}::uuid,${literal(successor)}::uuid,'blocks',${json(canonical.provenance)},${canonical.version},${literal(canonical.createdAt)}::timestamptz)`; }).join(','); if (values) { query(`insert into public.v2_task_dependencies (user_id,predecessor_task_id,successor_task_id,dependency_type,provenance,version,created_at) values ${values} on conflict (user_id,predecessor_task_id,successor_task_id,dependency_type) do nothing`); created += batch.length; fail('during-dependency-creation'); } }
  return created;
}
function linkParents(userId, records, targets, kind) {
  const column = kind === 'goal' ? 'parent_goal_id' : 'parent_task_id'; const table = kind === 'goal' ? 'v2_goals' : 'v2_tasks'; const key = kind === 'goal' ? 'goal' : 'task'; const sourceField = kind === 'goal' ? 'parentGoalId' : 'parentTaskId';
  for (const record of records) { const parentSource = record.canonical?.[sourceField]; if (!parentSource) continue; const child = targets.get(`${key}:${record.sourceLegacyId}`); const parent = targets.get(`${key}:${parentSource}`); if (!child || !parent) throw new Error(`PARENT_${kind.toUpperCase()}_ENDPOINT_UNRESOLVED:${record.sourceLegacyId}`); query(`update public.${table} set ${column}=${literal(parent)}::uuid where user_id=${literal(userId)}::uuid and id=${literal(child)}::uuid`); const verified = query(`select ${column}::text value from public.${table} where user_id=${literal(userId)}::uuid and id=${literal(child)}::uuid`)[0]?.value; if (verified !== parent) throw new Error(`PARENT_${kind.toUpperCase()}_LINK_RECONCILIATION_FAILED:${record.sourceLegacyId}`); }
}
function insertRefs(userId, jobId, version, records, targets) {
  for (const batch of chunks(records)) { const values = batch.map((record) => { const target = record.canonical ? targets.get(`${record.entityType}:${record.sourceLegacyId}`) : undefined; const state = target ? 'mapped' : 'quarantined'; return `(${literal(jobId)}::uuid,${literal(userId)}::uuid,'visualdeadline-v1',${literal(version)},${literal(record.sourceDomain)},${literal(record.entityType)},${literal(record.sourceLegacyId)},${target ? literal(record.entityType) : 'null'},${target ? `${literal(target)}::uuid` : 'null'},${literal(record.sourceChecksum)},null,${literal(state)},1,${json(record.warnings)},'{}'::jsonb,${json(record.unresolvedReferences)},${json(target ? {} : { disposition: record.disposition })},'{}'::jsonb,now(),null)`; }).join(','); if (values) query(`insert into public.v2_legacy_entity_refs (import_job_id,user_id,source_system,source_schema_version,source_domain,source_entity_type,source_legacy_id,canonical_target_type,canonical_target_id,source_checksum,target_checksum,status,attempt_count,warnings,error_detail,unresolved_references,quarantine_metadata,rollback_metadata,attempted_at,completed_at) values ${values} on conflict (user_id,source_system,source_domain,source_entity_type,source_legacy_id) do nothing`); }
}
const iso = (value) => value ? new Date(value).toISOString() : null;
function actualRows(userId) {
  const owner = `${literal(userId)}::uuid`; const scope = (kind) => `user_id=${owner} and provenance #>> '{legacy,system}'='visualdeadline-v1' and provenance #>> '{legacy,entityKind}'='${kind}'`;
  return {
    goal: query(`select id::text,user_id::text,status,importance,start_after,target_at,parent_goal_id::text,provenance from public.v2_goals where ${scope('goal')}`),
    task: query(`select id::text,user_id::text,status,importance,progress,deadline_at,start_after,goal_id::text,parent_task_id::text,provenance from public.v2_tasks where ${scope('task')}`),
    task_dependency: query(`select id::text,user_id::text,predecessor_task_id::text,successor_task_id::text,dependency_type,provenance from public.v2_task_dependencies where ${scope('task_dependency')}`),
  };
}
function expectedPayload(record) {
  const legacy = { system: 'visualdeadline-v1', entityKind: record.entityType, entityId: record.entityType === 'task_dependency' ? `legacy-dependency:${record.sourceLegacyId}` : record.sourceLegacyId };
  if (record.entityType === 'goal') { const value = record.canonical; return { type: 'goal', userId: value.userId, status: value.status, importance: value.importance, startAfter: iso(value.startAfter), targetDate: iso(value.targetDate), parent: value.parentGoalId ?? null, legacy }; }
  if (record.entityType === 'task') { const value = record.canonical; return { type: 'task', userId: value.userId, status: value.status, importance: value.importance, progress: value.progress, deadline: iso(value.deadline), startAfter: iso(value.startAfter), goal: value.goalId ?? null, parent: value.parentTaskId ?? null, legacy }; }
  const value = record.canonical; return { type: 'task_dependency', userId: value.userId, predecessor: value.predecessorTaskId, successor: value.successorTaskId, dependencyType: value.type, legacy };
}
function reconcile(userId, plan, targets, sourceChangedKeys = new Set()) {
  const rows = actualRows(userId); const actualRefs = new Map(refs(userId).map((row) => [`${row.source_entity_type}:${row.source_legacy_id}`, row])); const byId = Object.fromEntries(Object.entries(rows).map(([type, values]) => [type, new Map(values.map((row) => [row.id, row]))])); const reverse = new Map([...targets.entries()].map(([key, value]) => [value, key])); const errors = []; const actualChecksums = new Map(); const expectedRecords = plan.records;
  if (expectedRecords.some((record) => !actualRefs.has(`${record.entityType}:${record.sourceLegacyId}`))) errors.push('MAPPING_COUNT_OR_SOURCE_MISMATCH');
  const mappedTargets = new Set();
  for (const record of plan.records.filter((item) => item.canonical && !sourceChangedKeys.has(`${item.entityType}:${item.sourceLegacyId}`))) {
    const key = `${record.entityType}:${record.sourceLegacyId}`; const ref = actualRefs.get(key); const target = targets.get(key); if (!ref || ref.canonical_target_type !== record.entityType || ref.canonical_target_id !== target) { errors.push(`MAPPING_MISMATCH:${key}`); continue; } if (mappedTargets.has(target)) { errors.push(`MAPPING_NOT_ONE_TO_ONE:${key}`); continue; } mappedTargets.add(target); const row = target ? byId[record.entityType].get(target) : undefined; if (!row) { errors.push(`TARGET_MISSING:${record.entityType}:${record.sourceLegacyId}`); continue; }
    const legacy = row.provenance?.legacy ?? {}; let actual;
    if (record.entityType === 'goal') actual = { type: 'goal', userId: row.user_id, status: row.status, importance: Number(row.importance), startAfter: iso(row.start_after), targetDate: iso(row.target_at), parent: row.parent_goal_id ? reverse.get(row.parent_goal_id)?.replace('goal:', '') ?? null : null, legacy: { system: legacy.system, entityKind: legacy.entityKind, entityId: legacy.entityId } };
    else if (record.entityType === 'task') actual = { type: 'task', userId: row.user_id, status: row.status, importance: Number(row.importance), progress: Number(row.progress), deadline: iso(row.deadline_at), startAfter: iso(row.start_after), goal: row.goal_id ? reverse.get(row.goal_id)?.replace('goal:', '') ?? null : null, parent: row.parent_task_id ? reverse.get(row.parent_task_id)?.replace('task:', '') ?? null : null, legacy: { system: legacy.system, entityKind: legacy.entityKind, entityId: legacy.entityId } };
    else actual = { type: 'task_dependency', userId: row.user_id, predecessor: reverse.get(row.predecessor_task_id)?.replace('task:', '') ?? null, successor: reverse.get(row.successor_task_id)?.replace('task:', '') ?? null, dependencyType: row.dependency_type, legacy: { system: legacy.system, entityKind: legacy.entityKind, entityId: legacy.entityId } };
    if (stable(expectedPayload(record)) !== stable(actual)) errors.push(`RECONCILIATION_MISMATCH:${record.entityType}:${record.sourceLegacyId}`); else actualChecksums.set(`${record.entityType}:${record.sourceLegacyId}`, sha256(actual));
  }
  if (errors.length) throw new Error([...new Set(errors)].sort().join(','));
  for (const batch of chunks([...actualChecksums])) { const values = batch.map(([key, targetChecksum]) => { const [entityType, ...rest] = key.split(':'); return `(${literal(entityType)},${literal(rest.join(':'))},${literal(targetChecksum)})`; }).join(','); query(`update public.v2_legacy_entity_refs ref set target_checksum=updates.target_checksum,status='migrated',completed_at=now() from (values ${values}) as updates(source_entity_type,source_legacy_id,target_checksum) where ref.user_id=${literal(userId)}::uuid and ref.source_system='visualdeadline-v1' and ref.source_entity_type=updates.source_entity_type and ref.source_legacy_id=updates.source_legacy_id`); }
  return actualChecksums;
}

async function main() {
  const startedAt = Date.now(); assertLocalOnly(option('--database-url')); if (has('--linked') || has('--project-ref') || args.some((value) => value.includes(PRODUCTION_REF))) throw new Error('Remote/linked Supabase flags are forbidden by the PR F local-only runner.');
  const fixturePath = option('--input'); const requestedUserId = option('--user-id'); if (!fixturePath && !requestedUserId) throw new Error('Provide --input <fixture.json> or --user-id <local auth UUID>.');
  const fixture = fixturePath ? JSON.parse(readFileSync(resolve(fixturePath), 'utf8')) : { userId: requestedUserId, ...sourceRows(requestedUserId) }; if (!fixture.userId || !Array.isArray(fixture.goals) || !Array.isArray(fixture.tasks)) throw new Error('Fixture must contain userId, goals[], and tasks[].');
  const { planV2Backfill } = await loadPlanner(); const plan = planV2Backfill({ userId: fixture.userId, sourceSystem: 'visualdeadline-v1', sourceSchemaVersion: fixture.sourceSchemaVersion ?? '3', goals: fixture.goals, tasks: fixture.tasks, relationshipEvidence: fixture.relationshipEvidence, checksum: sha256 });
  const baseReport = { mode: has('--apply') ? 'apply-local' : 'dry-run', sourceCounts: plan.sourceCounts, plannedCounts: plan.plannedCounts, records: plan.records.map((item) => ({ entityType: item.entityType, sourceLegacyId: item.sourceLegacyId, sourceChecksum: item.sourceChecksum, disposition: item.disposition, warnings: item.warnings, unresolvedReferences: item.unresolvedReferences })), warnings: plan.warnings, unresolvedRelationships: plan.unresolvedRelationships, planChecksum: plan.checksum, writesPerformed: 0 };
  if (!has('--apply')) return console.log(JSON.stringify({ ...baseReport, summary: { sources: plan.records.length, planned: plan.records.filter((item) => item.canonical).length, created: 0, skipped: 0, warnings: plan.warnings.length, unresolved: plan.unresolvedRelationships.length, elapsedMs: Date.now() - startedAt } }, null, 2));
  fail('before-write'); const requestId = option('--request-id') ?? `v2-backfill:${plan.checksum}`;
  const job = query(`insert into public.v2_import_jobs (user_id,source_system,source_schema_version,client_request_id,status,attempt_count,record_counts,warnings,errors,rollback_metadata,attempted_at) values (${literal(fixture.userId)}::uuid,'visualdeadline-v1',${literal(fixture.sourceSchemaVersion ?? '3')},${literal(requestId)},'applying',1,${json(plan.sourceCounts)},${json(plan.warnings)},'[]'::jsonb,${json({ planChecksum: plan.checksum, localOnly: true, batchSize: BATCH_SIZE })},now()) on conflict (user_id,source_system,client_request_id) do update set status='applying',attempt_count=public.v2_import_jobs.attempt_count+1,attempted_at=now() returning id`)[0]?.id ?? query(`select id from public.v2_import_jobs where user_id=${literal(fixture.userId)}::uuid and source_system='visualdeadline-v1' and client_request_id=${literal(requestId)}`)[0]?.id;
  if (!job) throw new Error('Local import job could not be resolved after creation.'); activeJobId = job;
  const existing = new Map(refs(fixture.userId).map((row) => [`${row.source_entity_type}:${row.source_legacy_id}`, row])); const targets = new Map([...existing].filter(([, row]) => row.canonical_target_id).map(([key, row]) => [key, row.canonical_target_id])); addProvenanceTargets(targets, fixture.userId);
  const changed = plan.records.filter((item) => existing.has(`${item.entityType}:${item.sourceLegacyId}`) && existing.get(`${item.entityType}:${item.sourceLegacyId}`).source_checksum !== item.sourceChecksum); for (const item of changed) query(`update public.v2_legacy_entity_refs set warnings=warnings || ${json([{ code: 'SOURCE_CHANGED_AFTER_IMPORT', message: 'Source changed after import; canonical row was not overwritten.' }])} where user_id=${literal(fixture.userId)}::uuid and source_system='visualdeadline-v1' and source_entity_type=${literal(item.entityType)} and source_legacy_id=${literal(item.sourceLegacyId)}`);
  const missingRefs = plan.records.filter((item) => !existing.has(`${item.entityType}:${item.sourceLegacyId}`));
  const goals = missingRefs.filter((item) => item.entityType === 'goal' && item.canonical && !targets.has(`goal:${item.sourceLegacyId}`)); const createdGoals = insertGoalRows(fixture.userId, goals); addProvenanceTargets(targets, fixture.userId); insertRefs(fixture.userId, job, fixture.sourceSchemaVersion ?? '3', missingRefs.filter((item) => item.entityType === 'goal'), targets); linkParents(fixture.userId, missingRefs.filter((item) => item.entityType === 'goal'), targets, 'goal'); fail('after-goal-mappings');
  const tasks = missingRefs.filter((item) => item.entityType === 'task' && item.canonical && !targets.has(`task:${item.sourceLegacyId}`)); const createdTasks = insertTaskRows(fixture.userId, tasks, targets); addProvenanceTargets(targets, fixture.userId); linkParents(fixture.userId, missingRefs.filter((item) => item.entityType === 'task'), targets, 'task'); insertRefs(fixture.userId, job, fixture.sourceSchemaVersion ?? '3', missingRefs.filter((item) => item.entityType === 'task'), targets); fail('after-task-mappings');
  const dependencies = missingRefs.filter((item) => item.entityType === 'task_dependency' && item.canonical && !targets.has(`task_dependency:${item.sourceLegacyId}`)); const createdDependencies = insertDependencyRows(fixture.userId, dependencies, targets); addProvenanceTargets(targets, fixture.userId); insertRefs(fixture.userId, job, fixture.sourceSchemaVersion ?? '3', missingRefs.filter((item) => item.entityType === 'task_dependency'), targets); const unresolved = missingRefs.filter((item) => !item.canonical); insertRefs(fixture.userId, job, fixture.sourceSchemaVersion ?? '3', unresolved, targets); fail('before-final-reconciliation');
  const checksums = reconcile(fixture.userId, plan, targets, new Set(changed.map((item) => `${item.entityType}:${item.sourceLegacyId}`))); const created = createdGoals + createdTasks + createdDependencies; query(`update public.v2_import_jobs set status='completed',completed_at=now(),record_counts=${json({ ...plan.sourceCounts, created, skipped: plan.records.length - missingRefs.length, sourceChanged: changed.length, warnings: plan.warnings.length, unresolved: plan.unresolvedRelationships.length, reconciled: checksums.size })} where id=${literal(job)}::uuid`);
  console.log(JSON.stringify({ ...baseReport, writesPerformed: created, jobId: job, sourceChanged: changed.length, summary: { sources: plan.records.length, planned: plan.records.filter((item) => item.canonical).length, created, skipped: plan.records.length - missingRefs.length, warnings: plan.warnings.length, unresolved: plan.unresolvedRelationships.length, elapsedMs: Date.now() - startedAt } }, null, 2));
}
main().catch((error) => { if (activeJobId) try { query(`update public.v2_import_jobs set status='failed',errors=errors || ${json([{ code: String(error?.message ?? 'LOCAL_APPLY_FAILED').split(':')[0], message: 'Local backfill failed; inspect the local ledger for deterministic details.' }])} where id=${literal(activeJobId)}::uuid`); } catch {} console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
