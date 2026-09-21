import * as DypnsapiModule from 'npm:@alicloud/dypnsapi20170525@2.0.0';
import { Config as OpenApiConfig } from 'npm:@alicloud/openapi-client';
import * as Util from 'npm:@alicloud/tea-util';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type SendSmsEvent = { user?: { phone?: unknown }; sms?: { otp?: unknown } };
type AnyCtor = new (...args: any[]) => any;
const jsonHeaders = { 'Content-Type': 'application/json' };

function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: jsonHeaders });
}

function readRequiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('SMS_BRIDGE_CONFIGURATION_MISSING');
  return value;
}

export function toAliyunChinaPhone(phone: unknown): string {
  if (typeof phone !== 'string') throw new Error('SMS_BRIDGE_PHONE_UNSUPPORTED');
  const normalized = phone.trim();
  if (/^\+861[3-9]\d{9}$/.test(normalized)) return normalized.slice(3);
  if (/^861[3-9]\d{9}$/.test(normalized)) return normalized.slice(2);
  throw new Error('SMS_BRIDGE_PHONE_UNSUPPORTED');
}

function readSupabaseOtp(event: SendSmsEvent): string {
  if (typeof event.sms?.otp !== 'string' || !/^\d{6}$/.test(event.sms.otp)) throw new Error('SMS_BRIDGE_OTP_INVALID');
  return event.sms.otp;
}

function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value
    .replace(/\+?861[3-9]\d{9}/g, '[redacted-phone]')
    .replace(/\b1[3-9]\d{9}\b/g, '[redacted-phone]')
    .replace(/\b\d{6}\b/g, '[redacted-otp]')
    .replace(/LTAI[A-Za-z0-9]+/g, '[redacted-access-key]')
    .slice(0, 500);
}

function recordField(error: unknown, field: string): unknown {
  return error && typeof error === 'object' ? (error as Record<string, unknown>)[field] : undefined;
}

function nestedRecordField(error: unknown, outer: string, inner: string): unknown {
  const outerValue = recordField(error, outer);
  return outerValue && typeof outerValue === 'object' ? (outerValue as Record<string, unknown>)[inner] : undefined;
}

function providerCode(error: unknown): string {
  const value = recordField(error, 'code') ?? nestedRecordField(error, 'data', 'Code') ?? nestedRecordField(error, 'data', 'code');
  return typeof value === 'string' ? value : '';
}

function providerMessage(error: unknown): string {
  const value = (error instanceof Error ? error.message : undefined) ?? nestedRecordField(error, 'data', 'Message') ?? nestedRecordField(error, 'data', 'message');
  return typeof value === 'string' ? value : '';
}

function providerRequestId(error: unknown): string {
  const value = recordField(error, 'requestId') ?? recordField(error, 'requestID') ?? nestedRecordField(error, 'data', 'RequestId') ?? nestedRecordField(error, 'data', 'requestId');
  return typeof value === 'string' ? value : '';
}

function providerErrorText(error: unknown): string {
  return `${providerCode(error)} ${providerMessage(error)}`;
}

function responseStatus(error: unknown): number {
  const message = providerErrorText(error);
  if (message.includes('SMS_BRIDGE_PHONE_UNSUPPORTED') || message.includes('SMS_BRIDGE_OTP_INVALID')) return 400;
  if (/frequency|throttl|business.limit|daily/i.test(message)) return 429;
  return 503;
}

function normalizedProviderError(error: unknown): string {
  const message = providerErrorText(error);
  if (/frequency|throttl/i.test(message)) return 'SMS_DELIVERY_RATE_LIMITED';
  if (/daily|business.limit/i.test(message)) return 'SMS_DELIVERY_DAILY_LIMITED';
  if (/timeout|timed out|network/i.test(message)) return 'SMS_DELIVERY_UNAVAILABLE';
  return 'SMS_DELIVERY_FAILED';
}

function traversalKeys(value: unknown): string[] {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') return [];
  try { return Object.keys(value as Record<string, unknown>); } catch { return []; }
}

