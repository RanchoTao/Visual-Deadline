# Current system audit

Audit base: branch point `f88d938` (`main`, equal to `origin/main` after fetch on 2026-09-15). This is a source audit, not a production-state assertion.

## Repository and runtime

- Vite + React + TypeScript single-page application.
- `src/App.tsx` is the composition root and also owns routing, local persistence, cloud hydration, data merging, domain mutation, and most cross-feature coordination.
- Supabase access uses a custom REST/Auth client in `src/lib/supabaseClient.ts`; `@supabase/supabase-js` is not installed.
- Server endpoints are Vercel-style `api/*.js` functions: AI, multimodal intake, billing checkout, and billing webhook.
- Tests currently cover Life Controller, the imported Wayline execution domain, and the Home recommendation comparison.

## Navigation and shell

Desktop primary navigation is `首页 / 任务 / 人生 / 社交 / 数据`, with profile opened from the account control. Mobile is a separate product shell with `首页 / 任务 / 档案 / 设置`.

The divergence is semantic, not merely responsive:

- Desktop 首页 renders `HomePage`.
- Mobile 首页 renders `DailyQuestPage`.
- Desktop 人生 and 数据 have no equivalent mobile primary destination.
- Social is primary only on desktop.
- Settings exists as a mobile-only reminder surface, while desktop settings live inside Profile.

`LifeOSNav` also contains notification, membership modal, account menu, and sync affordances. `ProfilePage` renders another `MembershipPanel`, so billing has two full UI entry points.

The target correction is not a label swap. The final primary destinations are `NOW / TASKS / PLAN / OPS / REVIEW`. Current Task CRUD/matrix/list behavior maps to TASKS. PLAN maps long-term decomposition/Roadmap/Timeline. OPS is a new resource-constrained parallel-work operating surface. Profile/Settings, Billing, and Notifications remain global account surfaces opened from avatar, membership control, and notification bell; none becomes a primary page.

## Home and task execution

`App.tsx` calculates legacy Home recommendations by filtering active Tasks, sorting by `getTaskScore`, and taking three. `HomePage` renders:

- `MiniTaskMatrix`;
- `RecommendationCard`;
- a development-only comparison against `src/domain/execution/homeProjection.ts`.

Life Controller state/plan props are still passed to `HomePage`, but the component does not consume them.

`TaskPage` combines `AITaskCommandBar`, `PriorityMap`, and `TaskList`. The pressure engine is the established VisualDeadline behavior. `PriorityMap`, however, computes a separate mobile Top 5 formula based on urgency plus importance. `DailyQuest` adds a third selection strategy based primarily on deadline, importance, and progress. This creates competing answers to “what next?”

## Canonical and parallel models

| Concern | Current source(s) | Audit finding |
| --- | --- | --- |
| Task | `src/types/task.ts` | Production record with `active/completed/abandoned`, deadlines, importance, progress, optional goal links and planner fields. |
| Goal | `src/types/task.ts` | Production record with task ID links; no first-class Milestone. |
| Execution | `src/domain/execution/*` | Persistence-neutral Wayline-derived model and VD adapter; includes Project/parent/dependencies and richer lifecycle. Currently comparison-only. |
| Planning | `src/types/lifePlanning.ts`, `src/services/planner/*` | Goal layers, dependencies, resources, events, and plan versions; largely namespaced local state. |
| Roadmap | `src/types/roadmap.ts`, Roadmap components | Separate node/edge graph persisted independently from Goal/Task truth. |
| Life Map | `src/lib/lifeViews.ts`, life-map components | Projection plus saved layout/node metadata. Some demo/static timeline data remains. |
| Daily Quest | `DailyQuestPage`, task utilities | Persisted daily projection that copies task selection/status semantics. |
| Life Controller | `src/domain/life-controller/*` | Good event -> derived state -> plan separation. Uses typed `life_events` in cloud and owner-scoped local store. |
| Review/log | `LogPage` | Large derived dashboard: task archive, pressure, life distribution, trends, AI artifacts, achievements, and health placeholders. |

## Persistence inventory

### Browser storage

`src/storage/schema.ts` declares schema version `0.9` and keys for Tasks, Goals, pressure, achievements, profile, onboarding, AI settings/artifacts, Daily Quest/Review, reminders, notifications, roadmaps, Life Map, Life Controller, Social, and rolling backups. Auth session tokens are separately persisted by the custom Supabase client.

The export/backup envelope includes Tasks, Goals, pressure, Social, Life Map, Life Controller, achievements/AI artifacts, and profile/onboarding. It omits:

