# Database target schema

This is a target contract and migration plan, not executable DDL. All production changes must be additive, separately reviewed migrations.

## Current-to-target map

| Current table / store | Current shape | Target | Disposition |
| --- | --- | --- | --- |
| `profiles` | typed avatar/display columns plus broad JSONB `data` | `profiles`, `user_preferences` | Backfill typed settings; retain legacy payload read-only until verified |
| `goals` | text ID + full JSONB entity | `goals` v2 | Backfill UUID rows and legacy ref ledger; dual-read |
| `tasks` | text ID + full JSONB entity | `tasks` v2, `task_dependencies` | Backfill typed rows and normalized edges; dual-read |
| `pressure_logs` | text ID + JSONB measurement/snapshot | `execution_events` and typed pressure measurements | Preserve manual versus derived source |
| `intake_messages` | intake request metadata | `captures` | Backfill provenance and lifecycle |
| `intake_assets` | asset metadata | `capture_attachments` | Preserve private storage path/checksum/owner |
| `task_drafts` | per-intake Task JSONB | `capture_interpretations`, `capture_candidates` | Keep raw draft for audit, create typed candidates |
| `notifications` | normalized user inbox | `notifications` v2 | Add dedupe/read timestamps and consistent entity refs |
| `roadmaps` | graph header, UUID `goal_id` without FK | canonical Goals/Milestones plus projection metadata | Resolve legacy goal IDs; quarantine unresolved links |
| `roadmap_nodes` | graph-specific nodes | Goals/Milestones/Tasks or `plan_projection_nodes` | Type-based mapping, never blind conversion |
| `roadmap_edges` | graph-specific edges | task/milestone dependencies or projection edges | Validate edge semantics and acyclicity where required |
| `life_events` | typed owner-scoped events | `execution_events` | Namespace event type and preserve all timestamps/metadata |
| `billing_orders` | one-time order ledger | `payment_references` + legacy order view | Preserve immutable financial history |
| `membership_grants` | fixed-duration grants | `entitlements` | Preserve interval/revocation semantics |
| `memberships` | materialized stacked term | legacy entitlement projection | Continue during transition; not recurring subscription truth |
| `billing_events` | provider event ID/type/outcome | `billing_events` v2 | Add processing attempts, payload checksum, subscription/payment refs |
| local Daily Review | browser-only JSON | `reviews` | Explicit user import |
| local plan/resources/events | browser-only namespaced data | plan/resource/event tables | Import after canonical links resolve |
| local AI artifacts | browser-only JSON | `ai_reports` | Import only with provenance and clear generated status |

## Target table families

### Identity and preferences

- `profiles(user_id PK/FK auth.users, display_name, username, avatar_path, created_at, updated_at)`
- `user_preferences(user_id PK, timezone, planning_limits jsonb, reminder_settings jsonb, privacy_settings jsonb, feature_flags jsonb, version, updated_at)`
- `legacy_entity_refs(user_id, entity_type, legacy_system, legacy_id, canonical_id, import_job_id, UNIQUE(...))`

Authorization must use `auth.uid()` and immutable database ownership fields. Editable user metadata is never used for access decisions.

### Canonical execution

- `goals(id uuid PK, user_id, parent_goal_id, title, description, status, importance, horizon, target_at, success_criteria, provenance, version, timestamps)`
- `milestones(id uuid PK, user_id, goal_id FK, title, status, sort_key, target_at, success_criteria, completion_evidence, provenance, version, timestamps)`
- `tasks(id uuid PK, user_id, goal_id FK nullable, milestone_id FK nullable, parent_task_id FK nullable, title, description, status, importance, progress, actionable, deadline_at, start_after, estimated_minutes, completed_minutes, next_action, cost_minor, locked, provenance, version, timestamps)`
- `task_dependencies(user_id, predecessor_task_id, successor_task_id, dependency_type, created_at, PK(predecessor_task_id, successor_task_id))`

All cross-user relations are rejected. Composite ownership checks or guarded triggers must ensure a child and parent belong to the same user.

### Planning and resources

- `resource_budgets(id, user_id, budget_date, timezone, available_minutes, attention_capacity, energy_level, discretionary_budget_minor, source, confidence, version, timestamps)`
- `fixed_commitments(id, user_id, resource_budget_id, title, starts_at, ends_at, locked, source_ref, timestamps)`
- `plan_versions(id, user_id, horizon_start, horizon_end, scope, status, generator, model_ref, assumptions jsonb, warnings jsonb, confidence, content_checksum, parent_plan_id, created_at, decided_at)`
- `plan_changes(id, plan_version_id, user_id, command_type, entity_type, entity_id, before_json, after_json, sort_order)`
- `execution_windows(id, user_id, plan_version_id, task_id, lane, starts_at, ends_at, state, timestamps)`
- `resource_allocations(id, user_id, resource_budget_id, plan_version_id, entity_type, entity_id, minutes, budget_minor, status, timestamps)`

