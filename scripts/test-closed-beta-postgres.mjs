import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Install pg into an isolated tools directory; do not add runtime dependencies.
// VD_TEST_PG_DRIVER may point to that directory's node_modules/pg/lib/index.js.
const driver = process.env.VD_TEST_PG_DRIVER;
const { default: pg } = await import(driver ? pathToFileURL(resolve(driver)).href : 'pg');
const connectionString = process.env.VD_TEST_DATABASE_URL;
if (!connectionString) throw new Error('VD_TEST_DATABASE_URL is required (empty local database only)');
const endpoint = new URL(connectionString);
if (!['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('Refusing non-local database');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("set timezone='UTC'");
  const existing = await client.query("select count(*)::integer n from information_schema.tables where table_schema in ('public','auth','storage')");
  assert.equal(existing.rows[0].n, 0, 'Harness requires an empty isolated database, never an existing workspace');
  await client.query(readFileSync('supabase/tests/fixtures/local_platform_bootstrap.sql', 'utf8'));
  await client.query('create extension pgtap with schema extensions; set search_path=public,extensions');
  const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
  for (const migration of migrations) {
    if (migration === '20260928023311_closed_beta_review_hardening.sql') {
      await client.query("insert into auth.users(id,email) values ('88888888-8888-4888-8888-888888888888','existing@example.test')");
    }
    await client.query(readFileSync(`supabase/migrations/${migration}`, 'utf8'));
    console.log(`APPLIED ${migration}`);
  }
  console.log(`MIGRATION_CHAIN PASS ${migrations.length} migrations`);
  const grandfathered = await client.query("select count(*)::integer n from public.beta_existing_users where user_id='88888888-8888-4888-8888-888888888888'");
  assert.equal(grandfathered.rows[0].n, 1);
  console.log('EXISTING_ACCOUNT_ADMISSION PASS: migration preserves pre-beta accounts');
  for (const name of ['closed_beta_platform_rls_test.sql', 'closed_beta_quota_periods_test.sql', 'billing_service_role_privileges_test.sql', 'recurring_billing_rls_test.sql', 'recurring_billing_lifecycle_test.sql', 'recurring_billing_legacy_test.sql']) {
    const result = await client.query(readFileSync(`supabase/tests/${name}`, 'utf8'));
    const results = Array.isArray(result) ? result : [result];
    const lines = results.flatMap((part) => part.rows.flatMap((row) => Object.values(row))).filter((value) => typeof value === 'string' && /^(?:ok |not ok |1\.\.|#)/.test(value));
    const failures = lines.filter((line) => /^not ok |^#.*(?:failed|Looks like)/i.test(line));
    if (failures.length) throw new Error(`${name}:\n${failures.join('\n')}`);
    const assertions = lines.filter((line) => /^ok /.test(line)).length;
    assert.ok(assertions > 0, `No TAP assertions returned by ${name}`);
    console.log(`PGTAP PASS ${name}: ${assertions} assertions`);
  }
  // Independent connections exercise the real advisory lock, not an in-memory mock.
  const user = '99999999-9999-4999-8999-999999999999';
  await client.query('insert into auth.users(id,email) values($1,$2)', [user, 'concurrency@example.test']);
  const request = '99999999-0000-4000-8000-000000000001';
  const connections = [new pg.Client({ connectionString }), new pg.Client({ connectionString })];
  try {
    await Promise.all(connections.map((connection) => connection.connect()));
    const outcomes = await Promise.allSettled(connections.map((connection) => connection.query("set role service_role; select public.consume_ai_quota('99999999-9999-4999-8999-999999999999','99999999-0000-4000-8000-000000000001','deepseek','test','task_analysis')")));
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.message === 'AI_REQUEST_REPLAY').length, 1);
    const ledger = await client.query('select count(*)::integer n from public.ai_usage_events where user_id=$1 and request_id=$2', [user, request]);
    assert.equal(ledger.rows[0].n, 1);
    console.log('CONCURRENT_AI_REPLAY PASS: one reservation, one rejection, one ledger row');
    const actor = '77777777-7777-4777-8777-777777777777';
    await client.query('insert into auth.users(id,email) values($1,$2)', [actor, 'quota-admin-concurrent@example.test']);
    await client.query("insert into public.admin_roles(user_id,role,created_by) values($1,'admin',$1)", [actor]);
    await client.query("update public.ai_quota_policies set requests_per_period=200 where tier='free'");
    await client.query("insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status) select $1,gen_random_uuid(),'deepseek','test','task_analysis','succeeded' from generate_series(1,99)", [user]);
    await Promise.all(connections.map((connection) => connection.query(
      "select public.beta_reset_quota($1,gen_random_uuid(),$2,'concurrent-reset')", [actor,user])));
    const compensation = await client.query("select count(*)::integer n,max(amount) amount from public.ai_quota_grants where user_id=$1 and source_kind='period_reset'", [user]);
    assert.deepEqual(compensation.rows[0], { n: 1, amount: 100 });
    const resetSnapshot = await client.query('select public.beta_ai_quota_snapshot($1) snapshot', [user]);
    assert.equal(resetSnapshot.rows[0].snapshot.remaining, 200);
    const race = await Promise.all([
      connections[0].query("select public.consume_ai_quota($1,gen_random_uuid(),'deepseek','test','task_analysis')", [user]),
      connections[1].query("select public.beta_reset_quota($1,gen_random_uuid(),$2,'consume-reset-race')", [actor,user]),
    ]);
    assert.equal(race.length, 2);
    const afterRace = (await client.query('select public.beta_ai_quota_snapshot($1) snapshot', [user])).rows[0].snapshot;
    assert.equal(afterRace.used, 101);
    assert.ok([199,200].includes(afterRace.remaining));
    assert.ok([100,101].includes(afterRace.extra));
    console.log('CONCURRENT_QUOTA_RESET PASS: one compensation row; resets and consumption serialize without compounding');
  } finally { await Promise.allSettled(connections.map((connection) => connection.end())); }
} finally { await client.end(); }
