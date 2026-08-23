# VD Billing v1

VD Billing v1 exists to prove one production loop:

> signed-in VD user -> Paddle Checkout -> real payment -> verified webhook -> VD membership grant -> payment ledger -> payout to the seller.

The provider is deliberately behind VD-owned order and membership records. Paddle can be replaced later without rewriting the membership model.

## Frozen product rules

| Plan | Price | Term | Renewal |
| --- | ---: | --- | --- |
| `vd_monthly` | CNY 19 | 1 natural month | one-time, no auto-renew |
| `vd_yearly` | CNY 199 | 1 natural year | one-time, no auto-renew |

- A user must be signed in before checkout can be created.
- Re-purchase extends from the current membership end. It never discards remaining time.
- A completed browser checkout does **not** grant membership.
- Only a verified `transaction.completed` Paddle webhook grants membership.
- A Paddle transaction can grant membership only once.
- An approved full refund revokes the grant created by that order and rebuilds the remaining membership timeline.
- An approved partial refund is recorded, but v1 does not automatically shorten membership time.
- Admin grants are supported at the database/RPC layer without forging payment orders.

## Architecture

```text
Browser
  |
  | authenticated POST /api/billing-checkout
  v
VD Vercel Function --------------------> Paddle API
  |                                      |
  | creates pending VD order             | transaction / checkout
  v                                      v
Supabase                              Customer pays
  ^                                      |
  |                                      | signed webhook
  | POST /api/billing-webhook <----------+
  |
  +-- billing_orders
  +-- membership_grants
  +-- memberships
  +-- billing_events
```

`billing_orders`, `membership_grants`, and `memberships` are VD-owned domain state. Paddle transaction/customer IDs are provider references, not primary membership state.

## 1. Apply the Supabase migration

Apply:

```text
supabase/migrations/20260823193000_billing_v1.sql
```

The migration adds:

- `billing_orders`: user-visible order ledger;
- `membership_grants`: immutable-ish entitlement grants with revocation metadata;
- `memberships`: materialized current membership timeline;
- `billing_events`: minimal webhook audit/idempotency record;
- RLS so authenticated users can only read their own orders/membership;
- service-role RPCs to grant, revoke, rebuild and manually grant membership.

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.

## 2. Create Paddle catalog items

Start in **Paddle Sandbox**.

Create one VD membership product and two **one-time** CNY prices (their Paddle `billing_cycle` must be `null`):

- monthly price: CNY 19.00 -> save its `pri_...` ID;
- yearly price: CNY 199.00 -> save its `pri_...` ID.

Configure pricing/tax display so checkout presents the intended consumer-facing CNY price. Do not create recurring monthly/yearly subscription prices for Billing v1.

Also configure an approved/default Paddle checkout domain. For production the intended VD domain is `https://visualdeadline.com` (or `https://www.visualdeadline.com`, depending on the Paddle account's approved domain setup).

## 3. Vercel environment variables

### Server only — never prefix with `VITE_`

```text
SUPABASE_SERVICE_ROLE_KEY=...
PADDLE_API_KEY=...
PADDLE_WEBHOOK_SECRET=...
PADDLE_PRICE_MONTHLY=pri_...
PADDLE_PRICE_YEARLY=pri_...
PADDLE_ENVIRONMENT=sandbox
PADDLE_CHECKOUT_URL=https://visualdeadline.com
```

The existing server may already have:

```text
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

If not, the functions can fall back to the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The service-role key never has a browser fallback.

### Browser-safe build variables

```text
VITE_PADDLE_CLIENT_TOKEN=test_...
VITE_PADDLE_ENVIRONMENT=sandbox
```

Paddle client-side tokens are designed for Paddle.js. Paddle API keys and webhook secrets are not.

Because `VITE_` values are compiled into the Vite build, redeploy after changing them.

## 4. Paddle webhook destination

Create a Paddle notification destination pointing to:

```text
https://visualdeadline.com/api/billing-webhook
```

Subscribe at minimum to:

```text
transaction.completed
adjustment.created
adjustment.updated
```

Copy that destination's secret into `PADDLE_WEBHOOK_SECRET`.

The webhook handler:

1. reads the raw request body;
2. verifies `Paddle-Signature` using HMAC-SHA256;
3. verifies that the completed transaction belongs to a server-created VD order;
4. verifies that the Paddle price ID maps to the same VD plan;
5. marks the order paid;
6. calls an idempotent membership-grant RPC;
7. records a minimal event audit row.

## 5. Sandbox smoke test

Do not call Billing v1 complete because the page renders. The sandbox acceptance test is:

1. Apply the billing migration.
2. Configure all Sandbox environment variables.
3. Redeploy Vercel.
4. Log into a real VD test account.
5. Open **个人中心 -> 大会员**.
6. Buy the CNY 19 monthly plan with Paddle Sandbox.
7. Confirm the Paddle transaction reaches `completed`.
8. Confirm `billing_orders.status = 'paid'`.
9. Confirm exactly one `membership_grants` row references that order.
10. Confirm `memberships.expires_at` is one natural month after the grant start.
11. Replay/retry the same webhook and confirm the membership does not extend again.
12. Buy the plan again and confirm the next month stacks after the existing expiry.
13. Create an approved full refund and confirm the order becomes `refunded` and that order's grant is revoked.

Then repeat with the CNY 199 yearly plan and confirm it adds 12 calendar months.

## 6. Production cutover

Only after Sandbox passes:

1. Finish Paddle seller/KYC and website review.
2. Create equivalent **live** CNY 19 / CNY 199 one-time prices.
3. Create a live client-side token, API key and webhook destination.
4. Change both Paddle environment variables to `production` and replace every Paddle ID/secret with live values.
5. Redeploy.
6. Use a real payer account to purchase one plan.
7. Confirm VD grants membership from `transaction.completed` without manual intervention.
8. Confirm the real transaction appears in Paddle balance.
9. Later confirm Paddle payout reaches the configured payout account.

The production acceptance condition is not merely “checkout opens.” It is:

```text
real money paid
  -> Paddle transaction completed
  -> signed webhook accepted
  -> VD order paid
  -> exactly one membership grant
  -> membership visible to the user
  -> funds visible in Paddle balance
  -> payout eventually reconciled
```

## Security invariants

- Never put `SUPABASE_SERVICE_ROLE_KEY`, `PADDLE_API_KEY`, or `PADDLE_WEBHOOK_SECRET` in GitHub source, browser storage, or `VITE_*` variables.
- Never grant membership from a browser event such as `checkout.completed`.
- Never trust a user-supplied amount or Paddle price ID. The checkout API accepts only VD plan codes and maps them server-side.
- Never reconstruct a paid membership from an unknown Paddle transaction. The webhook only fulfills transactions already linked to a VD order.
- Keep provider event payloads out of the long-term ledger unless a concrete audit need appears; v1 stores event IDs/type/outcome rather than raw payment payloads.

## Provider exit path

Future payment providers should implement the same domain operations:

```text
create order -> provider checkout -> verified provider event -> mark order paid -> create grant
```

A future `WechatPayAdapter`, `AlipayAdapter`, or other provider should not change how VD calculates membership periods or exposes entitlements.
