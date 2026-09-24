import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { selectPortalUrl } from '../api/billing-portal.js';
import {
  PAST_DUE_GRACE_MS,
  buildEntitlementProjection,
  catalogPlanFromPrice,
  hasEntitlement,
  mergePaymentStatus,
  normalizeSubscriptionSnapshot,
  resolveCatalog,
  shouldApplySubscriptionSnapshot,
  validateCatalogIsolation,
} from '../server/billing/domain.js';
import { processProviderEvent } from '../server/billing/processor.js';
import { createLegacyBillingHandler } from '../server/billing/legacy.js';
import { verifyPaddleSignature } from '../server/billing/runtime.js';
import crypto from 'node:crypto';

const ENV = {
  PADDLE_RECURRING_PRICE_MONTHLY_V1_SANDBOX: 'pri_month_sandbox',
  PADDLE_RECURRING_PRICE_ANNUAL_V1_SANDBOX: 'pri_year_sandbox',
  PADDLE_RECURRING_PRICE_MONTHLY_V1_PRODUCTION: 'pri_month_live',
  PADDLE_RECURRING_PRICE_ANNUAL_V1_PRODUCTION: 'pri_year_live',
  PADDLE_API_KEY_SANDBOX: 'key', PADDLE_WEBHOOK_SECRET_SANDBOX: 'secret',
};
const readEnv = (name) => ENV[name] || '';

function subscriptionData(overrides = {}) {
  return {
    id: 'sub_1', customer_id: 'ctm_1', status: 'active', transaction_id: 'txn_checkout',
    items: [{ price: { id: 'pri_month_sandbox' } }],
    current_billing_period: { starts_at: '2026-09-01T00:00:00Z', ends_at: '2026-10-01T00:00:00Z' },
    updated_at: '2026-09-01T00:00:00Z', scheduled_change: null, ...overrides,
  };
}

function event(type, data, id = `evt_${type}`, occurredAt = data.updated_at || '2026-09-01T00:00:00Z') {
  return { event_id: id, event_type: type, occurred_at: occurredAt, data };
}

function fakeSystem({ environment = 'sandbox', payments = new Map([['txn_checkout', { status: 'pending', userId: 'user_1' }]]), providerSubscriptions = new Map() } = {}) {
  const events = new Map();
  const subscriptions = new Map();
  let subscriptionEffects = 0;
  let paymentEffects = 0;
  const repository = {
    async claimEvent(nextEvent, claimedEnvironment) {
      if (claimedEnvironment !== environment) return { claim_status: 'environment_conflict' };
      const current = events.get(nextEvent.event_id);
      if (current === 'succeeded' || current === 'ignored') return { claim_status: 'duplicate_succeeded' };
      if (current === 'processing') return { claim_status: 'in_progress' };
      events.set(nextEvent.event_id, 'processing');
      return { claim_status: 'claimed' };
    },
    async finishEvent(id, status) { events.set(id, status); },
    async applySubscription(snapshot) {
      if (snapshot.providerEnvironment !== environment) return { outcome: 'ignored_environment_mismatch' };
      const current = subscriptions.get(snapshot.providerSubscriptionId);
      if (!current && !payments.has(snapshot.originatingTransactionId)) return { outcome: 'ignored_unknown_provider_evidence' };
      if (!shouldApplySubscriptionSnapshot(current, snapshot)) return { outcome: 'ignored_stale_subscription', applied_subscription_id: current?.id };
      subscriptionEffects += 1;
      subscriptions.set(snapshot.providerSubscriptionId, { ...snapshot, id: current?.id || `local_${snapshot.providerSubscriptionId}`, user_id: 'user_1' });
      return { outcome: 'subscription_applied', applied_subscription_id: `local_${snapshot.providerSubscriptionId}`, applied_user_id: 'user_1' };
    },
    async applyPayment(next) {
      const current = payments.get(next.providerTransactionId);
      const knownSubscription = subscriptions.has(next.providerSubscriptionId);
      if (!current && !knownSubscription) return { outcome: 'ignored_unknown_provider_evidence' };
      paymentEffects += 1;
      const status = mergePaymentStatus(current?.status || 'pending', next.status);
      payments.set(next.providerTransactionId, { ...current, ...next, status });
      return { outcome: 'payment_applied', applied_payment_reference_id: `pay_${next.providerTransactionId}`, applied_subscription_id: next.providerSubscriptionId ? `local_${next.providerSubscriptionId}` : null };
    },
    async findCheckoutPayment(_environment, transactionId) { return payments.get(transactionId) || null; },
  };
  const paddle = { async getSubscription(id) { return { data: providerSubscriptions.get(id) || subscriptionData({ id }) }; } };
  const runtime = { environment, processingEnabled: true, isolation: { valid: true, reason: null } };
  const legacyHandler = async () => ({ handled: false, outcome: 'ignored_unknown_order' });
  return { repository, paddle, runtime, legacyHandler, events, subscriptions, payments, effects: () => ({ subscriptionEffects, paymentEffects }) };
}

