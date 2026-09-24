import { createLegacyBillingHandler } from '../server/billing/legacy.js';
import { createPaddleClient } from '../server/billing/paddle.js';
import { processProviderEvent } from '../server/billing/processor.js';
import { createBillingRepository } from '../server/billing/repository.js';
import {
  readEnv,
  readRawBody,
  recurringRuntime,
  sendJson,
  sha256,
  supabaseRuntime,
  verifyPaddleSignature,
} from '../server/billing/runtime.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { ok: false, error: '仅支持 POST。' });

  let runtime;
  try {
    runtime = recurringRuntime();
  } catch (error) {
    return sendJson(response, 503, { ok: false, code: 'PADDLE_ENVIRONMENT_INVALID', error: error instanceof Error ? error.message : 'Paddle 环境配置无效。' });
  }
  const storage = supabaseRuntime();
  if (!runtime.webhookSecret || !storage.url || !storage.serviceRoleKey) {
    return sendJson(response, 503, { ok: false, code: 'BILLING_WEBHOOK_NOT_CONFIGURED', error: '支付回调尚未完成服务端配置。' });
  }

  const rawBody = await readRawBody(request);
  if (!verifyPaddleSignature(rawBody, request.headers['paddle-signature'], runtime.webhookSecret)) {
    return sendJson(response, 401, { ok: false, code: 'INVALID_PADDLE_SIGNATURE', error: 'Paddle 回调签名无效。' });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch {
    return sendJson(response, 400, { ok: false, code: 'INVALID_WEBHOOK_JSON', error: 'Paddle 回调不是有效 JSON。' });
  }

  try {
    const repository = createBillingRepository(storage);
    const paddle = createPaddleClient(runtime);
    const legacyHandler = createLegacyBillingHandler(repository, runtime.environment, (name) => readEnv(name));
    const result = await processProviderEvent({
      event,
      checksum: sha256(rawBody),
      runtime,
      repository,
      paddle,
      legacyHandler,
      readEnv: (name) => readEnv(name),
    });
    if (result.error) {
      console.error('[VD_PADDLE_WEBHOOK_FAILED]', {
        eventId: event?.event_id,
        eventType: event?.event_type,
        message: result.error instanceof Error ? result.error.message : String(result.error),
      });
    }
    return sendJson(response, result.status, result.body);
  } catch (error) {
    console.error('[VD_PADDLE_WEBHOOK_SETUP_FAILED]', { message: error instanceof Error ? error.message : String(error) });
    return sendJson(response, 500, { ok: false, code: 'WEBHOOK_PROCESSING_FAILED', error: '支付回调处理失败，将等待 Paddle 重试。' });
  }
}

export const config = { api: { bodyParser: false } };
