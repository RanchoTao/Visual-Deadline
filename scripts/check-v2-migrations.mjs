import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationPath = fileURLToPath(migrationDirectory);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql') && (name.includes('v2_beta_') || name.includes('legacy_core_additive_baseline') || name === '20260924034628_v2_review_history.sql' || name === '20260924121019_v2_recurring_billing.sql' || name === '20260927101132_billing_service_role_table_privileges.sql' || name === '20260927174808_closed_beta_platform.sql' || name === '20260928023311_closed_beta_review_hardening.sql'))
  .sort();

if (migrationFiles.length !== 9) throw new Error(`Expected 9 additive V2/billing/closed-Beta migrations; found ${migrationFiles.length}: ${migrationFiles.join(', ')}`);

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

const preClosedBetaCombined = migrationFiles.filter((name) => !name.includes('closed_beta_')).map((name) => stripComments(readFileSync(join(migrationPath, name), 'utf8'))).join('\n').toLowerCase();
for (const [pattern, label] of forbidden) if (pattern.test(preClosedBetaCombined)) throw new Error(`PR E migration lint rejected ${label}`);

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

const review = stripComments(readFileSync(join(migrationPath, '20260924034628_v2_review_history.sql'), 'utf8')).toLowerCase();
for (const table of ['review_records', 'review_events', 'review_archive_events', 'review_tombstones']) {
  if (!review.includes(`create table public.${table}`)) throw new Error(`Missing required REVIEW table ${table}`);
  if (!review.includes(`alter table public.${table} enable row level security`)) throw new Error(`Missing REVIEW RLS enablement for ${table}`);
  if (!review.includes(`create policy ${table}_select_own`)) throw new Error(`Missing REVIEW owner SELECT policy for ${table}`);
  if (!review.includes(`create policy ${table}_insert_own`)) throw new Error(`Missing REVIEW owner INSERT policy for ${table}`);
  if (new RegExp(`create\\s+policy\\s+\\S+\\s+on\\s+public\\.${table}\\s+for\\s+(?:update|delete)`).test(review)) throw new Error(`REVIEW table ${table} must remain append-only`);
}
for (const contract of ['revoke all on table public.review_records', 'grant select, insert on table public.review_records', 'review_archive_events_record_fk']) {
  if (!review.includes(contract)) throw new Error(`REVIEW migration is missing append-only contract: ${contract}`);
}
const reviewRlsTest = readFileSync(new URL('../supabase/tests/review_history_rls_test.sql', import.meta.url), 'utf8').toLowerCase();
for (const requiredCase of ['anonymous review select is denied', 'forged review user_id insert is denied', 'authenticated review update is denied', 'authenticated review delete is denied', 'cross-user review select returns no rows']) {
  if (!reviewRlsTest.includes(requiredCase)) throw new Error(`REVIEW RLS test is missing case: ${requiredCase}`);
}

const recurring = stripComments(readFileSync(join(migrationPath, '20260924121019_v2_recurring_billing.sql'), 'utf8')).toLowerCase();
for (const table of ['subscriptions', 'payment_references', 'entitlements']) {
  if (!recurring.includes(`create table public.${table}`)) throw new Error(`Missing required PR N table ${table}`);
  if (!recurring.includes(`alter table public.${table} enable row level security`)) throw new Error(`Missing PR N RLS enablement for ${table}`);
  if (!recurring.includes(`create policy ${table}_select_own`)) throw new Error(`Missing PR N owner SELECT policy for ${table}`);
  if (new RegExp(`create\\s+policy\\s+\\S+\\s+on\\s+public\\.${table}\\s+for\\s+(?:insert|update|delete)`).test(recurring)) throw new Error(`PR N table ${table} must be server-write-only`);
}
for (const contract of [
  "catalog_version text not null check (catalog_version = 'vd-recurring-v1')",
  'constraint entitlements_source_key unique (user_id, capability, source_type, source_id)',
  "subscription.current_period_end + interval '72 hours'",
  'billing_claim_event',
  'billing_recover_checkout_payment',
  'billing_apply_subscription_snapshot',
  'billing_apply_payment_reference',
  'billing_rebuild_entitlements',
  "provider_environment in ('sandbox', 'production', 'legacy_unknown')",
  "event_source in ('webhook', 'reconciliation', 'migration', 'manual_admin')",
]) if (!recurring.includes(contract)) throw new Error(`PR N migration is missing billing contract: ${contract}`);

const billingRlsTest = readFileSync(new URL('../supabase/tests/recurring_billing_rls_test.sql', import.meta.url), 'utf8').toLowerCase();
for (const requiredCase of ['anonymous subscription select is denied', 'owner subscription select is allowed', 'cross-user subscription select returns no rows', 'forged subscription insert is denied', 'authenticated subscription update is denied', 'authenticated subscription delete is denied']) {
  if (!billingRlsTest.includes(requiredCase)) throw new Error(`PR N RLS test is missing case: ${requiredCase}`);
}

