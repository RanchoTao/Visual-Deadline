# Simplified-Chinese UI copy audit

Audited against `origin/main` at `44b816e` before this branch changed product copy. This inventory covers browser-reachable authenticated pages, public/auth surfaces, default notifications, browser-visible service errors, and API JSON errors that are surfaced to ordinary users. Route paths, schema/contracts, provider payloads, and developer-only controls are deliberately outside the translation target.

## Classification key

- **TRANSLATE** — ordinary user-facing copy; replace with natural Simplified Chinese.
- **KEEP_PROPER_NOUN** — product, provider, or protocol name retained as specified.
- **INTERNAL_ONLY** — identifier, enum, route, schema, telemetry, or an unreachable legacy module; do not rename.
- **DEBUG_ONLY** — development-only diagnostics; not rendered in production.

## Browser-reachable copy

| Location | English/mixed copy found | Classification | Disposition |
| --- | --- | --- | --- |
| `src/components/V2AppShell.tsx` | `NOW`, `TASKS`, `PLAN`, `OPS`, `REVIEW`, `WORKSPACE`, `ACCOUNT`, `Primary`, `Subscription`, `Profile & settings`, `Sign out`, `Notifications`, `Unread notifications`, `Primary mobile` | TRANSLATE | Display labels, headings, and aria-labels become `现在 / 任务 / 计划 / 执行 / 回顾`, `工作区`, `账户`, and the required account terminology; routes remain unchanged. |
| `src/components/BillingPage.tsx`, `src/services/billing.ts`, `src/components/MembershipPanel.tsx` | `Subscription & billing`, `Recurring Plus`, `Free`, `vd.plus active`, `Manage subscription`, `Update payment method`, `Cancel / manage billing`, `Recent payments`, `Subscription renewal`, `Subscription payment`, `Legacy one-time Billing v1`, recurring empty/loading/status copy | TRANSLATE | Presentation-only Chinese translations; `vd.plus`, catalog codes, Paddle statuses, and API values remain unchanged. |
| `src/components/NotificationsPage.tsx`, `src/App.tsx` | `ACCOUNT`, `Notifications`, `All notifications`, default system notification title/body | TRANSLATE | Translate visible heading, back action, and system-generated default notification. |
| `src/components/ProfilePage.tsx`, `src/components/DataSafetyPanel.tsx` | `Subscription / Billing`, `JPEG / PNG / WebP`, mixed setting copy | TRANSLATE / KEEP_PROPER_NOUN | Translate surrounding product copy; retain file-format names. |
| `src/components/TaskPage.tsx`, `TaskForm.tsx`, `TaskList.tsx`, `PriorityMap.tsx` | `TASKS`, `Blocked by`, raw lifecycle/deadline labels | TRANSLATE | Translate headers/labels while preserving enum values such as `active` and `completed`. |
| `src/components/PlanPage.tsx`, `OpsPage.tsx`, `ReviewPage.tsx` and their imported panels | `PLAN`, `OPS`, `REVIEW`, raw UI status/type labels | TRANSLATE | Translate browser labels and empty/loading/error states; keep internal status values, IDs, and route paths. |
| `src/components/HomePage.tsx`, `RecommendationCard.tsx`, `MiniTaskMatrix.tsx`, `CaptureIntakePanel.tsx` and imported NOW cards | `Legacy Top 3`, `legacy`, `empty`, and mixed UI labels | TRANSLATE | Translate visible comparison and empty-state copy; retain technical provenance only where it is intentionally user-facing. |
| `src/components/AuthPanel.tsx`, `PublicSite.tsx`, `PublicHome.tsx`, `PrivacyPolicyPage.tsx`, `TermsPage.tsx`, `ErrorBoundary.tsx`, `index.html` | English public/auth navigation, headings, action labels, aria/alt text, title and fallback errors | TRANSLATE | Make public and auth copy Chinese-first. |
| `src/constants/authMessages.ts`, `src/lib/auth*`, `src/lib/supabaseClient.ts`, `src/lib/cloudSync.ts` | Browser-rendered auth/config/sync errors | TRANSLATE | Translate user messages only; retain error codes and configuration keys. |
| `src/services/reviewPrompt.ts`, `taskAnalysisPrompt.ts`, `taskIntakePrompt.ts`, `goals/roadmapPrompt.ts`, `roadmap/roadmapGenerator.ts` | User-output AI instructions and visible fallback messages | TRANSLATE | Require concise Simplified Chinese output without changing provider/API behavior or required JSON keys. |
| `api/billing-*.js`, `api/intake.js`, `api/ai.js` | JSON `error` strings that can reach browser users | TRANSLATE | Translate human-readable error text only; retain status codes and machine `code` fields. |

## Retained proper nouns and protocol text

| Occurrence class | Classification | Reason |
| --- | --- | --- |
| `Visual Deadline`, `VD`, `DeepSeek`, `Paddle`, `Supabase`, `Google`, `GitHub`, `X`, `AI`, `API`, `URL` | KEEP_PROPER_NOUN | Explicit product policy allowlist. |
| `vd.plus`, `vd.plus.monthly.v1`, `vd.plus.annual.v1`, `vd-recurring-v1` | INTERNAL_ONLY when identifiers; KEEP_PROPER_NOUN when shown as an identifier | Billing/catalog contract must not change. |
| `/app`, `/app/tasks`, `/app/plan`, `/app/ops`, `/app/review`, `/settings`, `/billing`, `/notifications` | INTERNAL_ONLY | Route contract. |
| provider statuses, webhook names, event types, enum values, model IDs, JSON keys, SQL/table names | INTERNAL_ONLY | Protocol/schema compatibility. |
| `JPEG`, `PNG`, `WebP`, `JSON`, `CSV`, `OTP` | KEEP_PROPER_NOUN | User-recognizable standard format/acronym. |

## Non-production or unreachable inventory

| Location | Classification | Reason |
| --- | --- | --- |
| `DeveloperToolsPanel.tsx`, `authDebug.ts`, debug console/logger messages | DEBUG_ONLY | Gated by `import.meta.env.DEV` or console-only. |
| historical LifeOS, social, roadmap, log, desktop/mobile shell exports not imported by `src/App.tsx` or `PublicSite.tsx` in the current five-route shell | INTERNAL_ONLY | Not reachable from the current production route inventory; retained without deletion. |
| tests, docs, migration SQL, server billing domain/repository/processor internals | INTERNAL_ONLY | Assertions/protocol evidence, not end-user product copy. |

## Scope guardrails

- No database migration, schema, billing policy, provider configuration, or DeepSeek integration is part of this work.
- Browser-visible labels are translated without changing internal IDs or query/payload values.
- The regression test will scan production UI source for the audited high-signal English phrases and allow legitimate proper nouns and internal identifiers.
