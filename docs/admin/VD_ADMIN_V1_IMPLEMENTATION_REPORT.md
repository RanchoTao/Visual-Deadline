# VD authoritative Admin backend v1

## Status and boundaries

Implemented from main `aeb969352b125e9c1a173abadf5c1f5a60c3149a` on `codex/vd-admin-v1`. Consumer is the independent Admin-1 console at `f60840138af153d552c7bcb84b7ca605b225e4f0`. The console remains contract-tested; this PR adds VD-owned SQL authority and local integration evidence. No remote migration, production operational write, manual deployment, real email, Paddle Production action, or merge has occurred.

Operational correction: the first authorized branch push triggered the repository's existing automatic Vercel Preview integration. Preview `dpl_FtboXA7iCN8xwLcKvkga2t4Ex8gD` was identified as preview-only, removed, and verified absent. No runtime/data requests were made to it. `git.deploymentEnabled["codex/vd-admin-v1"]=false` now prevents subsequent automatic branch deployments, following the [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration). Production was not promoted or changed. The first Linux CI install also exposed two missing optional peer entries in the inherited lockfile; the lock was repaired without changing direct dependencies.

The existing `codex/closed-beta-platform` checkout and its three unpushed commits were preserved. Its proposed schema must be reconciled explicitly if that work lands before this PR.

## Migrations

1. `20260928064909_admin_v1_authority.sql`: operator directory, audit and encrypted receipts, tier grants, quotas, controls, beta/invitation/outbox tables, private RPCs and additive restrictive policies.
2. `20260928065257_admin_v1_commands_reads.sql`: transactional commands, bounded metadata reads, scoped content inspection and throttled beta application submission.

Both are transaction-wrapped. All 14 repository migrations were applied in order to a fresh local PostgreSQL 17.9 database. No historical migration was edited.

## Routes and resources

