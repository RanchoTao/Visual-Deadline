import { createPaddleClient } from '../server/billing/paddle.js';
import { createBillingRepository } from '../server/billing/repository.js';
import { authenticateUser, createCheckoutRecoveryBinding, readEnv, recurringRuntime, sendJson, supabaseRuntime } from '../server/billing/runtime.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: '仅支持 POST。' });
  const storage = supabaseRuntime();
  if (!storage.url || !storage.anonKey || !storage.serviceRoleKey) {
    return sendJson(response, 503, { ok: false, code: 'BILLING_STORAGE_NOT_CONFIGURED', error: '订阅数据库尚未完成服务端配置。' });
  }

  let runtime;
  try { runtime = recurringRuntime(); } catch (error) {
    return sendJson(response, 503, { ok: false, code: 'PADDLE_ENVIRONMENT_INVALID', error: error instanceof Error ? error.message : 'Paddle 环境配置无效。' });
  }
  if (!runtime.checkoutEnabled) {
    return sendJson(response, 503, { ok: false, code: 'RECURRING_CHECKOUT_DISABLED', error: '自动续费订阅仍在受控发布中。' });
  }
  if (!runtime.isolation.valid || !runtime.apiKey) {
    return sendJson(response, 503, { ok: false, code: 'RECURRING_CATALOG_NOT_CONFIGURED', error: runtime.isolation.reason || '订阅目录或环境隔离配置不完整。' });
  }

  const user = await authenticateUser(request, storage).catch(() => null);
  if (!user?.id) return sendJson(response, 401, { ok: false, code: 'AUTH_REQUIRED', error: '请先登录 VD 后再订阅。' });
  const planCode = typeof request.body?.planCode === 'string' ? request.body.planCode : '';
  const catalog = runtime.catalog(planCode);
  if (!catalog) return sendJson(response, 400, { ok: false, code: 'INVALID_RECURRING_PLAN', error: '订阅方案无效或未配置。' });

  try {
    const paddle = createPaddleClient(runtime);
    const checkoutUrl = readEnv('PADDLE_CHECKOUT_URL');
    const recoveryBinding = createCheckoutRecoveryBinding({
      environment: runtime.environment,
      userId: user.id,
      planCode: catalog.planCode,
      catalogVersion: catalog.catalogVersion,
    }, runtime.webhookSecret);
    const provider = await paddle.createTransaction({
      items: [{ price_id: catalog.priceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: recoveryBinding,
      ...(checkoutUrl ? { checkout: { url: checkoutUrl } } : {}),
    });
    const transactionId = provider?.data?.id;
    if (typeof transactionId !== 'string' || !transactionId.startsWith('txn_')) throw new Error('Paddle 没有返回有效 transaction id。');

    const repository = createBillingRepository(storage);
    const rows = await repository.createCheckoutPayment({
      user_id: user.id,
      subscription_id: null,
      provider: 'paddle',
      provider_environment: runtime.environment,
      provider_transaction_id: transactionId,
      kind: 'subscription',
      status: 'pending',
      currency: catalog.currency,
      subtotal_minor: 0,
      tax_minor: 0,
      total_minor: 0,
      occurred_at: new Date().toISOString(),
    });
    const paymentReferenceId = Array.isArray(rows) ? rows[0]?.id : null;
    return sendJson(response, 201, {
      ok: true,
      transactionId,
      paymentReferenceId,
      planCode: catalog.planCode,
      catalogVersion: catalog.catalogVersion,
      providerEnvironment: runtime.environment,
    });
  } catch (error) {
    console.error('[VD_RECURRING_CHECKOUT_FAILED]', { message: error instanceof Error ? error.message : String(error) });
    return sendJson(response, 502, { ok: false, code: 'RECURRING_CHECKOUT_FAILED', error: '暂时无法创建自动续费订阅，请稍后重试。' });
  }
}