const billingServiceRolePrivileges = stripComments(readFileSync(join(migrationPath, '20260927101132_billing_service_role_table_privileges.sql'), 'utf8')).toLowerCase();
for (const table of ['billing_orders', 'membership_grants', 'memberships', 'billing_events', 'subscriptions', 'payment_references', 'entitlements']) {
  if (!billingServiceRolePrivileges.includes(`public.${table}`)) throw new Error(`Missing service_role privilege grant for ${table}`);
}
if (!/grant\s+select,\s*insert,\s*update,\s*delete\s+on\s+table[\s\S]+?to\s+service_role/.test(billingServiceRolePrivileges)) {
  throw new Error('PR N service_role migration must grant backend CRUD privileges');
}
const billingServiceRoleTest = readFileSync(new URL('../supabase/tests/billing_service_role_privileges_test.sql', import.meta.url), 'utf8').toLowerCase();
for (const table of ['billing_orders', 'membership_grants', 'memberships', 'billing_events', 'subscriptions', 'payment_references', 'entitlements']) {
  for (const privilege of ['select', 'insert', 'update', 'delete']) {
    if (!billingServiceRoleTest.includes(`service_role can ${privilege} ${table}`)) throw new Error(`Missing service_role ${privilege} regression assertion for ${table}`);
  }
}

const closedBeta = stripComments(readFileSync(join(migrationPath, '20260927174808_closed_beta_platform.sql'), 'utf8')).toLowerCase();
for (const [pattern, label] of forbidden.filter(([pattern]) => !String(pattern).includes('update'))) if (pattern.test(closedBeta)) throw new Error(`Closed Beta migration lint rejected ${label}`);
for (const table of ['beta_cohorts', 'beta_applications', 'invite_codes', 'invite_redemptions', 'admin_roles', 'admin_audit_log', 'admin_access_grants', 'ai_quota_policies', 'ai_quota_grants', 'ai_usage_events', 'account_controls', 'moderation_cases', 'user_feedback', 'feature_flags', 'email_events']) {
  if (!closedBeta.includes(`create table public.${table}`)) throw new Error(`Missing Closed Beta table ${table}`);
  if (!closedBeta.includes(`'${table}'`) || !closedBeta.includes("alter table public.%i enable row level security")) throw new Error(`Missing Closed Beta RLS enablement for ${table}`);
}
for (const requiredContract of [
  'create function public.redeem_beta_invite',
  'pg_advisory_xact_lock',
  "raise exception 'invite_exhausted'",
  'grant execute on function public.redeem_beta_invite(text, uuid, text, text) to service_role',
  'create function public.consume_ai_quota',
  'constraint ai_quota_grants_amount_required_check',
  'grant execute on function public.consume_ai_quota(uuid, uuid, text, text, text) to service_role',
]) if (!closedBeta.includes(requiredContract)) throw new Error(`Closed Beta migration is missing contract: ${requiredContract}`);
if (/grant\s+(?:select,\s*)?insert(?:,\s*update)?(?:,\s*delete)?\s+on\s+table\s+public\.(?:beta_applications|invite_codes|admin_roles|admin_audit_log)\s+to\s+(?:anon|authenticated)/.test(closedBeta)) {
  throw new Error('Closed Beta operational tables must remain server-write-only');
}
const closedBetaRlsTest = readFileSync(new URL('../supabase/tests/closed_beta_platform_rls_test.sql', import.meta.url), 'utf8').toLowerCase();
for (const requiredCase of ['anonymous beta application insert is denied', 'authenticated admin role select is denied', 'owner ai usage select is allowed', 'cross-user account control select returns no rows', 'service role can mutate closed beta operational tables']) {
  if (!closedBetaRlsTest.includes(requiredCase)) throw new Error(`Closed Beta RLS test is missing case: ${requiredCase}`);
}

const hardening = stripComments(readFileSync(join(migrationPath, '20260928023311_closed_beta_review_hardening.sql'), 'utf8')).toLowerCase();
for (const contract of ["raise exception 'ai_request_replay'", 'as restrictive for insert', 'as restrictive for update', 'as restrictive for delete', 'superseded_at', 'beta_guard_auth_creation', 'beta_transition_account', 'beta_grant_entitlement', 'beta_revoke_entitlement', 'beta_create_invite', 'beta_set_feature_flag', 'on conflict (key,scope_type,scope_id)', 'revoke update, delete on public.admin_audit_log from service_role']) {
  if (!hardening.includes(contract)) throw new Error(`Closed Beta hardening missing: ${contract}`);
}
for (const forbiddenHardening of [/\bdrop\s+table\b/, /\btruncate\b/, /\bdelete\s+from\b/, /\bdisable\s+row\s+level\s+security\b/]) {
  if (forbiddenHardening.test(hardening)) throw new Error('Closed Beta hardening must preserve data and RLS');
}

for (const deferred of [
  'resource_budgets', 'resource_allocations', 'fixed_commitments', 'operations_plan_versions', 'execution_windows',
  'execution_events', 'reviews', 'review_entities', 'ai_reports', 'ai_report_refs',
  'capture_interpretations', 'capture_candidates',
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

console.log(`V2, recurring billing, and Closed Beta static SQL checks passed for ${migrationFiles.length} additive migrations.`);
