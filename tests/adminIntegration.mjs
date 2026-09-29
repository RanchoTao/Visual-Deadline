// Local Auth/REST transport doubles only; every authority RPC below executes the real migrated PostgreSQL function.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdtempSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import adminHandler from "../api/internal/admin.js";
import aiHandler from "../api/ai.js";
import intakeHandler from "../api/intake.js";
import applyHandler from "../api/beta/apply.js";
import redeemHandler from "../api/beta/redeem.js";
import registerHandler from "../api/beta/register.js";
import { owner, key } from "./adminDatabase.mjs";
const user=randomUUID();
const internal = "local-internal-test-token-32-characters";
const service = "local-service-test-token";
export async function runAdminIntegration(db, cluster) {
  await db.query("insert into auth.users(id,email,email_confirmed_at) values ($1,'user@example.test',now())",[user]);
  await db.query("insert into public.account_controls(user_id,status,reason_code,reason,updated_by) values ($1,'normal','manual','Local integration fixture',$2)",[user,owner]);
  const adminDir = resolve(process.env.VD_TEST_ADMIN_DIR);
  assert.ok(
    existsSync(join(adminDir, ".next", "BUILD_ID")),
    "Build the real Admin repository before integration",
  );
  let checks = 0,
    child,
    logs = "",
    cookie = "",
    providerFails = false;
  let providerInvalid = false;
  const providerRequests = [];
  const sessions = new Map(),
    factors = [];
  const issue = (id = owner, aal = "aal1") => {
    const token =
      "fixture." +
      Buffer.from(
        JSON.stringify({
          sub: id,
          aal,
          exp: Math.floor(Date.now() / 1000) + 3600,
          jti: randomUUID(),
        }),
      ).toString("base64url") +
      ".signature";
    sessions.set(token, { id, aal });
    return token;
  };
  const rpcNames = new Set([
    "admin_assert_operator",
    "admin_read",
    "admin_command",
    "admin_account_status",
    "admin_quota_snapshot",
    "ai_reserve",
    "ai_settle",
    "has_beta_access",
    "beta_redeem",
    "beta_submit",
    "beta_workspace_admitted",
    "beta_registration_check",
    "beta_admission_state",
  ]);
  const transport = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let raw = "";
    for await (const c of req) raw += c;
    const json = (body, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      const body = url.pathname==='/siteverify' ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || "{}");
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (url.pathname === "/chat/completions") {
        providerRequests.push(body);
        assert.ok(
          (
            await db.query(
              "select count(*)::int n from public.ai_usage_ledger where status='reserved'",
              [],
            )
          ).rows[0].n > 0,
          "Reservation precedes provider call",
        );
        if (providerFails)
          return json(
            { error: { message: "PRIVATE_PROVIDER_ERROR_SENTINEL" } },
            502,
          );
        const feature=JSON.parse(body.messages[1].content);
        const structured=body.response_format?.type==='json_object';
        const content=providerInvalid ? '{broken' : !structured ? '## 本地测试回复\n仅依据测试数据。' : feature.mode==='capture_interpret' ? JSON.stringify({goals:[],tasks:[],commitments:[],context:[],ambiguities:[],notes:[]}) : feature.mode==='goal_decompose' ? JSON.stringify({milestones:[{id:'m1',title:'本地结果',targetDate:null}],tasks:[],ambiguities:[],notes:[]}) : JSON.stringify({stages:[],milestones:[],weeklyMonthlyDirection:[],risks:[],firstActions:[]});
        return json({
          model: 'actual-provider-model',
          choices: [{ message: { content }, finish_reason:'stop' }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 4,
            prompt_cache_hit_tokens: 3,
          },
        });
      }
      if(url.pathname==='/siteverify') return json({success:body.response==='fixture-turnstile-token',hostname:'fixture.visualdeadline.test',action:'beta_apply'});
      if (url.pathname.startsWith("/auth/")) {
        if(url.pathname==='/auth/v1/admin/users' && token===service) {
          const id=randomUUID();
          await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,null)',[id,body.email]);
          return json({id,email:body.email});
        }
        if(url.pathname==='/auth/v1/resend' && token===service) return json({});
        if (url.pathname === "/auth/v1/token")
          return body.email === "owner@example.test" &&
            body.password === "fixture-password"
            ? json({ access_token: issue(), expires_in: 3600 })
            : json({}, 401);
        const session = sessions.get(token);
        if (!session) return json({}, 401);
        if (url.pathname === "/auth/v1/user")
          return json({
            id: session.id,
            email:
              session.id === owner ? "owner@example.test" : "user@example.test",
            email_confirmed_at: (await db.query('select email_confirmed_at from auth.users where id=$1',[session.id])).rows[0]?.email_confirmed_at,
            factors: session.id === owner ? factors : [],
          });
        if (url.pathname === "/auth/v1/logout") {
          sessions.delete(token);
          return json({});
        }
        if (url.pathname === "/auth/v1/factors") {
          const f = {
            id: randomUUID(),
            factor_type: "totp",
            status: "unverified",
          };
          factors.push(f);
          return json({
            id: f.id,
            totp: {
              secret: "LOCAL_AUTH_DOUBLE_ONLY",
              qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
            },
          });
        }
        const f = factors.find((f) => f.id === url.pathname.split("/")[4]);
        if (!f) return json({}, 404);
        if (url.pathname.endsWith("/challenge")) {
          f.challenge = randomUUID();
          return json({ id: f.challenge });
        }
        if (body.code !== "123456" || body.challenge_id !== f.challenge)
          return json({}, 400);
        f.status = "verified";
        delete f.challenge;
        return json({ access_token: issue(owner, "aal2"), expires_in: 3600 });
      }
      if (token !== service) return json({}, 401);
      const name = url.pathname.split("/").at(-1);
      if (!rpcNames.has(name)) return json({}, 404);
      const keys = Object.keys(body);
      if (keys.some((k) => !/^p_[a-z_]+$/.test(k))) return json({}, 400);
      const c = cluster.getPgClient("postgres", "127.0.0.1");
      await c.connect();
      try {
        await c.query("set role service_role");
        const result = await c.query(
          `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}`).join(",")}) result`,
          keys.map((k) => body[k]),
        );
        if (["admin_assert_operator", "ai_settle"].includes(name)) {
          res.writeHead(204);
          res.end();
          return;
        }
        return json(result.rows[0].result ?? null);
      } finally {
        await c.end();
      }
    } catch (error) {
      json({ code: error.code, message: error.message }, 400);
    }
  });
  await new Promise((resolve) => transport.listen(0, "127.0.0.1", resolve));
  const transportRoot = "http://127.0.0.1:" + transport.address().port;
  const saved = { ...process.env };
  const originalFetch=globalThis.fetch;
  globalThis.fetch=(url,options)=>originalFetch(String(url)==='https://challenges.cloudflare.com/turnstile/v0/siteverify'?transportRoot+'/siteverify':url,options);
  Object.assign(process.env, {
    NODE_ENV: "test",
    SUPABASE_URL: transportRoot,
    SUPABASE_SERVICE_ROLE_KEY: service,
    SUPABASE_ANON_KEY: "local-public",
    VD_ADMIN_API_TOKEN: internal,
    VD_ADMIN_RECEIPT_KEY: key,
  });
  const server = createServer(async (req, res) => {
    res.status = function (status) {
      this.statusCode = status;
      return this;
    };
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    const handler =
      path === "/api/ai"
        ? aiHandler
        : path === "/api/intake"
          ? intakeHandler
          : path === "/api/beta/apply"
            ? applyHandler
            : path === "/api/beta/register"
              ? registerHandler
              : path === "/api/beta/redeem"
              ? redeemHandler
              : adminHandler;
    await handler(req, res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const backendRoot = "http://127.0.0.1:" + server.address().port;
  const callBackend = (path, body, headers = {}) =>
    fetch(backendRoot + path, {
      method: body ? "POST" : "GET",
      headers: { "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const check = (condition) => {
    assert.ok(condition);
    checks++;
  };
  try {
    const headers = {
      Authorization: "Bearer " + internal,
      "X-Admin-Actor": owner,
      "X-Admin-Role": "owner",
      "X-Admin-Contract": "vd-admin-v1",
    };
    check((await callBackend("/v1/admin/users")).status === 401);
    check(
      (
        await callBackend("/v1/admin/users", null, {
          ...headers,
          Authorization: "Bearer wrong",
        })
      ).status === 401,
    );
    check(
      (
        await callBackend("/v1/admin/users", null, {
          ...headers,
          "X-Admin-Contract": "wrong",
        })
      ).status === 400,
    );
    check(
      (
        await callBackend("/v1/admin/users", null, {
          ...headers,
          "X-Admin-Actor": user,
        })
      ).status === 403,
    );
    check(
      (
        await callBackend("/v1/admin/users", null, {
          ...headers,
          "X-Admin-Role": "admin",
        })
      ).status === 403,
    );
    check(
      (await callBackend("/api/internal/admin/v1/users", null, headers))
        .status === 200,
    );
    check((await (await callBackend('/api/beta/register')).json()).admissionEnforced===false);
    check(
      (await callBackend("/api/beta/apply", { email: "local@example.test" }))
        .status === 404,
    );
    process.env.VD_PUBLIC_BETA_APPLICATIONS_ENABLED = "true";
    check(
      (await callBackend("/api/beta/apply", { email: "local@example.test" }))
        .status === 503,
    );
    Object.assign(process.env,{VD_PUBLIC_BETA_APPLICATIONS_ENABLED:'true',TURNSTILE_SECRET_KEY:'local-test-only',VD_BETA_RATE_KEY:'local-test-rate-key-32-characters',VD_BETA_HOSTNAME:'fixture.visualdeadline.test'});
    check((await callBackend('/api/beta/apply',{name:'Local',email:'pipeline@example.test',useCase:'Local integration',turnstileToken:'wrong'})).status===403);
    check((await callBackend('/api/beta/apply',{name:'Local',email:'pipeline@example.test',useCase:'Local integration',turnstileToken:'fixture-turnstile-token'})).status===202);
    check((await db.query("select count(*)::int n from public.beta_applications where email_normalized='pipeline@example.test'")).rows[0].n===1);
    if(process.env.VD_TEST_BROWSER==='1') await (await import('./betaBrowser.mjs')).runBetaBrowser(db);
    delete process.env.VD_PUBLIC_BETA_APPLICATIONS_ENABLED;
    const testToken = issue(user, "aal1");
    await db.query(
      "update public.account_controls set status='banned',effective_at=now(),expires_at=null where user_id=$1",
      [user],
    );
    check(
      (
        await callBackend(
          "/api/ai",
          { mode: "task_advice", message: "fixture" },
          { Authorization: "Bearer " + testToken },
        )
      ).status === 403,
    );
    check(
      (
        await callBackend(
          "/api/intake",
          { intakeId: randomUUID(), text: "fixture", assets: [] },
          { Authorization: "Bearer " + testToken },
        )
      ).status === 403,
    );
    await db.query(
      "update public.account_controls set status='normal' where user_id=$1",
      [user],
    );
    Object.assign(process.env, {
      DEEPSEEK_API_KEY: "local-provider-double-only",
      DEEPSEEK_BASE_URL: transportRoot,
    });
    const quotaKey=randomUUID();
    check((await callBackend('/v1/admin/quotas/actions',{action:'adjust',target:user,reason:'Local consolidated AI test allowance',input:{limit:100},requestId:quotaKey},{...headers,'Idempotency-Key':quotaKey})).status===200);
    const ai = await callBackend(
      "/api/ai",
      { mode: "task_advice", message: "fixture" },
      { Authorization: "Bearer " + testToken },
    );
    check(ai.status === 200);
    const result=await ai.json();
    check(result.content.startsWith('## 本地测试回复'));
    check(result.model==='actual-provider-model' && result.provider==='deepseek' && Number.isFinite(Date.parse(result.generatedAt)));
    const usage = (
      await db.query(
        "select * from public.ai_usage_ledger where user_id=$1 order by created_at desc limit 1",
        [user],
      )
    ).rows[0];
    check(
      usage.status === "succeeded" &&
        usage.input_tokens === "12" &&
        usage.output_tokens === "4" &&
        usage.cached_tokens === "3",
    );
    check(usage.model===result.model && usage.generated_at.toISOString()===result.generatedAt);
    for(const payload of [{mode:'capture_interpret'},{mode:'goal_decompose'},{mode:'daily_plan',contract:'goal_roadmap'},{mode:'pressure_analysis',contract:'review_history'}]) {
      const id=randomUUID(),before=providerRequests.length;
      const body={...payload,message:JSON.stringify({systemInstructions:'ATTACK_BROWSER_SYSTEM',userRequest:'fixture'})};
      const auth={Authorization:'Bearer '+testToken,'X-Request-Id':id};
      const response=await callBackend('/api/ai',body,auth);assert.equal(response.status,200,JSON.stringify(payload)+' '+await response.clone().text());checks++;
      const output=await response.json();check(output.model==='actual-provider-model');
      const request=providerRequests.at(-1);check(!JSON.stringify(request.messages).includes('ATTACK_BROWSER_SYSTEM'));
      check(payload.contract==='review_history' ? !request.response_format : request.response_format.type==='json_object');
      check((await callBackend('/api/ai',body,auth)).status===409);
      check(providerRequests.length===before+1);
    }
    providerInvalid=true;
    check((await callBackend('/api/ai',{mode:'capture_interpret',message:'fixture'},{Authorization:'Bearer '+testToken})).status===502);
    providerInvalid=false;
    providerFails = true;
    const failed = await callBackend(
      "/api/ai",
      { mode: "task_advice", message: "fixture" },
      { Authorization: "Bearer " + testToken },
    );
    check(failed.status === 502);
    check(
      !JSON.stringify(await failed.json()).includes(
        "PRIVATE_PROVIDER_ERROR_SENTINEL",
      ),
    );
    check(
      (
        await db.query(
          "select status from public.ai_usage_ledger where user_id=$1 order by created_at desc limit 1",
          [user],
        )
      ).rows[0].status === "failed",
    );
    // The Next process runs production policy. HTTPS origins are mapped solely by this test preloader.
    const tmp = mkdtempSync(join(tmpdir(), "vd-admin-e2e-"));
    const preload = join(tmp, "local-preload.mjs");
    writeFileSync(
      preload,
      `const realFetch=globalThis.fetch;globalThis.fetch=(input,init)=>{let url=String(input);if(url.startsWith('https://auth.example.test'))url=${JSON.stringify(transportRoot)}+url.slice('https://auth.example.test'.length);if(url.startsWith('https://vd.example.test'))url=${JSON.stringify(backendRoot)}+url.slice('https://vd.example.test'.length);return realFetch(url,init);};`,
    );
    const port = 3317,
      origin = "http://localhost:" + port;
    child = spawn(
      process.execPath,
      [
        "--import",
        pathToFileURL(preload).href,
        join(adminDir, "node_modules/next/dist/bin/next"),
        "start",
        "--port",
        String(port),
      ],
      {
        cwd: adminDir,
        env: {
          ...saved,
          NODE_ENV: "production",
          NEXT_TELEMETRY_DISABLED: "1",
          SUPABASE_URL: "https://auth.example.test",
          SUPABASE_PUBLISHABLE_KEY: "local-public",
          ADMIN_OWNER_USER_IDS: owner,
          VD_ADMIN_API_URL: "https://vd.example.test/",
          VD_ADMIN_API_TOKEN: internal,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stdout.on("data", (c) => (logs += c));
    child.stderr.on("data", (c) => (logs += c));
    const call = (path, body, requestId) =>
      fetch(origin + path, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
          ...(requestId ? { "Idempotency-Key": requestId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await call("/login")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await delay(250);
    }
    check(ready);
    const login = await call("/api/auth/login", {
      email: "owner@example.test",
      password: "fixture-password",
    });
    check(login.status === 200);
    check((await login.json()).destination === "/mfa");
    check(
      /HttpOnly/i.test(login.headers.get("set-cookie")) &&
        /Secure/i.test(login.headers.get("set-cookie")) &&
        /SameSite=strict/i.test(login.headers.get("set-cookie")),
    );
    cookie = login.headers.get("set-cookie").split(";")[0];
    const aal1 = cookie;
    check((await call("/api/admin/users")).status === 403);
    const enroll = await call("/api/auth/mfa", { action: "enroll" });
    check(enroll.status === 200);
    const factor = await enroll.json();
    check(
      (
        await call("/api/auth/mfa", {
          action: "verify",
          factorId: factor.factorId,
          code: "000000",
        })
      ).status === 400,
    );
    const verified = await call("/api/auth/mfa", {
      action: "verify",
      factorId: factor.factorId,
      code: "123456",
    });
    check(verified.status === 200);
    cookie = verified.headers.get("set-cookie").split(";")[0];
    check((await call("/dashboard")).status === 200);
    const users = await call("/api/admin/users?id=" + user);
    check(users.status === 200);
    const metadata = await users.json();
    check(
      metadata.items[0].id === user &&
        !JSON.stringify(metadata).includes("PRIVATE_"),
    );
    const settings = await call("/api/admin/settings");
    check(settings.status === 200);
    check((await settings.json()).summary.proGrantSupported === true);
    await db.query(
      "insert into public.beta_applications(email_normalized,name,use_case) values ('admin-e2e@example.test','Admin E2E','Local integration')",
    );
    const appId = (
      await db.query(
        "select id from public.beta_applications where email_normalized='admin-e2e@example.test'",
      )
    ).rows[0].id;
    let mutationCount = 0;
    async function mutate(
      resource,
      action,
      input = {},
      target = user,
      id = randomUUID(),
    ) {
      const before = (
        await db.query("select count(*)::int n from public.admin_audit_events")
      ).rows[0].n;
      const response = await call(
        "/api/admin/" + resource,
        {
          action,
          target,
          reason: "local Admin integration verification",
          input,
        },
        id,
      );
      const receipt = await response.json();
      assert.equal(response.status, 200, JSON.stringify(receipt));
      checks++;
      check(receipt.auditEvent.requestId === id);
      const audits = (
        await db.query(
          "select * from public.admin_audit_events where actor_user_id=$1 and request_id=$2",
          [owner, id],
        )
      ).rows;
      check(audits.length === 1 && audits[0].id === receipt.auditEvent.id);
      check(
        (
          await db.query(
            "select count(*)::int n from public.admin_audit_events",
          )
        ).rows[0].n ===
          before + 1,
      );
      mutationCount++;
      const replay=await call(`/api/admin/${resource}`,{action,target,reason:'local Admin integration verification',input},id);
      check(replay.status===200);
      assert.deepEqual(await replay.json(),receipt);checks++;
      check((await db.query('select count(*)::int n from public.admin_audit_events')).rows[0].n===before+1);
      return receipt;
    }
    const invitation = await mutate(
      "invitations",
      "create",
      { kind: "group", limit: 2 },
      "new",
    );
    check(/^VD-[\w-]{32}$/.test(invitation.result.inviteCode));
    await mutate("beta-applications", "approve-and-email", {}, appId);
    const plus = await mutate("entitlements", "grant", {
      tier: "plus",
      days: 7,
    });
    check(Boolean(plus.result.grantId));
    const pro = await mutate("entitlements", "grant", {
      tier: "pro",
      days: 30,
    });
    check(pro.result.effectiveTier === "pro");
    await mutate("entitlements", "revoke", { grantId: pro.result.grantId });
    check((await (await call('/api/admin/users?id='+user)).json()).items[0].effectiveTier==='plus');
    const sourceRows=(await (await call('/api/admin/entitlements')).json()).items;
    check(sourceRows.some(row=>row.userId===user && row.source==='admin_grant' && row.validUntil && row.id!==user));
    check(sourceRows.every(row=>!('entitlementSources' in row)));
    if(process.env.VD_TEST_ADMIN_COMPAT==='1') {
      const owned=sourceRows.find(row=>row.grantId===plus.result.grantId && row.userId===user);
      check(Boolean(owned));
      await mutate('entitlements','revoke',{grantId:owned.grantId},owned.userId);
      check((await (await call('/api/admin/users?id='+user)).json()).items[0].effectiveTier==='free');
    }
    await mutate("quotas", "adjust", { delta: 7 });
    await mutate("bans", "suspend", { days: 1 });
    await mutate("bans", "unban");
    const auditResponse = await call("/api/admin/audit");
    check(auditResponse.status === 200);
    const auditPage = await auditResponse.json();
    check(auditPage.items.some((a) => a.id === pro.auditEvent.id));
    const redeem = await callBackend(
      "/api/beta/redeem",
      { code: invitation.result.inviteCode },
      { Authorization: "Bearer " + testToken },
    );
    check(redeem.status === 200);
    check((await redeem.json()).inviteId === invitation.result.inviteId);
    const registration=await callBackend('/api/beta/register',{email:'invited-signup@example.test',password:'fixture-password',inviteCode:invitation.result.inviteCode});
    check(registration.status===201);
    check((await registration.json()).verificationSent===true);
    const newId=(await db.query("select id from auth.users where email='invited-signup@example.test'")).rows[0].id;
    check((await db.query('select count(*)::int n from public.invite_redemptions where user_id=$1',[newId])).rows[0].n===1);
    await db.query("update public.beta_admission_policy set enabled=true,grandfather_cutoff=now(),reason='Local rollback-only E2E'");
    check((await (await callBackend('/api/beta/register')).json()).admissionEnforced===true);
    check((await callBackend('/api/ai',{mode:'task_advice',message:'fixture'},{Authorization:'Bearer '+issue(newId)})).status===401);
    await db.query('update auth.users set email_confirmed_at=now() where id=$1',[newId]);
    const admitted=await callBackend('/api/ai',{mode:'task_advice',message:'fixture'},{Authorization:'Bearer '+issue(newId)});
    // Provider deliberately remains failed here; reaching it proves admission while the SQL checks remain real.
    check(admitted.status===502);
    const outsider=randomUUID();
    await db.query("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,'oauth-outsider@example.test',now(),'{\"role\":\"owner\",\"beta\":true}')",[outsider]);
    const callsBefore=providerRequests.length;
    check((await callBackend('/api/ai',{mode:'task_advice',message:'fixture'},{Authorization:'Bearer '+issue(outsider)})).status===403);
    check(providerRequests.length===callsBefore);
    await db.query('update public.beta_admission_policy set enabled=false');
    cookie = aal1;
    check((await call("/api/admin/users")).status === 403);
    cookie = verified.headers.get("set-cookie").split(";")[0];
    check((await call("/api/auth/logout", {})).status === 200);
    check((await call("/api/admin/users")).status === 401);
    check(
      !logs.includes("LOCAL_AUTH_DOUBLE_ONLY") &&
        !logs.includes(internal) &&
        !logs.includes(key),
    );
    console.log(
      "ADMIN_HTTP_E2E ASSERTIONS " +
        checks +
        "; authoritative mutations " +
        mutationCount +
        "; production AAL2 Auth fixture + real PostgreSQL",
    );
  } finally {
    globalThis.fetch=originalFetch;
    if (child) {
      child.kill();
      await Promise.race([
        new Promise((r) => child.once("exit", r)),
        delay(3000),
      ]);
    }
    await new Promise((r) => server.close(r));
    await new Promise((r) => transport.close(r));
    for (const k of Object.keys(process.env))
      if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
