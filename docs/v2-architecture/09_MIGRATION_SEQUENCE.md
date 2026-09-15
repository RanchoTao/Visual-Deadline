# Migration sequence

Each item is a separate, reviewable PR unless its scope is reduced further. No PR combines a navigation rewrite, schema backfill, and provider rollout.

## Ordering rationale

The suggested product sequence is adjusted in one important way: additive canonical persistence and export coverage precede guest migration, because Auth cannot safely import guest data into a schema that does not yet own all domains. Page work then proceeds NOW → PLAN → OPS → REVIEW while compatibility projections keep the current app usable.

## PR sequence

### PR A — architecture freeze

- Goal: land this document set and ADR; no runtime behavior.
- Files: `docs/v2-architecture/*` only.
- Data/migration risk: none.
- Tests: existing test suite, typecheck, build, link/path lint or manual link check.
- Rollback: revert documentation commit.

### PR B — canonical TypeScript contracts and repositories

- Goal: add v2 entity/command/projection interfaces and repository ports without changing current stores.
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
- Tests: frozen legacy corpus, generated boundary cases, same ordered IDs across Home/PriorityMap/Daily Quest shadow projections.
- Rollback: disable canonical selector flag; retain comparison telemetry.

### PR D — complete backup/export and migration ledger

- Goal: make every user-owned local domain inventory/export/restore capable before any data move.
- Files/modules: `src/storage/schema.ts`, `backup.ts`, Roadmap/notification/daily review/reminder/plan repositories, import fixtures.
- Data risk: high if restore is wrong; no automatic migration yet.
- Migration dependency: canonical contracts.
- Tests: export/import round-trip for all keys, old schema versions, corrupt/partial input, attachment manifest, session/token exclusion.
- Rollback: continue reading old envelope; never delete old backups.

### PR E — additive Supabase v2 schema and RLS

- Goal: create typed canonical, capture, plan, event/review, notification, import-ledger, subscription, and entitlement tables with no legacy mutation.
- Files/modules: new timestamped `supabase/migrations/*`, RLS SQL tests, schema documentation. Reconstruct a chronological baseline; do not run `supabase-schema.sql`.
- Data risk: low for additive tables; high if policies expose data.
- Migration dependency: canonical contracts and complete inventory.
- Tests: migration from empty and representative legacy database; grants; two-user cross-access; forged relationships; rollback by stopping v2 reads/writes.
- Rollback: feature flags route all traffic to legacy tables; additive tables remain inert.

### PR F — dry-run backfill and controlled dual-read

- Goal: map legacy JSONB/local entities to v2 tables through an idempotent ledger; initially report-only.
- Files/modules: server/admin migration job, compatibility repository, reconciliation reports.
- Data risk: critical once writes enable.
- Migration dependency: PRs D/E; ID and Roadmap resolution policy.
- Tests: fixture matrix in `05_DATABASE_TARGET_SCHEMA.md`, interruption after every batch, repeat run, counts/checksums, unresolved quarantine, legacy reads intact.
- Rollback: stop job and v2 reads; preserve ledger and legacy data; no destructive reverse transform.

### PR G — Auth client, OAuth/phone flags, guest import

- Goal: move to supported Supabase Auth client; add provider flows behind flags and explicit guest import preview/resume.
- Files/modules: `src/lib/supabaseClient.ts` replacement behind interface, `useSupabaseAuth`, Auth UI/callback, import service/UI.
- Data risk: critical for session and ownership binding.
- Migration dependency: PRs D–F.
- Tests: full Auth/identity matrix, existing session transition, guest collision/interruption/retry, two-user RLS E2E.
- Rollback: disable OAuth/phone/link/import independently; retain email path and legacy local snapshot.

### PR H — shared shell and five semantic routes

- Goal: expose NOW/PLAN/OPS/REVIEW/ME consistently on desktop/mobile; hide Social behind Labs; preserve old module redirects.
- Files/modules: `App.tsx`, `DesktopShell`, `MobileShell`, nav components, route types.
- Data risk: low; Daily Quest remains compatibility view.
- Migration dependency: shared projection contracts.
- Tests: viewport navigation E2E, back/forward/deep links, profile/notification/sync affordances, Social data still exportable.
- Rollback: shell feature flag restores legacy navigation.

### PR I — NOW and global Capture

