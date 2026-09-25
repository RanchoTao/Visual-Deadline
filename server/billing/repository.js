import { parseHttpResponse } from './runtime.js';

export function createBillingRepository({ url, serviceRoleKey }) {
  if (!url || !serviceRoleKey) throw new Error('Recurring billing storage is not configured.');

  async function rest(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('apikey', serviceRoleKey);
    headers.set('Authorization', `Bearer ${serviceRoleKey}`);
    headers.set('Content-Type', 'application/json');
    return parseHttpResponse(await fetch(`${url}/rest/v1/${path}`, { ...init, headers }));
  }

  async function rpc(name, body) {
    return rest(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
  }

  return {
    rest,
    rpc,
    async claimEvent(event, environment, checksum, eventSource) {
      const rows = await rpc('billing_claim_event', {
        p_event_id: event.event_id,
        p_provider_environment: environment,
        p_event_source: eventSource,
        p_event_type: event.event_type,
        p_payload_checksum: checksum,
        p_occurred_at: event.occurred_at,
        p_provider_sequence: event.notification_id || null,
        p_provider_version: 1,
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    finishEvent(eventId, status, outcome, refs = {}, error = null) {
      return rpc('billing_finish_event', {
        p_event_id: eventId,
        p_processing_status: status,
        p_outcome: outcome,
        p_last_error: error,
        p_subscription_id: refs.subscriptionId || null,
        p_payment_reference_id: refs.paymentReferenceId || null,
        p_provider_transaction_id: refs.transactionId || null,
      });
    },
    async applySubscription(snapshot) {
      const rows = await rpc('billing_apply_subscription_snapshot', {
        p_provider_environment: snapshot.providerEnvironment,
        p_provider_subscription_id: snapshot.providerSubscriptionId,
        p_provider_customer_id: snapshot.providerCustomerId,
        p_plan_code: snapshot.planCode,
        p_catalog_version: snapshot.catalogVersion,
        p_status: snapshot.status,
        p_current_period_start: snapshot.currentPeriodStart,
        p_current_period_end: snapshot.currentPeriodEnd,
        p_cancel_at: snapshot.cancelAt,
        p_canceled_at: snapshot.canceledAt,
        p_scheduled_change: snapshot.scheduledChange,
        p_provider_updated_at: snapshot.providerUpdatedAt,
        p_event_id: snapshot.lastProviderEventId,
        p_originating_transaction_id: snapshot.originatingTransactionId,
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async applyPayment(payment) {
      const rows = await rpc('billing_apply_payment_reference', {
        p_provider_environment: payment.providerEnvironment,
        p_provider_transaction_id: payment.providerTransactionId,
        p_provider_subscription_id: payment.providerSubscriptionId || null,
        p_kind: payment.kind,
        p_status: payment.status,
        p_currency: payment.currency,
        p_subtotal_minor: payment.subtotalMinor,
        p_tax_minor: payment.taxMinor,
        p_total_minor: payment.totalMinor,
        p_occurred_at: payment.occurredAt,
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async recoverCheckoutPayment(binding, payment) {
      const rows = await rpc('billing_recover_checkout_payment', {
        p_user_id: binding.userId,
        p_provider_environment: binding.environment,
        p_provider_transaction_id: payment.providerTransactionId,
        p_currency: payment.currency,
        p_subtotal_minor: payment.subtotalMinor,
        p_tax_minor: payment.taxMinor,
        p_total_minor: payment.totalMinor,
        p_occurred_at: payment.occurredAt,
      });
      return Array.isArray(rows) ? rows[0] : rows;
    },
    async findCheckoutPayment(environment, transactionId) {
      const rows = await rest(`payment_references?select=id,user_id,subscription_id,status,occurred_at&provider=eq.paddle&provider_environment=eq.${environment}&provider_transaction_id=eq.${encodeURIComponent(transactionId)}&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async findSubscription(environment, providerSubscriptionId) {
      const rows = await rest(`subscriptions?select=*&provider=eq.paddle&provider_environment=eq.${environment}&provider_subscription_id=eq.${encodeURIComponent(providerSubscriptionId)}&limit=1`);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async listUserSubscriptions(userId, environment) {
      const rows = await rest(`subscriptions?select=*&user_id=eq.${encodeURIComponent(userId)}&provider=eq.paddle&provider_environment=eq.${environment}&order=updated_at.desc`);
      return Array.isArray(rows) ? rows : [];
    },
    async listReconcilable(environment) {
      const statuses = encodeURIComponent('(trialing,active,past_due,paused,cancel_scheduled)');
      const rows = await rest(`subscriptions?select=*&provider=eq.paddle&provider_environment=eq.${environment}&status=in.${statuses}&order=updated_at.asc&limit=500`);
      return Array.isArray(rows) ? rows : [];
    },
    async createCheckoutPayment(row) {
      return rest('payment_references', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify([row]),
      });
    },
    async patchCheckoutPayment(environment, id, patch) {
      return rest(`payment_references?id=eq.${encodeURIComponent(id)}&provider_environment=eq.${environment}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
    },
    rebuildEntitlements(userId) {
      return rpc('billing_rebuild_entitlements', { p_user_id: userId });
    },
  };
}