- Roadmaps;
- Notifications;
- Daily Quest and Daily Review;
- Reminder settings;
- AI settings;
- auth session (correctly excluded, but not documented in the envelope).

The `futureSafe: true` metadata flag therefore overstates current coverage.

### Cloud sync

`src/lib/cloudSync.ts` syncs:

- `tasks`, `goals`, `pressure_logs` as whole entities inside JSONB `data`;
- profile, pressure calibration, onboarding, Social nodes/layout inside profile JSONB;
- Life Controller events through typed columns in `life_events`.

It does not cloud-sync Roadmaps, notifications, Daily Quest/Review, reminders, achievements, AI artifacts, Life Map layout, or planning versions/resources/events.

On sign-in, local and cloud Tasks/Goals/pressure are merged by ID, with cloud winning same-ID conflicts regardless of `updatedAt`. The merged arrays are then saved through `replaceJsonRows`, which deletes every row for the user before re-inserting the full array. This is an implicit guest import with no preview, transaction, deletion tombstone, conflict report, or interruption recovery.

### Database migrations

- Root `supabase-schema.sql` drops and recreates core tables. It is unsafe as a v2 deployment mechanism and must be deprecated.
- Core `tasks`, `goals`, and `pressure_logs` use text IDs and JSONB payloads.
- `profiles` mixes typed identity/display columns with a broad JSONB settings payload.
- Multimodal migrations add `intake_messages`, `intake_assets`, `task_drafts`, and a private bucket.
- Avatar migration adds profile avatar fields and a public bucket.
- Notifications and Roadmaps are normalized tables, but the runtime still keeps those domains local.
- Billing v1 stores one-time orders and fixed-duration membership grants.
- Life Controller is the strongest current migration: typed table, explicit grants, RLS, indexes, and dedicated SQL policy tests.

Schema mismatch already exists: core Goal IDs are text, while `roadmaps.goal_id` is UUID without a foreign key. A v2 ID policy must be settled before relationships are normalized.

## Auth and identity

Before PR G, auth supported email/password signup, sign-in, email verification callback/resend, token refresh, sign-out, and local guest mode. PR G adds independently gated Google, GitHub, X OAuth 2.0 (`x` provider), and phone entry points; identity linking and production guest import remain disabled until their separate gates are approved.

The custom client persists access and refresh tokens in localStorage. This increases the impact of any XSS and makes future OAuth/PKCE/identity-linking behavior costly to own manually. v2 should use the supported Supabase client unless a documented constraint prevents it.

## Billing

Billing v1 has several sound invariants: server-created orders, server-side price mapping, raw-body webhook signature verification, idempotent grant insertion, service-role-only grant RPCs, and no browser-based entitlement grant.

It is not the requested subscription system. Current catalog prices are explicitly one-time; membership is constructed by stacking 1- or 12-month grants. The webhook handles `transaction.completed` and refund adjustments, but not Paddle subscription lifecycle, renewals, pause/past-due/cancel state, plan changes, or customer portal sessions.

## Capture and AI

The task command bar supports one composed text/voice/image/document intake UI. Files upload directly to a private Supabase bucket; `/api/intake` validates session, path ownership, MIME, size, and storage metadata. The server writes intake metadata/drafts, not final Tasks.

The existing confirmation gate is correct: interpreted Tasks are drafts until the user confirms. Current provider support is incomplete: text task compilation exists, while image/document/audio extraction capabilities are represented but not fully implemented. Roadmap AI also creates a draft before save.

AI configuration permits a browser-stored provider key and direct browser provider calls. This should remain a developer-only compatibility path, not the v2 production architecture.

## Consolidation diagnosis

The strongest foundations to retain are the pressure model, confirmation boundary, Life Controller event/state separation, Wayline-derived pure execution domain, additive migrations, and webhook-authoritative entitlement principle.

The primary architecture problem is ownership: navigation, ranking, Task management, long-term planning, runtime operations, roadmap, daily execution, review, storage, and settings evolved in parallel. v2 should unify ownership through adapters and measured migrations, not replace all behavior at once. In particular, TASKS owns generic Task state and OPS owns constrained parallel scheduling; combining those responsibilities would reproduce the current ambiguity.

The audit also does not justify creating the entire target schema before Beta. Current product persistence and safe migration are Beta scope; OPS resource/allocation/window persistence waits for a consuming OPS runtime, and REVIEW event/report persistence waits for the durable REVIEW migration.
