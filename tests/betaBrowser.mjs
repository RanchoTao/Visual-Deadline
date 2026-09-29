// Real local React page with a synthetic Turnstile widget, not Cloudflare acceptance.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import applyHandler from "../api/beta/apply.js";

const widget = `window.turnstile={render(container,options){if(options.action!=='beta_apply')throw Error('wrong action');const button=document.createElement('button');button.type='button';button.textContent='完成本地人机验证';button.onclick=()=>options.callback('fixture-turnstile-token');container.appendChild(button);return 'fixture';},remove(){}};`;
export async function runBetaBrowser(db) {
  let checks = 0;
  const run = (...args) =>
    new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === "win32" ? "cmd.exe" : "npx",
        process.platform === "win32"
          ? [
              "/d",
              "/s",
              "/c",
              "npx",
              "--yes",
              "agent-browser@0.38.1",
              "--session",
              "vd-consolidation",
              ...args,
            ]
          : [
              "--yes",
              "agent-browser@0.38.1",
              "--session",
              "vd-consolidation",
              ...args,
            ],
        { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "";
      child.stdout.on("data", (d) => (output += d));
      child.stderr.on("data", (d) => (output += d));
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Browser command timed out"));
      }, 45000);
      child.on("error", reject);
      child.on("exit", (code) => {
        clearTimeout(timer);
        code === 0 ? resolve(output) : reject(new Error(output));
      });
    });
  const vite = await createViteServer({
    configFile: false,
    envFile: false,
    plugins: [
      react(),
      tailwind(),
      {
        name: "test-only-widget",
        transformIndexHtml() {
          return [
            { tag: "script", children: widget, injectTo: "head-prepend" },
          ];
        },
      },
    ],
    define: {
      "import.meta.env.VITE_TURNSTILE_SITE_KEY":
        JSON.stringify("fixture-site-key"),
    },
    server: { middlewareMode: true, hmr: false },
    appType: "spa",
  });
  const server = createServer((req, res) =>
    req.url === "/api/beta/apply"
      ? void applyHandler(req, res)
      : vite.middlewares(req, res),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const root = "http://127.0.0.1:" + server.address().port;
    await run("open", root + "/beta/apply");
    let snapshot = await run("snapshot", "-i");
    assert.ok(snapshot.includes("申请内测"));
    checks++;
    await run("find", "label", "姓名 / 昵称", "fill", "本地浏览器申请");
    await run("find", "label", "邮箱", "fill", "browser-beta@example.test");
    await run("find", "label", "身份", "fill", "研究者");
    await run(
      "find",
      "label",
      "你希望用 Visual Deadline 解决什么问题？",
      "fill",
      "本地端到端验证",
    );
    await run("find", "role", "checkbox", "check");
    await run("find", "role", "button", "click", "--name", "完成本地人机验证");
    await run("find", "role", "button", "click", "--name", "申请内测");
    await run("wait", "--text", "申请已提交");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from public.beta_applications where email_normalized='browser-beta@example.test'",
        )
      ).rows[0].n,
      1,
    );
    checks++;
    assert.ok((await run("get", "text", "body")).includes("申请已提交"));
    checks++;
    console.log("BETA_BROWSER ASSERTIONS " + checks);
  } finally {
    await run("close").catch(() => {});
    await vite.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