async function process(system, nextEvent, checksum = 'a'.repeat(64)) {
  return processProviderEvent({ ...system, event: nextEvent, checksum, readEnv });
}

test('immutable monthly and annual recurring catalog bindings are separate by environment', () => {
  assert.equal(resolveCatalog('vd.plus.monthly.v1', 'sandbox', readEnv)?.priceId, 'pri_month_sandbox');
  assert.equal(resolveCatalog('vd.plus.annual.v1', 'sandbox', readEnv)?.interval, 'year');
  assert.equal(catalogPlanFromPrice('pri_month_live', 'sandbox', readEnv), null);
  assert.equal(validateCatalogIsolation('sandbox', readEnv).valid, true);
});

test('mixed sandbox and production price configuration fails closed', () => {
  const mixed = { ...ENV, PADDLE_RECURRING_PRICE_MONTHLY_V1_PRODUCTION: 'pri_month_sandbox' };
  assert.equal(validateCatalogIsolation('sandbox', (name) => mixed[name] || '').valid, false);
});

test('shared sandbox and production credentials fail closed', () => {
  const mixed = { ...ENV, PADDLE_API_KEY_PRODUCTION: 'key' };
  const isolation = validateCatalogIsolation('sandbox', (name) => mixed[name] || '');
  assert.equal(isolation.valid, false);
  assert.match(isolation.reason, /credentials/);
});

test('Billing v1 trusted order mapping still rejects conflicting custom metadata', async () => {
  const writes = [];
  const repository = {
    async rest(path, init) {
      if (!init) return [{ id: 'order_1', user_id: 'user_1', plan_code: 'vd_monthly', status: 'pending', amount_minor: 1900, currency: 'CNY', provider_environment: 'sandbox' }];
      writes.push({ path, init }); return null;
    },
    async rpc(name, body) { writes.push({ name, body }); },
    async rebuildEntitlements(userId) { writes.push({ rebuild: userId }); },
  };
  const handler = createLegacyBillingHandler(repository, 'sandbox', (name) => name === 'PADDLE_PRICE_MONTHLY' ? 'pri_legacy_month' : '');
  const result = await handler(event('transaction.completed', {
    id: 'txn_legacy', currency_code: 'CNY', details: { totals: { total: '1900' } },
    items: [{ price: { id: 'pri_legacy_month' } }], custom_data: { vd_order_id: 'order_1', vd_user_id: 'forged_user' },
  }, 'evt_legacy_metadata'));
  assert.equal(result.outcome, 'ignored_user_metadata_mismatch');
  assert.equal(writes.length, 0);
});

test('monthly first subscription binds only through the trusted checkout transaction', async () => {
  const system = fakeSystem();
  const result = await process(system, event('subscription.created', subscriptionData()));
  assert.equal(result.body.outcome, 'subscription_applied');
  assert.equal(system.subscriptions.get('sub_1').planCode, 'vd.plus.monthly.v1');
});

test('annual first subscription uses the annual immutable catalog code', async () => {
  const data = subscriptionData({ id: 'sub_year', transaction_id: 'txn_checkout', items: [{ price: { id: 'pri_year_sandbox' } }] });
  const system = fakeSystem({ providerSubscriptions: new Map([['sub_year', data]]) });
  await process(system, event('subscription.created', data));
  assert.equal(system.subscriptions.get('sub_year').planCode, 'vd.plus.annual.v1');
});

