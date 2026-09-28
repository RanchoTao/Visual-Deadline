import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertAccountMayOperate, assertAdminRole, assertInviteAvailable, normalizeEmail, validateBetaApplication, validateInviteCode } from '../server/platform/domain.js';
import aiHandler from '../api/ai.js';
import { createInvite, grantEntitlement, makeInviteCode, revokeEntitlement } from '../server/platform/admin.js';
import { findActiveAccountControl } from '../server/platform/repository.js';
import { registerInvitedUser } from '../server/platform/registration.js';
import { verifyTurnstile } from '../server/platform/runtime.js';

function fakeRuntime(t, fetchImpl, overrides = {}) {
  const values = { SUPABASE_URL: 'https://storage.example.test', SUPABASE_ANON_KEY: 'test-anon', SUPABASE_SERVICE_ROLE_KEY: 'test-service', DEEPSEEK_API_KEY: 'test-provider', NODE_ENV: 'test', VERCEL_ENV: 'development', ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, values); globalThis.fetch = fetchImpl;
  t.after(() => { globalThis.fetch = previousFetch; for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const mockResponse = () => ({ headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } });
const aiRequest = (id, user = 'fixture') => ({ method: 'POST', headers: { authorization: `Bearer ${user}`, 'x-request-id': id }, body: { mode: 'task_advice', message: '分析任务' } });

for (const status of ['succeeded', 'processing', 'rejected', 'failed']) test(`AI replay after ${status} never calls provider or rewrites ledger`, async (t) => {
  let providerCalls = 0; let ledgerWrites = 0;
  fakeRuntime(t, async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return jsonResponse({ id: `replay-${status}` });
    if (path === '/rest/v1/invite_redemptions') return jsonResponse([{ id: 'admitted' }]);
    if (path === '/rest/v1/account_controls') return jsonResponse([]);
    if (path === '/rest/v1/rpc/consume_ai_quota') return jsonResponse({ message: 'AI_REQUEST_REPLAY' }, 400);
    if (path.includes('ai_usage_events') && init.method === 'PATCH') ledgerWrites++;
    if (path === '/chat/completions') providerCalls++;
    throw new Error(`Unexpected request ${path}`);
  });
  const response = mockResponse();
  await aiHandler(aiRequest('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), response);
  assert.equal(response.code, 409); assert.match(response.body.error, /请勿重复/);
  assert.equal(providerCalls, 0); assert.equal(ledgerWrites, 0);
});

test('fresh quota calls provider once; replay and concurrent duplicate cannot call it again', async (t) => {
  let ledgerStatus; let providerCalls = 0;
  fakeRuntime(t, async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return jsonResponse({ id: 'fresh-test' });
    if (path === '/rest/v1/invite_redemptions') return jsonResponse([{ id: 'admitted' }]);
    if (path === '/rest/v1/account_controls') return jsonResponse([]);
    if (path === '/rest/v1/rpc/consume_ai_quota') { if (ledgerStatus) return jsonResponse({ message: 'AI_REQUEST_REPLAY' }, 400); ledgerStatus = 'processing'; return jsonResponse(true); }
    if (path === '/chat/completions') { providerCalls++; return jsonResponse({ choices: [{ message: { content: '建议' } }], usage: { total_tokens: 20 } }); }
    if (path === '/rest/v1/ai_usage_events' && init.method === 'PATCH') { ledgerStatus = JSON.parse(init.body).status; return new Response(null, { status: 204 }); }
    throw new Error(`Unexpected request ${path}`);
  });
  const responses = [mockResponse(), mockResponse()];
  await Promise.all(responses.map((response) => aiHandler(aiRequest('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), response)));
  assert.deepEqual(responses.map((response) => response.code).sort(), [200, 409]);
  assert.equal(ledgerStatus, 'succeeded'); assert.equal(providerCalls, 1);
  const replay = mockResponse(); await aiHandler(aiRequest('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), replay);
  assert.equal(replay.code, 409); assert.equal(providerCalls, 1);
});

test('unadmitted or restricted accounts never reach AI quota/provider', async (t) => {
  let admitted = false; let control;
  fakeRuntime(t, async (url) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return jsonResponse({ id: 'denied' });
    if (path === '/rest/v1/invite_redemptions') return jsonResponse(admitted ? [{ id: 'admitted' }] : []);
    if (path === '/rest/v1/beta_existing_users') return jsonResponse([]);
    if (path === '/rest/v1/account_controls') return jsonResponse([control]);
    throw new Error('Unauthorized operation reached quota/provider');
  });
  let response = mockResponse(); await aiHandler(aiRequest('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), response); assert.equal(response.code, 403);
  admitted = true;
  for (const status of ['restricted', 'suspended', 'banned']) { control = { status }; response = mockResponse(); await aiHandler(aiRequest('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), response); assert.equal(response.code, 403); }
});

test('active account lookup filters expired rows in database before order and limit', async (t) => {
  const old = { status: 'banned', effective_at: '2026-01-01T00:00:00Z', expires_at: null };
  fakeRuntime(t, async (url) => {
    const query = new URL(url).searchParams;
    assert.equal(query.get('effective_at'), 'lte.2026-09-28T00:00:00Z');
    assert.equal(query.get('or'), '(expires_at.is.null,expires_at.gt.2026-09-28T00:00:00Z)');
    assert.equal(query.get('superseded_at'), 'is.null'); assert.equal(query.get('order'), 'effective_at.desc,id.desc'); assert.equal(query.get('limit'), '1');
    return jsonResponse([old]);
  });
  assert.deepEqual(await findActiveAccountControl('user', '2026-09-28T00:00:00Z'), old);
});

function registrationRepository(events, options = {}) {
  return {
    async validateInvite() { events.push('validate'); return { enabled: true, used_count: 0, max_uses: 1 }; },
    async createAuthUser() { events.push('create'); return { id: 'new-user' }; },
    async redeemInvite() { events.push('redeem'); if (options.redeemFailure) throw new Error('REDEMPTION_FAILED'); },
    async hasInviteRedemption() { events.push('check-commit'); if (options.lookupFailure) throw new Error('LOOKUP_FAILED'); return Boolean(options.committed); },
    async deleteAuthUser() { events.push('delete'); },
    async dispatchVerification(email) { events.push('dispatch'); assert.equal(email, 'person@example.test'); if (options.dispatchFailure) throw new Error('EMAIL_FAILED'); },
  };
}
const signupInput = { email: 'Person@Example.test', password: 'long-password', inviteCode: 'VD-AB12CD' };
test('registration validates then creates, redeems, dispatches real verification in order', async () => {
  const events = []; assert.deepEqual(await registerInvitedUser(signupInput, registrationRepository(events)), { verificationSent: true });
  assert.deepEqual(events, ['validate', 'create', 'redeem', 'dispatch']);
});
test('verification failure retains committed redemption, reports unsent, and permits resend', async () => {
  const events = []; assert.deepEqual(await registerInvitedUser(signupInput, registrationRepository(events, { dispatchFailure: true })), { verificationSent: false });
  assert.deepEqual(events, ['validate', 'create', 'redeem', 'dispatch']);
});
test('failed uncommitted redemption cleans up new user only after checking commit', async () => {
  const events = []; await assert.rejects(registerInvitedUser(signupInput, registrationRepository(events, { redeemFailure: true })), /REDEMPTION_FAILED/);
  assert.deepEqual(events, ['validate', 'create', 'redeem', 'check-commit', 'delete']);
});
test('lost redemption response cannot delete committed user or consume invite twice', async () => {
  const events = []; assert.deepEqual(await registerInvitedUser(signupInput, registrationRepository(events, { redeemFailure: true, committed: true })), { verificationSent: true });
  assert.deepEqual(events, ['validate', 'create', 'redeem', 'check-commit', 'dispatch']);
});
test('unknown redemption outcome fails closed without unsafe compensation', async () => {
  const events = []; await assert.rejects(registerInvitedUser(signupInput, registrationRepository(events, { redeemFailure: true, lookupFailure: true })), /LOOKUP_FAILED/);
  assert.deepEqual(events, ['validate', 'create', 'redeem', 'check-commit']);
});
test('verification uses supported signup resend and trusted app metadata, never user metadata', () => {
  const repository = readFileSync(new URL('../server/platform/repository.js', import.meta.url), 'utf8');
  assert.match(repository, /\/auth\/v1\/resend/); assert.match(repository, /type: 'signup', email/);
  assert.match(repository, /email_confirm: false, app_metadata: \{ vd_beta_preauthorized: true \}/);
  const auth = readFileSync(new URL('../src/components/AuthPanel.tsx', import.meta.url), 'utf8');
  assert.match(auth, /verificationSent/); assert.match(auth, /重新发送/);
});
test('phone is existing-user login only; OAuth flags cannot bypass closed beta action gates', () => {
  const source = readFileSync(new URL('../src/lib/supabaseClient.ts', import.meta.url), 'utf8');
  assert.match(source, /shouldCreateUser: false/);
  const auth = readFileSync(new URL('../src/components/AuthPanel.tsx', import.meta.url), 'utf8');
  assert.match(auth, /已有账号登录/); assert.doesNotMatch(auth, /手机登录 \/ 注册/);
});
test('browser Turnstile renders callback, submits token and resets after every attempt', () => {
  const widget = readFileSync(new URL('../src/components/TurnstileChallenge.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/components/BetaApplyPage.tsx', import.meta.url), 'utf8');
  assert.match(widget, /VITE_TURNSTILE_SITE_KEY/); assert.match(widget, /window.turnstile.render/);
  assert.match(widget, /expired-callback/); assert.match(widget, /error-callback/); assert.match(widget, /turnstile.remove/);
  assert.match(widget, /import.meta.env.DEV && import.meta.env.VITE_TURNSTILE_DEV_BYPASS === 'true'/);
  assert.match(page, /turnstileToken/); assert.match(page, /finally/); assert.match(page, /setTurnstileToken\(''\)/); assert.match(page, /setChallengeReset/);
});
test('Turnstile server requires configured challenge, rejects invalid, permits valid token', async (t) => {
  let valid = false; let calls = 0;
  fakeRuntime(t, async (url, init) => { calls++; assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify'); assert.equal(init.body.get('response'), 'submitted-token'); return jsonResponse({ success: valid }); }, { TURNSTILE_SECRET_KEY: 'test-secret' });
  await assert.rejects(verifyTurnstile(''), /TURNSTILE_INVALID/); assert.equal(calls, 0);
  await assert.rejects(verifyTurnstile('submitted-token'), /TURNSTILE_INVALID/);
  valid = true; await verifyTurnstile('submitted-token'); assert.equal(calls, 2);
});
test('Turnstile production cannot use dev bypass; development bypass is explicit only', async (t) => {
  fakeRuntime(t, () => { throw new Error('Must not fetch without secret'); }, { TURNSTILE_SECRET_KEY: '', VD_ALLOW_TURNSTILE_BYPASS: 'true', NODE_ENV: 'production' });
  await assert.rejects(verifyTurnstile(''), /TURNSTILE_REQUIRED/);
  process.env.NODE_ENV = 'test'; await verifyTurnstile('');
  process.env.VD_ALLOW_TURNSTILE_BYPASS = 'false'; await assert.rejects(verifyTurnstile(''), /TURNSTILE_REQUIRED/);
});
test('every generated invite passes canonical validation (4096 samples)', () => {
  const codes = new Set();
  for (let i = 0; i < 4096; i++) { const code = makeInviteCode(); assert.match(code, /^VD-[0-9A-F]{32}$/); assert.equal(validateInviteCode(code), code); codes.add(code); }
  assert.equal(codes.size, 4096);
});
test('grant and revoke call transactional RPC, then only read effective union', async (t) => {
  const calls = []; const context = { role: 'owner', user: { id: 'owner' } };
  fakeRuntime(t, async (url, init = {}) => { const path = new URL(url).pathname; calls.push([path, init.method || 'GET']);
    if (path === '/rest/v1/rpc/beta_grant_entitlement') return jsonResponse({ grant: { id: 'grant', user_id: 'user' }, entitlement: { source_type: 'admin_grant' } });
    if (path === '/rest/v1/rpc/beta_revoke_entitlement') return jsonResponse({ id: 'grant', user_id: 'user' });
    if (path === '/rest/v1/entitlements') return jsonResponse([{ source_type: 'subscription' }]);
    throw new Error('Nontransactional mutation');
  });
  const granted = await grantEntitlement(context, 'request', { userId: 'user', durationDays: 7 }); assert.equal(granted.effective.allowed, true);
  const revoked = await revokeEntitlement(context, 'request', 'grant', 'reason'); assert.equal(revoked.effective.allowed, true);
  assert.deepEqual(calls.map(([path]) => path), ['/rest/v1/rpc/beta_grant_entitlement', '/rest/v1/entitlements', '/rest/v1/rpc/beta_revoke_entitlement', '/rest/v1/entitlements']);
});
test('invite plaintext is returned only after successful atomic invite+audit RPC', async (t) => {
  let fail = true; let calls = 0;
  fakeRuntime(t, async (url, init) => { calls++; assert.equal(new URL(url).pathname, '/rest/v1/rpc/beta_create_invite'); const body = JSON.parse(init.body); assert.match(body.p_hash, /^[0-9a-f]{64}$/); assert.equal('code' in body, false); return fail ? jsonResponse({ message: 'AUDIT_FAILED' }, 400) : jsonResponse({ id: 'invite' }); });
  const context = { role: 'admin', user: { id: 'admin' } };
  await assert.rejects(createInvite(context, 'request', {}), /AUDIT_FAILED/);
  fail = false; const result = await createInvite(context, 'request', {}); assert.equal(validateInviteCode(result.invite.code), result.invite.code); assert.equal(calls, 2);
});

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
  const workflow = readFileSync(new URL('../server/platform/registration.js', import.meta.url), 'utf8');
  assert.match(app, /path === '\/beta\/apply'/); assert.match(auth, /邀请码/); assert.match(hook, /fetch\('\/api\/beta-register'/); assert.match(registration, /registerInvitedUser/); assert.match(workflow, /redeemInvite/); assert.match(workflow, /deleteAuthUser/);
});
test('AI server path consumes database quota before DeepSeek and never exposes its secret to browser source', () => {
  const api = readFileSync(new URL('../api/ai.js', import.meta.url), 'utf8'); const migration = readFileSync(new URL('../supabase/migrations/20260927174808_closed_beta_platform.sql', import.meta.url), 'utf8'); const browserFiles = ['src/App.tsx', 'src/services/aiClient.ts', 'src/components/BetaApplyPage.tsx'].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')).join('\n');
  assert.match(api, /consumeAIQuota/); assert.match(api, /本周期 AI 使用额度已用完/); assert.match(migration, /pg_advisory_xact_lock\(hashtext\('ai-quota:'/); assert.doesNotMatch(browserFiles, /DEEPSEEK_API_KEY/);
});
test('admin grants remain an independent entitlement source and operational tables are server-only', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260927174808_closed_beta_platform.sql', import.meta.url), 'utf8'); const admin = readFileSync(new URL('../server/platform/admin.js', import.meta.url), 'utf8');
  const hardening = readFileSync(new URL('../supabase/migrations/20260928023311_closed_beta_review_hardening.sql', import.meta.url), 'utf8');
  assert.match(hardening, /'admin_grant'/); assert.match(admin, /rpc\/beta_grant_entitlement/); assert.match(admin, /rpc\/beta_revoke_entitlement/); assert.match(migration, /revoke all on table public.%I from public, anon, authenticated/);
});
