import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { readFileSync } from "node:fs";
import {
  authenticateOperator,
  constantEqual,
  readBody,
  databaseError,
  authenticateUser,
  rpc,
} from "../server/admin/runtime.js";
const token = "synthetic-local-test-token-32-characters";
const headers = {
  authorization: "Bearer " + token,
  "x-admin-actor": "11111111-1111-4111-8111-111111111111",
  "x-admin-role": "owner",
  "x-admin-contract": "vd-admin-v1",
};
test("void authority RPCs accept no-content responses without hiding invalid command receipts", async () => {
  const env = {
    NODE_ENV: "test",
    SUPABASE_URL: "http://127.0.0.1",
    SUPABASE_SERVICE_ROLE_KEY: "fixture",
  };
  assert.equal(
    await rpc(
      "admin_assert_operator",
      {},
      env,
      async () => new Response(null, { status: 204 }),
    ),
    null,
  );
  await assert.rejects(
    rpc(
      "admin_command",
      {},
      env,
      async () => new Response(null, { status: 204 }),
    ),
    /AUTHORITY_INVALID_RESPONSE/,
  );
});
test("internal authentication requires token, UUID, role and exact version", () => {
  assert.equal(
    authenticateOperator({ headers }, { VD_ADMIN_API_TOKEN: token }).role,
    "owner",
  );
  for (const patch of [
    { authorization: "Bearer wrong" },
    { "x-admin-actor": "missing" },
    { "x-admin-role": "superuser" },
    { "x-admin-contract": "vd-admin-v2" },
  ])
    assert.throws(() =>
      authenticateOperator(
        { headers: { ...headers, ...patch } },
        { VD_ADMIN_API_TOKEN: token },
      ),
    );
  assert.throws(
    () => authenticateOperator({ headers }, {}),
    /ADMIN_NOT_CONFIGURED/,
  );
  assert.ok(constantEqual(token, token));
  assert.ok(!constantEqual(token, token + "x"));
});
test("bounded parser measures UTF-8 bytes for streamed and pre-parsed requests", async () => {
  await assert.rejects(
    readBody({ body: { x: "中".repeat(30) } }, 50),
    /BODY_TOO_LARGE/,
  );
  await assert.rejects(
    readBody(Readable.from(['{"x":"', "中".repeat(30), '"}']), 50),
    /BODY_TOO_LARGE/,
  );
  await assert.rejects(readBody(Readable.from(["{bad}"])), /INVALID_JSON/);
  assert.deepEqual(await readBody(Readable.from(['{"x":1}'])), { x: 1 });
});
test("database failures are sanitized and conflicts keep their semantics", () => {
  assert.equal(
    databaseError({ message: "ADMIN_IDEMPOTENCY_CONFLICT" }).status,
    409,
  );
  assert.equal(databaseError({ message: "AI_QUOTA_EXHAUSTED" }).status, 429);
  assert.equal(
    databaseError({ message: "secret provider payload" }).message,
    "AUTHORITY_UNAVAILABLE",
  );
});
test("product authentication verifies Auth identity and confirmation, ignoring metadata", async () => {
  const env = {
    SUPABASE_URL: "http://127.0.0.1",
    SUPABASE_ANON_KEY: "fixture",
  };
  const request = { headers: { authorization: "Bearer fixture" } };
  const actor = {
    id: headers["x-admin-actor"],
    email_confirmed_at: "2026-09-28",
    user_metadata: { role: "owner" },
  };
  assert.equal(
    (
      await authenticateUser(
        request,
        env,
        async () => new Response(JSON.stringify(actor)),
      )
    ).id,
    actor.id,
  );
  await assert.rejects(
    authenticateUser(
      request,
      env,
      async () =>
        new Response(JSON.stringify({ ...actor, email_confirmed_at: null })),
    ),
    /UNCONFIRMED_ACCOUNT/,
  );
  await assert.rejects(
    authenticateUser(
      request,
      env,
      async () => new Response("{}", { status: 401 }),
    ),
    /UNAUTHENTICATED/,
  );
});
test("all existing product user write APIs independently enforce account control", () => {
  for (const path of [
    "ai",
    "intake",
    "billing-checkout",
    "billing-subscription-checkout",
    "billing-portal",
  ])
    assert.match(
      readFileSync(new URL("../api/" + path + ".js", import.meta.url), "utf8"),
      /assertAccountNormal\(user\.id\)/,
    );
});
