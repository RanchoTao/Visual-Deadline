# Closed Beta admission rollout

## One authority, initially OFF

`public.beta_admission_policy` contains exactly the named singleton key `VD_CLOSED_BETA_ADMISSION_ENFORCED`. The additive consolidation migration seeds `enabled=false`. There is no authoritative environment or VITE mirror. The service-only `beta_admission_state()` exposes only its Boolean through `GET /api/beta/register`; the UI uses it for presentation. Missing authority fails closed on cloud mutations; login/local data/export remain available.

OFF preserves existing database access and public email signup when its existing readiness flag is explicitly enabled. Existing OAuth readiness flags are retained when OFF. Phone OTP always sets `shouldCreateUser:false`, matching the accepted security fix. New invitation signup is also available with a supplied code. Login itself is not an admission decision.

ON requires a verified Auth identity (confirmed email or phone) and `has_beta_access`: committed invitation redemption, valid explicit `beta_allow_grants`, authoritative active owner role, or valid testing grant. User metadata, domains, frontend state and OAuth provider labels cannot authorize. OAuth actions are hidden/rejected by the UI hook while ON; bypassing the UI and creating a GoTrue account still cannot obtain workspace mutation authority. `admin_may_operate()` supplements existing owner policies for all 22 product tables and Storage mutations. User HTTP write APIs and `ai_reserve` independently check admission. Reads/exports remain available to their existing owner; admission never overrides account controls.

## Reviewed grandfathering, no automatic blanket migration

Do not enable the flag before reconciling existing accounts. In a manually reviewed maintenance transaction, a database administrator must:

1. Record an approved UTC cutoff, eligibility criteria, operator UUID, affected count and change ticket. Compare the selected existing confirmed identities against expected production accounts. The cutoff is historical and fixed; it must not float with each request.
2. Materialize **that reviewed set** into `beta_allow_grants` with explicit `reason`, `created_by`, appropriate expiry and no revoked grant overwrite. Existing users retain admission through these records. No email domain or user-editable metadata is an eligibility criterion.
3. Verify row counts and sampled existing-account login/write/admission behavior. The policy CHECK requires a non-null `grandfather_cutoff` when enabling but does not invent a reviewed population.
4. In the same transaction update the singleton `enabled=true`, cutoff, reason and updated_at. Commit only after count/review checks. Capture the before/after policy, grant IDs, counts, operator and ticket in the maintenance audit record. Runtime roles cannot change the policy table; no console mutation route or permanently enabled bypass exists.
5. For rollback, record a separate approved maintenance event and set only `enabled=false`. Retain grants, redemptions, receipts and audit history. Do not delete user content or reinterpret subscription records.

No operation above was executed remotely. The current feature migration remains undeployed and OFF.

## Invited registration and dispatch

`POST /api/beta/register` bounds the body, uses case-sensitive 192-bit PR140 codes, and performs a durable `beta_registration_check` before creating an unconfirmed Auth user. The existing `beta_redeem` transaction locks invitation capacity, validates recipient ownership and commits the canonical redemption. `admin/users` receives `email_confirm:false` and no preauthorization metadata. `resend` requests Supabase signup verification only after committed admission; `verificationSent` distinguishes accepted dispatch from dispatch failure, not inbox delivery.

Auth creation and SQL redemption are separate systems. A definite rejected SQL transaction may delete only its new, demonstrably unadmitted account. A timeout/disconnect/unknown SQL commit retains the account and returns `REGISTRATION_RECONCILIATION_REQUIRED`; it never deletes a possibly redeemed identity. Recovery is manual: inspect the canonical redemption and confirmed identity, reconcile capacity/audit evidence, request verification resend for a committed redemption, or safely remove only an unadmitted unconfirmed orphan. Never free capacity or delete an account on an unknown outcome. Existing confirmed accounts redeem via authenticated `POST /api/beta/redeem`; no arbitrary user ID is accepted.

## Application UI and external acceptance

`/beta/apply` uses the actual Chinese React form, Turnstile `beta_apply` widget, bounded PR140 field names and `/api/beta/apply`. There is no development bypass. Server verification requires hostname/action and persists only a HMACed client address. `VD_PUBLIC_BETA_APPLICATIONS_ENABLED` controls application intake availability only; it never grants workspace admission.

Local tests use synthetic Auth/SMTP/provider/Turnstile transports and actual PostgreSQL. Hosted GoTrue signup/resend, callback allowlist/templates, real Turnstile hostname/site key, email delivery and hosted PostgREST/Storage acceptance remain external gates. Production Auth public signup settings must also be reviewed before rollout; direct Auth identities never bypass the SQL workspace gate.

## Reproduce

```powershell
$env:VD_TEST_TOOLS_DIR='C:/Users/RanchoTao/AppData/Local/Temp/vd-admin-v1-tools'
$env:VD_TEST_PGTAP='1'
$env:VD_TEST_ADMIN_DIR='D:/Projects/Visual-Deadline-Admin'
$env:VD_TEST_BROWSER='1'
npm run test:admin:db
```

The tools folder contains the pinned local PostgreSQL runtime and pgTAP described in the implementation report. Browser verification uses ephemeral `agent-browser@0.38.1`, a test-only Vite middleware/widget, the real application handler and real migrated SQL. No fixture is imported into a deployable route. This command accepts no remote database URL.
