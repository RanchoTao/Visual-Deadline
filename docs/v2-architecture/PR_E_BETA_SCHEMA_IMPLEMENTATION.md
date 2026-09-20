# PR E — additive v2 Beta schema implementation

This document records the physical decisions in PR E. It does not replace or amend the frozen architecture.

## Existing migration history audit

The root `supabase-schema.sql` is a destructive legacy setup script, not migration history. It drops and recreates `profiles`, `tasks`, `goals`, and `pressure_logs`. Those four tables were absent from `supabase/migrations/`, even though the avatar migration depends on `profiles`.

The chronological migration directory already creates:

- `intake_messages`, `intake_assets`, and `task_drafts` plus the private intake bucket;
- avatar columns and the avatar bucket (with an undeclared dependency on `profiles`);
- `notifications`, `roadmaps`, `roadmap_nodes`, and `roadmap_edges`;
- Billing v1: `billing_orders`, `membership_grants`, `memberships`, and `billing_events`;
- `life_events`.

`20260726000000_legacy_core_additive_baseline.sql` reconstructs only the missing legacy core baseline with `CREATE TABLE IF NOT EXISTS`, indexes, triggers, grants, and RLS. Its timestamp deliberately precedes the later repository migrations and may therefore precede versions already recorded by an existing remote. It contains no drop, legacy-ID conversion, or row rewrite. Because `CREATE TABLE IF NOT EXISTS` does not prove equivalence, the migration validates required column types/nullability, primary keys, JSONB defaults, the Profile identity/uniqueness contract, and `auth.users` ownership foreign keys before adding any later baseline objects. A mismatch raises a `Legacy core schema mismatch` exception and aborts the transaction for manual investigation.

### Fresh database versus existing production

On a fresh database, the reconstructed baseline creates and validates the legacy core before the later repository migrations run chronologically. On an existing database, the tables are not assumed correct merely because they exist. They must pass the same shape validation. The baseline also creates the legacy `updated_at` function only when absent; it does not replace the function in an existing database.

A read-only production audit supplied for project `surspszkoveoqdtevprg` (`visual-deadline`) found the physical `profiles`, `tasks`, `goals`, and `pressure_logs` schema equivalent to this baseline, including the Profile identity constraints, ownership foreign keys, text legacy IDs, JSONB payloads, triggers, and own-row RLS. The live database contained approximately 35 Profiles, 191 Tasks, 6 Goals, and 394 pressure logs. That equivalence is evidence for a future preflight, not authorization to run this migration or repair history; PR E performed no production operation.

### Existing production migration-history drift and preflight

The same audit found that remote migration history contains only `20260823170929 billing_v1`, while the repository contains `20260823193000_billing_v1.sql` plus older migrations absent from remote tracking. Physical production is also missing `intake_messages`, `intake_assets`, `task_drafts`, `notifications`, `roadmaps`, `roadmap_nodes`, `roadmap_edges`, and `life_events`. The divergence therefore predates the reconstructed baseline and cannot be resolved safely by a simple `supabase db push`.

Future production deployment requires a deliberate, read-first preflight:

1. Run `supabase migration list` and preserve its local/remote comparison.
2. Inspect the physical legacy core and all objects expected from every historical repository migration.
3. Reconcile three sources explicitly: physical schema, remote migration tracking, and repository migration files. Classify each old migration as physically equivalent, genuinely absent, or mismatched.
4. Stop immediately on any mismatch. Do not convert IDs, replay destructive setup SQL, use `db reset --linked`, or guess equivalence.
5. Only after independent schema-equivalence verification, reconcile a specific historical version if needed. `supabase migration repair --status applied <version>` changes migration tracking only; it does not execute that migration's SQL. PR E does not run or automate repair.
6. Plan and apply only verified-missing additive historical migrations in chronological dependency order, then dry-run the remaining migration push.
7. Do not use `--include-all` as a shortcut and do not continue when the dry run differs from the reviewed plan.

In particular, `20260920090200_v2_beta_capture_notifications.sql` is not independently deployable to the audited production database. Its required physical predecessors are `20260726170000_multimodal_intake.sql` for Capture and `20260809090000_notifications_and_roadmaps.sql` for notifications. Existing production must reconcile history and safely apply the verified-missing additive predecessors before the PR E adjustment; a fresh database receives them naturally through chronological replay.