test('unknown transaction cannot bind a subscription or grant access', async () => {
  const system = fakeSystem({ payments: new Map() });
  const result = await process(system, event('subscription.created', subscriptionData()));
  assert.equal(result.body.outcome, 'ignored_unknown_provider_evidence');
  assert.equal(system.subscriptions.size, 0);
});

test('wrong recurring price is rejected before subscription projection', async () => {
  const data = subscriptionData({ items: [{ price: { id: 'pri_untrusted' } }] });
  const system = fakeSystem({ providerSubscriptions: new Map([['sub_1', data]]) });
  const result = await process(system, event('subscription.created', data));
  assert.equal(result.body.outcome, 'ignored_unknown_catalog');
  assert.equal(system.effects().subscriptionEffects, 0);
});

test('trusted catalog currency and billing interval are enforced', async () => {
  const wrongCurrency = subscriptionData({ items: [{ price: { id: 'pri_month_sandbox', billing_cycle: { interval: 'month' } } }], currency_code: 'USD' });
  const wrongInterval = subscriptionData({ items: [{ price: { id: 'pri_month_sandbox', billing_cycle: { interval: 'year' } } }] });
  assert.equal(normalizeSubscriptionSnapshot(wrongCurrency, 'sandbox', readEnv, event('subscription.created', wrongCurrency)), null);
  assert.equal(normalizeSubscriptionSnapshot(wrongInterval, 'sandbox', readEnv, event('subscription.created', wrongInterval)), null);

  const system = fakeSystem();
  const transaction = { id: 'txn_checkout', subscription_id: 'sub_1', status: 'completed', currency_code: 'USD', items: [{ price: { id: 'pri_month_sandbox' } }] };
  const result = await process(system, event('transaction.completed', transaction, 'evt_wrong_currency'));
  assert.equal(result.body.outcome, 'ignored_catalog_policy_mismatch');
  assert.deepEqual(system.effects(), { subscriptionEffects: 0, paymentEffects: 0 });
});

test('first completed transaction binds fetched subscription through its trusted transaction id', async () => {
  const provider = subscriptionData({ id: 'sub_first', transaction_id: undefined });
  const payments = new Map([['txn_first', { status: 'pending', userId: 'user_1' }]]);
  const system = fakeSystem({ payments, providerSubscriptions: new Map([['sub_first', provider]]) });
  const transaction = {
    id: 'txn_first', subscription_id: 'sub_first', status: 'completed', currency_code: 'CNY',
    items: [{ price: { id: 'pri_month_sandbox', billing_cycle: { interval: 'month' } } }],
    updated_at: '2026-09-01T00:00:00Z',
  };
  const result = await process(system, event('transaction.completed', transaction, 'evt_first_transaction'));
  assert.equal(result.body.outcome, 'payment_applied');
  assert.equal(system.subscriptions.get('sub_first').originatingTransactionId, 'txn_first');
  assert.deepEqual(system.effects(), { subscriptionEffects: 1, paymentEffects: 1 });
});

test('duplicate replay has exactly one subscription effect', async () => {
  const system = fakeSystem(); const next = event('subscription.created', subscriptionData(), 'evt_duplicate');
  const first = await process(system, next); const second = await process(system, next);
  assert.equal(first.body.outcome, 'subscription_applied');
  assert.equal(second.body.outcome, 'duplicate_succeeded');
  assert.equal(system.effects().subscriptionEffects, 1);
});

test('concurrent duplicate processing cannot apply twice', async () => {
  const system = fakeSystem(); const next = event('subscription.created', subscriptionData(), 'evt_concurrent');
  const results = await Promise.all([process(system, next), process(system, next)]);
  assert.equal(results.filter((result) => result.body.outcome === 'subscription_applied').length, 1);
  assert.equal(system.effects().subscriptionEffects, 1);
});

test('older active event cannot reactivate newer canceled provider truth', () => {
  const canceled = normalizeSubscriptionSnapshot(subscriptionData({ status: 'canceled', updated_at: '2026-09-20T00:00:00Z' }), 'sandbox', readEnv, event('subscription.canceled', subscriptionData()));
  const oldActive = normalizeSubscriptionSnapshot(subscriptionData({ status: 'active', updated_at: '2026-09-10T00:00:00Z' }), 'sandbox', readEnv, event('subscription.updated', subscriptionData()));
  assert.equal(shouldApplySubscriptionSnapshot(canceled, oldActive), false);
});

