import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sha256 } from '../server/platform/runtime.js';
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
  const suites = readdirSync('supabase/tests').filter((name) => name.endsWith('_test.sql')).sort();
  for (const name of suites) {
    let sql = readFileSync('supabase/tests/' + name, 'utf8');
    if (!name.startsWith('closed_beta_')) {
      // Historical owner-RLS suites model accounts that predate Closed Beta.
      // Admit only their test fixtures within the rolled-back suite transaction;
      // do not disable RLS or bypass beta admission in the Closed Beta suites.
      sql = sql.replace(/begin;/i, () => String.raw`begin;
        create function pg_temp.admit_historical_fixture() returns trigger language plpgsql security definer set search_path='' as $$
        begin insert into public.beta_existing_users(user_id) values(new.id) on conflict do nothing; return new; end $$;
        create trigger admit_historical_fixture after insert on auth.users for each row execute function pg_temp.admit_historical_fixture();`);
    }
    const result = await client.query(sql);
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
    await client.query("insert into public.admin_roles(user_id,role,created_by) values($1,'owner',$1)", [actor]);
    await client.query("update public.ai_quota_policies set requests_per_period=200 where tier='free'");
    await client.query("insert into public.ai_usage_events(user_id,request_id,provider,model,feature,status) select $1,gen_random_uuid(),'deepseek','test','task_analysis','succeeded' from generate_series(1,99)", [user]);
    await Promise.all(connections.map((connection) => connection.query(
      "select public.beta_admin_command($1,gen_random_uuid(),'reset_quota',jsonb_build_object('userId',$2::text,'reason','concurrent-reset'))", [actor,user])));
    const compensation = await client.query("select count(*)::integer n,max(amount) amount from public.ai_quota_grants where user_id=$1 and source_kind='period_reset'", [user]);
    assert.deepEqual(compensation.rows[0], { n: 1, amount: 100 });
    const resetSnapshot = await client.query('select public.beta_ai_quota_snapshot($1) snapshot', [user]);
    assert.equal(resetSnapshot.rows[0].snapshot.remaining, 200);
    const race = await Promise.all([
      connections[0].query("select public.consume_ai_quota($1,gen_random_uuid(),'deepseek','test','task_analysis')", [user]),
      connections[1].query("select public.beta_admin_command($1,gen_random_uuid(),'reset_quota',jsonb_build_object('userId',$2::text,'reason','consume-reset-race'))", [actor,user]),
    ]);
    assert.equal(race.length, 2);
    const afterRace = (await client.query('select public.beta_ai_quota_snapshot($1) snapshot', [user])).rows[0].snapshot;
    assert.equal(afterRace.used, 101);
    assert.ok([199,200].includes(afterRace.remaining));
    assert.ok([100,101].includes(afterRace.extra));
    console.log('CONCURRENT_QUOTA_RESET PASS: one compensation row; resets and consumption serialize without compounding');
    const invite = randomUUID(); const application = randomUUID();
    await client.query("insert into public.invite_codes(id,code_hash,display_prefix,max_uses,created_by) values($1,repeat('c',64),'VD-TEST',1,$2)", [invite,actor]);
    await client.query("insert into public.beta_applications(id,email,email_hash,name,role,use_case,status) values($1,'concurrent-application@example.test',repeat('c',64),'Concurrent','test','test','pending')", [application]);
    const cases = [
      ['create_invite',{ maxUses: 2, note: 'concurrent-command' }],
      ['grant_entitlement',{ userId: user, durationDays: 7, reason: 'concurrent-command' }],
      ['grant_quota',{ userId: user, amount: 10, reason: 'concurrent-command' }],
      ['reset_quota',{ userId: user, reason: 'concurrent-command' }],
      ['set_account_control',{ userId: user, status: 'restricted', reason: 'concurrent-command' }],
      ['set_feature_flag',{ key: 'concurrent.command', enabled: false, reason: 'concurrent-command' }],
      ['disable_invite',{ inviteId: invite, reason: 'concurrent-command' }],
      ['review_application',{ applicationId: application, status: 'shortlisted', reviewNote: 'concurrent-command' }],
    ];
    for (const [action,input] of cases) {
      const key = randomUUID(); const args = [actor,key,action,JSON.stringify(input)];
      const statement = 'select public.beta_admin_command($1,$2,$3,$4::jsonb) result';
      // Hold the first committed effect behind a real transaction. The second
      // connection must wait on the advisory lock, then return the same receipt.
      await connections[0].query('begin');
      try {
        const first = (await connections[0].query(statement,args)).rows[0].result;
        let finished = false;
        const second = connections[1].query(statement,args).finally(() => { finished = true; });
        await new Promise((resolveWait) => setTimeout(resolveWait,50));
        assert.equal(finished,false,action + ': concurrent retry must wait for commit');
        const wait=(await client.query('select wait_event_type,wait_event from pg_stat_activity where pid=$1',[connections[1].processID])).rows[0];
        assert.deepEqual(wait,{wait_event_type:'Lock',wait_event:'advisory'},action + ': PostgreSQL observes the blocked retry');
        await connections[0].query('commit');
        assert.deepEqual((await second).rows[0].result,first,action + ': identical original result');
        assert.deepEqual((await connections[1].query(statement,args)).rows[0].result,first);
        const evidence = (await client.query(`select
          (select count(*)::integer from public.admin_command_receipts where actor_user_id=$1 and request_id=$2) receipts,
          (select count(*)::integer from public.admin_audit_log where actor_user_id=$1 and request_id=$2) audits`,[actor,key])).rows[0];
        assert.deepEqual(evidence,{receipts:1,audits:1});
        if (action==='create_invite') {
          const persisted=(await client.query('select code_hash from public.invite_codes where id=$1',[first.invite.id])).rows[0];
          assert.equal(persisted.code_hash,sha256(first.invite.code),'generated invite remains compatible with real registration hash');
          await connections[1].query('select public.redeem_beta_invite($1,$2,$3,$4)',[sha256(first.invite.code),user,sha256('concurrency@example.test'),'invite']);
          const redeemed=(await client.query('select used_count from public.invite_codes where id=$1',[first.invite.id])).rows[0];
          assert.equal(redeemed.used_count,1);
        }
        await assert.rejects(connections[1].query(statement,[actor,key,action,JSON.stringify({...input,note:'different'})]),/IDEMPOTENCY_KEY_REUSED/);
        await assert.rejects(connections[1].query(statement,[actor,key,action==='create_invite'?'grant_quota':'create_invite',JSON.stringify(input)]),/IDEMPOTENCY_KEY_REUSED/);
        console.log('CONCURRENT_ADMIN_COMMAND PASS ' + action + ': lock wait, exact replay, one receipt/audit, conflicting keys rejected');
      } catch (error) { await connections[0].query('rollback'); throw error; }
    }
  } finally { await Promise.allSettled(connections.map((connection) => connection.end())); }
} finally { await client.end(); }
