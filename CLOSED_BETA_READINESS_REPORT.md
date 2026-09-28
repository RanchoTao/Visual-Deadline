# Closed Beta readiness report

## Implemented contracts

- Additive schema/RLS for beta applications, cohorts, invite redemption, admin roles/audit, admin access grants, AI quota/ledger, account controls, moderation, feedback, flags and email events.
- Chinese `/beta/apply`, server-side invite registration, server-only DeepSeek proxy and admin API contract.
- Existing billing and recurring entitlement records remain unchanged; admin gifts add independent `admin_grant` sources.

## Required external setup before production enablement

1. Review and deploy both Closed Beta migrations to non-production staging first. Local PostgreSQL execution is complete; no remote deployment was performed during these review fixes.
2. Configure server-only Supabase service role, DeepSeek, Turnstile secret, and an external rate-limit provider.
3. Configure the browser Turnstile site key and validate Turnstile in the production hostname.
4. Seed the initial owner `admin_roles` row and beta cohorts/invites through a controlled operator runbook.

## Gates not claimed by code alone

No production secrets were configured, no Paddle settings were changed, and no real provider call was made. Code/SQL review fixes pass local validation below. This is not public/production beta readiness.

## PR #139 HOLD fixes — 2026-09-28

- AI replay: any existing `(user_id,request_id)` is rejected with `AI_REQUEST_REPLAY` regardless of processing/succeeded/rejected/failed status. Reservation/duplicate detection share a per-user transaction advisory lock. API replay returns 409 without a provider call or ledger rewrite.
- Invite authority: phone OTP uses `shouldCreateUser:false` and login-only copy. OAuth action gates stay disabled even if old env flags are enabled. A BEFORE INSERT Auth guard requires server-controlled app metadata for GoTrue creation; user metadata cannot preauthorize. Workspace writes additionally require committed redemption. Existing users are grandfathered once at migration time.
- Turnstile: browser renders the challenge, submits the token, clears expiration/errors, and removes/recreates widgets after attempts. Browser bypass requires Vite DEV plus `VITE_TURNSTILE_DEV_BYPASS=true`; server bypass requires non-production plus `VD_ALLOW_TURNSTILE_BYPASS=true`. Production fails closed.
- Verification: prevalidate invite → admin createUser → redeem → `/auth/v1/resend` with `type:signup`. Dispatch failure retains the committed account and reports `verificationSent:false`, allowing resend. Redemption transport failure is checked for commit before deleting a new user. Unknown outcomes are retained for operator recovery, not unsafe compensation. UI claims dispatch only on explicit success. Real GoTrue/SMTP delivery remains an external acceptance gate.
- Account transitions supersede all current controls, close indefinite intervals, insert replacement, and append before/after audit in one RPC. Unban after indefinite ban works. Expiration/supersession are filtered in SQL before ordering/limiting; expired newer rows cannot hide older live controls.
- Invite alphabet is `VD-` plus 32 uppercase hex digits (128 random bits). All 4,096 generated samples passed validation.
- Admin grant/revoke, invite/audit, account/audit and flag/audit are single SQL transactions. Service-only RPCs recheck actor authority. Audit fault injection proves rollback. Paddle rows and independent recurring entitlements remain untouched by grant/revoke.
- Flag updates use explicit `ON CONFLICT (key,scope_type,scope_id)`; false → true → false leaves one row, including NULL global scope IDs. Audit rows are append-only to the normal backend role.

### Exact account-control behavior

| State | Workspace writes / AI | Own reads / export | Feedback / support |
| --- | --- | --- | --- |
| active, admitted | Allowed subject to existing owner policies/quota | Allowed | Available |
| restricted | Denied | Allowed | Available |
| suspended | Denied | Allowed | Available |
| banned | Denied | Allowed | Available |
| new, not redeemed | Denied even with an Auth identity | Existing owner reads only | Available |

Restrictive RLS composes with owner policies on legacy tasks/goals/profiles/pressure logs, life events, all REVIEW tables, canonical tasks/goals/milestones/dependencies, intake/drafts, roadmaps/nodes/edges and Storage writes. Same-owner checks and append-only REVIEW permissions stay intact. Notification receipts and read-only exports remain available. Feedback has its separate authenticated server endpoint and normal rate-limit requirement, without workspace-write admission/control checks.

### Real database validation

- New migration: `20260928023311_closed_beta_review_hardening.sql`, created via Supabase CLI.
- Full chain exposed a separate initial, not-yet-deployed Closed Beta SQL defect: PostgreSQL's automatic amount check name collided with its explicit required-amount check. Renamed the latter to `ai_quota_grants_amount_required_check` in `20260927174808_closed_beta_platform.sql`. No previously deployed billing migration was edited.
- Docker could not start. Used an isolated native PostgreSQL 17.9 instance on `127.0.0.1:55439` with temporary tooling instead. No production/linked Supabase project was connected or mutated.
- All 14 migrations applied from an empty local database, including preserved pre-beta-account admission.
- pgTAP 1.3.4: Closed Beta **114** assertions; billing privileges **77**; recurring RLS **32**; lifecycle **21**; legacy billing **14**. Total **258**, all passed.
- Two independent PostgreSQL connections proved concurrent duplicate requests produce one quota reservation, one replay rejection, one ledger row.
- Audit trigger fault injection verified grant/revoke/invite/account rollback. Tests run within rolled-back transactions.
- Local `supabase db advisors --db-url <local-url>?sslmode=disable --type security --level error --fail-on error`: no error-level issues.
- The bootstrap fixture models only Supabase roles and Auth/Storage objects referenced by application migrations. It is NOT a deployment migration. PostgreSQL grants/RLS/transactions/locks were executed for real; GoTrue, SMTP, Storage HTTP and live Cloudflare were not run or claimed.

Reproduce with an empty loopback database and pgTAP 1.3.4: install `embedded-postgres@17.9.0-beta.17` and `pg` into an isolated tools directory; start its native instance. Set `VD_TEST_PG_DRIVER` to the tools directory's `node_modules/pg/lib/index.js`, and `VD_TEST_DATABASE_URL` to the empty database. Run `node scripts/test-closed-beta-postgres.mjs`. The harness refuses remote hosts and non-empty databases.

### Final code validation

- `npm test`: 317/317 passed; 9-migration additive static lint, SPA routing check and production secret exposure scan (187 browser source files) passed.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large-bundle advisory is non-fatal.
- `git diff --check`: passed. Full chain, pgTAP and real concurrency results are listed above.

## Explicit remaining pre-beta gates — NOT solved here

1. Paddle Sandbox/Production entitlement isolation requires dedicated acceptance evidence. The documented Sandbox platform-notification anomaly remains external. Recurring rollout stays OFF; no Production billing configuration changed.
2. Aliyun SMS hook timeout investigation and real existing-user OTP delivery verification remain open.
3. Authenticated mobile overflow audit/fixes remain open. Public-page smoke is not signed-in layout evidence.
4. Durable production rate limiting is required: production protected APIs deliberately return `RATE_LIMIT_UNAVAILABLE` rather than use the development in-memory limiter.
5. Staging GoTrue creation/confirmation/resend + SMTP delivery, real Turnstile hostname/challenge, owner provisioning, operational recovery for uncertain registration outcomes, and full invite-registration acceptance remain to be exercised. No live email or live challenge was performed by mocked behavioral tests.

FINAL_GATE: review-fix code/database validation PASS; public/production beta readiness HOLD pending the external gates above.
