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

`20260726000000_legacy_core_additive_baseline.sql` reconstructs only the missing legacy core baseline with `CREATE TABLE IF NOT EXISTS`, indexes, triggers, grants, and RLS. It contains no drop, legacy-ID conversion, or row rewrite. Production tables with the established shape remain intact.

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

Existing Capture tables are reused. PR E adds only nullable/idempotency and lifecycle evidence: `client_request_id`, confirmation/materialization timestamps and status, optional asset checksum, and same-owner composite FKs from assets/drafts to their intake. The ownership FKs are `NOT VALID`: they protect new writes without scanning or rewriting historical rows; PR F must reconcile and validate them before relying on complete historical integrity. No interpretation/candidate tables are created.

The existing normalized notification table receives `read_at`, optional `dedupe_key`, an idempotency index, an ownership/read index, explicit least-privilege grants, and optimized owner policies. The current local bell is not switched to this table in PR E.

`profiles` remains authoritative; an independently queryable `user_preferences` table is deferred because current Beta has no consuming repository/query that requires it.

## Billing and deferred persistence

Billing v1 tables and entitlement semantics are unchanged. PR E creates no subscriptions, payment references, or provider-independent entitlements.

Also deferred: Resource Budgets/Allocations, Fixed Commitments, Operations Plan Versions, Execution Windows, v2 Execution Events, Reviews, Review links, AI Reports, and advanced Capture interpretation/candidate tables.

## Rollback and activation

PR E performs no backfill and wires no runtime repository. Rollback is to leave the additive tables inert and keep legacy readers/writers enabled. Tables and ledger evidence are retained; no destructive reverse migration is required or authorized. PR F must begin report-only, populate import jobs/mappings idempotently, reconcile counts/checksums/unresolved references, and only then propose controlled dual-read behind a disabled-by-default feature flag.
