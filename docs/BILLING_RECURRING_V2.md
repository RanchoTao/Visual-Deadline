# VD recurring billing and entitlements (PR N)

PR N adds an opt-in recurring subscription path without replacing Billing v1. The legacy tables `billing_orders`, `membership_grants`, `memberships`, and `billing_events` remain valid evidence. Existing one-time Paddle prices keep their original environment variables and semantics.

## Authorization contract

Application authorization reads `entitlements` only. The initial capability is `vd.plus`. Each legacy grant, admin grant, fallback legacy membership, and recurring subscription remains a separate source row. Access is allowed when at least one active row covers the decision instant; periods are unioned, never stacked or shifted.

The recurring catalog is immutable:

| VD catalog code | Catalog version | Provider interval |
| --- | --- | --- |
| `vd.plus.monthly.v1` | `vd-recurring-v1` | month |
| `vd.plus.annual.v1` | `vd-recurring-v1` | year |

The initial recurring product has no trial entitlement. `past_due` receives at most 72 hours after the current paid period end. Paused and trialing subscriptions do not grant recurring Plus. Cancellation preserves only an already-paid interval. An approved full refund invalidates the affected current-period subscription source; a partial refund remains financial evidence without revoking unrelated access.

## Server-only configuration

Select exactly one deployment environment with `PADDLE_ENVIRONMENT=sandbox` or `production`. Use environment-specific recurring credentials and catalog bindings:

```text
PADDLE_API_KEY_SANDBOX=...
PADDLE_WEBHOOK_SECRET_SANDBOX=...
PADDLE_CLIENT_TOKEN_SANDBOX=...
PADDLE_RECURRING_PRICE_MONTHLY_V1_SANDBOX=pri_...
PADDLE_RECURRING_PRICE_ANNUAL_V1_SANDBOX=pri_...

PADDLE_API_KEY_PRODUCTION=...
PADDLE_WEBHOOK_SECRET_PRODUCTION=...
PADDLE_CLIENT_TOKEN_PRODUCTION=...
PADDLE_RECURRING_PRICE_MONTHLY_V1_PRODUCTION=pri_...
PADDLE_RECURRING_PRICE_ANNUAL_V1_PRODUCTION=pri_...

SUPABASE_SERVICE_ROLE_KEY=...
CRON_SECRET=...
```

Never expose API keys, webhook secrets, the service role, or `CRON_SECRET` through `VITE_*`. Browser-safe Paddle client tokens remain environment-specific deployment values; expose only the selected environment's token as `VITE_PADDLE_CLIENT_TOKEN` and pair it with `VITE_PADDLE_ENVIRONMENT`. The server rejects duplicated recurring price IDs or credentials across sandbox and production.

Both server and browser billing configuration fail closed: missing values and values other than the exact strings `sandbox` or `production` are configuration errors. Billing code never treats an unknown environment as sandbox.

## Rollout flags

All recurring flags default to false:

```text
VD_RECURRING_BILLING_ENABLED=false
VD_RECURRING_BILLING_PROCESSING_ENABLED=false
VD_RECURRING_BILLING_RECONCILIATION_ENABLED=false
VITE_RECURRING_BILLING_ENABLED=false
```

Enable processing and reconciliation only after the additive migration and sandbox lifecycle pass. Enable checkout last, together with the browser flag. Rollback disables checkout while leaving processing and reconciliation enabled for subscriptions that already exist.

## Provider flow

`/api/billing-subscription-checkout` maps only trusted VD catalog codes to recurring Paddle prices and creates a pending `payment_references` binding. Its server-created Paddle `custom_data` contains a domain-separated HMAC binding for user, environment, catalog, and nonce. If Paddle creates the transaction but the local insert fails, a verified webhook can validate that binding and idempotently reconstruct only the missing pending payment reference before the normal projector runs. Unsigned, modified, wrong-environment, and wrong-catalog metadata cannot recover an association. Browser checkout completion is UX feedback only.

`/api/billing-webhook` verifies the raw request signature, claims `billing_events` before effects with `event_source=webhook`, resolves only known VD transactions/subscriptions, applies environment and provider-time ordering, and calls the single `billing_rebuild_entitlements` projector. Reconciliation claims use `event_source=reconciliation`; upgraded Billing v1 rows use `migration`; future operator evidence must explicitly use `manual_admin`. Unknown evidence never grants access. Event claims and provider reference uniqueness make replay idempotent; advisory locks serialize each subscription/payment source.

`/api/billing-portal` authenticates the VD user, selects only their normalized subscription, creates a fresh Paddle portal session, and returns one requested short-lived URL with `Cache-Control: no-store`. Portal tokens and URLs are never persisted.

`/api/billing-reconcile` requires `Authorization: Bearer $CRON_SECRET`. The Vercel production cron calls it daily at 03:17 UTC. It fetches current provider truth and repairs differences through the same event processor and entitlement projector used by verified webhooks.

## Acceptance gate

Unit, migration, pgTAP, browser, and build checks do not replace a real Paddle Sandbox lifecycle. Keep recurring checkout disabled until monthly and annual checkout, signed webhook projection, replay, portal, cancellation/refund, and missed-webhook reconciliation have been exercised with actual sandbox credentials and catalog objects.
