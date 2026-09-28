import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertAccountMayOperate, assertAdminRole, assertInviteAvailable, normalizeEmail, validateBetaApplication, validateInviteCode } from '../server/platform/domain.js';

test('beta application requires consent and normalizes only the submitted fields', () => {
  const application = validateBetaApplication({ email: ' PERSON@Example.test ', name: ' 小明 ', role: '学生', useCase: '管理论文与截止日期', acceptedPolicies: true });
  assert.equal(application.email, 'person@example.test'); assert.equal(application.name, '小明'); assert.equal(application.use_case, '管理论文与截止日期');
  assert.throws(() => validateBetaApplication({ email: 'person@example.test', name: '小明', role: '学生', useCase: '测试', acceptedPolicies: false }), /APPLICATION_INVALID/);
});
test('invite validation distinguishes malformed, expired, disabled, and exhausted codes', () => {
  assert.equal(validateInviteCode(' vd-ab12cd '), 'VD-AB12CD'); assert.throws(() => validateInviteCode('bad!'), /INVITE_INVALID/);
  assert.throws(() => assertInviteAvailable(undefined), /INVITE_INVALID/); assert.throws(() => assertInviteAvailable({ enabled: false, expires_at: null, used_count: 0, max_uses: 1 }), /INVITE_DISABLED/);
  assert.throws(() => assertInviteAvailable({ enabled: true, expires_at: '2020-01-01T00:00:00Z', used_count: 0, max_uses: 1 }), /INVITE_EXPIRED/); assert.throws(() => assertInviteAvailable({ enabled: true, expires_at: null, used_count: 1, max_uses: 1 }), /INVITE_EXHAUSTED/);
});
test('account controls and admin roles fail closed for product operations', () => {
  assert.doesNotThrow(() => assertAccountMayOperate(undefined)); assert.throws(() => assertAccountMayOperate({ status: 'banned' }), /ACCOUNT_BLOCKED/); assert.throws(() => assertAdminRole('support'), /ADMIN_REQUIRED/); assert.doesNotThrow(() => assertAdminRole('admin'));
});
test('closed-beta routes and server-only registration preserve invite redemption authority', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'); const auth = readFileSync(new URL('../src/components/AuthPanel.tsx', import.meta.url), 'utf8'); const hook = readFileSync(new URL('../src/hooks/useSupabaseAuth.ts', import.meta.url), 'utf8'); const registration = readFileSync(new URL('../api/beta-register.js', import.meta.url), 'utf8');
  assert.match(app, /path === '\/beta\/apply'/); assert.match(auth, /邀请码/); assert.match(hook, /fetch\('\/api\/beta-register'/); assert.match(registration, /redeemInvite/); assert.match(registration, /deleteAuthUser/);
});
test('AI server path consumes database quota before DeepSeek and never exposes its secret to browser source', () => {
  const api = readFileSync(new URL('../api/ai.js', import.meta.url), 'utf8'); const migration = readFileSync(new URL('../supabase/migrations/20260927174808_closed_beta_platform.sql', import.meta.url), 'utf8'); const browserFiles = ['src/App.tsx', 'src/services/aiClient.ts', 'src/components/BetaApplyPage.tsx'].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
  assert.match(api, /consumeAIQuota/); assert.match(api, /本周期 AI 使用额度已用完/); assert.match(migration, /pg_advisory_xact_lock\(hashtext\('ai-quota:'/); assert.doesNotMatch(browserFiles, /DEEPSEEK_API_KEY/);
});
test('admin grants remain an independent entitlement source and operational tables are server-only', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260927174808_closed_beta_platform.sql', import.meta.url), 'utf8'); const admin = readFileSync(new URL('../server/platform/admin.js', import.meta.url), 'utf8');
  assert.match(admin, /source_type: 'admin_grant'/); assert.match(admin, /grantEntitlement/); assert.match(admin, /revokeEntitlement/); assert.match(migration, /revoke all on table public.%I from public, anon, authenticated/);
});
