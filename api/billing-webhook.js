import crypto from 'node:crypto';

const SIGNATURE_TOLERANCE_SECONDS = 5;

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value.trim();
  }
  return '';
}

async function readRawBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || typeof signatureHeader !== 'string' || !secret) return false;

  const values = signatureHeader.split(';').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});

  const timestamp = Number(values.ts?.[0]);
  const signatures = values.h1 || [];
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}:${rawBody}`, 'utf8').digest('hex');
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  const expectedBuffer = Buffer.from(expected, 'hex');

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const signatureBuffer = Buffer.from(signature, 'hex');
    return signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  });
}

async function parseResponse(result) {
  const text = await result.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text.slice(0, 500) };
    }
  }
  if (!result.ok) {
    const detail = body?.message || body?.error || body?.hint || `HTTP ${result.status}`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return body;
}

async function serviceRest(supabaseUrl, serviceRoleKey, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');
  return parseResponse(await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers }));
}

async function callRpc(supabaseUrl, serviceRoleKey, functionName, body) {
  return serviceRest(supabaseUrl, serviceRoleKey, `rpc/${functionName}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function findOrderByTransaction(supabaseUrl, serviceRoleKey, transactionId) {
  if (!transactionId) return null;
  const rows = await serviceRest(
    supabaseUrl,
    serviceRoleKey,
    `billing_orders?select=id,user_id,plan_code,status,amount_minor,currency&provider_transaction_id=eq.${encodeURIComponent(transactionId)}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchOrder(supabaseUrl, serviceRoleKey, orderId, patch) {
  return serviceRest(supabaseUrl, serviceRoleKey, `billing_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function recordEvent(supabaseUrl, serviceRoleKey, event, transactionId, outcome) {
  if (!event?.event_id) return;
  await serviceRest(supabaseUrl, serviceRoleKey, 'billing_events?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify([{
      id: event.event_id,
      provider: 'paddle',
      event_type: String(event.event_type || 'unknown'),
      provider_transaction_id: transactionId || null,
      outcome,
      occurred_at: event.occurred_at || null,
    }]),
  });
}

function priceToPlan(priceId) {
  const monthly = env('PADDLE_PRICE_MONTHLY');
  const yearly = env('PADDLE_PRICE_YEARLY');
  if (monthly && priceId === monthly) return 'vd_monthly';
  if (yearly && priceId === yearly) return 'vd_yearly';
  return null;
}

function planFromCompletedTransaction(data) {
  if (!Array.isArray(data?.items) || data.items.length !== 1) return null;
  const item = data.items[0];
  const priceId = item?.price?.id || item?.price_id;
  return typeof priceId === 'string' ? priceToPlan(priceId) : null;
}

async function handleTransactionCompleted(supabaseUrl, serviceRoleKey, event) {
  const data = event.data || {};
  const transactionId = typeof data.id === 'string' ? data.id : '';
  if (!transactionId) return { transactionId: null, outcome: 'ignored_missing_transaction' };

  const order = await findOrderByTransaction(supabaseUrl, serviceRoleKey, transactionId);
  if (!order) return { transactionId, outcome: 'ignored_unknown_order' };

  const planCode = planFromCompletedTransaction(data);
  if (!planCode || planCode !== order.plan_code) return { transactionId, outcome: 'ignored_price_mismatch' };
  if (data.currency_code && data.currency_code !== 'CNY') return { transactionId, outcome: 'ignored_currency_mismatch' };

  const customData = data.custom_data && typeof data.custom_data === 'object' ? data.custom_data : {};
  if (customData.vd_order_id && customData.vd_order_id !== order.id) return { transactionId, outcome: 'ignored_order_metadata_mismatch' };
  if (customData.vd_user_id && customData.vd_user_id !== order.user_id) return { transactionId, outcome: 'ignored_user_metadata_mismatch' };
  if (customData.vd_plan_code && customData.vd_plan_code !== order.plan_code) return { transactionId, outcome: 'ignored_plan_metadata_mismatch' };

  const paidAt = data.billed_at || data.updated_at || event.occurred_at || new Date().toISOString();
  await patchOrder(supabaseUrl, serviceRoleKey, order.id, {
    status: 'paid',
    provider_customer_id: data.customer_id || null,
    paid_at: paidAt,
    provider_error_code: null,
  });

  await callRpc(supabaseUrl, serviceRoleKey, 'billing_apply_paddle_grant', {
    p_user_id: order.user_id,
    p_plan_code: order.plan_code,
    p_order_id: order.id,
    p_granted_at: paidAt,
  });

  return { transactionId, outcome: 'membership_granted' };
}

