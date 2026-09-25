import { normalizeSubscriptionSnapshot } from '../server/billing/domain.js';
import { createLegacyBillingHandler } from '../server/billing/legacy.js';
import { createPaddleClient } from '../server/billing/paddle.js';
import { processProviderEvent } from '../server/billing/processor.js';
import { createBillingRepository } from '../server/billing/repository.js';
import { readEnv, recurringRuntime, sendJson, sha256, supabaseRuntime } from '../server/billing/runtime.js';

export default async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) return sendJson(response, 405, { ok: false, error: '仅支持 GET 或 POST。' });
  const cronSecret = readEnv('CRON_SECRET');
  if (!cronSecret || request.headers.authorization !== `Bearer ${cronSecret}`) {
    return sendJson(response, 401, { ok: false, code: 'RECONCILIATION_UNAUTHORIZED', error: '未授权。' });
  }

  let runtime;
  try { runtime = recurringRuntime(); } catch (error) {
    return sendJson(response, 503, { ok: false, code: 'PADDLE_ENVIRONMENT_INVALID', error: error instanceof Error ? error.message : 'Paddle 环境配置无效。' });
  }
  if (!runtime.processingEnabled || !runtime.reconciliationEnabled) {
    return sendJson(response, 503, { ok: false, code: 'RECONCILIATION_DISABLED', error: '订阅对账尚未启用。' });
  }
  if (!runtime.isolation.valid) {
    return sendJson(response, 503, { ok: false, code: 'RECURRING_ENVIRONMENT_MISMATCH', error: runtime.isolation.reason || '订阅目录或环境隔离配置不完整。' });
  }

  const storage = supabaseRuntime();
  try {
    const repository = createBillingRepository(storage);
    const paddle = createPaddleClient(runtime);
    const legacyHandler = createLegacyBillingHandler(repository, runtime.environment, (name) => readEnv(name));
    const localSubscriptions = await repository.listReconcilable(runtime.environment);
    const counts = { repaired: 0, unchanged: 0, failed: 0 };
    const failures = [];

    for (const local of localSubscriptions) {
      try {
        const provider = await paddle.getSubscription(local.provider_subscription_id);
        const occurredAt = provider?.data?.updated_at || new Date().toISOString();
        const event = {
          event_id: `reconcile_${sha256(`${runtime.environment}:${local.provider_subscription_id}:${occurredAt}`).slice(0, 48)}`,
          event_type: 'subscription.updated',
          occurred_at: occurredAt,
          notification_id: 'vd_reconciliation',
          data: provider?.data,
        };
        const normalized = normalizeSubscriptionSnapshot(provider?.data, runtime.environment, (name) => readEnv(name), event);
        if (!normalized) throw new Error('Provider subscription does not match the trusted VD catalog.');
        const unchanged = local.provider_updated_at === normalized.providerUpdatedAt
          && local.status === normalized.status
          && local.current_period_end === normalized.currentPeriodEnd
          && local.plan_code === normalized.planCode;
        if (unchanged) {
          await repository.rebuildEntitlements(local.user_id);
          counts.unchanged += 1;
          continue;
        }
        const raw = JSON.stringify(event);
        const result = await processProviderEvent({
          event,
          eventSource: 'reconciliation',
          checksum: sha256(raw),
          runtime,
          repository,
          paddle,
          legacyHandler,
          readEnv: (name) => readEnv(name),
        });
        if (result.status >= 200 && result.status < 300) counts.repaired += 1;
        else throw result.error || new Error(result.body?.code || 'Reconciliation event failed.');
      } catch (error) {
        counts.failed += 1;
        failures.push({ subscriptionId: local.id, error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240) });
      }
    }

    return sendJson(response, counts.failed ? 207 : 200, { ok: counts.failed === 0, ...counts, failures });
  } catch (error) {
    console.error('[VD_BILLING_RECONCILIATION_FAILED]', { message: error instanceof Error ? error.message : String(error) });
    return sendJson(response, 500, { ok: false, code: 'RECONCILIATION_FAILED', repaired: 0, unchanged: 0, failed: 1 });
  }
}
