# VisualDeadline architecture audit

**Audit date:** 2026-09-13  
**Scope:** all tracked product source, API handlers, SQL, tests, product documentation, Git metadata, `/workspace`, `/root`, and `/tmp` (to a depth sufficient to identify sibling checkouts/submodules).

## Executive finding

Wayline source is **not available**. There is no Wayline directory, checkout, submodule, remote, branch, package, or readable module in the inspected environment. Accordingly, this change does not claim to migrate Wayline behavior. It documents the boundary needed for a real import and adds a persistence-neutral canonical planning model justified by VD's own duplicated planning representations.

VisualDeadline is a client-heavy, local-first React application with optional Supabase REST sync and four serverless API concerns (AI proxy/intake and already-existing billing checkout/webhook). The execution loop exists in pieces, but is split among the task pressure ranking, goal roadmap suggestions, a vNext Life Planner, Roadmap graph records, Daily Quest generation, and Life Controller biological-state suggestions.

## Runtime architecture

### Frontend

- React + TypeScript, built by Vite; Tailwind is integrated through Vite and substantial utility styling is inline in JSX.
- `src/main.tsx` mounts one monolithic `App` under `ErrorBoundary`.
- `src/App.tsx` (~1,230 lines) owns most persisted state, auth/cloud synchronization, task/goal mutations, achievements, review flows, notification setup, and route/module composition.
- Desktop IA is `home`, `task`, `map`, `social`, `log`, `me`. A separate mobile IA is `today`, `tasks`, `profile`, `settings`, creating two navigation concepts for the same product.
- Browser pathname handling in `App.tsx` exposes privacy and terms documents; primary modules are state-driven rather than URL-routed. There is no router dependency.
- Graph rendering uses a repository-vendored `@xyflow/react` compatibility implementation rather than the upstream package.

### Backend/API

There is no long-running backend application. Vercel-style handlers provide:

- `api/ai.js`: authenticated/guest-rate-limited OpenAI-compatible proxy with request validation.
- `api/intake.js`: multimodal intake request handling.
- `api/billing-checkout.js` and `api/billing-webhook.js`: existing billing implementation. These are explicitly out of scope for consolidation and were not changed.
- `src/lib/supabaseClient.ts`: custom Supabase auth/REST/storage client rather than the Supabase JavaScript SDK.
- `src/lib/cloudSync.ts`: coarse entity synchronization. Tasks/goals/pressure rows are replaced in bulk; life events use append/upsert/delete operations.

### Persistence and data model

The authoritative offline store is browser `localStorage`, addressed through `useLocalStorage`, `src/storage/*`, and the key registry in `src/storage/schema.ts`. Backup envelopes are schema version `0.9` and preserve tasks, goals, pressure, social, life-map, life-controller events, logs, and settings. Roadmaps, Daily Quest/review, reminders, notifications, and vNext planning keys are not all included in that envelope, so backup coverage is incomplete.

Supabase has evolved through additive migrations, while root `supabase-schema.sql` is a destructive clean-install script that only recreates profiles, tasks, goals, and pressure logs. This root schema does not include later notifications, roadmap, billing, multimodal, or life-event migrations and should not be treated as a full current schema. Core tasks and goals are JSONB payloads keyed by text IDs; this eases shape evolution but prevents database-enforced planning relationships.

Current overlapping representations are:

| Concept | Representation(s) | Concern |
| --- | --- | --- |
| Goal/deadline | `Goal.targetDate`; `LifeNode.deadline`/`expectedEndDate`; `Roadmap.goalId` | Multiple status/date vocabularies and IDs |
| Milestone | `Task.milestoneSuggestions`; `LifeNode(layer=milestone)`; `RoadmapNode(type=MILESTONE)`; strings inside `Goal.roadmapSuggestions` | No canonical persisted milestone |
| Task | `Task`; `LifeNode(layer=task)`; `PlannedTask`; Daily Quest items | Plan acceptance can create another task rather than bind one stable entity |
| Dependency | `Task.dependencyIds`; `GoalDependency` with five edge meanings; `RoadmapEdge` with four other edge meanings | Direction and semantics differ by subsystem |
| Execution path | `LifeNode.pathId/predecessorId/mergeTargetId`; `Roadmap` nodes/edges; flat planner sequence | No single path identity tied to progress |
| Recommended action | pressure-ranked `recommendedTasks`; Life Planner `NowView`; Daily Quest; Life Controller `now` | Competing answers to “what now?” |

This change introduces `src/domain/planning` as the canonical vocabulary and a read-only adapter over existing `Goal`/`Task` records. It deliberately does not change persisted records or migrate user data.

## State management

There is no Redux/query/state-machine framework. State is React `useState`/`useMemo` plus `useLocalStorage`; `App` coordinates synchronization through effects and refs. Domain-pure logic exists in pressure utilities, Daily Quest, life-controller modules, life views, and planners, but components still contain important conversion and replanning behavior. vNext plan/nodes/dependencies/resources/events use component-local literal storage keys rather than the central registry.

