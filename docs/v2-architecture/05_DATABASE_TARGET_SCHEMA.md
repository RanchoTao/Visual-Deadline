# Database target schema

This is a target contract and migration plan, not executable DDL. All production changes must be additive, separately reviewed migrations.

The complete target model is not the Beta migration checklist. Physical persistence is staged below; a table becomes a runtime requirement only when its owning product surface consumes it.

## Current-to-target map

| Current table / store | Current shape | Target | Disposition |
| --- | --- | --- | --- |
| `profiles` | typed avatar/display columns plus broad JSONB `data` | `profiles`, `user_preferences` | Backfill typed settings; retain legacy payload read-only until verified |
| `goals` | text ID + full JSONB entity | `goals` v2 | Backfill UUID rows and legacy ref ledger; dual-read |
| `tasks` | text ID + full JSONB entity | `tasks` v2, `task_dependencies` | Backfill typed rows and normalized edges; dual-read |
| `pressure_logs` | text ID + JSONB measurement/snapshot | later `execution_events` and typed pressure measurements | Keep current Beta reads; preserve manual versus derived source when REVIEW migrates |
| `intake_messages` | intake request metadata | `captures` | Extend safely for Beta if sufficient; rename/backfill is not mandatory |
| `intake_assets` | asset metadata | `capture_attachments` | Preserve private storage path/checksum/owner; physical rename may wait |
| `task_drafts` | per-intake Task JSONB | `capture_interpretations`, `capture_candidates` | Keep raw draft for Beta; split only when advanced provenance needs it |
| `notifications` | normalized user inbox | `notifications` v2 | Add dedupe/read timestamps and consistent entity refs |
| `roadmaps` | graph header, UUID `goal_id` without FK | canonical Goals/Milestones plus projection metadata | Resolve legacy goal IDs; quarantine unresolved links |
| `roadmap_nodes` | graph-specific nodes | Goals/Milestones/Tasks or `plan_projection_nodes` | Type-based mapping, never blind conversion |
| `roadmap_edges` | graph-specific edges | task/milestone dependencies or projection edges | Validate edge semantics and acyclicity where required |
| `life_events` | typed owner-scoped events | later `execution_events` | Keep for Beta; migrate only when REVIEW consumes durable unified history |
| `billing_orders` | one-time order ledger | later `payment_references` + legacy order view | Keep authoritative for Beta continuity; migrate with recurring billing |
| `membership_grants` | fixed-duration grants | later `entitlements` | Preserve current interval/revocation semantics until recurring rollout |
| `memberships` | materialized stacked term | later legacy entitlement projection | Continue for Beta; not recurring subscription truth |
| `billing_events` | provider event ID/type/outcome | later expanded `billing_events` | Add fields only with recurring billing/reconciliation runtime |
| local Daily Review | browser-only JSON | later `reviews` | Keep local for Beta; import when durable REVIEW activates |
| local plan/resources/events | browser-only namespaced data | later PLAN/OPS/REVIEW tables | Import only with the consuming page and after canonical links resolve |
| local AI artifacts | browser-only JSON | later `ai_reports` | Keep local for Beta; import with REVIEW provenance and clear generated status |

## Persistence staging

### Beta-required persistence

Minimize Beta to current product data and the ownership correction:

| Capability | Minimum Beta persistence |
| --- | --- |
| Profile and settings | Existing `profiles` plus a versioned preferences shape; a separate `user_preferences` table is optional until settings fields need independent query/policy behavior |
| Goal/Milestone/Task | Canonical Goals, Milestones, Tasks, and Task dependencies, or a tested compatibility repository that provides the same IDs/relations while typed backfill is staged |
| NOW Capture | Existing intake message/asset/draft tables may be extended in place; require stable capture IDs, ownership, confirmation state, and materialization idempotency |
| TASKS state | Persist lifecycle, progress, deadline, dependency, Goal/Milestone grouping, and archive without copied page-specific records |
| Migration safety | Complete export/restore plus import job and legacy-ID ledger for any data actually migrated in Beta |
| Notifications | Existing notification table/read state if the global bell is enabled; otherwise retain local behavior and defer cross-device delivery |
| Billing continuity | Existing orders/grants/membership rows remain authoritative for existing purchases; do not block Beta on recurring-subscription tables unless recurring billing is in the Beta launch scope |

Beta does **not** require new Resource Budget, Resource Allocation, Fixed Commitment, Execution Window, Review, Execution Event, AI Report, or recurring Subscription tables merely because those entities exist in the target domain model.

### Later / deferred persistence

