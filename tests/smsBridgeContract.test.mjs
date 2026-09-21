import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../supabase/functions/send-sms-aliyun/index.ts', import.meta.url), 'utf8');

test('Aliyun Send SMS bridge verifies a signed hook before mapping only +86 numbers', () => {
  assert.match(source, /new Webhook\(hookSecret\)\.verify\(payload, Object\.fromEntries\(request\.headers\)\)/);
  assert.match(source, /SMS_HOOK_UNAUTHORIZED/);
  assert.match(source, /\^\\\+861\[3-9\]\\d\{9\}\$/);
  assert.match(source, /return phone\.slice\(3\)/);
});

test('Aliyun bridge passes the Supabase OTP only as configured template variables and never delegates verification', () => {
  assert.match(source, /\[readRequiredEnvironment\('ALIYUN_PNVS_CODE_VARIABLE'\)\]: otp/);
  assert.match(source, /ALIYUN_PNVS_VALIDITY_VARIABLE/);
  assert.match(source, /returnVerifyCode: false/);
  assert.doesNotMatch(source, /checkSmsVerifyCode/i);
  assert.doesNotMatch(source, /console\.(log|error|warn)/);
  assert.match(source, /SMS_DELIVERY_(RATE_LIMITED|DAILY_LIMITED|UNAVAILABLE|FAILED)/);
});
