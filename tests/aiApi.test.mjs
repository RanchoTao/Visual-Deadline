import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import handler, { getAIRequestTimeoutMs } from '../api/ai.js';

function mockResponse() {
  return {
    code: 200,
    headers: {},
    body: undefined,
    status(code) { this.code = code; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    end(json) { this.body = JSON.parse(json); },
  };
}

test('AI timeout budget covers structured captures without delaying quick requests', () => {
  assert.equal(getAIRequestTimeoutMs('capture_interpret'), 90_000);
  assert.equal(getAIRequestTimeoutMs('goal_decompose'), 90_000);
  assert.equal(getAIRequestTimeoutMs('task_advice'), 30_000);
  assert.equal(getAIRequestTimeoutMs('daily_plan'), 30_000);
  assert.equal(getAIRequestTimeoutMs('pressure_analysis'), 30_000);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.equal(config.functions['api/ai.js'].maxDuration, 120);
});

test('capture sends provider request, returns text, and does not expose credentials', async () => {
  const oldFetch = globalThis.fetch;
  const oldEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'AI_PROVIDER', 'DEEPSEEK_BASE_URL'].map((key) => [key, process.env[key]]));
  let upstream;
  try {
    Object.assign(process.env, {
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      DEEPSEEK_API_KEY: 'fake-secret-for-test',
      DEEPSEEK_MODEL: 'deepseek-flash',
      AI_PROVIDER: 'deepseek',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    });
    globalThis.fetch = async (url, options) => {
      if (String(url).endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'ai-test-user' }) };
      assert.equal(url, 'https://api.deepseek.com/chat/completions');
      upstream = JSON.parse(options.body);
      assert.equal(options.headers.Authorization, 'Bearer fake-secret-for-test');
      return { ok: true, text: async () => JSON.stringify({ choices: [{ message: { content: '{"tasks":[]}' } }] }) };
    };
    const response = mockResponse();
    await handler({ method: 'POST', headers: { authorization: 'Bearer dummy-user-token' }, body: { mode: 'capture_interpret', message: '安排两项作业' } }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.model, 'deepseek-flash');
    assert.equal(response.body.content, '{"tasks":[]}');
    assert.equal(upstream.model, 'deepseek-flash');
    assert.ok(!JSON.stringify(response.body).includes('fake-secret-for-test'));
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('capture interpreter sends existing tasks and goals only once', () => {
  const source = readFileSync(new URL('../src/domain/capture/interpreter.ts', import.meta.url), 'utf8');
  assert.match(source, /activeTasks: tasks\.slice\(0, 40\)/);
  assert.match(source, /activeGoals: goals\.slice\(0, 30\)/);
  assert.match(source, /\{ mode: 'capture_interpret', signal \}/);
  assert.doesNotMatch(source, /context: \{ tasks: tasks\.slice/);
});

test('unsupported request methods are rejected without contacting provider', async () => {
  const response = mockResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.code, 405);
  assert.equal(response.body.ok, false);
});