| Owner | Deferred tables | Activation condition |
| --- | --- | --- |
| OPS | `resource_budgets`, `fixed_commitments`, `operations_plan_versions`, `execution_windows`, `resource_allocations` | Required only when OPS actually schedules competing work from persisted capacity/time/attention/energy/resource constraints |
| REVIEW | `execution_events`, `reviews`, `review_entities`, `ai_reports`, `ai_report_refs` | Required only when REVIEW migration needs durable history, reviews, or traceable reports beyond current derived/local behavior |
| Recurring Billing | `subscriptions`, expanded `payment_references`, provider-independent `entitlements`, expanded `billing_events` | Required only when recurring Paddle subscriptions enter release scope; legacy Billing v1 continuity remains separate |
| Advanced Capture | Separate `capture_interpretations` and `capture_candidates` | Required when multi-version extraction/provenance cannot be represented safely by extended current intake/draft tables |
| Notification delivery | server delivery attempts/preferences tables | Required when cross-device or push delivery is enabled |

Promoting a deferred table to runtime-required needs the owning page PR, actual queries, RLS/grant tests, backfill/reconciliation, and rollback. Do not pre-create speculative tables solely to complete the diagram.

## Complete target table families

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

### PLAN proposals and OPS resources

- PLAN, when durable proposal history is required: `long_term_plan_versions(id, user_id, horizon_start, horizon_end, status, generator, model_ref, assumptions jsonb, warnings jsonb, confidence, content_checksum, parent_plan_id, created_at, decided_at)` and `long_term_plan_changes(...)`.
- OPS, only when runtime scheduling consumes them: `resource_budgets(id, user_id, budget_date, timezone, available_minutes, attention_capacity, energy_level, discretionary_budget_minor, source, confidence, version, timestamps)`.
- OPS: `fixed_commitments(id, user_id, resource_budget_id, title, starts_at, ends_at, locked, source_ref, timestamps)`.
- OPS: `operations_plan_versions(id, user_id, horizon_start, horizon_end, status, generator, capacity_checksum, assumptions jsonb, warnings jsonb, confidence, parent_plan_id, created_at, decided_at)`.
- OPS: `execution_windows(id, user_id, operations_plan_version_id, task_id, lane, starts_at, ends_at, state, timestamps)`.
- OPS: `resource_allocations(id, user_id, resource_budget_id, operations_plan_version_id, entity_type, entity_id, minutes, budget_minor, status, timestamps)`.

Only an accepted proposal may apply its declared changes. Long-term PLAN changes and OPS scheduling/allocation changes remain separate commands and ownership boundaries. Acceptance and application must share one database transaction or a recoverable job state machine.

### Capture

- `captures(id, user_id, source_mode, raw_text, status, client_request_id, locale, created_at, updated_at, confirmed_at, materialized_at)`
- `capture_attachments(id, capture_id, user_id, kind, mime_type, byte_size, storage_bucket, storage_path, checksum, status, retention_state, timestamps)`
- `capture_interpretations(id, capture_id, user_id, version, provider, model, compiler_version, extracted_text, structured_output, confidence, warnings, status, created_at)`
- `capture_candidates(id, interpretation_id, user_id, candidate_type, candidate_payload, source_refs, decision, decided_at, materialized_entity_type, materialized_entity_id)`

Unique `(user_id, client_request_id)` makes retry safe. Storage object paths remain owner-prefixed and private.

### REVIEW events and reports — deferred until REVIEW consumes durable history

- `execution_events(id, user_id, entity_type, entity_id, event_type, occurred_at, recorded_at, actor_type, source, idempotency_key, supersedes_event_id, metadata)`
- `reviews(id, user_id, review_type, window_start, window_end, timezone, rating, pressure, energy, summary, notes, corrections, created_at, updated_at)`
- `review_entities(review_id, entity_type, entity_id)`
- `ai_reports(id, user_id, report_type, window_start, window_end, provider, model, prompt_version, input_checksum, content, structured_findings, status, user_feedback, created_at)`
- `ai_report_refs(report_id, entity_type, entity_id)`

Use a unique `(user_id, source, idempotency_key)` when an external/client event can be retried. Index timeline reads by `(user_id, occurred_at desc)`.

### Global Notifications

- `notifications(id, user_id, type, title, summary, content, related_entity_type, related_entity_id, dedupe_key, created_at, read_at, expires_at)`
- Unique active `(user_id, dedupe_key)` where applicable.
- Client may mark its own notification read; creation comes from trusted server jobs except explicitly local-only reminders.

### Global Billing and entitlements

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
