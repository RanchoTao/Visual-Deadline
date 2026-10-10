# Visual Deadline roadmap

**As of 2026-10-11 · Early-stage project · Roadmap is not a release commitment**

VD began as a visual deadline-pressure tool. The active product direction is a personal planning and execution workspace: **NOW → TASKS → PLAN → OPS → REVIEW**.

This roadmap separates **code present**, **next validation work**, and **research ideas**. The presence of a component or an acceptance test is not proof that an end-to-end cloud workflow has been deployed and validated.

## 1. Present in the public codebase

| System | Verified source entry points | Limitations |
| --- | --- | --- |
| V2 application shell | `src/components/V2AppShell.tsx` | Five primary workspace destinations; some legacy UI remains. |
| Planning and hierarchy | `src/domain/plan/`, `src/components/PlanPage.tsx` | Still needs real user testing. |
| Tasks and dependencies | `src/domain/execution/`, `src/domain/ops/` | Domain logic is not autonomous agent execution. |
| Scheduling | `src/domain/ops/scheduler.ts` | Scheduling outputs require user review and realistic constraints. |
| Review and history | `src/domain/review/` | Verify retention, persistence and migration in the chosen deployment. |
| Local backup and account paths | `src/components/DataSafetyPanel.tsx`, `src/domain/account/` | Local vs authenticated cloud behavior must be documented and tested separately. |
| Server-backed AI | `api/ai.js`, `docs/ai-backend.md` | Provider keys and deployment required; not a general agent guarantee. |
| Subscription entitlement system | `api/billing-*.js`, `docs/BILLING_RECURRING_V2.md` | Recurring rollout flags default off; live lifecycle acceptance is a separate gate. |

These paths establish that work exists in the repository, not that every area has passed independent hosted acceptance.

## 2. Next: make V2 genuinely useful

### Product experience

- Make NOW/TASKS/PLAN/OPS/REVIEW understandable without reading architecture documents.
- Improve mobile use, visual hierarchy, keyboard flows, form validation and accessibility.
- Demonstrate an end-to-end user journey: capture → plan → execute → review.
- Replace generic placeholder screenshots with captures of the actual shipped build.
- Keep pressure visualization useful without producing needless anxiety.

### Reliability and privacy

- Run `npm run typecheck`, `npm test`, and `npm run build` on releases.
- Test local export/restore and browser cache migration on representative old datasets.
- Independently verify cloud owner isolation, session handling, and safe credential boundaries.
- Clearly document what is browser-local versus cloud-synced and how a user can export data.
- Check and preserve legacy records through backward-compatible transitions.

### Product feedback

- Recruit a small number of real users and measure task capture, return use, and successful reviews.
- Identify the single most useful differentiator over a basic todo list.
- Validate willingness to pay **before** committing to pricing, cloud cost, or heavy administration.

## 3. Later: managed cloud and integrations (conditional)

- Improve managed onboarding, backup, failure recovery and cross-device consistency.
- Perform a real provider sandbox lifecycle before enabling recurring checkout.
- Define explicit entitlement and AI-usage budgets; do not promise unlimited inference.
- Publish stable, permission-scoped integration surfaces (calendar, GitHub, MCP) **after** contracts and security checks.
- Formalize a repeatable reviewed public release process: [PUBLIC_RELEASE_PROCESS.md](./docs/PUBLIC_RELEASE_PROCESS.md).
- Keep pricing and commercial boundaries transparent: [COMMUNITY_AND_CLOUD.md](./docs/COMMUNITY_AND_CLOUD.md).

## 4. Longer-term research and exploration

These are research hypotheses, **not supported product features**:

- Context-aware task decomposition, dynamic reprioritization, and explainable plan changes.
- Long-term memory with explicit data control, retention and forgetting mechanisms.
- Planning with uncertainty, attention limits, dependency risk and recovery constraints.
- User-authorized agents that can execute tasks and verify evidence of completion.
- A richer life graph connecting projects, obligations, resources and goals.
- Scenario models for potential consequences of taking on new commitments.

Success means users make better decisions and complete relevant work—not just that the system generates more plans.

## Historical references

Earlier `v0.x` documentation and local-first pressure/life-graph prototypes remain valuable design history, but should not be mistaken for the current five-view V2 product. See [docs/life-controller/](./docs/life-controller/), [docs/vnext-architecture-audit.md](./docs/vnext-architecture-audit.md), and the repository's prior commits.

## Release posture

VD is independently developed and early-stage. Feature priorities, license strategy for future **owned** code, pricing, and publication cadence may change. Published Apache-2.0 versions retain their existing grants. No paid tier or delivery date is promised here.