function diagnosticKeys(value: unknown): string[] {
  return traversalKeys(value).slice(0, 40);
}

function findConstructorWithMethod(root: unknown, methodName: string, maxDepth = 4): AnyCtor | undefined {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift()!;
    const value = current.value;
    if (seen.has(value)) continue;
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') seen.add(value);

    if (typeof value === 'function') {
      const proto = (value as { prototype?: Record<string, unknown> }).prototype;
      if (proto && typeof proto[methodName] === 'function') return value as AnyCtor;
    }

    if (current.depth >= maxDepth) continue;
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') continue;

    for (const key of traversalKeys(value)) {
      try {
        const child = (value as Record<string, unknown>)[key];
        queue.push({ value: child, depth: current.depth + 1 });
      } catch {
        // Ignore accessor failures while inspecting the module namespace.
      }
    }
  }
  return undefined;
}

function findNamedConstructor(root: unknown, targetName: string, maxDepth = 4): AnyCtor | undefined {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  const seen = new Set<unknown>();
  while (queue.length) {
    const current = queue.shift()!;
    const value = current.value;
    if (seen.has(value)) continue;
    if ((typeof value === 'object' && value !== null) || typeof value === 'function') seen.add(value);

    if (typeof value === 'function' && value.name === targetName) return value as AnyCtor;
    if (current.depth >= maxDepth) continue;
    if ((typeof value !== 'object' || value === null) && typeof value !== 'function') continue;

    for (const key of traversalKeys(value)) {
      try {
        const child = (value as Record<string, unknown>)[key];
        if (key === targetName && typeof child === 'function') return child as AnyCtor;
        queue.push({ value: child, depth: current.depth + 1 });
      } catch {
        // Ignore accessor failures while inspecting the module namespace.
      }
    }
  }
  return undefined;
}

function logSdkShape(): void {
  const top = diagnosticKeys(DypnsapiModule);
  let defaultKeys: string[] = [];
  try { defaultKeys = diagnosticKeys((DypnsapiModule as unknown as Record<string, unknown>).default); } catch { /* noop */ }
  console.error('ALIYUN_SDK_SHAPE', {
    topLevelKeys: top,
    topLevelKeyCount: traversalKeys(DypnsapiModule).length,
    defaultKeys,
    defaultKeyCount: (() => {
      try { return traversalKeys((DypnsapiModule as unknown as Record<string, unknown>).default).length; } catch { return 0; }
    })(),
  });
}

function logAliyunDiagnostic(stage: string, error: unknown): void {
  console.error('ALIYUN_SMS_ERROR', {
    stage,
    code: sanitizeDiagnosticText(providerCode(error)),
    message: sanitizeDiagnosticText(providerMessage(error)),
    requestId: sanitizeDiagnosticText(providerRequestId(error)),
    name: sanitizeDiagnosticText(error instanceof Error ? error.name : undefined),
    env: {
      accessKeyId: Boolean(Deno.env.get('ALIYUN_ACCESS_KEY_ID')),
      accessKeySecret: Boolean(Deno.env.get('ALIYUN_ACCESS_KEY_SECRET')),
      signName: Boolean(Deno.env.get('ALIYUN_PNVS_SIGN_NAME')),
      templateCode: Boolean(Deno.env.get('ALIYUN_PNVS_TEMPLATE_CODE')),
      codeVariable: Boolean(Deno.env.get('ALIYUN_PNVS_CODE_VARIABLE')),
      validityVariable: Boolean(Deno.env.get('ALIYUN_PNVS_VALIDITY_VARIABLE')),
      validitySeconds: Boolean(Deno.env.get('ALIYUN_PNVS_VALIDITY_SECONDS')),
    },
  });
}

