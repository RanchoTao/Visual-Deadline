import { createPaddleClient } from '../server/billing/paddle.js';
import { createBillingRepository } from '../server/billing/repository.js';
import { authenticateUser, recurringRuntime, sendJson, supabaseRuntime } from '../server/billing/runtime.js';

export function selectPortalUrl(session, subscriptionId, action) {
  if (action === 'overview') return session?.data?.urls?.general?.overview || null;
  const links = session?.data?.urls?.subscriptions?.find((entry) => entry.id === subscriptionId);
  if (action === 'update_payment') return links?.update_subscription_payment_method || null;
  if (action === 'cancel') return links?.cancel_subscription || null;
  return null;
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: '仅支持 POST。' });
  const storage = supabaseRuntime();
  const user = await authenticateUser(request, storage).catch(() => null);
  if (!user?.id) return sendJson(response, 401, { ok: false, code: 'AUTH_REQUIRED', error: '请先登录。' });

  let runtime;
  try { runtime = recurringRuntime(); } catch (error) {
    return sendJson(response, 503, { ok: false, code: 'PADDLE_ENVIRONMENT_INVALID', error: error instanceof Error ? error.message : 'Paddle 环境配置无效。' });
  }
  if (!runtime.isolation.valid || !runtime.apiKey || !storage.serviceRoleKey) {
    return sendJson(response, 503, { ok: false, code: 'BILLING_PORTAL_NOT_CONFIGURED', error: '订阅管理尚未完成服务端配置。' });
  }

  const action = typeof request.body?.action === 'string' ? request.body.action : 'overview';
  if (!['overview', 'update_payment', 'cancel'].includes(action)) {
    return sendJson(response, 400, { ok: false, code: 'INVALID_PORTAL_ACTION', error: '订阅管理操作无效。' });
  }

  try {
    const repository = createBillingRepository(storage);
    const subscriptions = await repository.listUserSubscriptions(user.id, runtime.environment);
    const requestedId = typeof request.body?.subscriptionId === 'string' ? request.body.subscriptionId : null;
    const subscription = requestedId
      ? subscriptions.find((row) => row.id === requestedId)
      : subscriptions.find((row) => !['canceled', 'expired'].includes(row.status)) || subscriptions[0];
    if (!subscription) return sendJson(response, 404, { ok: false, code: 'SUBSCRIPTION_NOT_FOUND', error: '没有可管理的订阅。' });

    const paddle = createPaddleClient(runtime);
    const portal = await paddle.createPortalSession(subscription.provider_customer_id, [subscription.provider_subscription_id]);
    const url = selectPortalUrl(portal, subscription.provider_subscription_id, action);
    if (!url) throw new Error('Paddle did not return the requested portal link.');
    return sendJson(response, 200, { ok: true, url });
  } catch (error) {
    console.error('[VD_BILLING_PORTAL_FAILED]', { userId: user.id, message: error instanceof Error ? error.message : String(error) });
    return sendJson(response, 502, { ok: false, code: 'BILLING_PORTAL_FAILED', error: '暂时无法打开订阅管理，请稍后重试。' });
  }
}
