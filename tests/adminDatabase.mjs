import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash } from "node:crypto";
export const owner = "11111111-1111-4111-8111-111111111111";
export const user = "22222222-2222-4222-8222-222222222222";
export const key = "synthetic-local-receipt-key-32-characters";
export async function runDatabaseTests(db, cluster) {
  let checks = 0;
  const check = (condition) => {
    assert.ok(condition);
    checks++;
  };
  const query = async (sql, args = []) => (await db.query(sql, args)).rows;
  const invoke = async (
    client,
    resource,
    action,
    input = {},
    target = user,
    request = randomUUID(),
    role = "owner",
    actor = owner,
  ) =>
    (
      await client.query(
        "select public.admin_command($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result",
        [
          actor,
          role,
          resource,
          action,
          target,
          "local regression verification",
          input,
          request,
          key,
          "VD-" + randomBytes(24).toString("base64url"),
        ],
      )
    ).rows[0].result;
  const command = (...args) => invoke(db, ...args);
  const parallel = async (work) => {
    const client = cluster.getPgClient("postgres", "127.0.0.1");
    await client.connect();
    try {
      await client.query("set role service_role");
      return await work(client);
    } finally {
      await client.end();
    }
  };
  const read = async (resource = "users", q = { id: user }) =>
    (
      await query("select public.admin_read($1,$2,$3,$4) result", [
        owner,
        "owner",
        resource,
        q,
      ])
    )[0].result;
  const reject = async (promise, pattern) => {
    await assert.rejects(promise, pattern);
    checks++;
  };
  await query(
    `insert into auth.users(id,email,email_confirmed_at) values ($1,'owner@example.test',now()),($2,'user@example.test',now())`,
    [owner, user],
  );
  await query(
    `insert into public.admin_operator_roles(user_id,role,created_by) values ($1,'owner',$1)`,
    [owner],
  );
  await query("set role service_role");
  check(
    (
      await query("select public.admin_read($1,$2,$3,$4) result", [
        owner,
        "owner",
        "users",
        {},
      ])
    )[0].result.items.length === 2,
  );
  check((await read()).items[0].effectiveTier === "free");
  check((await read()).items[0].limit === 20);
  await assert.rejects(
    command("entitlements", "grant", { days: 7 }, user, randomUUID(), "admin"),
    /ADMIN_FORBIDDEN/,
  );
  checks++;
  await assert.rejects(
    command(
      "entitlements",
      "grant",
      { days: 7 },
      user,
      randomUUID(),
      "owner",
      user,
    ),
    /ADMIN_FORBIDDEN/,
  );
  checks++;
  const plus = await command("entitlements", "grant", {
    tier: "plus",
    days: 7,
  });
  check(plus.result.effectiveTier === "plus");
  check((await read()).items[0].limit === 200);
  const pro = await command("entitlements", "grant", { tier: "pro", days: 30 });
  check(pro.result.effectiveTier === "pro");
  check((await read()).items[0].limit === 500);
  const dto = (await read()).items[0];
  assert.deepEqual(dto.capabilities, ["vd.plus", "vd.pro"]);
  checks++;
  await command("entitlements", "revoke", { grantId: pro.result.grantId });
  check((await command("quotas", "adjust", { limit: 2 })).result.limit === 2);
  const delta = await command("quotas", "adjust", { delta: 3 });
  check(delta.result.limit === 5);
  await command("quotas", "adjust", {
    revokeOverride: delta.result.overrideId,
  });
  await command("quotas", "reset");
  await command("bans", "suspend", { days: 1 });
  await assert.rejects(
    query("select public.ai_reserve($1,$2,$3,$4,$5)", [
      user,
      randomUUID(),
      "task_advice",
      "fixture",
      "model",
    ]),
    /ACCOUNT_BLOCKED/,
  );
  checks++;
  check((await command("bans", "unban")).result.accountStatus === "normal");
  const req = randomUUID();
  const original = await command(
    "entitlements",
    "grant",
    { tier: "plus", days: 1 },
    user,
    req,
  );
  assert.deepEqual(
    await command(
      "entitlements",
      "grant",
      { days: 1, tier: "plus" },
      user,
      req,
    ),
    original,
  );
  checks++;
  await assert.rejects(
    command("entitlements", "grant", { days: 7 }, user, req),
    /ADMIN_IDEMPOTENCY_CONFLICT/,
  );
  checks++;
  const invite = await command(
    "invitations",
    "create",
    { kind: "group", limit: 1, cohort: "local-test" },
    "new",
  );
  check(invite.result.inviteCode?.length === 35);
  const hash = createHash("sha256")
    .update(invite.result.inviteCode)
    .digest("hex");
  await query("select public.beta_redeem($1,$2)", [user, hash]);
  await query("select public.beta_redeem($1,$2)", [user, hash]);
  checks++;
  await assert.rejects(
    query("select public.beta_redeem($1,$2)", [owner, hash]),
    /INVITE_UNAVAILABLE/,
  );
  checks++;
  await query("reset role");
  // No runtime DML on operator tables, even for service_role. Immutable triggers also reject database-owner edits.
  await query("set role authenticated");
  await query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: user, user_metadata: { role: "owner" } }),
  ]);
  await reject(
    command("entitlements", "grant", { tier: "pro", days: 7 }),
    /permission denied for function admin_command/,
  );
  await reject(
    query("select public.admin_read($1,$2,$3,$4)", [
      owner,
      "owner",
      "users",
      {},
    ]),
    /permission denied for function admin_read/,
  );
  await query("reset role");
  const tables = [
    "admin_operator_roles",
    "admin_audit_events",
    "admin_command_receipts",
    "admin_access_grants",
    "ai_quota_policies",
    "ai_quota_overrides",
    "ai_usage_ledger",
    "ai_quota_resets",
    "account_controls",
    "beta_cohorts",
    "beta_applications",
    "invite_codes",
    "invite_redemptions",
    "beta_allow_grants",
    "email_outbox",
    "beta_application_rate_buckets",
  ];
  for (const table of tables) {
    check(
      (
        await query(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          ["public." + table],
        )
      )[0].relrowsecurity,
    );
    for (const role of ["anon", "authenticated", "service_role"]) {
      await query("set role " + role);
      await reject(query("select * from public." + table), /permission denied/);
      await reject(query("delete from public." + table), /permission denied/);
      await query("reset role");
    }
  }
  await reject(
    query("update public.admin_audit_events set reason=reason"),
    /ADMIN_APPEND_ONLY/,
  );
  await reject(
    query("delete from public.admin_command_receipts"),
    /ADMIN_APPEND_ONLY/,
  );
  // Existing ownership policies remain effective. Blocked users retain their own read/export access.
  await query(
    'insert into public.tasks(id,user_id,data) values (\'private-task\',$1,\'{"title":"PRIVATE_BODY_SENTINEL","description":"PRIVATE_BODY_SENTINEL"}\')',
    [user],
  );
  await query(
    "insert into public.goals(id,user_id,data) values ('private-goal',$1,'{\"title\":\"PRIVATE_GOAL_SENTINEL\"}')",
    [user],
  );
  await query(
    'insert into public.review_records(user_id,id,created_at,updated_at,data) values ($1,\'private-review\',now(),now(),\'{"title":"PRIVATE_REVIEW_SENTINEL","userNote":"PRIVATE_REVIEW_SENTINEL"}\')',
    [user],
  );
  await query("set role service_role");
  check(!JSON.stringify(await read()).includes("PRIVATE_"));
  check(
    (await read("users", { q: "USER@EXAMPLE.TEST", limit: 1 })).items.length ===
      1,
  );
  check((await read("users", { q: "absent" })).items.length === 0);
  const page = await read("users", { limit: 1 });
  check(page.items.length === 1 && Boolean(page.nextCursor));
  check(
    (await read("users", { limit: 1, cursor: page.nextCursor })).items
      .length === 1,
  );
  await reject(
    command("restricted-content", "inspect", {
      scope: "tasks",
      from: new Date(Date.now() - 3600000).toISOString(),
      until: new Date(Date.now() + 3600000).toISOString(),
    }),
    /ADMIN_INVALID_INPUT/,
  );
  const scope = {
    caseReference: "CASE-LOCAL",
    category: "support",
    scope: "tasks",
    from: new Date(Date.now() - 3600000).toISOString(),
    until: new Date(Date.now() + 3600000).toISOString(),
  };
  const inspected = await command("restricted-content", "inspect", scope);
  check(inspected.result.items[0].title === "PRIVATE_BODY_SENTINEL");
  const replayInspectId = randomUUID();
  const snap = await command(
    "restricted-content",
    "inspect",
    scope,
    user,
    replayInspectId,
  );
  assert.deepEqual(
    await command(
      "restricted-content",
      "inspect",
      scope,
      user,
      replayInspectId,
    ),
    snap,
  );
  checks++;
  await query("reset role");
  check(
    (
      await query(
        "select count(*)::int n from public.admin_audit_events where id=$1",
        [inspected.auditEvent.id],
      )
    )[0].n === 1,
  );
  await query(
    "insert into public.admin_operator_roles(user_id,role,created_by) values ($1,'support',$2)",
    [user, owner],
  );
  await query("set role service_role");
  await reject(
    command(
      "restricted-content",
      "inspect",
      scope,
      user,
      randomUUID(),
      "support",
      user,
    ),
    /ADMIN_FORBIDDEN/,
  );
  await reject(
    command("restricted-content", "inspect", {
      ...scope,
      until: new Date(Date.now() + 40 * 86400000).toISOString(),
    }),
    /ADMIN_INVALID_CONTENT_RANGE/,
  );
  await query("reset role");
  await query(
    "update public.admin_operator_roles set status='revoked' where user_id=$1",
    [user],
  );
  await query("set role service_role");
  await reject(read("restricted-content", {}), /ADMIN_FORBIDDEN/);
  await reject(
    query("select public.admin_read($1,$2,$3,$4)", [
      user,
      "support",
      "users",
      {},
    ]),
    /ADMIN_FORBIDDEN/,
  );
  // Failure at audit insertion rolls back grant projection, invitation, approval, and outbox.
  await query("reset role");
  await query(
    "create function public.test_reject_audit() returns trigger language plpgsql as $$begin raise exception 'TEST_AUDIT_FAILURE';end$$; create trigger test_reject_audit before insert on public.admin_audit_events for each row execute function public.test_reject_audit()",
  );
  const grantsBefore = (
    await query("select count(*)::int n from public.admin_access_grants")
  )[0].n;
  await query("set role service_role");
  await reject(
    command("entitlements", "grant", { tier: "pro", days: 7 }),
    /TEST_AUDIT_FAILURE/,
  );
  const app = (
    await query("select public.beta_submit($1,$2) result", [
      {
        email: "applicant@example.test",
        name: "Local applicant",
        useCase: "Regression",
      },
      "a".repeat(64),
    ])
  )[0].result;
  await reject(
    command("beta-applications", "approve-and-email", {}, app.id),
    /TEST_AUDIT_FAILURE/,
  );
  await query("reset role");
  check(
    (await query("select count(*)::int n from public.admin_access_grants"))[0]
      .n === grantsBefore,
  );
  check(
    (await query("select count(*)::int n from public.email_outbox"))[0].n === 0,
  );
  check(
    (
      await query("select status from public.beta_applications where id=$1", [
        app.id,
      ])
    )[0].status === "pending",
  );
  await query(
    "drop trigger test_reject_audit on public.admin_audit_events; drop function public.test_reject_audit()",
  );
  await query("set role service_role");
  const approval = await command(
    "beta-applications",
    "approve-and-email",
    {},
    app.id,
  );
  check(Boolean(approval.result.queuedEmailId));
  const mails = await read("email", {});
  check(
    mails.items[0].status === "queued" &&
      mails.items[0].providerMessageId === null,
  );
  await reject(
    command(
      "email",
      "resend",
      { recipient: "attacker@example.test" },
      mails.items[0].id,
    ),
    /ADMIN_INVALID_INPUT/,
  );
  check(
    (await command("email", "resend", {}, mails.items[0].id)).result.status ===
      "queued",
  );
  await reject(command("email", "resend", {}, randomUUID()), /ADMIN_NOT_FOUND/);
  check(
    (
      await query("select public.beta_submit($1,$2) result", [
        {
          email: "APPLICANT@example.test",
          name: "Changed",
          useCase: "Regression",
        },
        "a".repeat(64),
      ])
    )[0].result.id === app.id,
  );
  await query("select public.beta_submit($1,$2)", [
    { email: "applicant@example.test", name: "Local", useCase: "Regression" },
    "a".repeat(64),
  ]);
  await reject(
    query("select public.beta_submit($1,$2)", [
      { email: "applicant@example.test", name: "Local", useCase: "Regression" },
      "a".repeat(64),
    ]),
    /BETA_RATE_LIMITED/,
  );
  // Concurrent duplicate commands each use an independent PostgreSQL connection.
  const concurrentRequest = randomUUID();
  const duplicates = await Promise.all(
    Array.from({ length: 8 }, () =>
      parallel((c) =>
        invoke(
          c,
          "entitlements",
          "grant",
          { tier: "pro", days: 1 },
          user,
          concurrentRequest,
        ),
      ),
    ),
  );
  check(
    duplicates.every((r) => r.auditEvent.id === duplicates[0].auditEvent.id),
  );
  await query("reset role");
  check(
    (
      await query(
        "select count(*)::int n from public.admin_audit_events where request_id=$1",
        [concurrentRequest],
      )
    )[0].n === 1,
  );
  const subscription = randomUUID();
  await query(
    "insert into public.subscriptions(id,user_id,provider,provider_environment,provider_subscription_id,provider_customer_id,plan_code,catalog_version,status,current_period_start,current_period_end,provider_updated_at) values ($1,$2,'paddle','sandbox','sub_local','ctm_local','vd.plus.monthly.v1','vd-recurring-v1','active',now()-interval '1 day',now()+interval '29 days',now())",
    [subscription, user],
  );
  await query("select public.billing_rebuild_entitlements($1)", [user]);
  const subscriptionBefore = (
    await query(
      "select to_jsonb(s) v from public.subscriptions s where id=$1",
      [subscription],
    )
  )[0].v;
  check(
    (
      await query(
        "select count(*)::int n from public.entitlements where user_id=$1 and source_type='operator_grant' and capability='vd.pro' and status='active'",
        [user],
      )
    )[0].n === 1,
  );
  await query("set role service_role");
  await command("entitlements", "revoke");
  check((await read()).items[0].effectiveTier === "plus");
  await query("reset role");
  assert.deepEqual(
    (
      await query(
        "select to_jsonb(s) v from public.subscriptions s where id=$1",
        [subscription],
      )
    )[0].v,
    subscriptionBefore,
  );
  checks++;
  await query(
    "insert into public.entitlements(user_id,capability,source_type,source_id,status,valid_from,valid_until,reason) values ($1,'vd.plus','legacy_membership','legacy-local','active',now()-interval '1 day',now()+interval '40 days','legacy')",
    [user],
  );
  await query("set role service_role");
  const union = await read();
  await query("reset role");
  await query(
    "insert into public.entitlements(user_id,capability,source_type,source_id,status,valid_from,valid_until,reason) values ($1,'vd.plus','legacy_membership','future-local','active',now()+interval '60 days',now()+interval '100 days','legacy future')",
    [user],
  );
  await query("set role service_role");
  check((await read()).items[0].validUntil === union.items[0].validUntil);
  check(
    new Date(union.items[0].validUntil) >
      new Date(subscriptionBefore.current_period_end),
  );
  await reject(
    command("entitlements", "grant", { source: "testing", validUntil: null }),
    /ADMIN_INVALID_INPUT/,
  );
  await reject(
    command("entitlements", "grant", { source: "promotion", permanent: true }),
    /ADMIN_INVALID_INPUT/,
  );
  await reject(
    command("quotas", "adjust", { unlimited: true }),
    /ADMIN_FORBIDDEN/,
  );
  await command("entitlements", "grant", {
    source: "testing",
    tier: "pro",
    permanent: true,
  });
  check(
    (await query("select public.has_beta_access($1) access", [user]))[0].access,
  );
  const unlimited = await command("quotas", "adjust", { unlimited: true });
  check(unlimited.result.limit === null);
  await command("quotas", "adjust", {
    revokeOverride: unlimited.result.overrideId,
  });
  await reject(
    command("quotas", "adjust", { unlimited: null }),
    /ADMIN_FORBIDDEN/,
  );
  await command("quotas", "adjust", { limit: 2 });
  await command("quotas", "reset");
  const reservations = await Promise.allSettled(
    Array.from({ length: 10 }, () =>
      parallel((c) =>
        c.query("select public.ai_reserve($1,$2,$3,$4,$5)", [
          user,
          randomUUID(),
          "task_advice",
          "fixture",
          "model",
        ]),
      ),
    ),
  );
  check(reservations.filter((r) => r.status === "fulfilled").length === 2);
  await command("quotas", "reset");
  check((await read()).items[0].used === 2);
  check(
    reservations
      .filter((r) => r.status === "rejected")
      .every((r) => r.reason.message === "AI_QUOTA_EXHAUSTED"),
  );
  await query("reset role");
  const pending = await query(
    "select request_id from public.ai_usage_ledger where user_id=$1 and status='reserved'",
    [user],
  );
  await query("set role service_role");
  await query("select public.ai_settle($1,$2,$3,$4)", [
    user,
    pending[0].request_id,
    "failed",
    { errorCode: "PROVIDER_FAILED", latencyMs: 10 },
  ]);
  await query("select public.ai_settle($1,$2,$3,$4)", [
    user,
    pending[1].request_id,
    "succeeded",
    { inputTokens: 12, outputTokens: 4, cachedTokens: 3, latencyMs: 20 },
  ]);
  check((await read()).items[0].used === 1);
  await command("quotas", "reset");
  check((await read()).items[0].used === 0);
  await query("reset role");
  check(
    (
      await query(
        "select count(*)::int n from public.ai_usage_ledger where user_id=$1",
        [user],
      )
    )[0].n === 2,
  );
  // Owner-only read of metadata does not disclose private content; bounds cap oversized content.
  await query(
    "insert into public.tasks(id,user_id,data) select 'bounded-'||n,$1,jsonb_build_object('title',repeat('x',2000),'description',repeat('中',10000)) from generate_series(1,70) n",
    [user],
  );
  await query("set role service_role");
  const bounded = await command("restricted-content", "inspect", scope);
  check(
    bounded.result.items.length <= 50 &&
      Buffer.byteLength(JSON.stringify(bounded.result)) < 250000,
  );
  check(
    bounded.result.items.every(
      (i) => (i.title?.length ?? 0) <= 1000 && (i.content?.length ?? 0) <= 6000,
    ),
  );
  await command("bans", "suspend", { days: 1 });
  await query("reset role");
  await query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await query("set role authenticated");
  check(
    (await query("select public.account_bootstrap() s"))[0].s.accountStatus ===
      "suspended",
  );
  check((await query("select count(*)::int n from public.tasks"))[0].n > 0);
  await reject(
    query(
      "insert into public.tasks(id,user_id,data) values ('blocked-write',$1,'{}')",
      [user],
    ),
    /row-level security/,
  );
  check(
    (await query("update public.tasks set data='{}' returning id")).length ===
      0,
  );
  await query("reset role");
  await query(
    "update public.account_controls set effective_at=now()-interval '2 days',expires_at=now()-interval '1 day' where user_id=$1",
    [user],
  );
  await query("set role service_role");
  check((await read()).items[0].accountStatus === "normal");
  await command("bans", "unban");
  await query("reset role");
  await query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await query("set role authenticated");
  check(
    (await query("select * from public.tasks where user_id=$1", [user]))
      .length === 0,
  );
  await reject(
    query(
      "insert into public.tasks(id,user_id,data) values ('forged-write',$1,'{}')",
      [user],
    ),
    /row-level security/,
  );
  await query("reset role");
  const banRequests=Array.from({length:4},()=>randomUUID());
  const controls=await Promise.all(['suspend','restrict','ban','unban'].map((action,i)=>parallel(c=>invoke(c,'bans',action,{},user,banRequests[i]))));
  check(new Set(controls.map(r=>r.auditEvent.id)).size===4);
  check((await query('select count(*)::int n from public.admin_audit_events where request_id=any($1::uuid[])',[banRequests]))[0].n===4);
  await query('set role service_role');await command('bans','unban');await query('reset role');
  const contestants = Array.from({ length: 6 }, () => randomUUID());
  for (const id of contestants)
    await query(
      "insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())",
      [id, id + "@example.test"],
    );
  await query("set role service_role");
  const group = await command(
    "invitations",
    "create",
    { kind: "group", limit: 2, cohort: "concurrent-cohort" },
    "new",
  );
  const groupHash = createHash("sha256")
    .update(group.result.inviteCode)
    .digest("hex");
  const redeems = await Promise.allSettled(
    contestants.map((id) =>
      parallel((c) =>
        c.query("select public.beta_redeem($1,$2)", [id, groupHash]),
      ),
    ),
  );
  check(redeems.filter((r) => r.status === "fulfilled").length === 2);
  await command("invitations", "disable", {}, group.result.inviteId);
  await reject(
    query("select public.beta_redeem($1,$2)", [owner, groupHash]),
    /INVITE_UNAVAILABLE/,
  );
  await command("invitations", "revoke", {}, group.result.inviteId);
  await reject(
    command("invitations", "enable", {}, group.result.inviteId),
    /INVITE_UNAVAILABLE/,
  );
  const exp = await command(
    "invitations",
    "create",
    { kind: "personal" },
    "new",
  );
  const disabled = await command(
    "invitations",
    "create",
    { kind: "group", limit: 2 },
    "new",
  );
  const disabledHash = createHash("sha256")
    .update(disabled.result.inviteCode)
    .digest("hex");
  await command("invitations", "disable", {}, disabled.result.inviteId);
  await reject(
    query("select public.beta_redeem($1,$2)", [owner, disabledHash]),
    /INVITE_UNAVAILABLE/,
  );
  await command("invitations", "enable", {}, disabled.result.inviteId);
  await command("invitations", "revoke", {}, disabled.result.inviteId);
  await reject(
    query("select public.beta_redeem($1,$2)", [owner, disabledHash]),
    /INVITE_UNAVAILABLE/,
  );
  await query("reset role");
  await query(
    "update public.invite_codes set expires_at=now()-interval '1 second' where id=$1",
    [exp.result.inviteId],
  );
  await query("set role service_role");
  await reject(
    query("select public.beta_redeem($1,$2)", [
      owner,
      createHash("sha256").update(exp.result.inviteCode).digest("hex"),
    ]),
    /INVITE_UNAVAILABLE/,
  );
  await reject(
    query("select public.beta_redeem($1,$2)", [
      user,
      createHash("sha256").update(approval.result.inviteCode).digest("hex"),
    ]),
    /INVITE_OWNER_MISMATCH/,
  );
  check(
    !JSON.stringify(await read("invitations", {})).includes(
      group.result.inviteCode,
    ),
  );
  await query("reset role");
  check(
    (
      await query("select code_hash from public.invite_codes where id=$1", [
        group.result.inviteId,
      ])
    )[0].code_hash === groupHash,
  );
  check(
    (
      await query(
        "select count(*)::int n from public.invite_redemptions where invite_id=$1 and cohort_id is not null",
        [group.result.inviteId],
      )
    )[0].n === 2,
  );
  await query("set role service_role");
  for (let i = 0; i < 10; i++)
    await query("select public.beta_submit($1,$2)", [
      { email: `rate-${i}@example.test`, name: "Local", useCase: "Regression" },
      "b".repeat(64),
    ]);
  await reject(
    query("select public.beta_submit($1,$2)", [
      { email: "rate-11@example.test", name: "Local", useCase: "Regression" },
      "b".repeat(64),
    ]),
    /BETA_RATE_LIMITED/,
  );
  await query("reset role");
  console.log("ADMIN_DATABASE ASSERTIONS " + checks);
  return { owner, user, appId: app.id };
}
