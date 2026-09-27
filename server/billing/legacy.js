function integer(value) {
  return Number.isInteger(Number(value)) ? Number(value) : 0;
}

export function createLegacyBillingHandler(repository, environment, readEnv) {
  function priceToPlan(priceId) {
    const monthly = readEnv('PADDLE_PRICE_MONTHLY');
    const yearly = readEnv('PADDLE_PRICE_YEARLY');
    if (monthly && priceId === monthly) return 'vd_monthly';
    if (yearly && priceId === yearly) return 'vd_yearly';
    return null;
  }

  async function findOrder(transactionId) {
    if (!transactionId) return null;
    const rows = await repository.rest(
      `billing_orders?select=id,user_id,plan_code,status,amount_minor,currency,provider_environment&provider_transaction_id=eq.${encodeURIComponent(transactionId)}&or=(provider_environment.eq.${environment},provider_environment.eq.legacy_unknown)&limit=1`,
    );
    return Array.isArray(rows) ? rows[0] || null : null;
  }

  async function patchOrder(orderId, patch) {
    return repository.rest(`billing_orders?id=eq.${encodeURIComponent(orderId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
  }

  return async function handleLegacy(event) {
    const data = event.data || {};
    if (event.event_type === 'transaction.completed') {
      const transactionId = typeof data.id === 'string' ? data.id : '';
      const order = await findOrder(transactionId);
      if (!order) return { handled: false, outcome: 'ignored_unknown_order', transactionId };
      if (order.status === 'refunded') return { handled: true, outcome: 'ignored_completed_after_full_refund', transactionId };
      const items = Array.isArray(data.items) ? data.items : [];
      const priceId = items.length === 1 ? items[0]?.price?.id || items[0]?.price_id : null;
      const planCode = typeof priceId === 'string' ? priceToPlan(priceId) : null;
      if (!planCode || planCode !== order.plan_code) return { handled: true, outcome: 'ignored_price_mismatch', transactionId };
      if (data.currency_code && data.currency_code !== 'CNY') return { handled: true, outcome: 'ignored_currency_mismatch', transactionId };
      const totals = data.details?.totals || data.totals || {};
      if (integer(totals.total) && integer(totals.total) !== order.amount_minor) return { handled: true, outcome: 'ignored_amount_mismatch', transactionId };
      const custom = data.custom_data && typeof data.custom_data === 'object' ? data.custom_data : {};
      if (custom.vd_order_id && custom.vd_order_id !== order.id) return { handled: true, outcome: 'ignored_order_metadata_mismatch', transactionId };
      if (custom.vd_user_id && custom.vd_user_id !== order.user_id) return { handled: true, outcome: 'ignored_user_metadata_mismatch', transactionId };
      if (custom.vd_plan_code && custom.vd_plan_code !== order.plan_code) return { handled: true, outcome: 'ignored_plan_metadata_mismatch', transactionId };
      const paidAt = data.billed_at || data.updated_at || event.occurred_at;
      await patchOrder(order.id, {
        status: order.status === 'partially_refunded' ? 'partially_refunded' : 'paid',
        provider_customer_id: data.customer_id || null,
        provider_environment: order.provider_environment === 'legacy_unknown' ? 'legacy_unknown' : environment,
        paid_at: paidAt,
        provider_error_code: null,
      });
      await repository.rpc('billing_apply_paddle_grant', {
        p_user_id: order.user_id, p_plan_code: order.plan_code, p_order_id: order.id, p_granted_at: paidAt,
      });
      await repository.rebuildEntitlements(order.user_id);
      return { handled: true, outcome: 'legacy_membership_granted', transactionId, userId: order.user_id };
    }

    if (event.event_type === 'adjustment.created' || event.event_type === 'adjustment.updated') {
      const transactionId = typeof data.transaction_id === 'string' ? data.transaction_id : '';
      const order = await findOrder(transactionId);
      if (!order) return { handled: false, outcome: 'ignored_unknown_order', transactionId };
      if (data.action !== 'refund' || data.status !== 'approved') {
        return { handled: true, outcome: `legacy_refund_${String(data.status || 'ignored')}`, transactionId };
      }
      const refundedAt = data.updated_at || event.occurred_at;
      if (data.type === 'full') {
        await patchOrder(order.id, { status: 'refunded', refunded_at: refundedAt });
        await repository.rpc('billing_revoke_order_grant', {
          p_order_id: order.id, p_reason: 'approved_full_refund', p_revoked_at: refundedAt,
        });
        await repository.rebuildEntitlements(order.user_id);
        return { handled: true, outcome: 'legacy_full_refund_revoked', transactionId, userId: order.user_id };
      }
      await patchOrder(order.id, { status: 'partially_refunded', refunded_at: refundedAt });
      await repository.rebuildEntitlements(order.user_id);
      return { handled: true, outcome: 'legacy_partial_refund_recorded', transactionId, userId: order.user_id };
    }
    return { handled: false, outcome: 'ignored_event_type', transactionId: null };
  };
}
