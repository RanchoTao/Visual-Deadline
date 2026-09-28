# PR N review preparation

Scope: hardening follow-up for PR #136 on `codex/v2-recurring-billing`. This document describes the implemented recurring-billing path; it does not change the frozen product architecture.

## `processor.js` event flow

1. The HTTP webhook verifies the Paddle signature against the raw request body and validates `event_id`, `event_type`, and `occurred_at`.
2. Every call to `processProviderEvent()` supplies an explicit audit source: `webhook`, `reconciliation`, `migration`, or `manual_admin`. Missing or unknown sources fail before the event is claimed.
3. `billing_claim_event` records the event, source, environment, checksum, occurrence time, and processing attempt before effects are applied. A replay with a different source is rejected as `source_conflict` rather than rewriting provenance.
4. Duplicate succeeded or currently processing events return success without repeating effects. Retryable failures remain claimable with an incremented attempt count.
5. Subscription events fetch current Paddle subscription state before normalization. Transaction and adjustment events validate the immutable VD catalog mapping and provider environment before persistence.
6. If Paddle created a recurring transaction but the checkout endpoint failed to persist its local `payment_reference`, the processor verifies the environment-bound HMAC checkout binding from Paddle `custom_data`. It then creates only the missing pending payment association and re-enters the normal payment/subscription RPC path. A `subscription.created` event can recover the same association by fetching its trusted originating Paddle transaction.
7. Unknown, unsigned, tampered, wrong-environment, wrong-catalog, or user-mismatched evidence cannot create an association or entitlement.
8. The event is finalized as `succeeded`, `ignored`, or `retryable_failed`, with normalized subscription/payment references attached for audit.

## `repository.js` persistence flow

The repository is a service-role-only adapter over narrowly scoped database RPCs:

- `billing_claim_event` owns event idempotency, provenance, checksum, and retry state.
- `billing_recover_checkout_payment` acquires an environment/transaction advisory lock and idempotently restores a missing checkout association for an existing authenticated user. It does not grant an entitlement.
- `billing_apply_payment_reference` and `billing_apply_subscription_snapshot` acquire transactional locks, reject unknown provider evidence, apply ordering rules, and call the shared entitlement rebuild function.
- `billing_rebuild_entitlements` deterministically projects all independent legacy, admin, and recurring sources.
- `billing_finish_event` records the final outcome and evidence references.

Checkout recovery cannot bypass the normal projector: it creates a pending `payment_reference`, after which the same apply RPCs used by ordinary webhook processing must succeed before entitlement state changes.

## `domain.js` entitlement projection

`buildEntitlementProjection()` and the SQL `billing_rebuild_entitlements` implement the same source-union policy:

- valid Billing v1 `membership_grants` remain independent `legacy_membership_grant` or `admin_grant` sources with their original periods;
- a legacy `memberships` row is projected only when no more specific grant evidence exists for that user;
- recurring subscriptions are separate `subscription` sources and never shift or shorten legacy periods;
- `hasEntitlement()` authorizes `vd.plus` only when at least one active entitlement row covers the requested instant.

Recurring projection rules remain: active/cancel-scheduled/canceled access is bounded by the paid period end; past-due adds at most 72 hours; paused and trialing are inactive; a full current-period refund inactivates only the affected recurring source; a partial refund remains financial evidence without revoking unrelated access.

## Ordering and idempotency

- Billing events are unique by provider event ID and claimed before effects.
- Same-ID concurrent delivery is serialized by the claim RPC; only the winning claimant applies effects.
- Provider environment is part of subscription, payment, and recovery identity.
- Subscription snapshots compare Paddle `updated_at`; older snapshots cannot replace newer state. At equal provider time, normalized terminal/severity ordering prevents active state from undoing paused or canceled state.
- Payment states are monotonic (`pending` < `failed` < `paid` < `partially_refunded` < `refunded`), so delayed completion cannot undo an approved refund.
- Recovery is unique on provider/environment/transaction and advisory-locked, so retries cannot create a second financial or access effect.

## Refund and cancellation precedence

- An approved full refund has higher payment precedence than delayed payment completion and makes the matching current-period recurring entitlement inactive.
- Partial refunds update financial evidence only.
- Cancellation scheduled at period end remains entitled through that period end.
- Canceled state does not create access after the already-valid paid interval.
- Newer paused or canceled provider truth cannot be overwritten by an older active event.
- Legacy and admin sources are evaluated independently, so a recurring refund or cancellation does not revoke an unrelated valid source.