- Goal: canonical NOW projection, bounded queue, one Capture entry; Daily Quest becomes a Task-referencing compatibility view.
- Files/modules: `HomePage`, `DailyQuestPage`, recommendation components, capture components/services.
- Data risk: medium for Daily Quest migration and capture materialization.
- Migration dependency: canonical ranking, capture tables, dual-read.
- Tests: ranking parity, no copied mutable Task state, confirm/reject/idempotency, multimodal negative cases.
- Rollback: legacy Home/Daily Quest flag; canonical data remains additive.

### PR J — PLAN convergence

- Goal: canonical Goal/Milestone/Task planning, dependencies/resources, versioned proposals; graph/timeline are projections.
- Files/modules: `LifeMapPage`, `LifeOSPlanner`, Goal/Roadmap/PathMap/Timeline components, planner services.
- Data risk: critical for Roadmap/plan acceptance mappings.
- Migration dependency: dry-run Roadmap report and canonical schema.
- Tests: propose/reject zero-write, accept exact transactional diff, resource/dependency validation, roadmap unresolved cases, visual smoke.
- Rollback: use legacy Life Map/Roadmap read-only; accepted canonical writes stay valid.

### PR K — OPS convergence

- Goal: Task CRUD and every matrix/list ranking consume canonical repositories/selectors.
- Files/modules: `TaskPage`, `PriorityMap`, `TaskList`, `TaskForm`, lifecycle commands.
- Data risk: high for edit/delete semantics.
- Migration dependency: dual-write/controlled-write confidence from PR F.
- Tests: CRUD and dependency transitions, deadline boundaries, optimistic conflict, offline/retry, legacy record edit round-trip.
- Rollback: return to legacy Task repository; block v2-only edits if not reversible.

### PR L — REVIEW convergence

- Goal: append-only events, Reviews, pressure/behavior projections, AI Reports; remove reconstruction from mutable snapshots where possible.
- Files/modules: `LogPage`, `ActivityLog`, pressure analytics, Daily Review, AI report components/services.
- Data risk: high for historical accuracy.
- Migration dependency: event backfill and source classification.
- Tests: metric parity, timeline stability after later Task edits, timezone windows, manual vs derived pressure, AI provenance.
- Rollback: render legacy analytics while retaining event records.

### PR M — recurring billing and entitlement projection

- Goal: add recurring Paddle catalog bindings, subscription lifecycle, customer portal, reconciliation, provider-independent authorization.
- Files/modules: billing API/webhook/service, new migrations, ME membership UI, scheduled reconciliation.
- Data risk: critical financial/access state.
- Migration dependency: subscription/entitlement schema and frozen legacy-overlap rule.
- Tests: sandbox lifecycle matrix, signature/replay/out-of-order/unknown events, legacy grants, reconciliation, environment mismatch.
- Rollback: disable new checkout; continue webhook/reconciliation for existing subscriptions; legacy grants remain readable.

### PR N — ME, notifications, integrations, cleanup gates

- Goal: finish ME ownership, connect notification persistence/producers, hide developer-only paths, then retire verified legacy reads/writes.
- Files/modules: `ProfilePage`, `NotificationCenter`, preferences/data controls, feature flags, compatibility repositories.
- Data risk: high only in cleanup phase.
- Migration dependency: all reconciliation gates and observation window.
- Tests: settings/profile/notification cross-device flows, export, production secret scan, zero legacy-read telemetry, rollback rehearsal.
- Rollback: restore legacy readers from feature flag. Do not delete legacy storage in the same PR that first disables reads.

## Required PR template fields

Every implementation PR must state:

- domain owner and affected canonical entities;
- exact legacy and target read/write paths;
- data classification and affected record counts in the test fixture/environment;
- forward migration, retry/idempotency, reconciliation, and rollback;
- feature flags and their default state;
- unit, integration, RLS, browser, build, and manual verification actually run;
- known unknowns and follow-up cleanup that is not yet authorized.

## Cutover gates

| Gate | Evidence required |
| --- | --- |
| Enable v2 reads | Complete backfill report; no critical unresolved refs; representative RLS reads |
| Enable v2 writes | Failure-injection and idempotency suite; complete export; rollback exercised |
| Disable legacy writes | One release of matching read/write telemetry and no unexplained divergence |
| Disable legacy reads | Zero legacy fallback reads for observation window; support runbook ready |
| Delete legacy data/code | Separate approval, immutable archive/export, checksums, restore rehearsal |
| Enable recurring billing | Paddle Sandbox full lifecycle and reconciliation; environment guard |
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
