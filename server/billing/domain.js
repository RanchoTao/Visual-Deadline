export const PLUS_CAPABILITY = 'vd.plus';
export const PAST_DUE_GRACE_MS = 72 * 60 * 60 * 1000;
export const RECURRING_CATALOG_VERSION = 'vd-recurring-v1';

export const RECURRING_PLANS = Object.freeze({
  'vd.plus.monthly.v1': Object.freeze({ interval: 'month', currency: 'CNY', priceEnv: 'PADDLE_RECURRING_PRICE_MONTHLY_V1' }),
  'vd.plus.annual.v1': Object.freeze({ interval: 'year', currency: 'CNY', priceEnv: 'PADDLE_RECURRING_PRICE_ANNUAL_V1' }),
});

const STATUS_ORDER = Object.freeze({
  trialing: 0,
  active: 1,
  past_due: 2,
  cancel_scheduled: 3,
  paused: 4,
  canceled: 5,
  expired: 6,
});

const PAYMENT_STATUS_ORDER = Object.freeze({
  pending: 0,
  failed: 1,
  paid: 2,
  partially_refunded: 3,
  refunded: 4,
});

function asDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function iso(value) {
  return asDate(value)?.toISOString() ?? null;
}

function addMilliseconds(value, milliseconds) {
  const date = asDate(value);
  return date ? new Date(date.getTime() + milliseconds).toISOString() : null;
}

export function normalizeProviderEnvironment(value) {
  if (value === 'sandbox' || value === 'production') return value;
  throw new Error('PADDLE_ENVIRONMENT must be exactly sandbox or production.');
}