## Reconciliation

`/api/billing-reconcile` requires `CRON_SECRET`, both processing and reconciliation rollout flags, and valid environment-isolated catalog configuration. It enumerates non-terminal local subscriptions, fetches current Paddle state, and constructs deterministic `reconcile_...` events. Changed provider state is passed through the same `processProviderEvent()` and entitlement projector as webhooks with `event_source = 'reconciliation'`. Unchanged rows only receive an idempotent entitlement rebuild. The response reports repaired, unchanged, and failed counts.

Reconciliation events are therefore distinguishable from Paddle-delivered webhooks in `billing_events`; they do not impersonate Paddle audit evidence.

## RLS and security assumptions

- `subscriptions`, `payment_references`, and `entitlements` enable RLS. Authenticated users may select only rows with their own `auth.uid()` and cannot insert, update, or delete provider evidence.
- `billing_events` remains service-role-only audit state.
- All mutation RPCs, including checkout recovery, revoke execution from `public`, `anon`, and `authenticated` and grant it only to `service_role`.
- The recovery RPC verifies the target user exists, rejects conflicting transaction ownership, and relies on a server-verified HMAC binding. Browser checkout completion alone never grants `vd.plus`.
- `PADDLE_API_KEY`, environment-specific webhook secrets, and the Supabase service-role key remain server-only. Portal URLs remain short-lived, `no-store`, and unpersisted.
- `PADDLE_ENVIRONMENT` and `VITE_PADDLE_ENVIRONMENT` accept only the exact values `sandbox` or `production`; missing, differently cased, padded, or otherwise invalid values fail closed.

## Compatibility and rollout invariants

- Recurring checkout, processing, and reconciliation flags still default to disabled.
- Billing v1 tables and one-time catalog identifiers remain intact and readable.
- Existing Billing v1 rows are preserved; migrated legacy billing events are explicitly classified with `event_source = 'migration'` and `provider_environment = 'legacy_unknown'`.
- Entitlements remain the only application authorization source.
- Reconciliation reuses the webhook processor/projector rather than directly granting access.

## Changed files

- `api/billing-checkout.js`
- `api/billing-reconcile.js`
- `api/billing-subscription-checkout.js`
- `api/billing-webhook.js`
- `docs/BILLING_RECURRING_V2.md`
- `scripts/check-v2-migrations.mjs`
- `server/billing/domain.js`
- `server/billing/processor.js`
- `server/billing/repository.js`
- `server/billing/runtime.js`
- `src/domain/billing/contracts.ts`
- `src/services/billing.ts`
- `supabase/migrations/20260924121019_v2_recurring_billing.sql`
- `supabase/migrations/20260927101132_billing_service_role_table_privileges.sql`
- `supabase/tests/recurring_billing_lifecycle_test.sql`
- `supabase/tests/recurring_billing_rls_test.sql`
- `supabase/tests/billing_service_role_privileges_test.sql`
- `tests/recurringBilling.test.mjs`
- `REVIEW_PREPARATION.md`

The pre-existing untracked reviewer artifact `pr136.diff` was not modified or included.

## Validation evidence

- `npm test`: passed, 279 tests; recurring-billing behavioral suite 30/30; additive migration static checks passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with Vite 8.0.11; the existing large-chunk advisory remains non-fatal.
- Empty local Supabase database migration chain: passed through `20260924121019_v2_recurring_billing.sql`.
- `npx supabase test db --local`: passed, 3 PR N SQL files / 67 pgTAP assertions.
- Representative Billing v1 fixture upgrade: passed. Original order, grant, membership, note, periods, and event outcome were retained; legacy environment/source classification and the corresponding provider-independent entitlement were verified.
- `git diff --check`: run immediately before commit; result recorded in the commit handoff.

## Sandbox acceptance evidence