async function handleAdjustment(supabaseUrl, serviceRoleKey, event) {
  const data = event.data || {};
  const transactionId = typeof data.transaction_id === 'string' ? data.transaction_id : '';
  if (!transactionId) return { transactionId: null, outcome: 'ignored_missing_transaction' };
  if (data.action !== 'refund') return { transactionId, outcome: `ignored_adjustment_${String(data.action || 'unknown')}` };
  if (data.status !== 'approved') return { transactionId, outcome: `refund_${String(data.status || 'unknown')}` };

  const order = await findOrderByTransaction(supabaseUrl, serviceRoleKey, transactionId);
  if (!order) return { transactionId, outcome: 'ignored_unknown_order' };

  const refundedAt = data.updated_at || event.occurred_at || new Date().toISOString();
  if (data.type === 'full') {
    await patchOrder(supabaseUrl, serviceRoleKey, order.id, {
      status: 'refunded',
      refunded_at: refundedAt,
    });
    await callRpc(supabaseUrl, serviceRoleKey, 'billing_revoke_order_grant', {
      p_order_id: order.id,
      p_reason: 'approved_full_refund',
      p_revoked_at: refundedAt,
    });
    return { transactionId, outcome: 'full_refund_membership_revoked' };
  }

  await patchOrder(supabaseUrl, serviceRoleKey, order.id, {
    status: 'partially_refunded',
    refunded_at: refundedAt,
  });
  return { transactionId, outcome: 'partial_refund_recorded' };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: '仅支持 POST。' });

  const webhookSecret = env('PADDLE_WEBHOOK_SECRET');
  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceRoleKey) {
    return send(response, 503, { ok: false, code: 'BILLING_WEBHOOK_NOT_CONFIGURED', error: '支付回调尚未完成服务端配置。' });
  }

  const rawBody = await readRawBody(request);
  const signatureHeader = request.headers['paddle-signature'];
  if (!verifyPaddleSignature(rawBody, signatureHeader, webhookSecret)) {
    return send(response, 401, { ok: false, code: 'INVALID_PADDLE_SIGNATURE', error: 'Paddle 回调签名无效。' });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return send(response, 400, { ok: false, code: 'INVALID_WEBHOOK_JSON', error: 'Paddle 回调不是有效 JSON。' });
  }

  if (!event?.event_id || !event?.event_type) {
    return send(response, 400, { ok: false, code: 'INVALID_WEBHOOK_EVENT', error: 'Paddle 回调缺少事件标识。' });
  }

  try {
    let result = { transactionId: null, outcome: 'ignored_event_type' };
    if (event.event_type === 'transaction.completed') {
      result = await handleTransactionCompleted(supabaseUrl, serviceRoleKey, event);
    } else if (event.event_type === 'adjustment.created' || event.event_type === 'adjustment.updated') {
      result = await handleAdjustment(supabaseUrl, serviceRoleKey, event);
    }

    await recordEvent(supabaseUrl, serviceRoleKey, event, result.transactionId, result.outcome);
    return send(response, 200, { ok: true, outcome: result.outcome });
  } catch (error) {
    console.error('[VD_PADDLE_WEBHOOK_FAILED]', {
      eventId: event.event_id,
      eventType: event.event_type,
      message: error instanceof Error ? error.message : String(error),
    });
    // Non-2xx makes Paddle retry. All grant/revoke operations are idempotent.
    return send(response, 500, { ok: false, code: 'WEBHOOK_PROCESSING_FAILED', error: '支付回调处理失败，将等待 Paddle 重试。' });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
