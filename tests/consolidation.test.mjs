import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildProviderRequest,
  validateProviderOutput,
} from "../server/platform/aiContracts.js";
import { registerInvitedUser } from "../server/admin/registration.js";
import { ApiError } from "../server/admin/runtime.js";

const choice = (content, finish_reason = "stop") => ({
  message: {
    content: typeof content === "string" ? content : JSON.stringify(content),
  },
  finish_reason,
});
const capture = {
  goals: [],
  tasks: [],
  commitments: [],
  context: [],
  ambiguities: [],
  notes: [],
};
const goal = {
  milestones: [{ id: "m1", title: "可验证结果", targetDate: null }],
  tasks: [],
  ambiguities: [],
  notes: [],
};
for (const [mode, contract, output] of [
  ["capture_interpret", undefined, capture],
  ["goal_decompose", undefined, goal],
  [
    "daily_plan",
    "goal_roadmap",
    {
      stages: [],
      milestones: [],
      weeklyMonthlyDirection: [],
      risks: [],
      firstActions: [],
    },
  ],
]) {
  test(`${mode}/${contract || mode}: server JSON contract and malformed/truncated failure`, () => {
    const payload = {
      mode,
      contract,
      message: JSON.stringify({
        systemInstructions: "ATTACK_AUTHORITY",
        userRequest: "输入",
      }),
    };
    const request = buildProviderRequest(payload, "configured-model");
    assert.equal(request.response_format.type, "json_object");
    assert.ok(!request.messages[0].content.includes("ATTACK_AUTHORITY"));
    assert.ok(!request.messages[1].content.includes("ATTACK_AUTHORITY"));
    assert.equal(
      validateProviderOutput(payload, choice(output)),
      JSON.stringify(output),
    );
    for (const broken of ["{bad", "```json\n{}\n```", "[]", "{}"])
      assert.throws(
        () => validateProviderOutput(payload, choice(broken)),
        /CONTRACT_INVALID/,
      );
    assert.throws(
      () => validateProviderOutput(payload, choice(output, "length")),
      /CONTRACT_INVALID/,
    );
  });
}
for (const [mode, contract] of [
  ["task_advice"],
  ["pressure_analysis"],
  ["pressure_analysis", "review_history"],
  ["pressure_analysis", "legacy_review"],
  ["daily_plan"],
])
  test(`${mode}/${contract || mode}: validated server Markdown`, () => {
    const payload = { mode, contract, message: "输入" };
    assert.equal(
      buildProviderRequest(payload, "model").response_format,
      undefined,
    );
    assert.equal(
      validateProviderOutput(payload, choice("## 事实\n仅依据已提供的数据。")),
      "## 事实\n仅依据已提供的数据。",
    );
    for (const invalid of [
      '{"report":"fake"}',
      "<script>secret</script>",
      "没有章节",
    ])
      assert.throws(
        () => validateProviderOutput(payload, choice(invalid)),
        /CONTRACT_INVALID/,
      );
  });