Only an accepted plan may have applied `plan_changes`; acceptance and command application must share one database transaction or a recoverable job state machine.

### Capture

- `captures(id, user_id, source_mode, raw_text, status, client_request_id, locale, created_at, updated_at, confirmed_at, materialized_at)`
- `capture_attachments(id, capture_id, user_id, kind, mime_type, byte_size, storage_bucket, storage_path, checksum, status, retention_state, timestamps)`
- `capture_interpretations(id, capture_id, user_id, version, provider, model, compiler_version, extracted_text, structured_output, confidence, warnings, status, created_at)`
- `capture_candidates(id, interpretation_id, user_id, candidate_type, candidate_payload, source_refs, decision, decided_at, materialized_entity_type, materialized_entity_id)`

Unique `(user_id, client_request_id)` makes retry safe. Storage object paths remain owner-prefixed and private.

### Events and review

- `execution_events(id, user_id, entity_type, entity_id, event_type, occurred_at, recorded_at, actor_type, source, idempotency_key, supersedes_event_id, metadata)`
- `reviews(id, user_id, review_type, window_start, window_end, timezone, rating, pressure, energy, summary, notes, corrections, created_at, updated_at)`
- `review_entities(review_id, entity_type, entity_id)`
- `ai_reports(id, user_id, report_type, window_start, window_end, provider, model, prompt_version, input_checksum, content, structured_findings, status, user_feedback, created_at)`
- `ai_report_refs(report_id, entity_type, entity_id)`

Use a unique `(user_id, source, idempotency_key)` when an external/client event can be retried. Index timeline reads by `(user_id, occurred_at desc)`.

### Notifications

- `notifications(id, user_id, type, title, summary, content, related_entity_type, related_entity_id, dedupe_key, created_at, read_at, expires_at)`
- Unique active `(user_id, dedupe_key)` where applicable.
- Client may mark its own notification read; creation comes from trusted server jobs except explicitly local-only reminders.

### Billing and entitlements

- `subscriptions(id, user_id, provider, provider_subscription_id, provider_customer_id, plan_code, status, current_period_start, current_period_end, cancel_at, canceled_at, scheduled_change, last_provider_event_id, timestamps)`
- `payment_references(id, user_id, subscription_id, provider, provider_transaction_id, kind, status, currency, subtotal_minor, tax_minor, total_minor, occurred_at, timestamps)`
- `entitlements(id, user_id, capability, source_type, source_id, status, valid_from, valid_until, reason, timestamps)`
- `billing_events(id/provider_event_id, provider, event_type, payload_checksum, occurred_at, received_at, processing_status, processing_attempts, last_error, subscription_id, payment_reference_id)`

Unique provider identifiers and advisory/row locks make processing idempotent. Entitlement rebuild is deterministic from valid sources.

## RLS and grants baseline

For every Data API table:

1. revoke broad defaults and grant only required operations to `authenticated` or service roles;
2. enable RLS before exposure;
3. use `TO authenticated` and `(select auth.uid()) = user_id` in ownership policies;
4. verify child-table ownership without permitting cross-user joins;
5. keep provider audit/internal tables service-role-only;
6. test anon denial, own-row success, other-user denial, forged-owner inserts, relationship forgery, and update/delete cases.

This follows current Supabase guidance that exposed tables require RLS and that grants and policies work together: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Index baseline

- Index every foreign key used for navigation/deletion.
- Index RLS ownership columns, normally `(user_id, ...)`.
- Use partial indexes for active Tasks, unread Notifications, proposed Plans, and active Entitlements.
- Index dependencies in both directions.
- Do not add speculative indexes without representative query plans.

## Zero-data-loss migration protocol

Each domain follows this sequence:

```text
inventory -> complete export -> additive schema -> dual-read
-> dry-run mapping report -> idempotent backfill -> reconcile
-> controlled new writes -> rollback exercise -> retire legacy writes
-> observation window -> archive/delete legacy storage
```

Every backfill records an import job, source ID, target ID, checksum, status, and error. Rerunning the same job must not create duplicates. Unresolved records go to a quarantine report and remain readable from the legacy source.

## Required pre-migration fixtures

- Empty account; local-only guest; cloud-only account; both with collisions.
- Legacy text IDs that are and are not UUID-shaped.
- One-sided Goal/Task links and missing references.
- Roadmap linked to a text Goal ID, dangling node edges, unknown node types.
- Active/completed/abandoned Tasks with boundary deadlines and `startDate`.
- Manual and task-derived pressure records.
- Life events across timezone/midnight boundaries.
- Paid, refunded, partially refunded, and stacked legacy membership grants.
- Interrupted backfill after each write phase.

## Deployment safety

`supabase-schema.sql` must not be executed in v2 environments. CI should lint migrations for destructive statements and require an explicit, separately approved cleanup phase for `DROP`, mass `DELETE`, or incompatible `ALTER`. Schema changes are forward-only; rollback uses feature flags/read paths and compensating migrations, not history rewrites.
