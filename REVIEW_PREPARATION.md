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
- `supabase/tests/recurring_billing_lifecycle_test.sql`
- `supabase/tests/recurring_billing_rls_test.sql`
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

Real Paddle Sandbox acceptance was not run because usable sandbox credentials/catalog are not present in this checkout. Recurring rollout flags remain disabled; this document does not claim the provider acceptance gate or merge readiness.