export function booleanFlag(value, fallback = false) {
  if (value == null || String(value).trim() === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

export function resolveCatalog(planCode, environment, readEnv) {
  const plan = RECURRING_PLANS[planCode];
  if (!plan) return null;
  const suffix = environment === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const priceId = readEnv(`${plan.priceEnv}_${suffix}`);
  if (!priceId) return null;
  return { ...plan, planCode, catalogVersion: RECURRING_CATALOG_VERSION, provider: 'paddle', providerEnvironment: environment, priceId };
}

export function catalogPlanFromPrice(priceId, environment, readEnv) {
  for (const planCode of Object.keys(RECURRING_PLANS)) {
    const binding = resolveCatalog(planCode, environment, readEnv);
    if (binding && binding.priceId === priceId) return binding;
  }
  return null;
}

export function validateCatalogIsolation(environment, readEnv) {
  const selectedSuffix = environment === 'production' ? 'PRODUCTION' : 'SANDBOX';
  const otherSuffix = environment === 'production' ? 'SANDBOX' : 'PRODUCTION';
  const selectedToken = readEnv(`PADDLE_CLIENT_TOKEN_${selectedSuffix}`) || readEnv('PADDLE_CLIENT_TOKEN');
  const selectedKey = readEnv(`PADDLE_API_KEY_${selectedSuffix}`) || readEnv('PADDLE_API_KEY');
  const selectedSecret = readEnv(`PADDLE_WEBHOOK_SECRET_${selectedSuffix}`) || readEnv('PADDLE_WEBHOOK_SECRET');
  const otherToken = readEnv(`PADDLE_CLIENT_TOKEN_${otherSuffix}`);
  const otherKey = readEnv(`PADDLE_API_KEY_${otherSuffix}`);
  const otherSecret = readEnv(`PADDLE_WEBHOOK_SECRET_${otherSuffix}`);
  const selectedPrices = Object.values(RECURRING_PLANS).map((plan) => readEnv(`${plan.priceEnv}_${selectedSuffix}`)).filter(Boolean);
  const otherPrices = Object.values(RECURRING_PLANS).map((plan) => readEnv(`${plan.priceEnv}_${otherSuffix}`)).filter(Boolean);
  const duplicatedPrice = selectedPrices.some((price) => otherPrices.includes(price));
  const duplicatedCredential = [
    [selectedToken, otherToken], [selectedKey, otherKey], [selectedSecret, otherSecret],
  ].some(([selected, other]) => Boolean(selected && other && selected === other));
  return {
    valid: Boolean(selectedKey && selectedSecret && selectedPrices.length === Object.keys(RECURRING_PLANS).length && !duplicatedPrice && !duplicatedCredential),
    selectedToken,
    selectedKey,
    selectedSecret,
    reason: duplicatedPrice
      ? 'Recurring Paddle price IDs cannot be shared across sandbox and production.'
      : duplicatedCredential
        ? 'Paddle credentials cannot be shared across sandbox and production.'
        : null,
  };
}

export function normalizeSubscriptionStatus(data) {
  const raw = String(data?.status || '').toLowerCase();
  const scheduledAction = String(data?.scheduled_change?.action || '').toLowerCase();
  if (raw === 'active' && scheduledAction === 'cancel') return 'cancel_scheduled';
  if (['trialing', 'active', 'past_due', 'paused', 'canceled'].includes(raw)) return raw;
  return 'expired';
}

export function extractSubscriptionPriceId(data) {
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length !== 1) return null;
  const priceId = items[0]?.price?.id || items[0]?.price_id;
  return typeof priceId === 'string' ? priceId : null;
}

export function matchesCatalogPolicy(data, catalog) {
  if (!catalog) return false;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (items.length !== 1) return false;
  const price = items[0]?.price || {};
  const interval = String(price.billing_cycle?.interval || '').toLowerCase();
  const currency = String(data?.currency_code || price.unit_price?.currency_code || '').toUpperCase();
  if (interval && interval !== catalog.interval) return false;
  if (currency && currency !== catalog.currency) return false;
  return true;
}

export function normalizeSubscriptionSnapshot(data, environment, readEnv, event = {}) {
  const providerSubscriptionId = typeof data?.id === 'string' ? data.id : '';
  const providerCustomerId = typeof data?.customer_id === 'string' ? data.customer_id : '';
  const priceId = extractSubscriptionPriceId(data);
  const catalog = priceId ? catalogPlanFromPrice(priceId, environment, readEnv) : null;
  if (!providerSubscriptionId || !providerCustomerId || !catalog || !matchesCatalogPolicy(data, catalog)) return null;
  return {
    provider: 'paddle',
    providerEnvironment: environment,
    providerSubscriptionId,
    providerCustomerId,
    planCode: catalog.planCode,
    catalogVersion: catalog.catalogVersion,
    status: normalizeSubscriptionStatus(data),
    currentPeriodStart: iso(data.current_billing_period?.starts_at || data.started_at),
    currentPeriodEnd: iso(data.current_billing_period?.ends_at || data.next_billed_at),
    cancelAt: iso(data.scheduled_change?.effective_at),
    canceledAt: iso(data.canceled_at),
    scheduledChange: data.scheduled_change && typeof data.scheduled_change === 'object' ? data.scheduled_change : null,
    providerUpdatedAt: iso(data.updated_at || event.occurred_at),
    eventOccurredAt: iso(event.occurred_at),
    lastProviderEventId: typeof event.event_id === 'string' ? event.event_id : null,
    originatingTransactionId: typeof data.transaction_id === 'string' ? data.transaction_id : null,
  };
}

export function shouldApplySubscriptionSnapshot(existing, incoming) {
  if (!existing) return true;
  const existingEnvironment = existing.provider_environment || existing.providerEnvironment;
  const incomingEnvironment = incoming.provider_environment || incoming.providerEnvironment;
  if (existingEnvironment !== incomingEnvironment) return false;
  const existingUpdated = asDate(existing.provider_updated_at || existing.providerUpdatedAt)?.getTime() ?? 0;
  const incomingUpdated = asDate(incoming.provider_updated_at || incoming.providerUpdatedAt)?.getTime() ?? 0;
  if (incomingUpdated > existingUpdated) return true;
  if (incomingUpdated < existingUpdated) return false;
  const currentStatus = existing.status || 'expired';
  const nextStatus = incoming.status || 'expired';
  return (STATUS_ORDER[nextStatus] ?? 0) >= (STATUS_ORDER[currentStatus] ?? 0);
}

export function mergePaymentStatus(currentStatus, nextStatus) {
  const current = PAYMENT_STATUS_ORDER[currentStatus] ?? 0;
  const next = PAYMENT_STATUS_ORDER[nextStatus] ?? 0;
  return next >= current ? nextStatus : currentStatus;
}

export function normalizePaymentReference(data, environment, userId, subscriptionId = null) {
  const transactionId = typeof data?.id === 'string' ? data.id : typeof data?.transaction_id === 'string' ? data.transaction_id : '';
  if (!transactionId || !userId) return null;
  const totals = data.details?.totals || data.totals || {};
  const status = data.status === 'completed' ? 'paid'
    : data.status === 'past_due' ? 'failed'
      : data.status === 'payment_failed' ? 'failed'
        : 'pending';
  const integer = (value) => Number.isInteger(Number(value)) ? Number(value) : 0;
  return {
    userId,
    subscriptionId,
    provider: 'paddle',
    providerEnvironment: environment,
    providerTransactionId: transactionId,
    kind: data.origin === 'subscription_recurring' ? 'renewal' : 'subscription',
    status,
    currency: String(data.currency_code || 'CNY').toUpperCase(),
    subtotalMinor: integer(totals.subtotal),
    taxMinor: integer(totals.tax),
    totalMinor: integer(totals.total),
    occurredAt: iso(data.billed_at || data.updated_at || data.created_at),
  };
}

function currentPeriodFullyRefunded(subscription, payments) {
  const start = asDate(subscription.current_period_start || subscription.currentPeriodStart)?.getTime() ?? -Infinity;
  const end = asDate(subscription.current_period_end || subscription.currentPeriodEnd)?.getTime() ?? Infinity;
  return payments.some((payment) => {
    const subscriptionId = payment.subscription_id || payment.subscriptionId;
    const occurredAt = asDate(payment.occurred_at || payment.occurredAt)?.getTime() ?? -Infinity;
    return subscriptionId === subscription.id && payment.status === 'refunded' && occurredAt >= start && occurredAt <= end;
  });
}

function subscriptionEntitlement(subscription, payments) {
  const status = subscription.status;
  const sourceId = subscription.id;
  const from = iso(subscription.current_period_start || subscription.currentPeriodStart || subscription.created_at || subscription.createdAt);
  const periodEnd = iso(subscription.current_period_end || subscription.currentPeriodEnd);
  const refunded = currentPeriodFullyRefunded(subscription, payments);
  let validUntil = periodEnd;
  let entitlementStatus = 'inactive';
  let reason = `recurring_${status}`;

  if (!refunded && ['active', 'cancel_scheduled', 'canceled'].includes(status) && periodEnd) entitlementStatus = 'active';
  if (!refunded && status === 'past_due' && periodEnd) {
    entitlementStatus = 'active';
    validUntil = addMilliseconds(periodEnd, PAST_DUE_GRACE_MS);
    reason = 'recurring_past_due_72h_grace';
  }
  if (refunded) reason = 'recurring_current_period_full_refund';
  if (status === 'trialing') reason = 'recurring_trial_disabled';
  if (status === 'paused') reason = 'recurring_paused';

  return {
    userId: subscription.user_id || subscription.userId,
    capability: PLUS_CAPABILITY,
    sourceType: 'subscription',
    sourceId,
    status: entitlementStatus,
    validFrom: from,
    validUntil,
    reason,
  };
}

function legacyGrantEntitlement(grant) {
  const revoked = Boolean(grant.revoked_at || grant.revokedAt);
  return {
    userId: grant.user_id || grant.userId,
    capability: PLUS_CAPABILITY,
    sourceType: grant.source === 'admin_grant' ? 'admin_grant' : 'legacy_membership_grant',
    sourceId: grant.id,
    status: revoked ? 'revoked' : 'active',
    validFrom: iso(grant.period_start || grant.periodStart || grant.granted_at || grant.grantedAt),
    validUntil: iso(grant.period_end || grant.periodEnd),
    reason: revoked ? `legacy_grant_revoked:${grant.revoke_reason || grant.revokeReason || 'unknown'}` : `legacy_${grant.source || 'unknown'}`,
  };
}

function legacyMembershipEntitlement(membership) {
  return {
    userId: membership.user_id || membership.userId,
    capability: PLUS_CAPABILITY,
    sourceType: 'legacy_membership',
    sourceId: membership.last_grant_id || membership.lastGrantId || membership.user_id || membership.userId,
    status: 'active',
    validFrom: iso(membership.starts_at || membership.startsAt),
    validUntil: iso(membership.expires_at || membership.expiresAt),
    reason: 'legacy_membership_projection',
  };
}

export function buildEntitlementProjection({ subscriptions = [], payments = [], legacyGrants = [], legacyMemberships = [] }) {
  const projected = [];
  const grantUsers = new Set();
  for (const grant of legacyGrants) {
    grantUsers.add(grant.user_id || grant.userId);
    projected.push(legacyGrantEntitlement(grant));
  }
  for (const membership of legacyMemberships) {
    const userId = membership.user_id || membership.userId;
    if (!grantUsers.has(userId)) projected.push(legacyMembershipEntitlement(membership));
  }
  for (const subscription of subscriptions) projected.push(subscriptionEntitlement(subscription, payments));
  return projected.filter((row) => row.userId && row.sourceId && row.validFrom);
}

export function hasEntitlement(rows, userId, capability, at = new Date()) {
  const instant = asDate(at)?.getTime();
  if (!Number.isFinite(instant)) throw new Error('Entitlement decision time is invalid.');
  const valid = rows.filter((row) => {
    if ((row.user_id || row.userId) !== userId || row.capability !== capability || row.status !== 'active') return false;
    const starts = asDate(row.valid_from || row.validFrom)?.getTime() ?? Infinity;
    const ends = asDate(row.valid_until || row.validUntil)?.getTime() ?? Infinity;
    return starts <= instant && instant < ends;
  });
  const validUntil = valid.reduce((latest, row) => {
    const candidate = iso(row.valid_until || row.validUntil);
    if (!candidate) return null;
    return !latest || candidate > latest ? candidate : latest;
  }, null);
  return {
    allowed: valid.length > 0,
    capability,
    validUntil,
    sources: valid.map((row) => ({ sourceType: row.source_type || row.sourceType, sourceId: row.source_id || row.sourceId, validUntil: iso(row.valid_until || row.validUntil) })),
    reason: valid.length ? 'valid_entitlement_source' : 'no_valid_entitlement_source',
  };
}

export function eventKind(eventType) {
  if (String(eventType).startsWith('subscription.')) return 'subscription';
  if (String(eventType).startsWith('transaction.')) return 'transaction';
  if (String(eventType).startsWith('adjustment.')) return 'adjustment';
  return 'ignored';
}
