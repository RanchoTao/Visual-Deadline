# Migration sequence

Each item is a separate, reviewable PR unless its scope is reduced further. No PR combines a navigation rewrite, schema backfill, and provider rollout.

## Ordering rationale

The primary navigation is fixed as `NOW / TASKS / PLAN / OPS / REVIEW`. Additive canonical persistence and complete export coverage precede guest migration, but only the minimum Beta-required data is implemented up front. OPS resource tables wait for OPS runtime consumption; REVIEW event/report tables wait for durable REVIEW migration.

## PR sequence

### PR A — architecture freeze

- Goal: land this corrected document set and ADR; no runtime behavior.
- Files: `docs/v2-architecture/*` only.
- Data/migration risk: none.
- Tests: existing test suite, typecheck, build, local link check, forbidden-ownership search.
- Rollback: revert documentation commit.

### PR B — canonical TypeScript contracts and repositories

- Goal: add the complete target entity/command/projection interfaces and persistence-stage markers without changing current stores.
- Files/modules: new `src/domain/v2/*`; adapters around `src/types/task.ts`, `src/types/lifePlanning.ts`, `src/types/roadmap.ts`; no component replacement.
- Data risk: low; read-only adapters only.
- Migration dependency: PR A.
- Tests: legacy Task/Goal fixtures, reversible lifecycle/start-date mapping, relationship warnings, zero-write assertions.
- Rollback: remove new modules; current runtime remains unchanged.

### PR C — one ranking and projection contract

- Goal: unify pressure, Wayline execution eligibility, dependencies, and explainable rank output behind a comparison flag.
- Files/modules: `src/lib/pressureEngine.ts`, `src/domain/execution/*`, new v2 priority selector, expanded `tests/*`.
- Data risk: none; read-only.
- Product risk: ranking drift near deadline/timezone/progress boundaries.
- Tests: frozen legacy corpus, generated boundary cases, same ordered IDs across NOW/TASKS shadow projections.
- Rollback: disable canonical selector flag; retain comparison telemetry.

### PR D — complete backup/export and migration ledger

- Goal: make every currently user-owned local domain inventory/export/restore capable before any data move.
- Files/modules: `src/storage/schema.ts`, `backup.ts`, Roadmap/notification/daily review/reminder/current-plan repositories, import fixtures.
- Data risk: high if restore is wrong; no automatic migration yet.
- Migration dependency: canonical contracts.
- Tests: export/import round-trip for all current keys, old schema versions, corrupt/partial input, attachment manifest, session/token exclusion.
- Rollback: continue reading old envelope; never delete old backups.

### PR E — minimum additive Beta schema and RLS

- Goal: add only schema required by current Beta functionality and safe migration: canonical Goal/Milestone/Task/dependencies, minimal Capture extensions if needed, complete import/legacy-ID ledger, and enabled notification/billing-continuity adjustments.
- Explicitly deferred: canonical OPS Resource Budget/Allocation/Fixed Commitment/Execution Window tables, REVIEW Events/Reviews/AI Reports, and recurring-subscription tables. Beta OPS compatibility state may persist only when the OPS feature consumes it.
- Files/modules: small timestamped `supabase/migrations/*`, RLS SQL tests, schema documentation. Reconstruct a chronological baseline; do not run `supabase-schema.sql`.
- Data risk: low for additive tables; high if policies expose data.
- Migration dependency: canonical contracts and complete inventory.
- Tests: migration from empty and representative legacy database; grants; two-user cross-access; forged relationships; rollback by stopping v2 reads/writes.
- Rollback: feature flags route traffic to legacy tables; additive tables remain inert.

### PR F — dry-run Beta backfill and controlled dual-read

- Goal: map only Beta-enabled legacy JSONB/local entities through an idempotent ledger; initially report-only.
- Files/modules: server/admin migration job, compatibility repository, reconciliation reports.
- Data risk: critical once writes enable.
- Migration dependency: PRs D/E; ID and Roadmap resolution policy.
- Tests: fixture matrix in `05_DATABASE_TARGET_SCHEMA.md`, interruption after every batch, repeat run, counts/checksums, unresolved quarantine, legacy reads intact.
- Rollback: stop job and v2 reads; preserve ledger and legacy data; no destructive reverse transform.

### PR G — Auth client, OAuth/phone flags, guest import

