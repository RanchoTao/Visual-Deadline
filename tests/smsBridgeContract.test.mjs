import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../supabase/functions/send-sms-aliyun/index.ts', import.meta.url), 'utf8');

test('Aliyun Send SMS bridge verifies a signed hook and normalizes Supabase China phone formats', () => {
  assert.match(source, /new Webhook\(hookSecret\)\.verify\(payload, Object\.fromEntries\(request\.headers\)\)/);
  assert.match(source, /SMS_HOOK_UNAUTHORIZED/);
  assert.match(source, /\^\\\+861\[3-9\]\\d\{9\}\$/);
  assert.match(source, /\^861\[3-9\]\\d\{9\}\$/);
  assert.match(source, /return normalized\.slice\(3\)/);
  assert.match(source, /return normalized\.slice\(2\)/);
});

test('Aliyun bridge uses Supabase OTP as transport data and never delegates verification', () => {
  assert.match(source, /\[codeVariable\]: otp/);
  assert.match(source, /\[validityVariable\]/);
  assert.match(source, /returnVerifyCode: false/);
  assert.doesNotMatch(source, /checkSmsVerifyCode/i);
  assert.match(source, /SMS_DELIVERY_(RATE_LIMITED|DAILY_LIMITED|UNAVAILABLE|FAILED)/);
});

test('Aliyun bridge uses the verified Deno-compatible SDK resolver without truncating traversal', () => {
  assert.match(source, /import \* as DypnsapiModule from 'npm:@alicloud\/dypnsapi20170525@2\.0\.0'/);
  assert.match(source, /import \{ Config as OpenApiConfig \} from 'npm:@alicloud\/openapi-client'/);
  assert.match(source, /sendSmsVerifyCodeWithOptions/);
  assert.match(source, /findNamedConstructor\(DypnsapiModule, 'Client'\)/);
  assert.match(source, /Object\.keys\(value as Record<string, unknown>\)/);
  assert.doesNotMatch(source, /Object\.keys\([^)]*\)\.slice\(0, 40\)/);
  assert.doesNotMatch(source, /SMS_HOOK_PAYLOAD_SHAPE/);
  assert.match(source, /ALIYUN_SMS_ERROR/);
});
