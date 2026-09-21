import Dypnsapi20170525, * as $Dypnsapi20170525 from 'npm:@alicloud/dypnsapi20170525@2.0.0';
import * as $OpenApi from 'npm:@alicloud/openapi-core@1.0.0';
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

type SendSmsEvent = { user?: { phone?: unknown }; sms?: { otp?: unknown } };
const jsonHeaders = { 'Content-Type': 'application/json' };

function hookError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: jsonHeaders });
}

function readRequiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('SMS_BRIDGE_CONFIGURATION_MISSING');
  return value;
}

/** PNVS presently supports mainland China only; pass its local number with CountryCode=86. */
export function toAliyunChinaPhone(phone: unknown): string {
  if (typeof phone !== 'string' || !/^\+861[3-9]\d{9}$/.test(phone)) throw new Error('SMS_BRIDGE_PHONE_UNSUPPORTED');
  return phone.slice(3);
}

function readSupabaseOtp(event: SendSmsEvent): string {
  if (typeof event.sms?.otp !== 'string' || !/^\d{6}$/.test(event.sms.otp)) throw new Error('SMS_BRIDGE_OTP_INVALID');
  return event.sms.otp;
}

function providerErrorText(error: unknown): string {
  const providerCode = error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code : '';
  return `${providerCode} ${error instanceof Error ? error.message : ''}`;
}

function responseStatus(error: unknown): number {
  const message = providerErrorText(error);
  if (message === 'SMS_BRIDGE_PHONE_UNSUPPORTED' || message === 'SMS_BRIDGE_OTP_INVALID') return 400;
  if (/frequency|throttl|daily|business.limit/i.test(message)) return 429;
  return 503;
}

function normalizedProviderError(error: unknown): string {
  const message = providerErrorText(error);
  if (/frequency|throttl/i.test(message)) return 'SMS_DELIVERY_RATE_LIMITED';
  if (/daily|business.limit/i.test(message)) return 'SMS_DELIVERY_DAILY_LIMITED';
  if (/timeout|timed out|network/i.test(message)) return 'SMS_DELIVERY_UNAVAILABLE';
  return 'SMS_DELIVERY_FAILED';
}

async function sendWithAliyun(phoneNumber: string, otp: string): Promise<void> {
  const validitySeconds = Number(Deno.env.get('ALIYUN_PNVS_VALIDITY_SECONDS') ?? '300');
  if (!Number.isInteger(validitySeconds) || validitySeconds < 60 || validitySeconds > 1_800) throw new Error('SMS_BRIDGE_CONFIGURATION_MISSING');
  const config = new $OpenApi.Config({
    accessKeyId: readRequiredEnvironment('ALIYUN_ACCESS_KEY_ID'),
    accessKeySecret: readRequiredEnvironment('ALIYUN_ACCESS_KEY_SECRET'),
    endpoint: 'dypnsapi.aliyuncs.com',
  });
  const client = new Dypnsapi20170525(config);
  const request = new $Dypnsapi20170525.SendSmsVerifyCodeRequest({
    countryCode: '86',
    phoneNumber,
    signName: readRequiredEnvironment('ALIYUN_PNVS_SIGN_NAME'),
    templateCode: readRequiredEnvironment('ALIYUN_PNVS_TEMPLATE_CODE'),
    templateParam: JSON.stringify({
      [readRequiredEnvironment('ALIYUN_PNVS_CODE_VARIABLE')]: otp,
      [readRequiredEnvironment('ALIYUN_PNVS_VALIDITY_VARIABLE')]: String(Math.ceil(validitySeconds / 60)),
    }),
    validTime: validitySeconds,
    interval: 60,
    duplicatePolicy: 1,
    returnVerifyCode: false,
  });
  const response = await client.sendSmsVerifyCode(request);
  if (response.body?.code !== 'OK') {
    const providerError = new Error('SMS_BRIDGE_PROVIDER_REJECTED');
    Object.assign(providerError, { code: response.body?.code });
    throw providerError;
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
