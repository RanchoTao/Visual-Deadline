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
import { owner, user, key } from "./adminDatabase.mjs";
const internal = "local-internal-test-token-32-characters";
const service = "local-service-test-token";
export async function runAdminIntegration(db, cluster) {
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
      const body = JSON.parse(raw || "{}");
      const token = req.headers.authorization?.replace(/^Bearer /, "");
      if (url.pathname === "/chat/completions") {
        assert.ok(
          (
            await db.query(
              "select count(*)::int n from public.ai_usage_ledger where user_id=$1 and status='reserved'",
              [user],
            )
          ).rows[0].n > 0,
          "Reservation precedes provider call",
        );
        if (providerFails)
          return json(
            { error: { message: "PRIVATE_PROVIDER_ERROR_SENTINEL" } },
            502,
          );
        return json({
          choices: [{ message: { content: "本地测试回复" } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 4,
            prompt_cache_hit_tokens: 3,
          },
        });
      }
      if (url.pathname.startsWith("/auth/")) {
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
            email_confirmed_at: "2026-09-28T00:00:00Z",
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
    check(
      (await callBackend("/api/beta/apply", { email: "local@example.test" }))
        .status === 404,
    );
    process.env.VD_PUBLIC_BETA_APPLICATIONS_ENABLED = "true";
    check(
      (await callBackend("/api/beta/apply", { email: "local@example.test" }))
        .status === 503,
    );
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
    const ai = await callBackend(
      "/api/ai",
      { mode: "task_advice", message: "fixture" },
      { Authorization: "Bearer " + testToken },
    );
    check(ai.status === 200);
    check((await ai.json()).content === "本地测试回复");
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
      return receipt;
    }
    const invitation = await mutate(
      "invitations",
      "create",
      { kind: "group", limit: 1 },
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