- Goal: move to supported Supabase Auth client; add provider flows behind flags and explicit guest import preview/resume for Beta-enabled domains only.
- Files/modules: `src/lib/supabaseClient.ts` replacement behind interface, `useSupabaseAuth`, Auth UI/callback, import service/UI.
- Data risk: critical for session and ownership binding.
- Migration dependency: PRs D–F.
- Tests: full Auth/identity matrix, existing session transition, guest collision/interruption/retry, two-user RLS E2E.
- Rollback: disable OAuth/phone/link/import independently; retain email path and legacy local snapshot.

### PR H — shared shell and final five semantic routes

- Goal: expose exactly `NOW / TASKS / PLAN / OPS / REVIEW` on desktop and mobile; hide Social behind Labs; preserve old module redirects.
- Global account contract: Avatar → Profile/Account/Settings; avatar-left membership control → Subscription/Billing; notification bell → Notifications. These are not primary routes.
- Files/modules: `App.tsx`, `DesktopShell`, `MobileShell`, navigation components, route types, global account-surface host.
- Data risk: low; Daily Quest remains a compatibility view.
- Migration dependency: shared projection contracts.
- Tests: exact route inventory, viewport navigation E2E, back/forward/deep links, account/billing/notification controls, sync affordances, Social data still exportable.
- Rollback: shell feature flag restores legacy navigation.

### PR I — NOW and global Capture convergence

- Goal: implement Task heat zone, current Top 3/current action, and one multimodal Capture entry; Daily Quest becomes a Task-referencing compatibility view.
- Files/modules: `HomePage`, `DailyQuestPage`, recommendation/heat-zone components, capture components/services.
- Data risk: medium for Daily Quest migration and capture materialization.
- Migration dependency: canonical ranking, Beta Capture persistence, dual-read.
- Tests: ranking parity, no copied mutable Task state, confirm/reject/idempotency, multimodal negative cases.
- Rollback: legacy Home/Daily Quest flag; canonical data remains additive.

### PR J — TASKS convergence

- Goal: move all generic Task ownership to TASKS: CRUD, urgency × importance matrix, full list/filters, lifecycle/progress/deadline, dependencies, Goal/Milestone grouping, and archive/completed/deferred/cancelled views.
- Files/modules: `TaskPage`, `PriorityMap`, `TaskList`, `TaskForm`, lifecycle/dependency commands.
- Data risk: high for edit/delete/dependency semantics.
- Migration dependency: canonical Task repository and ranking confidence.
- Tests: CRUD and dependency transitions, filters/lifecycle views, deadline boundaries, optimistic conflict, offline/retry, legacy record edit round-trip, ranking agreement with NOW.
- Rollback: return to legacy Task repository; block v2-only edits if not reversible.

### PR K — PLAN convergence

- Goal: canonical Goal → Milestone → Task decomposition, AI long-term decomposition, Roadmap, past/present/future Timeline, logical dependencies, and versioned proposals.
- Explicit boundary: PLAN does not primarily own runtime capacity, Resource Budgets/Allocations, Fixed Commitments, or Execution Windows.
- Files/modules: `LifeMapPage`, long-term portions of `LifeOSPlanner`, Goal/Roadmap/PathMap/Timeline components, decomposition planner services.
- Data risk: critical for Roadmap/proposal acceptance mappings.
- Migration dependency: dry-run Roadmap report and canonical Goal/Milestone/Task schema.
- Tests: propose/reject zero-write, accept exact transactional diff, logical dependency validation, roadmap unresolved cases, past/present/future projection, visual smoke.
- Rollback: use legacy Life Map/Roadmap read-only; accepted canonical writes stay valid.

### PR L — OPS convergence

- Goal: implement the parallel-task operating system: rolling planning/replanning, finite capacity, execution windows, time/attention/energy and optional money/resource constraints, Resource Budgets/Allocations, Fixed Commitments, multi-project scheduling, and conflict handling.
- Explicit boundary: OPS consumes canonical Tasks but does not own generic Task CRUD, matrix, full list, filters, lifecycle, or archive.
- Files/modules: operations planner/domain, capacity inputs, scheduling/conflict UI, OPS persistence migrations introduced only with actual runtime queries.
- Data risk: high for accepted allocations/schedules; none before persistence is enabled.
- Migration dependency: TASKS canonical state and PLAN direction/proposals; representative capacity scenarios.
- Tests: capacity conservation, fixed-commitment exclusion, attention/energy/money constraints, cross-project conflict, deterministic replan, accepted-window atomicity, override audit, offline/retry.
- Rollback: disable OPS planning/writes; Tasks and PLAN remain intact. Retain accepted OPS records read-only for audit.