`GET /api/internal/admin/v1/{resource}` and `POST /api/internal/admin/v1/{resource}/actions` rewrite to `/api/internal/admin`. `/v1/admin/{resource}` and `/v1/admin/{resource}/actions` are equivalent aliases for the current Admin gateway. Configure its base URL to the VD origin, with no appended API path. SPA fallback remains last; billing routes and cron configuration remain intact. Routing follows the [Vercel rewrite contract](https://vercel.com/docs/routing/rewrites).

Real resources: users, beta-applications, invitations, entitlements, quotas, bans, audit, email, settings; ai-usage also has ledger reads. Dashboard, feedback, analytics, infrastructure and deployments return empty/pending summaries. No inferred metrics or raw provider payloads are returned. Reads use UUID cursors, stable UUID order, maximum 100 rows and server-side email/name search. UUID cursors do not promise chronological order or snapshot isolation across pages.

Users expose identity metadata, tier/capabilities, at most 50 grant/source/override records, quota snapshot, control state and counts. Task/goal counts are physical records across legacy and canonical tables; an imported legacy record and its canonical counterpart can both count. They are not a product engagement KPI. Ordinary reads never expose profile JSON, task/goal/review bodies, code hashes, encrypted receipts or internal credentials.

## Authentication and transactions

Required headers: Bearer internal token, `X-Admin-Actor`, `X-Admin-Role`, `X-Admin-Contract: vd-admin-v1`. Tokens are compared with fixed-length SHA-256 digests and `timingSafeEqual`. The active SQL operator directory and resource/action rules independently authorize reads and mutations. A row lock prevents directory revocation racing a command already holding its authorization lock. No email or metadata roles are inferred.

Mutations require a UUID body `requestId` matching `Idempotency-Key`, a bounded target, a reason of 8–1000 characters and an action-specific input object. One service-only `admin_command` executes the mutation, immutable audit and AES-256 encrypted receipt in one PostgreSQL transaction. Actor/request advisory locks serialize duplicates; canonical JSONB binds actor, role, resource, action, target, trimmed reason and input. Equal retries return the original receipt; changed retries conflict. Same command should be retried with its original request ID after uncertain transport results.

## Entitlements

Target model is Free / Plus / Pro. Free has no premium capability, Plus has `vd.plus`, Pro has `vd.plus` and `vd.pro`. Independent grants have a source category, separate validity interval and explicit revocation. They project into `operator_grant` entitlement rows; PR N's existing projector preserves this namespace. Existing subscription/legacy Plus rows are unchanged. Pro is an authoritative manual grant capability here; no Paddle Pro product or Pro product functionality is introduced.

SQL resolves `pro > plus > free`. Current entitlement expiry is the end of the connected interval union containing now, using PostgreSQL [range aggregation](https://www.postgresql.org/docs/17/functions-aggregate.html). Future disconnected periods do not extend present access. Permanent grants require explicit `permanent: true` and `source: testing`. A tested settings response declares `vd-admin-tiers-v1` with Plus and Pro grant support. Admin grants never call legacy `billing_admin_grant`, edit a subscription or invoke Paddle.

## AI quota and account controls

Beta defaults are UTC daily request units: Free 20, Plus 200, Pro 500. These values are operational beta policy, not pricing promises. Effective tier chooses policy; explicit limit overrides, positive deltas and time-bounded unlimited testing overrides are independently revocable. Only owner can issue unlimited and only to an account with an active testing grant. Override IDs are available in `quotaOverrides` on VD quota/user reads; the current console projects only its approved display fields.

`ai_reserve` serializes on the user lock shared with operator commands. Pending reservations count immediately; exhausted requests never call the provider. `ai_settle` retains successful/failed/cancelled/released events and available token/cached-token/latency data. Cost/currency remain unknown unless authoritative cost evidence is supplied; no price is invented. Reset changes a daily allowance epoch and retains all historical usage; live pre-reset reservations continue consuming capacity. A per-instance 60/hour limiter remains abuse friction, with old buckets discarded.

Provider calls time out after 30 seconds; stale reservations expire after two minutes and are marked released on the next reservation. If the provider succeeds but settlement transport fails, the API fails closed and leaves the reservation pending rather than falsely marking provider usage failed. Production acceptance must include durable monitoring/reconciliation of these rare uncertain settlements; no external provider reconciliation worker is implemented in this PR.

Restricted/suspended/banned status blocks cloud writes, AI, intake and user-initiated billing endpoints. New restrictive INSERT/UPDATE/DELETE policies supplement existing owner RLS on 22 product tables and storage objects. Read/export and local data remain available. `account_bootstrap()` exposes only the signed-in user's state/tier; UI shows blocked or unknown status without deleting data. Expired controls resolve to normal. These are VD controls: no Supabase Auth ban or session revocation occurs; mutation results say `authProviderPropagation: not_requested`. A future Auth reconciler must separately record provider-confirmed outcomes.

## Beta, invitations and email

`POST /api/beta/apply` is disabled unless `VD_PUBLIC_BETA_APPLICATIONS_ENABLED=true`. Enabled requests require configured Turnstile secret, expected hostname and `beta_apply` action, and a separate HMAC rate key. Payload is bounded to 8000 UTF-8 bytes; PostgreSQL enforces duplicate email suppression and hourly boundaries of 10/IP, 3/email. IP addresses are HMACed; only the platform-overwritten Vercel address is trusted in deployment. Responses do not enumerate existing applicants.

Invitation codes use 24 random bytes (192 bits), SHA-256 storage, masked ordinary reads and bounded expiry/capacity. The creation command returns the full code; retrying that same authorized command returns its original encrypted receipt. Codes are not recoverable from ordinary reads or the audit log. Redemption derives confirmed identity from Supabase Auth, serializes capacity with a row lock, binds recipient ownership for application invitations and records cohort/source. Same user's retry is idempotent; another user cannot replay an exhausted code. A successful redemption persists beta admission even if the original invitation is later disabled/revoked. Account control can still block that user.

Approve-and-email atomically creates the invite, updates application state, creates an allowlisted outbox row and writes audit. Email resend copies an existing row's approved template/recipient/payload; arbitrary HTML/recipient mutations are rejected. Status remains queued; no delivery claim, sender, provider integration or worker exists. A future delivery design must resolve secure invitation links without putting plaintext codes into ordinary projections/logs.

`has_beta_access(uuid)` is a service-only helper for redemption, explicit beta allow grants, active owner and active testing grants. It is not a global gate. Future signup is code → ordinary Supabase signup/confirmation → authenticated `/api/beta/redeem` → beta access → workspace admission. `user_metadata` is never evidence of admission.

## Restricted content

Owner-only inspect requires case reference, category, scope and a valid interval no longer than 31 days. Audit is inserted before bounded content selection; SQL commits before HTTP returns. Up to 50 items expose only ID, title (1000 characters), content (6000), createdAt and updatedAt, with a 240000-byte internal result bound. Exact retry data is encrypted in the command receipt. Audit snapshots record authorization metadata, never content. There is no ordinary restricted-content GET.

## Validation evidence

- Product regression: `npm test` (291 existing domain tests plus 6 Admin boundary tests), `npm run typecheck`, `npm run build`, static migrations/routing/browser-secret scan and `git diff --check`.
- Fresh actual PostgreSQL: 14 applied migrations, 201 Admin assertions including independent-connection quota/idempotency/invite races and forced audit rollback.
- Existing SQL regression: all 10 pgTAP files, 241 assertions.
- Actual production-mode Admin Next server → VD handlers → real SQL: 72 HTTP/E2E assertions; eight mutations each matched exactly one authoritative audit. Password/AAL1 rejection, enrollment/challenge fixture, AAL2 page/API, logout, users, invitations, approval/email queue, tiers, revocation, quota, suspend/unban and audit were exercised. AI success/failure also used a local provider double and real reservation/settlement SQL.

The local harness substitutes Supabase Auth/REST transport and AI provider responses. It does not prove real GoTrue/TOTP, managed PostgREST grants, hosted Storage behavior, Vercel deployment routing or email delivery. No real production credentials are needed. Reproduction steps and acceptance gates are in the security review and rollback guide.
