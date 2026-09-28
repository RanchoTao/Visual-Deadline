# VD Admin v1 authoritative contract audit

Audit complete before implementation. Base: origin/main aeb969352b125e9c1a173abadf5c1f5a60c3149a (2026-09-28). Consumer: Visual-Deadline-Admin f60840138af153d552c7bcb84b7ca605b225e4f0, docs/VD_ADMIN_CONTRACT.md.

The primary checkout is on codex/closed-beta-platform with three unpushed commits. Its proposed beta tables and APIs are not on main. This implementation uses a separate checkout from main, preserves that branch, and must be reconciled explicitly if that PR lands first. No cherry-pick or implicit inclusion of that branch is authorized.

## Existing authoritative backing

| Consumer resource | Main backing | Required additive work |
|---|---|---|
| users | auth.users; profiles has id/user_id/email/display_name/data | bounded metadata projection using Auth identity and profile display_name, with legacy JSON-name fallback; no full profile payload |
| entitlements | subscriptions, payment_references, entitlements, memberships, membership_grants | independent tier grants and Pro projection; preserve all historical Plus rows |
| audit | billing_events only, not an operator command ledger | append-only admin audit and encrypted idempotent receipts |
| quotas / ai-usage | api/ai.js in-memory per-instance daily counter | durable policy, override, reservation/settlement and reset ledger |
| bans | no authoritative controls on main | account controls, restrictive write policies, API gates and safe session bootstrap |
| beta-applications / invitations / email | none on main | cohorts, applications, hashed invitation redemption, transactional queue; no external send |
| settings | no operator support directory | authoritative role directory and explicit tier capability support |
| restricted-content | legacy tasks/goals JSON; v2_tasks/v2_goals; review_records append-only JSON | owner-only bounded read RPC with audit committed before HTTP return |
| dashboard / analytics / feedback / infrastructure / deployments | partial product rows but no approved metric/provider contract | empty/pending responses; no fabricated metrics or provider payload |

## Authorization gaps

Main has no internal Admin authentication or role directory. Service-role credentials currently serve server-only billing endpoints, but possession of that key must not become browser Admin authorization. New HTTP handlers require a timing-safe internal-token comparison, version, UUID, active operator binding and matching authoritative role; SQL independently rechecks roles/permissions. Neither email nor user_metadata is a role source. The console already enforces production MFA/AAL2; the VD API trusts only its internal caller plus the independently checked directory.

Existing RLS scopes ordinary product rows to auth.uid(). New admin tables receive RLS, no anon/authenticated table access, and service-role RPC access only. Account controls add restrictive write policies to existing product tables and storage, preserving existing owner policies and read/export behavior.

## Entitlement limitations

PR N entitlements has a capability=vd.plus check and projector billing_rebuild_entitlements with independent subscription and legacy source identities. billing_admin_grant accepts only monthly/yearly legacy plans and changes the legacy membership aggregate. New operator grants must not call it or write subscription periods. Add vd.pro to the capability constraint and independent admin_access_grants projected through a trigger into one or two entitlements per grant. The existing projector invalidates admin_grant rows without membership_grants backing. New rows use a separate operator_grant namespace so that projector leaves independent grant rows intact; test rebuild, overlap union, revocation and subscription byte-for-byte preservation. Effective tier and merged active interval boundary are SQL-owned; no product pricing or Paddle Pro product is created.

## AI quota limitations

Main api/ai.js increments a process Map keyed by user/day, so scaling/restart resets commercial quota. Preserve a small process rate limit as abuse friction, replace quota with locked SQL reservations. Beta defaults are daily UTC request units (free 20, plus 200, pro 500), configurable policy rows, not pricing promises. Failed/cancelled reservations release budget but retain usage events; stale pending reservations expire durably. Reset advances a period-scoped allowance epoch without deleting usage/cost history. Explicit limits, deltas and revocable unlimited testing overrides serialize on the same user lock.

## Account enforcement and bootstrap

Main /api/ai and /api/intake authenticate users but do not check account state. Browser product repositories write Supabase directly, so API-only or UI-only bans are insufficient. Apply restrictive INSERT/UPDATE/DELETE predicates to user-owned product tables and storage, and check control state in AI/intake RPCs. Add a safe account-status RPC/read during identity bootstrap. No external Supabase Auth ban is performed; result states authoritative VD restriction active and auth provider propagation not requested. A future Auth outbox/reconciler can report pending/confirmed separately.

## Invitation and signup boundary

Public signup remains unchanged. New authenticated redemption derives user identity from verified bearer/Auth SQL identity, validates a strong code hash, locks invitation capacity, binds redemption ownership and captures cohort/source. One-time codes cannot be reused by another user; retry by the same user is idempotent. hasBetaAccess is prepared from redemption/explicit allow grant/operator-test exception without enabling a global production gate. Application endpoint is off by default and requires configured server-side Turnstile when enabled; bounded payload plus durable IP/email throttling and duplicate suppression.

## Transactions and idempotency

One service-only command RPC dispatches an allowlisted resource/action, locks actor+request ID, compares canonical jsonb command hash (actor/role/resource/action/target/reason/input), and locks target rows/users. Mutation and append-only audit insert are in that transaction. Changed-command retry conflicts; concurrent equal commands reuse one committed receipt. Before/after snapshots contain only state metadata. Invitation plaintext exists only in creation-command results; encrypted command receipts support original-result retry without plaintext storage or code in ordinary reads/audit. Receipt encryption key is separate server-only configuration, never a client field. Implementation refinement: bounded restricted-content results are encrypted in the receipt after audit insertion, so retries also return their exact original result. They are never copied into audit before/after snapshots or ordinary reads.

## Rollback strategy

No destructive reverse migration. Disable internal Admin/public application entry flags and AI rollout before returning to prior runtime, revoke operator directory entries/internal token, and retain new ledgers/audits for reconciliation. Preserve current memberships/subscriptions/review history. Account-control rollback requires an explicitly reviewed normal-state transition or controlled restrictive-policy removal; never silently weaken RLS. Test migration transactions against a fresh loopback PostgreSQL database before any staging adoption. No remote migration, deployment, real email or production Paddle action is part of this PR.

## Verification boundary

Required evidence is real PostgreSQL transactions, RLS and independent-connection concurrency, plus actual Admin Route Handler to VD handler to database integration with local Auth/AAL2 fixtures. Doubles model Supabase HTTP only; they do not replace the SQL authority. Real hosted Supabase/GoTrue, provider email and production rollout remain separate acceptance gates.