## Authentication

`useSupabaseAuth` wraps the custom Supabase client and owns session initialization, sign-in/sign-up/resend/sign-out. Guests remain supported with local storage; signed-in users can sync selected data. RLS policies scope records to `auth.uid()`. Authentication is not rewritten here, per product scope.

## AI functionality

- Shared `aiClient` supports cloud proxy and developer-key modes/provider defaults.
- AI task intake converts natural language/multimodal input into task drafts.
- Task analysis and review generate displayed/stored AI artifacts.
- Goal roadmap generation produces string suggestions, not canonical milestones/tasks/dependencies.
- `ConfiguredPlannerProvider` asks an AI for `PlanningResult`, then runs a deterministic validator. The visible `LifeOSPlanner` currently uses only `planSevenDays`, not that provider.
- Prompt parsing mostly validates top-level presence, not a full runtime schema. AI output must remain advisory until stronger validation and stable IDs exist.

## Notifications, analytics, and payments

- Browser reminders and site notifications are coordinated in `App`; `NotificationCenter` is present in desktop navigation. A Supabase notifications migration exists, but client persistence is primarily local.
- Analytics are local derivations: `lifeStats`, behavior analytics, pressure analytics/history, health metrics, Daily Quest, and weekly reports. There is no external product analytics SDK found.
- Billing already includes client membership state, checkout UI/service, webhook/API handlers, SQL migration, and nav placement. It is out of scope and must remain isolated from planning consolidation.

## Experimental, duplicate, and low-confidence surfaces

1. **Life OS Planner (`src/components/life-planner`, `src/types/lifePlanning.ts`)** is a substantial experiment already aiming at Wayline-like concepts, but stores its graph separately and projects legacy data at render time.
2. **Roadmap system** has both an AI string-roadmap embedded in `Goal` and generic `Roadmap`/node/edge types plus SQL. `RoadmapCanvas.tsx` and `RoadmapGenerator.tsx` are thin placeholders; cloud sync does not load/save roadmap tables.
3. **Life Map path graph** and generic Roadmap graph duplicate route visualization concepts.
4. **Daily Quest** duplicates current-action selection and has separate mobile-first execution state.
5. **Life Controller** recommends sleep/meals independently of task execution. It is tested and internally coherent but currently competes for “NOW” semantics.
6. **Social graph and achievements** are broad Life OS features not essential to deadline execution. They are functioning enough to preserve, but candidates for Labs/non-primary navigation.
7. `src/services/tasks/progress.ts` only re-exports a helper and `LifeMapPage`/roadmap wrapper files are minimal; they add indirection but are not harmful dead code.
8. Demo life-node/dependency data is defined but no production import was found. It appears abandoned or documentation-only.
9. `Goal.linkedTaskIds` and `Task.linkedGoalIds` duplicate relationship ownership and can drift.
10. The root README and roadmap still position VD as a broad “life operating system,” which conflicts with the newly supplied execution-system direction.

No safe claim can be made that a database column/table is unused solely from client references: webhook/administrative integrations may access it externally. No migrations or user data are deleted.

## Build and test infrastructure

- `npm run typecheck`: strict TypeScript project build with unused checks.
- `npm run build`: typecheck followed by Vite production build.
- `npm test`: compiles domain modules to `tests/.compiled`, then runs Node test scenarios.
- GitHub Actions deploys the app, but there is no lint script, formatter, browser test, component test, API test, migration runner, or complete SQL validation command.
- `tests/lifePlanner.mjs` exists but was not wired into `npm test` before this audit, leaving its planner scenarios outside the default test command.
- Supabase has one manual RLS SQL test for life events.

## Architecture decisions for consolidation

1. **Stored data remains untouched.** Canonical records are initially projections, making rollback trivial and preserving local/cloud JSON.
2. **One vocabulary, multiple temporary adapters.** Goal, deadline, milestone, task, dependency, and execution path now have explicit domain interfaces under `src/domain/planning`; old graph/plan types are migration inputs, not future authorities.
3. **Dependency direction is explicit.** `prerequisiteTaskId -> dependentTaskId` avoids ambiguous `source`/`target` interpretation.
4. **Recommendation is deterministic and dependency-safe.** The first primitive produces one actionable task, with a transparent deadline-risk bucket. It does not yet replace the UI ranker because UX replacement needs real Wayline comparison and migration design.
5. **No SQL migration yet.** A schema migration before inspecting Wayline would prematurely freeze assumptions.

## Known risks

- Date-only strings are parsed by JavaScript; future risk calculation needs an explicit user timezone/end-of-day policy.
- Existing dependency IDs are assumed to point from a task to its prerequisites; this matches planner usage but has never been database-constrained.
- Projection emits empty milestones because current milestone sources are suggestions or independent graph nodes without stable correspondence.
- Multiple recommendation surfaces remain visible. Removing them now would be destructive and premature.
- Bulk cloud replacement creates conflict/lost-update risk when multiple devices edit concurrently.
- Backup/schema and clean-install SQL drift need dedicated remediation.