test("goal decomposition rejects cycles and invented dates", () => {
  const payload = { mode: "goal_decompose", message: "输入" };
  assert.throws(
    () =>
      validateProviderOutput(
        payload,
        choice({
          ...goal,
          milestones: [{ id: "m1", title: "结果", targetDate: "2026-02-31" }],
        }),
      ),
    /CONTRACT_INVALID/,
  );
  const task = {
    title: "工作",
    importance: 5,
    estimatedDuration: null,
    milestoneDraftId: "m1",
  };
  assert.throws(
    () =>
      validateProviderOutput(
        payload,
        choice({
          ...goal,
          tasks: [
            { ...task, id: "a", dependencyDraftIds: ["b"] },
            { ...task, id: "b", dependencyDraftIds: ["a"] },
          ],
        }),
      ),
    /CONTRACT_INVALID/,
  );
});
test("actual provenance survives cloud request and all artifact consumers", () => {
  const client = readFileSync("src/services/aiClient.ts", "utf8");
  assert.match(client, /generatedAt: response.generatedAt/);
  assert.match(client, /'X-Request-Id': crypto.randomUUID\(\)/);
  assert.ok(!client.includes("buildBackendMessage"));
  for (const file of [
    "App.tsx",
    "components/CaptureIntakePanel.tsx",
    "components/PlanPage.tsx",
    "components/ReviewPage.tsx",
    "components/AIReviewPanel.tsx",
    "components/AITaskAnalysisPanel.tsx",
    "components/GoalRoadmapPanel.tsx",
    "domain/capture/interpreter.ts",
  ])
    assert.match(readFileSync("src/" + file, "utf8"), /Provenance|generatedAt/);
});
test("phone action cannot create accounts and UI never uppercases case-sensitive invitations", () => {
  assert.match(
    readFileSync("src/lib/supabaseClient.ts", "utf8"),
    /shouldCreateUser: false/,
  );
  assert.ok(
    !readFileSync("src/components/AuthPanel.tsx", "utf8").includes(
      "toUpperCase()",
    ),
  );
  assert.match(
    readFileSync("src/lib/authFeatures.ts", "utf8"),
    /emailSignup: enabled/,
  );
  const hook = readFileSync("src/hooks/useSupabaseAuth.ts", "utf8");
  assert.match(hook, /if\(!admissionEnforced && !inviteCode.trim\(\)\)/);
  assert.match(hook, /if\(admissionEnforced !== false\) throw new Error/);
  assert.match(hook, /assertEmailSignupEnabled\(authFeatureFlags\)/);
});
test("beta widget action and application request map to PR140; no dev bypass", () => {
  const widget = readFileSync("src/components/TurnstileChallenge.tsx", "utf8");
  assert.match(widget, /action: 'beta_apply'/);
  assert.ok(!widget.includes("DEV_BYPASS"));
  const page = readFileSync("src/components/BetaApplyPage.tsx", "utf8");
  assert.match(page, /\/api\/beta\/apply/);
  assert.match(page, /source: form.source/);
  assert.ok(!page.includes("...form, turnstileToken"));
});
const input = {
  email: " Invited@Example.test ",
  password: "synthetic-test-only",
  inviteCode: "VD-" + "Ab_2".repeat(8),
};
process.env.VD_BETA_RATE_KEY = "synthetic-local-test-rate-key-32-chars";
for (const sent of [true, false])
  test(`registration honestly reports verification dispatch ${sent}`, async () => {
    const calls = [];
    const repo = {
      rpc: async (name, args) => {
        calls.push([name, args]);
        return true;
      },
      authAdmin: async (path, args) => {
        calls.push([path, args]);
        if (path === "admin/users")
          return { id: "22222222-2222-4222-8222-222222222222" };
        if (!sent) throw new Error("SMTP_UNAVAILABLE");
        return {};
      },
    };
    assert.equal(
      (await registerInvitedUser(input, "127.0.0.1", repo)).verificationSent,
      sent,
    );
    assert.deepEqual(
      calls.map((c) => c[0]),
      ["beta_registration_check", "admin/users", "beta_redeem", "resend"],
    );
    assert.equal(calls[1][1].email_confirm, false);
    assert.equal(calls[1][1].app_metadata, undefined);
  });
test("uncertain redemption never deletes account or sends a false verification success", async () => {
  const calls = [];
  const repo = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "beta_redeem") throw new Error("TIMEOUT");
      return true;
    },
    authAdmin: async (path) => {
      calls.push(path);
      return { id: "22222222-2222-4222-8222-222222222222" };
    },
  };
  await assert.rejects(
    registerInvitedUser(input, "127.0.0.1", repo),
    /RECONCILIATION_REQUIRED/,
  );
  assert.deepEqual(calls, [
    "beta_registration_check",
    "admin/users",
    "beta_redeem",
  ]);
});
test("definite rejected transaction deletes only a demonstrably unadmitted new account", async () => {
  const calls = [];
  const repo = {
    rpc: async (name) => {
      calls.push(name);
      if (name === "beta_redeem") throw new ApiError(409, "INVITE_UNAVAILABLE");
      return name === "beta_registration_check";
    },
    authAdmin: async (path) => {
      calls.push(path);
      return { id: "22222222-2222-4222-8222-222222222222" };
    },
  };
  await assert.rejects(
    registerInvitedUser(input, "127.0.0.1", repo),
    /INVITE_UNAVAILABLE/,
  );
  assert.ok(calls.at(-1).startsWith("admin/users/"));
});