test('equal-version paused or canceled state cannot be undone by active update', () => {
  const timestamp = '2026-09-20T00:00:00Z';
  assert.equal(shouldApplySubscriptionSnapshot({ providerEnvironment: 'sandbox', providerUpdatedAt: timestamp, status: 'paused' }, { providerEnvironment: 'sandbox', providerUpdatedAt: timestamp, status: 'active' }), false);
  assert.equal(shouldApplySubscriptionSnapshot({ providerEnvironment: 'sandbox', providerUpdatedAt: timestamp, status: 'canceled' }, { providerEnvironment: 'sandbox', providerUpdatedAt: timestamp, status: 'active' }), false);
});

test('provider upgrade or downgrade normalizes from trusted new price', () => {
  const annual = normalizeSubscriptionSnapshot(subscriptionData({ items: [{ price: { id: 'pri_year_sandbox' } }], updated_at: '2026-09-02T00:00:00Z' }), 'sandbox', readEnv, event('subscription.updated', subscriptionData()));
  assert.equal(annual.planCode, 'vd.plus.annual.v1');
});

test('no-trial, pause, active, cancel-scheduled, canceled, and grace policies are explicit', () => {
  const base = { id: 's', user_id: 'u', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z' };
  const projected = buildEntitlementProjection({ subscriptions: [
    { ...base, id: 'trial', status: 'trialing' }, { ...base, id: 'paused', status: 'paused' }, { ...base, id: 'active', status: 'active' },
    { ...base, id: 'scheduled', status: 'cancel_scheduled' }, { ...base, id: 'canceled', status: 'canceled' }, { ...base, id: 'due', status: 'past_due' },
  ] });
  assert.equal(projected.find((row) => row.sourceId === 'trial').status, 'inactive');
  assert.equal(projected.find((row) => row.sourceId === 'paused').status, 'inactive');
  assert.equal(projected.find((row) => row.sourceId === 'active').status, 'active');
  assert.equal(projected.find((row) => row.sourceId === 'scheduled').status, 'active');
  assert.equal(projected.find((row) => row.sourceId === 'canceled').validUntil, '2026-10-01T00:00:00.000Z');
  assert.equal(new Date(projected.find((row) => row.sourceId === 'due').validUntil).getTime(), new Date('2026-10-01T00:00:00Z').getTime() + PAST_DUE_GRACE_MS);
});

test('payment recovery and renewal success advance evidence without overriding refunds', () => {
  assert.equal(mergePaymentStatus('failed', 'paid'), 'paid');
  assert.equal(mergePaymentStatus('refunded', 'paid'), 'refunded');
  assert.equal(mergePaymentStatus('partially_refunded', 'paid'), 'partially_refunded');
});

test('full refund removes only the affected recurring source; partial refund does not', () => {
  const subscription = { id: 's', user_id: 'u', status: 'active', current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z' };
  const full = buildEntitlementProjection({ subscriptions: [subscription], payments: [{ subscription_id: 's', status: 'refunded', occurred_at: '2026-09-01T00:00:00Z' }] });
  const partial = buildEntitlementProjection({ subscriptions: [subscription], payments: [{ subscription_id: 's', status: 'partially_refunded', occurred_at: '2026-09-01T00:00:00Z' }] });
  assert.equal(full[0].status, 'inactive'); assert.equal(partial[0].status, 'active');
});

test('refund before delayed transaction.completed remains refunded', async () => {
  const payments = new Map([['txn_refund', { status: 'refunded', userId: 'u' }]]);
  const system = fakeSystem({ payments });
  const data = { id: 'txn_refund', subscription_id: 'sub_1', status: 'completed', currency_code: 'CNY', items: [{ price: { id: 'pri_month_sandbox' } }], updated_at: '2026-09-10T00:00:00Z' };
  await process(system, event('transaction.completed', data, 'evt_delayed_completed'));
  assert.equal(payments.get('txn_refund').status, 'refunded');
});

test('legacy, recurring, and admin sources authorize as a union without period stacking', () => {
  const rows = buildEntitlementProjection({
    subscriptions: [{ id: 's', user_id: 'u', status: 'active', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z' }],
    legacyGrants: [
      { id: 'legacy', user_id: 'u', source: 'paddle', period_start: '2026-01-01T00:00:00Z', period_end: '2026-06-01T00:00:00Z' },
      { id: 'admin', user_id: 'u', source: 'admin_grant', period_start: '2026-01-01T00:00:00Z', period_end: '2026-12-01T00:00:00Z' },
    ],
  });
  const decision = hasEntitlement(rows, 'u', 'vd.plus', new Date('2026-01-15T00:00:00Z'));
  assert.equal(decision.allowed, true); assert.equal(decision.sources.length, 3); assert.equal(decision.validUntil, '2026-12-01T00:00:00.000Z');
  assert.equal(rows.find((row) => row.sourceId === 's').validUntil, '2026-02-01T00:00:00.000Z');
});

test('revoked legacy grant plus active subscription still authorizes', () => {
  const rows = buildEntitlementProjection({ subscriptions: [{ id: 's', user_id: 'u', status: 'active', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z' }], legacyGrants: [{ id: 'g', user_id: 'u', source: 'paddle', period_start: '2026-01-01T00:00:00Z', period_end: '2026-06-01T00:00:00Z', revoked_at: '2026-01-02T00:00:00Z' }] });
  assert.equal(hasEntitlement(rows, 'u', 'vd.plus', new Date('2026-01-15T00:00:00Z')).allowed, true);
});

test('customer portal selects only requested owned subscription links and endpoint is no-store', () => {
  const portal = { data: { urls: { general: { overview: 'https://portal/overview?token=x' }, subscriptions: [{ id: 'sub_owned', cancel_subscription: 'https://portal/cancel?token=x', update_subscription_payment_method: 'https://portal/payment?token=x' }] } } };
  assert.equal(selectPortalUrl(portal, 'sub_owned', 'cancel'), 'https://portal/cancel?token=x');
  assert.equal(selectPortalUrl(portal, 'sub_other', 'cancel'), null);
  const source = readFileSync(new URL('../api/billing-portal.js', import.meta.url), 'utf8');
  assert.match(source, /listUserSubscriptions\(user\.id/); assert.doesNotMatch(source, /insert|update.*portal/i);
  assert.match(readFileSync(new URL('../server/billing/runtime.js', import.meta.url), 'utf8'), /Cache-Control[\s\S]*no-store/);
});

test('missed subscription webhook is repairable through the same event processor', async () => {
  const provider = subscriptionData({ updated_at: '2026-09-21T00:00:00Z' });
  const system = fakeSystem({ providerSubscriptions: new Map([['sub_1', provider]]) });
  const synthetic = event('subscription.updated', provider, 'reconcile_hash', provider.updated_at);
  const result = await process(system, synthetic);
  assert.equal(result.body.outcome, 'subscription_applied'); assert.equal(system.subscriptions.get('sub_1').providerUpdatedAt, new Date(provider.updated_at).toISOString());
});

test('environment mismatch is rejected before any effect', async () => {
  const system = fakeSystem({ environment: 'production' });
  system.runtime.environment = 'sandbox';
  const result = await process(system, event('subscription.created', subscriptionData()));
  assert.equal(result.status, 409); assert.equal(system.effects().subscriptionEffects, 0);
});

test('Paddle signatures verify raw bytes and reject stale or changed bodies', () => {
  const body = '{"event_id":"evt"}'; const now = Date.parse('2026-09-24T00:00:00Z'); const ts = Math.floor(now / 1000);
  const signature = crypto.createHmac('sha256', 'secret').update(`${ts}:${body}`).digest('hex');
  assert.equal(verifyPaddleSignature(body, `ts=${ts};h1=${signature}`, 'secret', now), true);
  assert.equal(verifyPaddleSignature(`${body} `, `ts=${ts};h1=${signature}`, 'secret', now), false);
  assert.equal(verifyPaddleSignature(body, `ts=${ts};h1=${signature}`, 'secret', now + 6000), false);
});