async function sendWithAliyun(phoneNumber: string, otp: string): Promise<void> {
  let stage = 'config-load';
  try {
    const validitySeconds = Number(Deno.env.get('ALIYUN_PNVS_VALIDITY_SECONDS') ?? '300');
    if (!Number.isInteger(validitySeconds) || validitySeconds < 60 || validitySeconds > 1_800) throw new Error('SMS_BRIDGE_CONFIGURATION_MISSING');

    const accessKeyId = readRequiredEnvironment('ALIYUN_ACCESS_KEY_ID');
    const accessKeySecret = readRequiredEnvironment('ALIYUN_ACCESS_KEY_SECRET');
    const signName = readRequiredEnvironment('ALIYUN_PNVS_SIGN_NAME');
    const templateCode = readRequiredEnvironment('ALIYUN_PNVS_TEMPLATE_CODE');
    const codeVariable = readRequiredEnvironment('ALIYUN_PNVS_CODE_VARIABLE');
    const validityVariable = readRequiredEnvironment('ALIYUN_PNVS_VALIDITY_VARIABLE');

    stage = 'client-resolve';
    const ClientCtor =
      findNamedConstructor(DypnsapiModule, 'Client') ??
      findConstructorWithMethod(DypnsapiModule, 'sendSmsVerifyCodeWithOptions');
    if (!ClientCtor) {
      logSdkShape();
      throw new Error('SMS_BRIDGE_SDK_CLIENT_CONSTRUCTOR_MISSING');
    }

    stage = 'client-create';
    const config = new OpenApiConfig({
      accessKeyId,
      accessKeySecret,
      regionId: 'ap-southeast-1',
      endpoint: 'dypnsapi.aliyuncs.com',
      protocol: 'https',
    });
    const client = new ClientCtor(config);

    stage = 'request-resolve';
    const RequestCtor = findNamedConstructor(DypnsapiModule, 'SendSmsVerifyCodeRequest');
    if (!RequestCtor) {
      logSdkShape();
      throw new Error('SMS_BRIDGE_SDK_REQUEST_CONSTRUCTOR_MISSING');
    }

    stage = 'request-create';
    const request = new RequestCtor({
      countryCode: '86',
      phoneNumber,
      signName,
      templateCode,
      templateParam: JSON.stringify({
        [codeVariable]: otp,
        [validityVariable]: String(Math.ceil(validitySeconds / 60)),
      }),
      validTime: validitySeconds,
      interval: 60,
      duplicatePolicy: 1,
      returnVerifyCode: false,
    });
    const runtime = new Util.RuntimeOptions({});

    stage = 'aliyun-request';
    const response = await client.sendSmsVerifyCodeWithOptions(request, runtime);

    stage = 'provider-response';
    const body = response.body;
    if (response.statusCode !== 200 || body?.success !== true || body?.code !== 'OK') {
      console.error('ALIYUN_SMS_ERROR', {
        stage,
        code: sanitizeDiagnosticText(body?.code),
        message: sanitizeDiagnosticText(body?.message),
        requestId: sanitizeDiagnosticText(body?.requestId),
        success: body?.success,
        statusCode: response.statusCode,
      });
      const providerError = new Error('SMS_BRIDGE_PROVIDER_REJECTED');
      Object.assign(providerError, {
        code: body?.code,
        requestId: body?.requestId,
        data: { Message: body?.message, Code: body?.code, RequestId: body?.requestId },
      });
      throw providerError;
    }
  } catch (error) {
    if (!(error instanceof Error && error.message === 'SMS_BRIDGE_PROVIDER_REJECTED')) logAliyunDiagnostic(stage, error);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return hookError(405, 'SMS_HOOK_METHOD_NOT_ALLOWED');

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET')?.replace('v1,whsec_', '');
  if (!hookSecret) return hookError(500, 'SMS_BRIDGE_CONFIGURATION_MISSING');

  let event: SendSmsEvent;
  try {
    const payload = await request.text();
    event = new Webhook(hookSecret).verify(payload, Object.fromEntries(request.headers)) as SendSmsEvent;
  } catch {
    return hookError(401, 'SMS_HOOK_UNAUTHORIZED');
  }


  try {
    await sendWithAliyun(toAliyunChinaPhone(event.user?.phone), readSupabaseOtp(event));
    return new Response(JSON.stringify({}), { status: 200, headers: jsonHeaders });
  } catch (error) {
    return hookError(responseStatus(error), normalizedProviderError(error));
  }
});
