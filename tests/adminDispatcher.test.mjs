import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { beforeEach, test } from 'node:test';
import handler from '../api/admin.js';
import { apiEntrypoints, assertFunctionLimit } from '../scripts/check-vercel-function-count.mjs';

const actor = '11111111-1111-4111-8111-111111111111';
const user = '33333333-3333-4333-8333-333333333333';
const record = '44444444-4444-4444-8444-444444444444';
const requestId = '77777777-7777-4777-8777-777777777777';
const internalHeaders = { authorization: 'Bearer fixture-internal', 'x-admin-contract': 'vd-admin-v1', 'x-admin-actor': actor };
let calls;
let committed;
beforeEach((t) => {
  calls = []; committed = undefined;
  const env = { ...process.env }; const fetch = globalThis.fetch;
  Object.assign(process.env, { VD_ADMIN_INTERNAL_TOKEN: 'fixture-internal', SUPABASE_URL: 'https://fixture.invalid', SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' });
  t.after(() => { process.env = env; globalThis.fetch = fetch; });
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname; calls.push(path);
    let result;
    if (path === '/auth/v1/user') {
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer fixture-browser');
      result = { id: actor };
    } else if (path === '/rest/v1/admin_roles') result = [{ role: 'owner' }];
    else if (path === '/rest/v1/account_controls') result = [];
    else if (path === '/rest/v1/profiles') result = [{ id: user, display_name: '本地用户' }];
    else if (path === '/rest/v1/rpc/beta_admin_v1_read') {
      const args = JSON.parse(init.body);
      assert.equal(args.p_actor, actor); assert.equal(args.p_resource, 'users');
      assert.equal(args.p_query.q, '样例'); result = { items: [] };
    } else if (path === '/rest/v1/rpc/beta_admin_v1_authorize') result = 'owner';
    else if (path === '/rest/v1/rpc/beta_admin_command') {
      const args = JSON.parse(init.body);
      assert.equal(args.p_action, 'grant_entitlement'); assert.equal(args.p_request, requestId);
      committed = { id: record, actor_user_id: actor, request_id: requestId, adapter_command: args.p_input._adminV1, created_at: '2026-09-29T00:00:00Z' };
      result = { grant: { id: record }, effective: { allowed: true } };
    } else if (path === '/rest/v1/rpc/beta_admin_v1_audit_receipt') result = committed;
    else assert.fail('Unexpected persistence path: ' + path);
    return new Response(JSON.stringify(result), { status: 200 });
  };
});
async function invoke(url, { method = 'GET', headers = {}, query, body } = {}) {
  const response = { headers: {}, status(code) { this.code = code; return this; }, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ url, method, headers, query, body }, response);
  assert.equal(response.headers['Cache-Control'], 'no-store');
  return response;
}
test('legacy /api/admin?action=users retains Supabase authentication and response', async () => {
  const res = await invoke('/api/admin?action=users', { headers: { authorization: 'Bearer fixture-browser' } });
  assert.equal(res.code, 200); assert.deepEqual(res.body.users, [{ id: user, display_name: '本地用户' }]);
  assert.equal(res.body.items, undefined);
  assert.deepEqual(calls, ['/auth/v1/user', '/rest/v1/admin_roles', '/rest/v1/account_controls', '/rest/v1/profiles']);
});
for (const representation of ['url', 'query']) {
  test(`rewritten v1 GET uses shared function (${representation}) without legacy auth`, async () => {
    const url = representation === 'url' ? '/api/admin?vdAdminV1=true&vdResource=users&q=%E6%A0%B7%E4%BE%8B' : '/api/admin';
    const query = representation === 'query' ? { vdAdminV1: 'true', vdResource: 'users', q: '样例' } : undefined;
    const res = await invoke(url, { headers: internalHeaders, query });
    assert.equal(res.code, 200); assert.deepEqual(res.body.items, []); assert.equal(res.body.ok, undefined);
    assert.deepEqual(calls, ['/rest/v1/rpc/beta_admin_v1_read']);
  });
  test(`rewritten v1 POST uses existing authorization/command/audit (${representation})`, async () => {
    const url = representation === 'url' ? '/api/admin?vdAdminV1=true&vdResource=entitlements&vdOperation=actions' : '/api/admin';
    const query = representation === 'query' ? { vdAdminV1: 'true', vdResource: 'entitlements', vdOperation: 'actions' } : undefined;
    const body = { action: 'grant', target: user, reason: '分发验证', input: { days: 7 }, requestId };
    const res = await invoke(url, { method: 'POST', headers: { ...internalHeaders, 'idempotency-key': requestId }, query, body });
    assert.equal(res.code, 200); assert.equal(res.body.result.effectivePlus, true);
    assert.equal(res.body.auditEvent.requestId, requestId);
    assert.deepEqual(calls, ['/rest/v1/rpc/beta_admin_v1_authorize', '/rest/v1/rpc/beta_admin_command', '/rest/v1/rpc/beta_admin_v1_audit_receipt']);
  });
}
for (const [name, suffix, headers, query] of [
  ['resource/operation only', '&vdResource=users&vdOperation=actions', {}, undefined],
  ['contract without marker', '&vdResource=users', { 'x-admin-contract': 'vd-admin-v1' }, undefined],
  ['marker without contract', '&vdAdminV1=true&vdResource=users', {}, undefined],
  ['marker with wrong contract', '&vdAdminV1=true&vdResource=users', { 'x-admin-contract': 'vd-admin-v2' }, undefined],
  ['false marker', '&vdAdminV1=false&vdResource=users', { 'x-admin-contract': 'vd-admin-v1' }, undefined],
  ['duplicate marker', '&vdAdminV1=true&vdAdminV1=true', { 'x-admin-contract': 'vd-admin-v1' }, undefined],
  ['array marker', '', { 'x-admin-contract': 'vd-admin-v1' }, { vdAdminV1: ['true'] }],
  ['conflicting marker', '&vdAdminV1=true', { 'x-admin-contract': 'vd-admin-v1' }, { vdAdminV1: 'false' }],
]) test(`legacy query spoofing cannot select v1: ${name}`, async () => {
  const res = await invoke('/api/admin?action=users' + suffix, { headers: { authorization: 'Bearer fixture-browser', ...headers }, query });
  assert.equal(res.code, 200); assert.equal(res.body.ok, true); assert.equal(res.body.items, undefined);
  assert.ok(!calls.some(path => path.includes('beta_admin_v1')));
});
test('public caller with marker and contract still cannot bypass internal credential', async () => {
  const res = await invoke('/api/admin?vdAdminV1=true&vdResource=users', { headers: { ...internalHeaders, authorization: 'Bearer fixture-browser' } });
  assert.equal(res.code, 401); assert.equal(res.body.code, 'INTERNAL_AUTH_INVALID'); assert.deepEqual(calls, []);
});
test('canonical v1 route retains contract validation even without rewritten URL', async () => {
  const res = await invoke('/api/v1/admin/users', { headers: { ...internalHeaders, 'x-admin-contract': '' } });
  assert.equal(res.code, 426); assert.equal(res.body.code, 'ADMIN_CONTRACT_UNSUPPORTED'); assert.deepEqual(calls, []);
});
test('ambiguous rewritten resource fails before persistence', async () => {
  const res = await invoke('/api/admin?vdAdminV1=true&vdResource=users', { headers: internalHeaders, query: { vdAdminV1: 'true', vdResource: 'settings' } });
  assert.equal(res.code, 400); assert.equal(res.body.code, 'ADMIN_INPUT_INVALID'); assert.deepEqual(calls, []);
});
test('public v1 routes share admin function; cron and final SPA fallback remain unchanged', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.rewrites, [
    { source: '/api/v1/admin/:resource/actions', destination: '/api/admin?vdAdminV1=true&vdResource=:resource&vdOperation=actions' },
    { source: '/api/v1/admin/:resource', destination: '/api/admin?vdAdminV1=true&vdResource=:resource' },
    { source: '/(.*)', destination: '/index.html' },
  ]);
  assert.deepEqual(config.crons, [{ path: '/api/billing-reconcile', schedule: '17 3 * * *' }]);
});
test('deployable physical API entrypoints fit Hobby cap; thirteenth function fails static gate', () => {
  const files = apiEntrypoints(new URL('../api/', import.meta.url));
  assertFunctionLimit(files); assert.equal(files.length, 12);
  assert.equal(existsSync(new URL('../api/admin-v1.js', import.meta.url)), false);
  assert.throws(() => assertFunctionLimit([...files, 'api/extra-function.js']), /limit exceeded: 13\/12/);
});