## Canonical physical names and ID policy

The Beta canonical tables are `v2_goals`, `v2_milestones`, `v2_tasks`, and `v2_task_dependencies`. The `v2_` prefix is deliberate: legacy `goals` and `tasks` retain text primary keys and JSONB payloads during PR F dual-read/backfill.

Canonical primary keys are database-generated UUIDs. A legacy text ID—including a string that happens to be UUID-shaped—is never treated as canonical merely because it parses as UUID. Its mapping belongs in `v2_legacy_entity_refs`.

## Relationship and ownership enforcement

Every canonical user table stores `user_id` and exposes a unique `(user_id, id)` key. Composite foreign keys carry `user_id` through parent Goal, Milestone, Goal grouping, parent Task, predecessor, and successor relationships. A Task with a Milestone also carries the Milestone's Goal in a three-column foreign key, preventing mismatched Goal/Milestone combinations.

RLS is enabled on every new public table. Canonical tables grant only CRUD to `authenticated`; policies use `(select auth.uid()) = user_id` for select/insert/update/delete, including both `USING` and `WITH CHECK` on updates. `anon` has no grants. Ownership-changing updates are rejected by a trigger as defense in depth.

## Import job and legacy mapping model

`v2_import_jobs` stores resumable job status, source/version, attempt metadata, counts, warnings/errors, rollback metadata, and timestamps. `v2_legacy_entity_refs` stores per-record source identity/checksum, optional canonical UUID/type, target checksum, status, retries, unresolved references, quarantine/error details, and rollback metadata.

The mapping uniqueness key is `(user_id, source_system, source_domain, source_entity_type, source_legacy_id)`. Retrying the same mapping cannot create a duplicate. A composite job FK prevents a mapping from pointing at another user's job. Authenticated users may select their own migration status but cannot insert, update, or delete ledger rows; trusted `service_role` workers own those mutations.

## Capture and notifications

Existing Capture tables are reused. PR E adds only nullable/idempotency and lifecycle evidence: `client_request_id`, confirmation/materialization timestamps and status, optional asset checksum, and same-owner composite FKs from assets/drafts to their intake. `confirmation_status` is added nullable before the default is set: existing rows remain `NULL`, meaning legacy historical state not yet reconciled, while new rows that omit it default to `unconfirmed`. No historical state is inferred or backfilled. PR F must reconcile `NULL` before any future `NOT NULL` validation or runtime cutover.

The ownership FKs are `NOT VALID`: they protect new writes without scanning or rewriting historical rows; PR F must reconcile and validate them before relying on complete historical integrity. No interpretation/candidate tables are created.

The existing normalized notification table receives `read_at`, optional `dedupe_key`, an idempotency index, an ownership/read index, explicit least-privilege grants, and optimized owner policies. The current local bell is not switched to this table in PR E.

`profiles` remains authoritative; an independently queryable `user_preferences` table is deferred because current Beta has no consuming repository/query that requires it.

## Billing and deferred persistence

Billing v1 tables and entitlement semantics are unchanged. PR E creates no subscriptions, payment references, or provider-independent entitlements.

The production advisor's policy warnings for `billing_events` and `membership_grants` are consistent with their intended service-role-only internal model and are not a reason to add client policies. Separate follow-up hardening should review the callable `SECURITY DEFINER` function `public.rls_auto_enable()`, mutable `search_path` on existing legacy/Billing trigger functions, and legacy `auth.uid()` policy performance warnings. PR E does not opportunistically change Billing/Auth security or existing production policies.

Also deferred: Resource Budgets/Allocations, Fixed Commitments, Operations Plan Versions, Execution Windows, v2 Execution Events, Reviews, Review links, AI Reports, and advanced Capture interpretation/candidate tables.

## Rollback and activation

PR E performs no backfill and wires no runtime repository. Rollback is to leave the additive tables inert and keep legacy readers/writers enabled. Tables and ledger evidence are retained; no destructive reverse migration is required or authorized. PR F must begin report-only, populate import jobs/mappings idempotently, reconcile counts/checksums/unresolved references, and only then propose controlled dual-read behind a disabled-by-default feature flag.