- Live Sandbox checkout exposed a PostgreSQL privilege defect: the `service_role` backend could bypass RLS but lacked ordinary table privileges for `payment_references` and related billing tables. The resulting server error was `permission denied for table payment_references`.
- The additive `20260927101132_billing_service_role_table_privileges.sql` migration grants `service_role` explicit `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the seven billing-owned tables, without expanding `anon` or `authenticated` write access or disabling RLS.
- The migration has been applied to the remote Supabase project. The linked remote migration chain now includes it, and remote service-role CRUD was verified for all seven covered tables.
- A real Paddle Sandbox transaction completed and its subscription became active. Paddle generated the expected platform events, but the provider created zero notification entities for its active, subscribed Platform destination. This is an external Paddle Sandbox platform-notification creation anomaly, not a VD processor failure.
- Paddle's Sandbox webhook simulator then ran a `subscription_renewal` scenario against the real subscription. All seven signed deliveries returned HTTP 200. The processor recorded the expected billing events, marked the payment reference paid, normalized the subscription as active, and projected one active `vd.plus` subscription entitlement with reason `recurring_active`.
- `PR_N_PROCESSOR_GATE = PASS`. The remaining external acceptance limitation is real Platform notification creation in Paddle Sandbox.
- Recurring rollout flags remain disabled. This evidence does not treat the external Platform notification anomaly as resolved or claim production readiness.

## PR O — global account surfaces, notifications, and cleanup gates

### Owning surfaces and route contract

- The only primary workspace destinations remain `NOW / TASKS / PLAN / OPS / REVIEW` (`/app`, `/app/tasks`, `/app/plan`, `/app/ops`, `/app/review`).
- Avatar opens the existing non-primary `/settings` Profile / Account / Settings surface; it now uses the saved avatar or account initial.
- Membership control opens non-primary `/billing`. Profile no longer renders a duplicate Billing v1 purchase widget; Billing retains the compatible Legacy one-time Billing v1 disclosure.
- The bell opens non-primary `/notifications`, an authenticated deep-linkable Notifications surface. Its unread indicator is derived from the current account notifications.

### Persistence, cross-device behavior, and security

- No migration was added. PR O consumes existing owner-RLS `profiles.data` and `notifications` rows only.
- Account reminder enablement, time, and types are persisted with the existing profile payload. Browser notification permission is deliberately device-local and is neither synchronized nor fabricated.
- Remote notification rows are read for the authenticated owner. A read receipt updates only that owner's row. Local/cloud merging treats `isRead` as monotonic, so a stale device cannot turn a remote-read notification unread.
- Existing local profile, reminder, and notification caches remain active as rollback-compatible legacy paths. No provider, billing catalog, webhook, Paddle environment, Production secret, or recurring rollout flag was changed.

### Cleanup gating and rollback

- `evaluateLegacyCleanupGate()` requires a matching read/write release, zero unexplained divergence, zero fallback reads, a support runbook, and a completed rollback rehearsal before it permits retirement.
- PR O supplies the gate/telemetry contract but does not claim its observation window is complete. Legacy reads, writes, exports, and restore paths remain enabled; no deletion occurs in this PR.
- Rollback is to retain the current global routes and re-enable use of existing local caches. There is no destructive or provider-state rollback action.

### PR O validation evidence

- `npm run test:life-controller`: passed, 284 tests, including five PR O behavioral cases for trigger routing, monotonic notification merge, device-local permission boundaries, cleanup gates, and account/export compatibility.
- `npm run test:sql:static`: passed: additive migration static lint, Vercel SPA deep-link check, and production browser-source secret-exposure scan.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-chunk advisory is non-fatal.
- `git diff --check`: passed.
- Browser: public home rendered at desktop and 390px mobile without a Vite error overlay. An unauthenticated `/notifications` deep link redirected safely to `/login?next=%2Fnotifications`.

### Known remaining acceptance items

- The local Vite runtime had no usable authenticated Supabase session/configuration, so visual interaction with the authenticated account, billing, and notification content still needs a signed-in desktop/mobile smoke test.
- The legacy observation window, telemetry evidence, support runbook, and rollback rehearsal are intentionally not complete. They block disabling legacy reads/writes or any deletion, not the additive PR O routing/persistence implementation.

## PR #139 — closed-beta HOLD review hardening

See `CLOSED_BETA_READINESS_REPORT.md` for exact control semantics and remaining pre-beta gates.

- Replay rejection is in `consume_ai_quota`; `api/ai.js` only calls DeepSeek after a fresh boolean reservation. Four prior-status tests, HTTP processor/concurrent replay tests, and real two-connection PostgreSQL locking evidence cover the authority boundary.
- `server/platform/registration.js` owns prevalidate/create/redeem/dispatch and checks ambiguous redemption commits before compensation. Repository dispatch uses supported signup resend; UI explicitly distinguishes sent/unsent. OAuth action gates, phone existing-only OTP, Auth creation trigger and restrictive workspace RLS jointly enforce invite authority.
- Browser Turnstile includes render/token/error/expiry/reset/cleanup; both client/server dev bypasses are explicit and unavailable in production.
- Account transitions, admin grant/revoke, invite creation and flag changes each call a service-only SQL RPC. Actor checks, mutations and audit are transactional. Account history is superseded, not deleted; backend audit UPDATE/DELETE is revoked. Grant/revoke does not mutate Paddle subscriptions or unrelated entitlements.
- New migration: `20260928023311_closed_beta_review_hardening.sql`. Real chain execution also required renaming a conflicting constraint in the original, not-yet-deployed Closed Beta migration. Existing deployed billing migrations were not edited.
- Scope: platform/API registration/admin/AI boundaries; auth/Turnstile UI; two Closed Beta SQL files; pgTAP and behavior tests; isolated local PostgreSQL harness; static lint; `.env.example` explicit browser bypass default OFF; review/readiness documentation. No routes, billing provider rules, Production settings, secrets, or unrelated local files changed.
- Executed database evidence: 14-migration empty-database chain; pre-beta account preservation; 258 passing pgTAP assertions (Closed Beta 114); actual concurrent replay; grant/revoke/invite/account audit-failure rollback; existing billing RLS/lifecycle/legacy preservation. Security advisor reports no error-level issues on the local database.
- Database runtime: isolated native PostgreSQL 17.9 + pgTAP 1.3.4. Auth/Storage base objects use the documented test bootstrap, not a running GoTrue/SMTP stack. No remote project was mutated. No actual DeepSeek/Cloudflare/email provider call is claimed.
- Validation commands: `npm test`, `npm run typecheck`, `npm run build`, `git diff --check`, `node scripts/test-closed-beta-postgres.mjs`, local `supabase db advisors --type security --level error --fail-on error`. Final command results are recorded in the readiness report and PR handoff.
- Remaining deployment/product gates: staging Auth/SMTP/Turnstile and durable limiter setup; Paddle environment-isolation acceptance; Aliyun SMS timeout; authenticated mobile overflow. Review-fix validation does not remove those gates or authorize merge/rollout.

## PR #139 re-review — two P1 follow-up fixes

### AI flow and evidence

1. Browser sends a mode, bounded user input/context and an optional allowlisted contract variant, never authoritative systemInstructions. Developer-local provider mode stays compatible.
2. /api/ai validates the contract before quota reservation. The server supplies canonical feature-specific system instructions in the actual provider system role. Historical review, legacy review and goal-roadmap variants are explicitly allowlisted for their modes.
3. Capture/goal decomposition (and the existing goal roadmap) use DeepSeek JSON object response mode plus server JSON/shape validation. Decomposition IDs, dates, milestones, categories, importance and dependency cycles are checked. Invalid or truncated output is rejected before successful usage/artifact creation; text review/analysis remains unchanged Markdown.
4. Server provenance comes from the provider response model (configured request model only when the provider omits its model), server completion timestamp and actual provider. Usage finalization records the returned model. Capture passes provenance through interpretation/review/confirmation; Plan and compatible report artifacts also persist it. No browser-default model is substituted.
5. Tests inspect the exact outbound provider request for five modes and three retained variants, exercise the real JSON parsers and run the actual browser Capture -> API -> provider-fixture -> artifact-provenance path. No live model acceptance is claimed.

Reference: [DeepSeek JSON mode](https://api-docs.deepseek.com/guides/json_mode/).

### Quota and audit transaction

- Additive migration: `20260928061948_closed_beta_ai_contracts_quota_periods.sql`. No existing migration was changed in this follow-up.
- Canonical period: configured ai_quota_policies.period_interval, UTC [start,end), anchor 2000-01-01. Fixed durations, months, years and positive mixed calendar intervals are supported; session timezone/DST cannot alter boundaries.
- Reset inserts/updates one finite period_reset compensation record equal to current used count and expiring exactly at period end. Repeated resets do not stack. Period matching prevents old reset compensation applying after policy changes; manual grants and explicit unlimited access remain separate.
- Grant/reset/consume share a user advisory transaction lock. Service-only beta_grant_quota/beta_reset_quota recheck actor permissions and commit mutation + audit together. Audit failure rolls back both new grants and reset inserts/updates. Existing RLS, owner reads, browser mutation denial and function grants are preserved.

### Changed files in this follow-up

- Server/API: `api/ai.js`, `api/admin.js`, `server/platform/aiContracts.js`, `server/platform/admin.js`, `server/platform/repository.js`.
- Browser provenance/contract wiring: `src/services/aiClient.ts`, `src/domain/capture/interpreter.ts`, `src/App.tsx`; CaptureIntakePanel, PlanPage, ReviewPage, AIReviewPanel, AITaskAnalysisPanel and GoalRoadmapPanel.
- Database/validation: new migration above; `supabase/tests/closed_beta_quota_periods_test.sql`; `scripts/test-closed-beta-postgres.mjs`, `scripts/check-v2-migrations.mjs`; closedBetaPlatform, captureFirst and reviewWorkspace test files.
- Evidence: `CLOSED_BETA_READINESS_REPORT.md`, this document and PR #139 body. No local environment files, billing/provider code, Production settings or unrelated files are included.

### Executed validation

- `npm test`: **339/339**, including 22 new behavior cases; additive static lint (10 migrations), SPA routing and 187-browser-file secret scan pass.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass; existing non-fatal bundle-size advisory remains.
- `node scripts/test-closed-beta-postgres.mjs`: fresh empty local database, **15-migration chain** and **314 pgTAP assertions** pass (114 Closed Beta + 56 quota periods + 77 billing privileges + 32 recurring RLS + 21 lifecycle + 14 legacy).
- Real independent PostgreSQL connections: duplicate AI request admitted once; simultaneous resets produce one compensation row; reset/consumption serialize without lost or compounded quota.
- Local `supabase db advisors --type security --level error --fail-on error`: no issues.
- The prior verified evidence was 317/317, 14 migrations and 258 assertions. This follow-up supersedes those totals. The PR body no longer says SQL/pgTAP was not executed.
- No remote migration, live DeepSeek/Turnstile/SMTP request, Paddle operation or Production deployment was performed. Local validation does not remove staging/provider/product gates or authorize merge.

## PR #139 final hardening — four P1 and two P2 follow-ups

### Implemented authority boundary

- New additive migration: `20260928141713_closed_beta_admin_command_hardening.sql`, created via Supabase CLI. No earlier migration is edited in this follow-up.
- All ten admin mutations now use one service-only `beta_admin_command` dispatcher. Actor/key receipt uniqueness, canonical SHA-256 action/input fingerprint and advisory transaction lock provide exact committed-result replay, with HTTP 409 `IDEMPOTENCY_KEY_REUSED` for different action/payload. Defaults, relative periods, IDs and invite randomness are resolved only on first execution. Replays recheck current actor authority and do not recompute effective access from later state.
- Domain mutation, audit, receipt and private invite result commit together. Invite disable/application review acquire row locks, preserve before/after evidence, validate statuses and record database-authored reviewer/time. Audit, receipt and private-secret fault injection verifies rollback; failed commands do not poison their retry keys.
- Invite plaintext is absent from audit/general receipts. Only a non-Data-API private schema stores the narrowly scoped replay secret. No application role, even service_role, can browse it; the dispatcher retrieves it for the matching authorized actor/key. Trusted DB owners/backups must treat it as sensitive. Direct worker execution is revoked to prevent receipt bypass. See `docs/ADMIN_API_CONTRACT.md` for retention/security assumptions and client retry contract.
- Pro option A: explicitly unsupported for Closed Beta. Free + Plus remain authoritative; reserved Pro policy is disabled and cannot be accidentally enabled. No new capability, billing/provider logic, routes or rollout changes.
- Canonical AI contract determines usage feature: roadmap is goal_roadmap, both review variants are review, plain pressure_analysis remains pressure_analysis, decomposition is goal_decompose. Provider/model/output/provenance authority from the earlier fix is preserved.
- Central `aiPricing.js` uses optional versioned, server-only pricing configuration and provider token evidence. It distinguishes cached input and records estimates for the actual returned model. Missing/invalid pricing or insufficient usage stays NULL/unknown, not zero; explicit priced zero is tested separately. Existing default-zero rows with no pricing provenance are classified unknown. No actual tariff, pricing config or provider charge is invented/configured. Admin usage projection preserves unknown/zero/version distinctions.

### Changed files

`api/admin.js`, `api/ai.js`; `server/platform/admin.js`, `aiContracts.js`, new `aiPricing.js`, `repository.js`, `runtime.js`; new migration above; new `closed_beta_admin_commands_test.sql`, adapted existing platform/quota pgTAP suites; `scripts/test-closed-beta-postgres.mjs`, `scripts/check-v2-migrations.mjs`; `tests/closedBetaPlatform.test.mjs`; `docs/ADMIN_API_CONTRACT.md`; this document and `CLOSED_BETA_READINESS_REPORT.md`.

### Executed validation — supersedes earlier totals

- `npm test`: **356/356** pass, including 17 new HTTP retry/cost cases and expanded exact outbound provider feature/cost assertions. Static SQL lint covers 11 additive V2/billing/beta migrations; SPA routing and 187-file production browser secret scan pass.
- `npm run typecheck`, `npm run build`, `git diff --check`: pass. Existing non-fatal bundle-size advisory remains.
- Full empty local PostgreSQL 17.9 + pgTAP 1.3.4 chain: **16/16 migrations** applied; pre-beta admission preserved. All **13 pgTAP suites / 554 assertions** pass, including 146 new command/security/rollback assertions, existing billing, REVIEW, legacy coexistence, schema/owner RLS and quota periods.
- Real two-connection PostgreSQL tests cover create_invite, grant_entitlement, grant_quota, reset_quota, account control, feature flag, invite disable and application review. A first open transaction forces the other connection to wait before commit; both return the original result, one receipt/audit, and reject changed payload/action. Actual runtime.sha256 of the returned invite matches its persisted hash and redeems successfully through the existing registration RPC. AI replay and consume/reset concurrency also pass.
- The harness now discovers all root `*_test.sql` suites. Historical owner-RLS fixtures receive rolled-back pre-beta admission through a test-only Auth insert trigger, not disabled RLS; Closed Beta admission suites receive no bypass. All tests execute actual PostgreSQL ACL/RLS/locks, with the existing minimal Supabase Auth/Storage bootstrap, not live GoTrue.
- Local error-level Supabase security advisor: no issues. No remote database migration, live provider request, secret/configuration change, Paddle/Production operation or merge performed. Reviewer verification and staging/public-beta acceptance remain HOLD.

## PR #139 — final cross-repository vd-admin-v1 adapter

Full contract, role matrix, explicit unsupported controls and reproduction steps: `docs/VD_ADMIN_V1_ADAPTER.md`.

- Pinned read-only Admin baseline `f60840138af153d552c7bcb84b7ca605b225e4f0`; exported JSON fixture includes contract/source SHA-256 and representative responses. No Admin repository modifications/business-rule copies.
- New service-to-service GET/POST routes now share the existing physical `api/admin.js` behind explicit Vercel rewrites (deployment fix below); the internal adapter remains separate. Fixed-size digest constant-time internal token comparison; contract/UUID validation; authoritative enabled VD role + actor account checks on reads, commands and receipt retrieval. X-Admin-Role cannot elevate privileges. No browser token/storage path or new navigation.
- Eleven implemented read resources use safe operational DTOs, query-bound keyset cursors and DB-side filtering before expensive user projection. No permanent first-100 cap; 130-user three-page tests prove order/no duplicates. Private Auth/profile/task/feedback payload, code_hash and provider credentials stay excluded. Unknown activity/cost/kind stays null. Existing entitlement union and quota snapshot remain the authority.
- Every supported action maps to existing beta_admin_command. Additive migration `20260928150104_closed_beta_admin_v1_adapter.sql` captures immutable transport alias/target/reason/input on the domain audit INSERT in the same transaction. Existing command receipts/locking/private invite replay are reused, not replaced. Quota snapshot is committed into the original result. API receipt comes from the committed audit row; missing/mismatched receipt fails closed.
- Role expansion is only existing application-review worker access for reviewer; other workers remain service-inaccessible. Revoke requires explicit owned grantId; implicit bulk revoke, absolute quota limit/negative adjustments and invite enable/expire are clearly rejected, not fabricated. Free + Plus only; Pro 409. Email commands are EMAIL_INTEGRATION_PENDING with zero side effect. restricted-content disabled for everyone.
- All old behavior/security suites pass. Real Admin gateway -> handler -> local service-role PostgreSQL bridge passes **34 checks**, including all reads, mapped mutations, exact invite replay, 5 concurrent identical requests/one receipt+audit, conflicting key 409, forged owner header/no elevation, revoked actor/no secret replay (including revocation while waiting on the command lock) and no subscription mutation.
- Executed fresh local PostgreSQL 17.9 + pgTAP 1.3.4: **17/17 migrations; 14 suites / 714 assertions** (160 new adapter assertions). Includes rollback for a UUID colliding with ambiguous historical audit, with the original row preserved and no new receipt/effect. Existing AI replay, quota races and eight legacy command lock/replay cases still pass. Minimal Auth/Storage bootstrap remains test-only. No actual deployed HTTP/GoTrue/SMTP/provider acceptance is claimed. Local error-level Supabase advisor: no issues.
- Validation: **npm test 408/408** (52 new adapter behavior/contract tests); typecheck, build, 12-migration additive static lint, API/SPA routing, 187-file browser secret scan and diff check pass. Existing non-fatal bundle-size advisory remains.
- Changed scope: new `api/admin-v1.js`; three `server/platform/adminV1*.js` modules; new additive migration and adapter pgTAP suite; `.env.example` empty server-token placeholder; Vercel rewrites/routing test; static lint/secret scan; package test entry; adapter behavior tests/exported fixture; cross-repo test script; adapter docs and this review section.
- **HOLD**: no merge, remote migration, real credentials, environment changes, provider/Paddle operation or rollout. Actual trusted server token provisioning and two-deployment integration remain unexecuted; earlier staging/public-beta acceptance gates are not removed.

## PR #139 — Hobby deployment entrypoint consolidation

- Vercel confirmed deployment `dpl_EU9QzSTvepVs3SmrJJ1M6MapBtGa`, head `50f688d7d09cf88b1a7fdc13c9bca7f5d80f596b`, failed with `exceeded_serverless_functions_per_deployment`: 13 physical API files exceeded the Hobby limit of 12.
- Removed only `api/admin-v1.js`. `api/admin.js` is a thin dispatcher; the unchanged legacy handler retains Supabase-user authentication and `action=...` behavior. v1 business logic remains in `server/platform/adminV1.js`, with unchanged public routes/contract and internal-token/contract/actor/authoritative-role authorization. Rewrite selection explicitly requires the marker and contract; arbitrary legacy resource/operation parameters, absent/incorrect contract and ambiguous markers do not select v1. The marker is routing metadata, not proof of origin or an authentication secret.
- Updated only the two admin rewrite destinations; billing APIs/cron, AI, beta, feedback, intake and final SPA fallback remain unchanged. No schema, billing/provider, production configuration or Admin-repository change.
- Added 18 dispatcher/deployment regression cases. Existing 52 v1 contract tests and pinned Admin fixture are unchanged. Added conservative recursive function counting to `npm test` static gates; a thirteenth entrypoint fails the regression test.
- Cross-repo harness now exercises the shared physical entrypoint after the same explicit rewrite, not the internal v1 handler directly. Real local PostgreSQL continues to verify roles, transactions, audit, replay and concurrency; the HTTP/PostgREST transport remains a local test bridge, not a deployed authenticated two-service acceptance claim.
- Executed final rerun: `npm test` **426/426**; `npm run typecheck`, `npm run build`, all static checks (including **12/12 physical API entrypoints**) and `git diff --check` pass. Fresh isolated local PostgreSQL chain **17/17 migrations**; all **14 pgTAP suites / 714 assertions** pass, along with existing real two-connection lock/replay tests. Pinned Admin gateway -> rewritten shared function -> local PostgreSQL bridge **34/34 checks** pass. Existing non-fatal bundle-size advisory remains.
- Real Preview deployment evidence is recorded in the PR body and delivery report after pushing this validated commit. Public-beta release remains HOLD; do not merge or execute remote migrations.
