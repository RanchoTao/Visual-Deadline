import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationPath = fileURLToPath(migrationDirectory);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql') && (name.includes('v2_beta_') || name.includes('legacy_core_additive_baseline')))
  .sort();

if (migrationFiles.length !== 4) throw new Error(`Expected 4 PR E migrations, found ${migrationFiles.length}: ${migrationFiles.join(', ')}`);

const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');
const combined = migrationFiles.map((name) => stripComments(readFileSync(join(migrationPath, name), 'utf8'))).join('\n').toLowerCase();

const forbidden = [
  [/\bdrop\s+table\b/, 'DROP TABLE'],
  [/\bdrop\s+column\b/, 'DROP COLUMN'],
  [/\btruncate\b/, 'TRUNCATE'],
  [/\bdelete\s+from\b/, 'DELETE FROM'],
  [/\bupdate\s+public\.(?:profiles|tasks|goals|pressure_logs)\b/, 'legacy row UPDATE'],
  [/\bupdate\s+public\.intake_messages\b/, 'intake history UPDATE/backfill'],
  [/\balter\s+table\s+public\.(?:tasks|goals|pressure_logs)\s+(?:alter|drop|rename)\b/, 'incompatible legacy ALTER'],
];

for (const [pattern, label] of forbidden) if (pattern.test(combined)) throw new Error(`PR E migration lint rejected ${label}`);

const baseline = stripComments(readFileSync(join(migrationPath, '20260726000000_legacy_core_additive_baseline.sql'), 'utf8')).toLowerCase();
for (const requiredValidation of [
  'legacy core schema mismatch', 'pg_attribute', "constraint_record.contype = 'p'",
  "constraint_record.contype = 'u'", "constraint_record.contype = 'f'", 'checkid=user_id',
]) {
  if (!baseline.includes(requiredValidation)) throw new Error(`Legacy baseline is missing shape validation: ${requiredValidation}`);
}
if (baseline.includes('create or replace function public.set_visual_deadline_updated_at')) {
  throw new Error('Legacy baseline must not replace an existing production trigger function');
}

const capture = stripComments(readFileSync(join(migrationPath, '20260920090200_v2_beta_capture_notifications.sql'), 'utf8')).toLowerCase();
if (/add\s+column(?:\s+if\s+not\s+exists)?\s+confirmation_status\s+text\s+not\s+null/.test(capture)) {
  throw new Error('confirmation_status must remain nullable for unreconciled legacy rows');
}
for (const requiredCaptureContract of [
  'add column if not exists confirmation_status text',
  "alter column confirmation_status set default 'unconfirmed'",
  'confirmation_status is null',
]) {
  if (!capture.includes(requiredCaptureContract)) throw new Error(`Capture migration is missing historical-state protection: ${requiredCaptureContract}`);
}

for (const table of ['v2_goals', 'v2_milestones', 'v2_tasks', 'v2_task_dependencies', 'v2_import_jobs', 'v2_legacy_entity_refs']) {
  if (!combined.includes(`create table public.${table}`)) throw new Error(`Missing required table ${table}`);
  if (!combined.includes(`alter table public.${table} enable row level security`)) throw new Error(`Missing RLS enablement for ${table}`);
}

for (const deferred of [
  'resource_budgets', 'resource_allocations', 'fixed_commitments', 'operations_plan_versions', 'execution_windows',
  'execution_events', 'reviews', 'review_entities', 'ai_reports', 'ai_report_refs', 'subscriptions',
  'payment_references', 'entitlements', 'capture_interpretations', 'capture_candidates',
]) {
  if (new RegExp(`create\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+public\\.${deferred}\\b`).test(combined)) throw new Error(`Deferred table was created: ${deferred}`);
}

for (const relationship of [
  'v2_goals_parent_owner_fk', 'v2_milestones_goal_owner_fk', 'v2_tasks_goal_owner_fk',
  'v2_tasks_milestone_goal_owner_fk', 'v2_tasks_parent_owner_fk',
  'v2_task_dependencies_predecessor_owner_fk', 'v2_task_dependencies_successor_owner_fk',
  'v2_legacy_entity_refs_job_owner_fk',
]) {
  if (!combined.includes(relationship)) throw new Error(`Missing same-owner relationship constraint ${relationship}`);
}

console.log(`PR E static SQL checks passed for ${migrationFiles.length} additive migrations.`);
