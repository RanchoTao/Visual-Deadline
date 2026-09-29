# PR139 / PR140 consolidation audit

## Frozen comparison (before implementation)

Reference PR139: 213ab3ac17e8dd6ae21fac7e76f4f43c0e3ce2df.
Canonical PR140: e0ab0754e6f851e0f0ea60f0e8566699e9f71bb4.
Common base: aeb969352b125e9c1a173abadf5c1f5a60c3149a.
PR139 live head has since moved to a0e40125ab1749a115e53e78eccd4cbb006fb38e. That later adapter/pricing/Hobby work is outside this requested frozen comparison and requires external reconciliation. PR139 must remain open.

This audit was created before code changes. Classifications are intended disposition; executed evidence is appended after verification. No merge, deployment or remote migration is authorized. Preserve PR140 branch deployment guard.

## Every reference changed file (52)

| File | Disposition | Reason |
| --- | --- | --- |
| `.env.example` | DROP | Do not copy environment files or expand feedback scope; existing ignore rules suffice. |
| `.gitignore` | DROP | Do not copy environment files or expand feedback scope; existing ignore rules suffice. |
| `CLOSED_BETA_READINESS_REPORT.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `REVIEW_PREPARATION.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `api/admin.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `api/ai.js` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `api/beta-apply.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `api/beta-invite-validate.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `api/beta-register.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `api/feedback.js` | DROP | Do not copy environment files or expand feedback scope; existing ignore rules suffice. |
| `docs/ACCOUNT_CONTROL_MODEL.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/ADMIN_API_CONTRACT.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/BETA_SECURITY_MODEL.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/CLOSED_BETA_ARCHITECTURE.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/DEEPSEEK_INTEGRATION.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/ENTITLEMENT_AND_QUOTA_MODEL.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `docs/INVITE_SYSTEM.md` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `package.json` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `scripts/check-v2-migrations.mjs` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `scripts/test-closed-beta-postgres.mjs` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `server/platform/admin.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `server/platform/aiContracts.js` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `server/platform/domain.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `server/platform/registration.js` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `server/platform/repository.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `server/platform/runtime.js` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `src/App.tsx` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `src/components/AIReviewPanel.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/AITaskAnalysisPanel.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/AuthPanel.tsx` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `src/components/BetaApplyPage.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/CaptureIntakePanel.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/GoalRoadmapPanel.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/PlanPage.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/ReviewPage.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/components/TurnstileChallenge.tsx` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/domain/capture/interpreter.ts` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/hooks/useSupabaseAuth.ts` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `src/lib/authFeatures.ts` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `src/lib/authPortalState.ts` | PORT_TO_140 | Accepted AI contract/provenance or beta UI behavior. |
| `src/lib/supabaseClient.ts` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `src/services/aiClient.ts` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `supabase/migrations/20260927174808_closed_beta_platform.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `supabase/migrations/20260928023311_closed_beta_review_hardening.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `supabase/migrations/20260928061948_closed_beta_ai_contracts_quota_periods.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `supabase/tests/closed_beta_platform_rls_test.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `supabase/tests/closed_beta_quota_periods_test.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `supabase/tests/fixtures/local_platform_bootstrap.sql` | SUPERSEDED_BY_140 | PR140 SQL/runtime/docs/harness are canonical; verify equivalent protection without importing competing schema. |
| `tests/authIdentity.test.mjs` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `tests/captureFirst.test.mjs` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `tests/closedBetaPlatform.test.mjs` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |
| `tests/reviewWorkspace.test.mjs` | MANUAL_MERGE | Adapt accepted behavior to PR140 authority; preserve current account controls and tests. |

## Accepted findings and reconciliation

| Finding | Disposition | Required equivalent |
| --- | --- | --- |
| AI replay / provider cost control | PORTED_FROM_139 | Client request UUID reaches PR140 durable reserve; duplicate never calls provider or rewrites settlement. |
| Turnstile browser token | PORTED_FROM_139 | Real widget beta_apply action; PR140 siteverify hostname/action; no bypass. |
| Email verification dispatch | PORTED_FROM_139 | Unconfirmed Auth user, transactional PR140 redemption; resend result reported honestly; uncertain commits never delete account. |
| Phone / OAuth bypass | PORTED_FROM_139 | Phone shouldCreateUser=false; OAuth is hidden/rejected while ON; OFF readiness flags remain compatible. The authoritative gate rejects directly-created uninvited phone/OAuth identities. |
| Account controls | PRESERVED_BY_140 | Per-request checks, quota reserve check, restrictive product/storage RLS. |
| Strong invite alphabet | PRESERVED_BY_140 | 192-bit base64url, case-sensitive; never uppercase PR140 codes in UI. |
| Transactional entitlement writes | PRESERVED_BY_140 | Grant projection, audit, encrypted receipt commit together; subscription tables untouched. |
| Transactional invitation writes | PRESERVED_BY_140 | SQL row locks, exact receipt replay, capacity and recipient check. |
| General feature flags | NO_LONGER_APPLICABLE | Competing flag registry excluded; one database-owned admission policy is added, default OFF. UI visibility flags cannot authorize. |
| Server AI contracts | PORTED_FROM_139 | Server mode prompts, JSON mode, output validation before success. |
| Actual AI provenance | PORTED_FROM_139 | Provider-returned model, server generatedAt through all artifacts. |
| Quota reset | PRESERVED_BY_140 | UTC day plus allowance epoch, settled-time accounting and in-flight reservations; no ledger deletion. |

## Admission design / migration plan

One singleton database policy: VD_CLOSED_BETA_ADMISSION_ENFORCED, initially false. No VITE/environment mirror is authority. Enabling requires an explicit reviewed SQL transaction: select a fixed UTC grandfather cutoff, materialize existing eligible confirmed users into beta_allow_grants with a documented reason, verify counts, then enable. No automatic migration-time blanket grandfathering or metadata/domain inference. New users remain subject to redeemed invitation or explicit valid allow/testing/owner grant. Verified email OR phone identity is required when ON; account controls still apply. Reads/local exports remain compatible; every product/storage mutation predicate and privileged user HTTP operation checks this gate. Bootstrap reports the policy to UI without granting access.

## Migration lineage

Keep both 20260928064909_admin_v1_authority.sql and 20260928065257_admin_v1_commands_reads.sql unchanged. Add one chronological CLI-generated migration for gate, registration helpers, source-row list and actual-model settlement. Do not import any of the three PR139 migrations or its overlapping tables. Fresh local database applies one chain once.

## Scope / external gates

PR140 is canonical for Admin roles/audit/receipts, Free/Plus/Pro grants, quota ledger, controls, beta/invite/outbox and RLS. PR139 backend/schema is superseded only after final verification. Its later live-head work is not silently considered ported. Supabase Auth/SMTP, real Cloudflare/DeepSeek and hosted two-service acceptance remain external; local fixtures do not prove them.

## Executed verification

- VD `npm test`: 291 existing domain tests + 22 boundary/consolidation cases = 313 passed. Typecheck, production build, migration/routing/browser-source/built-asset secret checks and diff checks passed. Existing nonfatal bundle-size advisory remains.
- Fresh native PostgreSQL 17.9: one chronological 15-migration chain; both original PR140 feature migrations unchanged; none of the three reference beta migrations imported.
- All 11 pgTAP suites: 282 assertions. Existing 241 cases retained; 41 admission/source-row/provenance cases added.
- Existing real authority/ACL/RLS/rollback/concurrency harness: 201 assertions retained and passed.
- Supabase CLI local error-level security advisor: no findings. The CLI was pointed only at the newly created loopback test cluster; no remote database was used.
- Actual production-mode Admin baseline f608401 build against final VD handlers/SQL: 139 HTTP checks, eight audited mutations, exact receipt replay, AAL1 rejection/AAL2 enforcement/logout; AI JSON/Markdown/prompt/provenance/replay, Turnstile submit and invitation signup/confirmation/admission exercised. Auth/SMTP/provider/siteverify remain transport doubles.
- Compatible independent Admin commit daa0f18: 148 HTTP checks, nine audited mutations including source-row grantId revocation; 35 unit tests, typecheck/build/client-boundary scan (17 assets), 59 HTTP checks and both production runtime/MFA scripts pass.
- Real Chinese React application page in local browser: 3 assertions, fixture widget token -> actual application handler -> canonical migrated beta_applications row. No test code is wired into deployed routes.
- GitHub read at review time: PR140 has no review threads; all ten PR139 threads are marked resolved. This is not a new external approval of the consolidated implementation.

FINAL_GATE: local consolidation PASS; hosted service acceptance and external review HOLD. No merge, remote migration or new deployment performed.


## Precise reference disposition lists

### PR139_UNIQUE_WORK_PORTED

- `server/platform/aiContracts.js` (PORT_TO_140)
- `src/components/AIReviewPanel.tsx` (PORT_TO_140)
- `src/components/AITaskAnalysisPanel.tsx` (PORT_TO_140)
- `src/components/BetaApplyPage.tsx` (PORT_TO_140)
- `src/components/CaptureIntakePanel.tsx` (PORT_TO_140)
- `src/components/GoalRoadmapPanel.tsx` (PORT_TO_140)
- `src/components/PlanPage.tsx` (PORT_TO_140)
- `src/components/ReviewPage.tsx` (PORT_TO_140)
- `src/components/TurnstileChallenge.tsx` (PORT_TO_140)
- `src/domain/capture/interpreter.ts` (PORT_TO_140)
- `src/lib/authPortalState.ts` (PORT_TO_140)
- `api/ai.js` (MANUAL_MERGE)
- `package.json` (MANUAL_MERGE)
- `scripts/check-v2-migrations.mjs` (MANUAL_MERGE)
- `server/platform/registration.js` (MANUAL_MERGE)
- `src/App.tsx` (MANUAL_MERGE)
- `src/components/AuthPanel.tsx` (MANUAL_MERGE)
- `src/hooks/useSupabaseAuth.ts` (MANUAL_MERGE)
- `src/lib/authFeatures.ts` (MANUAL_MERGE)
- `src/lib/supabaseClient.ts` (MANUAL_MERGE)
- `src/services/aiClient.ts` (MANUAL_MERGE)
- `tests/authIdentity.test.mjs` (MANUAL_MERGE)
- `tests/captureFirst.test.mjs` (MANUAL_MERGE)
- `tests/closedBetaPlatform.test.mjs` (MANUAL_MERGE)
- `tests/reviewWorkspace.test.mjs` (MANUAL_MERGE)

The former registration module is adapted as `server/admin/registration.js` using canonical PR140 SQL, not copied as an authority. Reference closedBetaPlatform tests are adapted into consolidation unit, SQL and HTTP/browser suites; its competing harness/schema tests are not imported. UI readiness semantics are preserved while admission is enforced from the database.

### PR139_SUPERSEDED_FILES

- `CLOSED_BETA_READINESS_REPORT.md`
- `REVIEW_PREPARATION.md`
- `api/admin.js`
- `api/beta-apply.js`
- `api/beta-invite-validate.js`
- `api/beta-register.js`
- `docs/ACCOUNT_CONTROL_MODEL.md`
- `docs/ADMIN_API_CONTRACT.md`
- `docs/BETA_SECURITY_MODEL.md`
- `docs/CLOSED_BETA_ARCHITECTURE.md`
- `docs/DEEPSEEK_INTEGRATION.md`
- `docs/ENTITLEMENT_AND_QUOTA_MODEL.md`
- `docs/INVITE_SYSTEM.md`
- `scripts/test-closed-beta-postgres.mjs`
- `server/platform/admin.js`
- `server/platform/domain.js`
- `server/platform/repository.js`
- `server/platform/runtime.js`
- `supabase/migrations/20260927174808_closed_beta_platform.sql`
- `supabase/migrations/20260928023311_closed_beta_review_hardening.sql`
- `supabase/migrations/20260928061948_closed_beta_ai_contracts_quota_periods.sql`
- `supabase/tests/closed_beta_platform_rls_test.sql`
- `supabase/tests/closed_beta_quota_periods_test.sql`
- `supabase/tests/fixtures/local_platform_bootstrap.sql`

### PR139_STILL_NEEDED

- External review before closing PR139. Do not close either PR automatically.
- Later live-head work after the specified 213ab3 reference (including optional pricing/adapter/Hobby follow-ups) needs independent reviewer disposition. PR140 already has 11 physical entrypoints and its branch deployment guard remains intact; no competing adapter/schema is imported.
- General feedback endpoint/product workflow and feature registry are outside this consolidation scope, explicitly dropped/superseded rather than silently claimed ported.
- Hosted GoTrue/SMTP, Turnstile/DeepSeek, PostgREST/Storage and grandfather population acceptance remain external.


The compatible Admin commit also disables Git-triggered deployment for codex/admin-foundation. PR140 retains its existing codex/vd-admin-v1 deployment guard. PR139 remains open; later live-head changes are explicitly not folded into this frozen-reference audit.
