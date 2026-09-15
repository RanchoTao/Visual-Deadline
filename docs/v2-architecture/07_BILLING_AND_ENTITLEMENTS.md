# Billing and entitlements architecture

## Current state and reusable invariants

Billing v1 sells one-time CNY 19 / CNY 199 prices and converts successful Paddle transactions into fixed 1- or 12-month membership grants. It is not recurring billing.

Retain these invariants:

- checkout requires an authenticated VD user;
- the server maps a VD plan code to a configured Paddle price and amount;
- Paddle API keys, webhook secrets, and Supabase service role remain server-only;
- browser `checkout.completed` is UX feedback only;
- only a verified server webhook changes billing evidence;
- unknown transactions cannot grant access;
- event/order/grant handling is idempotent;
- refunds are auditable and recompute access.

## Target ownership

```text
Paddle catalog + checkout
        |
        v
verified Paddle webhook/event fetch
        |
        v
VD billing adapter -> billing_events + subscriptions + payment_references
        |
        v
VD entitlement projector -> entitlements
        |
        v
product authorization / global Billing status
```

Paddle is provider-of-record for provider subscription and transaction state. VD owns the normalized Subscription projection and provider-independent Entitlements used by product code.

Paddle creates subscriptions automatically when a checkout uses recurring prices, and recurring billing produces related transactions: [Subscriptions](https://developer.paddle.com/api-reference/subscriptions/). Paddle recommends synchronizing subscription lifecycle events and provides a hosted customer portal for payment and subscription management: [Paddle for SaaS](https://developer.paddle.com/get-started/how-paddle-works/saas/), [Customer portal](https://developer.paddle.com/concepts/sell/customer-portal/).

## Product catalog transition

Do not repurpose existing one-time price IDs. Create separate recurring monthly and annual prices in Paddle Sandbox, then map immutable VD plan versions to provider price IDs in server configuration or a trusted catalog table.

Historical one-time purchases remain valid under legacy grant semantics. A user can have legacy entitlement time and a recurring subscription; a deterministic policy defines whether validity is max(end dates), stacked, or starts after legacy expiry. Freeze that commercial rule before implementation.

## Subscription lifecycle

Normalized statuses:

- `trialing`
- `active`
- `past_due`
- `paused`
- `cancel_scheduled`
- `canceled`
- `expired`

Provider events must cover at least subscription creation and updates, renewal transactions, payment completion/failure as needed for reconciliation, cancellations/pauses, and adjustments/refunds. Exact event names and payload versions must be verified against Paddle docs at implementation time.

Entitlement policy is explicit per status. A recommended baseline:

| Subscription state | Entitlement |
| --- | --- |
| trialing | active only if the product enables trials |
| active | active through the provider current-period end |
| past_due | grace period policy, not indefinite access |
| paused | follow provider effective date and frozen product policy |
| cancel scheduled | active through current-period end |
| canceled/expired | inactive after valid paid/grace interval |
| full refund | recompute affected access; never blindly erase unrelated grants |

## Webhook processing

1. Read raw request body and verify signature within the documented tolerance.
2. Parse and validate event ID/type/occurred time.
3. Insert or claim `billing_events(provider, provider_event_id)` before effects.
4. If duplicate and already succeeded, return 2xx with no new effects.
5. Resolve the referenced customer/subscription/transaction to an existing VD binding.
6. Where ordering or partial payloads are ambiguous, fetch current provider state server-side.
7. Upsert normalized Subscription/Payment Reference in one transaction.
8. Rebuild Entitlements deterministically.
9. Mark event succeeded with affected IDs; on failure record bounded error and return retryable status.

Events can arrive late or out of order. Apply provider `occurred_at` and last-known version rules so an older event cannot reactivate a canceled/refunded state. Use per-subscription serialization/advisory locks for concurrent delivery.

## Entitlement API

Product code asks one question:

```text
hasEntitlement(userId, capability, at) -> decision + source + validity
```

It does not query Paddle, inspect a price ID, trust client state, or infer access from an order row. Capability examples are product-defined (`vd.plus`, feature-specific limits) and versioned separately from Paddle plans.

## Global Billing surface and customer self-service

The membership control immediately left of the avatar opens Subscription / Billing. This global surface shows normalized plan/status/current period and recent payment references. Manage-payment/cancel actions open a short-lived Paddle customer portal session generated server-side. Portal tokens are not cached in VD. Settings may also link to Billing, but Billing is not a primary page and is not owned by TASKS, PLAN, OPS, or REVIEW.

The global notification bell remains separate and opens Notifications; billing events may produce notifications, but the notification inbox does not become the billing source of truth.

## Sandbox and production separation

- Separate API keys, client tokens, webhook destinations/secrets, catalog IDs, and database environment markers.
- A Sandbox event cannot mutate production records and vice versa.
- Store provider environment on every binding/event.
- Deployment refuses a mixed live/sandbox configuration.

## Reconciliation

A scheduled server job compares active VD subscriptions with Paddle state, repairs missed events through the same idempotent projector, and reports differences. It does not grant from browser claims. Financial totals reconcile by provider transaction IDs and currency/minor amounts.

## Acceptance matrix

- Initial monthly/annual subscription.
- Renewal success and duplicate webhook replay.
- Payment failure, grace, recovery.
- Cancel at period end and immediate cancellation if supported by policy.
- Pause/resume.
- Upgrade/downgrade and proration rule.
- Full/partial refund and adjustment arriving before/after transaction completion.
- Out-of-order provider events.
- Unknown customer/order/price/environment.
- Legacy one-time grant coexisting with subscription.
- Customer portal access.
- Reconciliation after a deliberately missed webhook.

## Rollback

Recurring catalog flags can be disabled while legacy purchases and existing subscriptions continue through the billing adapter. Entitlement projection is rebuildable. No rollback deletes provider or financial evidence. If webhook processing is paused, events remain retryable and reconciliation restores state before access policy changes resume.

## Persistence stage

Recurring Subscription, Payment Reference, expanded Billing Event, and provider-independent Entitlement tables belong to the complete target model. They are Beta-required only if recurring Paddle subscriptions are included in the Beta launch. Otherwise, existing Billing v1 orders/grants/membership continuity is the Beta requirement and recurring persistence remains deferred until its own rollout PR.