### PR M — REVIEW convergence

- Goal: durable execution history, Reviews, completion/delay and pressure/trend analysis, AI Reports/recommendations, and archive.
- Persistence rule: introduce Event/Review/Report tables only when this PR needs durable history beyond existing derived/local behavior.
- Files/modules: `LogPage`, `ActivityLog`, pressure analytics, Daily Review, AI report components/services, additive REVIEW migrations if activated.
- Data risk: high for historical accuracy.
- Migration dependency: event backfill and source classification when durable persistence activates.
- Tests: metric parity, timeline stability after later Task edits, timezone windows, manual versus derived pressure, AI provenance, archive round-trip.
- Rollback: render legacy analytics while retaining new records read-only.

### PR N — recurring billing and entitlement projection, if in release scope

- Goal: add recurring Paddle catalog bindings, subscription lifecycle, customer portal, reconciliation, and provider-independent authorization.
- Files/modules: billing API/webhook/service, conditional billing migrations, global Subscription/Billing surface, scheduled reconciliation.
- Data risk: critical financial/access state.
- Migration dependency: frozen legacy-overlap rule. Target subscription tables become runtime-required only when this PR is activated.
- Tests: sandbox lifecycle matrix, signature/replay/out-of-order/unknown events, legacy grants, reconciliation, environment mismatch.
- Rollback: disable new checkout; continue webhook/reconciliation for existing subscriptions; legacy grants remain readable.

### PR O — global account surfaces, notifications, integrations, cleanup gates

- Goal: finalize Avatar → Profile/Account/Settings, membership control → Subscription/Billing, and bell → Notifications; hide developer-only paths; retire only verified legacy reads/writes.
- Files/modules: `ProfilePage`, account/settings surfaces, `MembershipPanel`, `NotificationCenter`, preferences/data controls, feature flags, compatibility repositories.
- Data risk: high only in cleanup phase.
- Migration dependency: relevant reconciliation gates and observation windows.
- Tests: trigger-to-surface routing, settings/profile/notification cross-device flows, export, production secret scan, zero legacy-read telemetry, rollback rehearsal.
- Rollback: restore legacy readers from feature flag. Do not delete legacy storage in the same PR that first disables reads.

## Required PR template fields

Every implementation PR must state:

- owning page or global surface and affected canonical entities;
- whether persistence is Beta-required, conditional, or later/deferred;
- exact legacy and target read/write paths;
- data classification and affected record counts in the test fixture/environment;
- forward migration, retry/idempotency, reconciliation, and rollback;
- feature flags and their default state;
- unit, integration, RLS, browser, build, and manual verification actually run;
- known unknowns and follow-up cleanup that is not yet authorized.

## Cutover gates

| Gate | Evidence required |
| --- | --- |
| Enable Beta v2 reads | Complete Beta-domain backfill report; no critical unresolved refs; representative RLS reads |
| Enable Beta v2 writes | Failure-injection and idempotency suite; complete export; rollback exercised |
| Activate OPS persistence | OPS consumes real capacity/resource inputs; queries, RLS, reconciliation, and rollback pass |
| Activate REVIEW persistence | REVIEW needs durable history; event/report provenance and backfill tests pass |
| Activate recurring billing persistence | Recurring feature is in scope; Paddle Sandbox full lifecycle and reconciliation pass |
| Disable legacy writes | One release of matching read/write telemetry and no unexplained divergence |
| Disable legacy reads | Zero legacy fallback reads for observation window; support runbook ready |
| Delete legacy data/code | Separate approval, immutable archive/export, checksums, restore rehearsal |
| Enable OAuth/phone | Provider/recovery/abuse tests and redirect configuration verified |

## Validation commands for each code PR

At minimum:

```text
npm test
npm run typecheck
npm run build
git diff --check
```

Schema PRs additionally run migrations from empty and representative legacy databases plus RLS negative tests. UI PRs add browser verification at mobile and desktop breakpoints. Billing/Auth/Capture PRs add provider sandbox or mocked signed-event integration tests; a rendered page alone is not acceptance.
