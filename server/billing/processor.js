import {
  catalogPlanFromPrice,
  eventKind,
  extractSubscriptionPriceId,
  matchesCatalogPolicy,
  normalizeSubscriptionSnapshot,
} from './domain.js';

function asInteger(value) {
  return Number.isInteger(Number(value)) ? Number(value) : 0;
}

function transactionPayment(event, environment) {
  const data = event.data || {};
  const totals = data.details?.totals || data.totals || {};
  const status = event.event_type === 'transaction.completed' ? 'paid' : 'failed';
  return {
    providerEnvironment: environment,
    providerTransactionId: data.id,
    providerSubscriptionId: data.subscription_id || null,
    kind: data.origin === 'subscription_recurring' ? 'renewal' : 'subscription',
    status,
    currency: String(data.currency_code || 'CNY').toUpperCase(),
    subtotalMinor: asInteger(totals.subtotal),
    taxMinor: asInteger(totals.tax),
    totalMinor: asInteger(totals.total),
    occurredAt: data.billed_at || data.updated_at || event.occurred_at,
  };
}

function adjustmentPayment(event, environment) {
  const data = event.data || {};
  return {
    providerEnvironment: environment,
    providerTransactionId: data.transaction_id,
    providerSubscriptionId: data.subscription_id || null,
    kind: 'adjustment',
    status: data.type === 'full' ? 'refunded' : 'partially_refunded',
    currency: String(data.currency_code || data.totals?.currency_code || 'CNY').toUpperCase(),
    subtotalMinor: asInteger(data.totals?.subtotal),
    taxMinor: asInteger(data.totals?.tax),
    totalMinor: asInteger(data.totals?.total),
    occurredAt: data.updated_at || event.occurred_at,
  };
}

function validEvent(event) {
  if (!event || typeof event.event_id !== 'string' || !event.event_id) return false;
  if (typeof event.event_type !== 'string' || !event.event_type) return false;
  return Number.isFinite(new Date(event.occurred_at).getTime());
}

function resultRefs(result, transactionId = null) {
  return {
    subscriptionId: result?.applied_subscription_id || null,
    paymentReferenceId: result?.applied_payment_reference_id || null,
    transactionId,
  };
}

export async function processProviderEvent({ event, checksum, runtime, repository, paddle, legacyHandler, readEnv }) {
  if (!validEvent(event)) return { status: 400, body: { ok: false, code: 'INVALID_WEBHOOK_EVENT' } };
  const claim = await repository.claimEvent(event, runtime.environment, checksum);
  if (claim?.claim_status === 'duplicate_succeeded' || claim?.claim_status === 'in_progress') {
    return { status: 200, body: { ok: true, outcome: claim.claim_status } };
  }
  if (claim?.claim_status !== 'claimed') {
    return { status: 409, body: { ok: false, code: String(claim?.claim_status || 'EVENT_CLAIM_FAILED') } };
  }

  try {
    const kind = eventKind(event.event_type);
    let outcome = 'ignored_event_type';
    let refs = {};

    if (kind === 'subscription') {
      if (!runtime.isolation?.valid) throw new Error(runtime.isolation?.reason || 'Recurring billing environment isolation is invalid.');
      if (!runtime.processingEnabled) throw new Error('Recurring billing processing is disabled.');
      const providerId = event.data?.id;
      if (typeof providerId !== 'string') {
        outcome = 'ignored_missing_subscription';
      } else {
        const providerResponse = await paddle.getSubscription(providerId);
        const providerData = { ...event.data, ...providerResponse?.data, transaction_id: event.data?.transaction_id || providerResponse?.data?.transaction_id };
        const snapshot = normalizeSubscriptionSnapshot(providerData, runtime.environment, readEnv, event);
        if (!snapshot) outcome = 'ignored_unknown_catalog';
        else {
          const applied = await repository.applySubscription(snapshot);
          outcome = applied?.outcome || 'ignored_subscription';
          refs = resultRefs(applied, snapshot.originatingTransactionId);
        }
      }
    } else if (kind === 'transaction') {
      const data = event.data || {};
      const priceId = extractSubscriptionPriceId(data);
      const recurringCatalog = priceId ? catalogPlanFromPrice(priceId, runtime.environment, readEnv) : null;
      const isRecurring = Boolean(data.subscription_id || recurringCatalog);
      if (isRecurring) {
        if (!runtime.isolation?.valid) throw new Error(runtime.isolation?.reason || 'Recurring billing environment isolation is invalid.');
        if (!runtime.processingEnabled) throw new Error('Recurring billing processing is disabled.');
        if (priceId && !recurringCatalog) outcome = 'ignored_unknown_catalog';
        else if (recurringCatalog && !matchesCatalogPolicy(data, recurringCatalog)) outcome = 'ignored_catalog_policy_mismatch';
        else {
          const payment = transactionPayment(event, runtime.environment);
          const applied = await repository.applyPayment(payment);
          outcome = applied?.outcome || 'ignored_payment';
          refs = resultRefs(applied, payment.providerTransactionId);
          if (data.subscription_id) {
            const providerResponse = await paddle.getSubscription(data.subscription_id);
            const providerData = {
              ...providerResponse?.data,
              transaction_id: providerResponse?.data?.transaction_id || data.id,
            };
            const snapshot = normalizeSubscriptionSnapshot(providerData, runtime.environment, readEnv, event);
            if (snapshot) {
              const subscriptionResult = await repository.applySubscription(snapshot);
              refs = { ...refs, ...resultRefs(subscriptionResult, payment.providerTransactionId) };
            }
          }
        }
      } else {
        const legacy = await legacyHandler(event);
        outcome = legacy.outcome;
        refs = { transactionId: legacy.transactionId || null };
      }
    } else if (kind === 'adjustment') {
      const data = event.data || {};
      if (data.action !== 'refund' || data.status !== 'approved') {
        outcome = `refund_${String(data.status || 'ignored')}`;
      } else {
        const knownRecurring = await repository.findCheckoutPayment(runtime.environment, data.transaction_id).catch(() => null);
        if (knownRecurring || data.subscription_id) {
          if (!runtime.isolation?.valid) throw new Error(runtime.isolation?.reason || 'Recurring billing environment isolation is invalid.');
          if (!runtime.processingEnabled) throw new Error('Recurring billing processing is disabled.');
          const payment = adjustmentPayment(event, runtime.environment);
          const applied = await repository.applyPayment(payment);
          outcome = applied?.outcome || 'ignored_adjustment';
          refs = resultRefs(applied, payment.providerTransactionId);
        } else {
          const legacy = await legacyHandler(event);
          outcome = legacy.outcome;
          refs = { transactionId: legacy.transactionId || null };
        }
      }
    }

    const finalStatus = outcome.startsWith('ignored_') || outcome.startsWith('refund_') ? 'ignored' : 'succeeded';
    await repository.finishEvent(event.event_id, finalStatus, outcome, refs);
    return { status: 200, body: { ok: true, outcome } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await repository.finishEvent(event.event_id, 'retryable_failed', 'processing_failed', {}, message).catch(() => undefined);
    return { status: 500, body: { ok: false, code: 'WEBHOOK_PROCESSING_FAILED', error: '支付回调处理失败，将等待 Paddle 重试。' }, error };
  }
}
