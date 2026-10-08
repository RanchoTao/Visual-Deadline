# VD Admin v1 security review

## Trust boundaries

Admin production UI requires confirmed allowlisted owner identity and Supabase MFA/AAL2 in its separate repository. VD receives its server credential plus asserted actor/role and independently checks an active authoritative directory binding and SQL permissions. This PR does not make browser metadata, email, role headers alone or service-role possession a frontend login method. A stolen internal token plus active actor identity can impersonate the trusted console: store it only in server secret configuration, restrict network access where available, rotate on compromise, and revoke operator rows immediately.

All 16 new tables enable RLS and revoke direct access from anon, authenticated and service_role. Only allowlisted SECURITY DEFINER RPCs run as their trusted database owner with empty search_path and qualified names. Existing billing service-role table privileges remain intact. Database owners are the break-glass boundary and can administer schema; immutable row triggers do not prevent a superuser from changing triggers or truncating a table. No such operation is exposed by runtime RPCs.

Tests denied SELECT and DELETE on every new table for all three runtime roles, checked ordinary product cross-user access, blocked account writes, preserved own read access and verified immutable trigger rejection. Existing ownership/REVIEW/billing tests passed. Direct authenticated writes see account controls under PostgreSQL statement snapshots: banning a user does not cancel an already executing transaction or provider call. All later requests recheck authority.

## Secret and private-data handling

Server-only configuration: `SUPABASE_SERVICE_ROLE_KEY`, `VD_ADMIN_API_TOKEN`, `VD_ADMIN_RECEIPT_KEY`, `TURNSTILE_SECRET_KEY`, `VD_BETA_RATE_KEY`. Generate independent cryptographically random keys of at least 32 bytes for each Admin/rate secret, encode appropriately, and provision through the deployment secret store. Do not put them in `VITE_*`, source files, screenshots, command output, request/audit logs or browser storage. Enforce HTTPS server roots in production. RPC parameters include the receipt key: infrastructure must not log RPC bodies or SQL bind parameters.

Internal responses are no-store/nosniff and use fixed sanitized failure messages. AI upstream error bodies are neither logged nor returned. Unknown cost and delivery evidence remain null/pending. Application throttling retains HMAC address identifiers and normalized email evidence; define retention before public rollout.

Receipts are AES-256 encrypted with a separate server-held key. They can contain a creation invite code or case-bounded private content. Audit snapshots and ordinary reads never contain these values. Preserve key versions when rotating; existing receipts currently require the original key. This v1 does not include key-version rotation or a retention/purge service. Establish encrypted-receipt retention, recovery and access policy before sensitive production inspections. Never lose the current key while retryable commands exist.

## Manual owner authorization procedure

No real owner is automatically seeded by migrations. In an approved staging/server SQL session, verify the exact existing Auth UUID, confirmed email, and verified TOTP factor using Supabase's server-side Auth records/dashboard. Match that UUID to the separate Admin owner's allowlist. Record the operator identity and approval ticket outside the product database before bootstrap.

Use an explicit UUID, never search-and-authorize by email or metadata. Example template (replace the placeholder only in the approved SQL session):

```sql
begin;
do $$
declare owner_id uuid := '<verified-owner-uuid>'::uuid;
begin
 if not exists(select 1 from auth.users where id=owner_id and email_confirmed_at is not null) then
  raise exception 'Owner identity must already exist and be confirmed';
 end if;
 insert into public.admin_operator_roles(user_id,role,status,created_by)
 values(owner_id,'owner','active',owner_id);
end $$;
commit;
```

If the row exists, stop and review it; the template deliberately does not silently upsert privileges. Initially authorize only that owner. Role/status changes require a manual change record and independently verified UUID. Do not make this SQL available to client routes. Revoke with an approved `UPDATE admin_operator_roles SET status='revoked', updated_at=now() WHERE user_id=<exact UUID>`; retain the row/audits.

Loss of TOTP is handled by the console's `docs/ADMIN_BREAK_GLASS.md` procedure using Supabase's manual controls and an audit requirement, with no permanently enabled AAL1 bypass. Recover the factor and reestablish AAL2 before console use. VD does not implement an alternate emergency token.

## Verification and residual gates

The implementation audit preceded edits. Real local PostgreSQL tested atomic rollback, replay conflicts, concurrent duplicates, interval union, projection survival through the old billing rebuild, subscription preservation, limits/unlimited/reset, control expiry, strict invite capacity, approval/outbox rollback and scoped content bounds. Local HTTP exercised the actual production-mode Admin routes and real backend SQL.

Before any hosted real-data test, apply migrations in an isolated staging Supabase project and verify platform Auth/GoTrue MFA, PostgREST function privileges and Storage policies with synthetic identities. Then provision an approved owner directory and server-only secrets. No production credentials or data should be used for that rehearsal.

Before production rollout, additionally review receipt retention/key rotation, uncertain AI settlement monitoring/reconciliation, ingress protection/rate limits and operator access review. Public beta remains off until real Turnstile/domain/proxy and application abuse acceptance are complete. Email and Auth propagation workers remain separate work with provider-confirmed statuses; beta signup gating remains disabled.

## Reproduce local tests

From the VD feature checkout, install pinned tooling into an isolated temporary directory (not the product dependency manifest):

```powershell
$toolsDir = Join-Path $env:TEMP 'vd-admin-v1-tools'
npm install --prefix $toolsDir --no-audit --no-fund pg@8.16.3 embedded-postgres@17.9.0-beta.17 supabase@2.118.0
$env:VD_TEST_TOOLS_DIR = $toolsDir
npm run test:admin:db
```

The harness creates a new loopback-only PostgreSQL cluster on 55440, synthetic identities and all migrations; it never accepts a remote database URL. Requires free local port. Clusters remain in the system temporary directory for diagnostics. To include existing pgTAP files, install official pgTAP 1.3.4 in that isolated PostgreSQL's extension directory and set `VD_TEST_PGTAP=1`. Official `sql/pgtap.sql.in` SHA-256 used here: `383ecd73edfd1c7ed5f3b835134ee1fe74e201ee31599346c92ea029b65dcdce`; replace `__OS__` with `MSWin32` and `__VERSION__` with `1.0304`, save as `pgtap--1.3.4.sql` next to the release control file. Source: [official pgTAP release](https://github.com/theory/pgtap/tree/v1.3.4).

Build the independent Admin consumer at the stated commit, then set `VD_TEST_ADMIN_DIR` to its absolute checkout path and rerun `npm run test:admin:db`. Next production server uses local port 3317. The preloader maps only synthetic `.example.test` origins to ephemeral loopback servers; it is generated under TEMP and never imported by application routes. Auth/TOTP and AI responses are local doubles; authority functions are real SQL. No test bypass is shipped.
