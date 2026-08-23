import crypto from 'node:crypto';

const PLAN_CATALOG = {
  vd_monthly: { amountMinor: 1900, currency: 'CNY', priceEnv: 'PADDLE_PRICE_MONTHLY' },
  vd_yearly: { amountMinor: 19900, currency: 'CNY', priceEnv: 'PADDLE_PRICE_YEARLY' },
};

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

function paddleBaseUrl() {
  return env('PADDLE_ENVIRONMENT').toLowerCase() === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
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
    const detail = body?.error?.detail || body?.error?.code || body?.message || `HTTP ${result.status}`;
    const error = new Error(String(detail));
    error.status = result.status;
    error.code = body?.error?.code;
    throw error;
  }
  return body;
}

async function getUser(supabaseUrl, anonKey, token) {
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!result.ok) return null;
  return result.json();
}

async function serviceRest(supabaseUrl, serviceRoleKey, path, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', serviceRoleKey);
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');
  return parseResponse(await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers }));
}

async function updateOrder(supabaseUrl, serviceRoleKey, orderId, patch) {
  return serviceRest(supabaseUrl, serviceRoleKey, `billing_orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return send(response, 405, { ok: false, error: '仅支持 POST。' });

  const supabaseUrl = env('SUPABASE_URL', 'VITE_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = env('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  const paddleApiKey = env('PADDLE_API_KEY');
  const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return send(response, 503, { ok: false, code: 'BILLING_STORAGE_NOT_CONFIGURED', error: '支付数据库尚未完成服务端配置。' });
  }
  if (!paddleApiKey) {
    return send(response, 503, { ok: false, code: 'PADDLE_NOT_CONFIGURED', error: 'Paddle 尚未完成服务端配置。' });
  }

  const user = token ? await getUser(supabaseUrl, anonKey, token).catch(() => null) : null;
  if (!user?.id) return send(response, 401, { ok: false, code: 'AUTH_REQUIRED', error: '请先登录 VD 后再开通会员。' });

  const planCode = typeof request.body?.planCode === 'string' ? request.body.planCode : '';
  const plan = PLAN_CATALOG[planCode];
  if (!plan) return send(response, 400, { ok: false, code: 'INVALID_PLAN', error: '会员方案无效。' });

  const priceId = env(plan.priceEnv);
  if (!priceId) {
    return send(response, 503, { ok: false, code: 'PADDLE_PRICE_NOT_CONFIGURED', error: '该会员方案尚未完成 Paddle 价格配置。' });
  }

  const orderId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  try {
    await serviceRest(supabaseUrl, serviceRoleKey, 'billing_orders', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify([{
        id: orderId,
        user_id: user.id,
        provider: 'paddle',
        plan_code: planCode,
        amount_minor: plan.amountMinor,
        currency: plan.currency,
        status: 'pending',
        checkout_created_at: createdAt,
      }]),
    });
  } catch (error) {
    console.error('[VD_BILLING_ORDER_CREATE_FAILED]', { message: error instanceof Error ? error.message : String(error) });
    return send(response, 503, { ok: false, code: 'BILLING_ORDER_CREATE_FAILED', error: '暂时无法建立支付订单，请稍后重试。' });
  }

  try {
    const checkoutUrl = env('PADDLE_CHECKOUT_URL');
    const payload = {
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: {
        vd_user_id: user.id,
        vd_order_id: orderId,
        vd_plan_code: planCode,
      },
      checkout: { url: checkoutUrl || null },
    };

    const paddleResult = await parseResponse(await fetch(`${paddleBaseUrl()}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        'Paddle-Version': '1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }));

    const transactionId = paddleResult?.data?.id;
    if (typeof transactionId !== 'string' || !transactionId.startsWith('txn_')) {
      throw new Error('Paddle 没有返回有效 transaction id。');
    }

    await updateOrder(supabaseUrl, serviceRoleKey, orderId, {
      provider_transaction_id: transactionId,
      provider_error_code: null,
    });

    return send(response, 201, {
      ok: true,
      orderId,
      transactionId,
      planCode,
      amountMinor: plan.amountMinor,
      currency: plan.currency,
    });
  } catch (error) {
    const providerErrorCode = typeof error?.code === 'string' ? error.code.slice(0, 120) : 'paddle_transaction_create_failed';
    await updateOrder(supabaseUrl, serviceRoleKey, orderId, {
      status: 'failed',
      provider_error_code: providerErrorCode,
    }).catch(() => undefined);

    console.error('[VD_PADDLE_TRANSACTION_CREATE_FAILED]', {
      code: providerErrorCode,
      message: error instanceof Error ? error.message : String(error),
    });
    return send(response, 502, { ok: false, code: 'PADDLE_TRANSACTION_CREATE_FAILED', error: 'Paddle 暂时无法创建支付，请稍后重试。' });
  }
}
