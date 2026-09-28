import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const tools = process.env.VD_TEST_TOOLS_DIR;
if (!tools)
  throw new Error(
    "VD_TEST_TOOLS_DIR must contain embedded-postgres@17.9.0-beta.17 and pg; no remote database accepted",
  );
const { default: EmbeddedPostgres } = await import(
  pathToFileURL(resolve(tools, "node_modules/embedded-postgres/dist/index.js"))
    .href
);
const cluster = new EmbeddedPostgres({
  databaseDir: mkdtempSync(join(tmpdir(), "vd-admin-sql-")),
  user: "postgres",
  password: "local-contract-test-only",
  port: 55440,
  persistent: true,
  postgresFlags: ["-c", "listen_addresses=127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let client;
try {
  await cluster.initialise();
  await cluster.start();
  client = cluster.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  await client.query("set timezone='UTC'");
  await client.query(
    readFileSync("supabase/tests/fixtures/admin_local_bootstrap.sql", "utf8"),
  );
  for (const name of readdirSync("supabase/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await client.query(readFileSync("supabase/migrations/" + name, "utf8"));
    console.log("APPLIED " + name);
  }
  console.log("MIGRATION_CHAIN PASS");
  if (process.env.VD_TEST_PGTAP === "1") {
    await client.query(
      "create extension pgtap with schema extensions; set search_path=public,extensions;",
    );
    let cases = 0;
    for (const name of readdirSync("supabase/tests")
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const results = await client.query(
        readFileSync("supabase/tests/" + name, "utf8"),
      );
      const messages = (Array.isArray(results) ? results : [results]).flatMap(
        (r) =>
          r.rows.flatMap((row) =>
            Object.values(row).filter((v) => typeof v === "string"),
          ),
      );
      assert.ok(
        !messages.some((line) =>
          /^not ok|Looks like you|# No tests/.test(line),
        ),
        name +
          " " +
          messages
            .filter((line) => /^not ok|Looks like you/.test(line))
            .join("\n"),
      );
      cases += messages.filter((line) => /^ok \d+/.test(line)).length;
      console.log("PGTAP PASS " + name);
    }
    console.log("PGTAP ASSERTIONS " + cases);
  }
  await (
    await import("../tests/adminDatabase.mjs")
  ).runDatabaseTests(client, cluster);
  if (process.env.VD_TEST_ADMIN_DIR)
    await (
      await import("../tests/adminIntegration.mjs")
    ).runAdminIntegration(client, cluster);
  if (process.env.VD_TEST_KEEP_DB === "1") {
    console.log("Local test database ready on 127.0.0.1:55440");
    await new Promise(() => {});
  }
} finally {
  await client?.end();
  await cluster.stop().catch(() => {});
}
