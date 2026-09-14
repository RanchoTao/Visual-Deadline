# Wayline source audit: first VisualDeadline migration

## Evidence boundary

The source is available at `D:\Projects\vd-workspace\wayline`, Git `main` at
`4355fdb3d494e8c5c177b510d84ebfc9f698af1d`. This supersedes the unavailable-source
assumption in PR #117. The source command `npm run test:domain` has 13 passing tests.

Classification: **A** = migrate substantially as-is, **B** = reimplement in VD
conventions, **C** = merge with an existing VD capability, **D** = do not migrate.
No classification means the Wayline product shell should survive as a second product.

| WAYLINE PATH / SYMBOL | BEHAVIOR | VD EQUIVALENT | CLASS | TARGET VD MODULE | MIGRATION STRATEGY | TESTS |
| --- | --- | --- | --- | --- | --- | --- |
| `src/domain/priority/engine.ts`: `urgencyWeight`, `taskPressure`, `priorityScore`, `topTasks`, `heatZoneTasks`, `matrixQuadrant` | One deterministic importance-urgency-v1 engine. Excludes non-actionable, resolved, future-start and dependency-blocked Top 3 candidates. | `src/lib/pressureEngine.ts`, task views and Life Map | C | `src/domain/execution/priority.ts` | Reimplement exact pure semantics over VD adapter records; retain existing VD pressure engine rather than a second UI ranker. | Wayline `scripts/domain.test.ts`; VD `tests/executionDomain.test.mjs` |
| `src/domain/capture.ts`: `materializeCapture` | Confirmed project capture creates one project, one non-actionable parent and executable children. Direct actionable capture creates exactly one task. It retains input/capture provenance and effort. | VD AI intake creates Task drafts but has no shared confirmed execution materializer. | B | `src/domain/execution/capture.ts` | Reimplement pure materialization only. Existing VD transport/UI remains authoritative until a later capture integration PR. | Wayline capture tests; VD capture parity scenarios |
| `src/store/wayline.ts`: `analyzeCapture`, `confirmCapture`, `startTask`, `completeTask`, `applyReviewSuggestion` | Zustand/localStorage orchestration for capture confirmation, lifecycle writes, local fallback and review application. | VD `App.tsx` state/localStorage/cloud sync | D / C | `src/domain/execution/transitions.ts` | Do not import Zustand, local key `wayline-core-v2`, Next route wiring, or PilotDeck client state. Extract only deterministic transitions and suggestion application. | Wayline domain tests; VD transition/review tests |
| `src/domain/review.ts`: `reviewWindow`, `computeReviewStatistics`, `buildReview` | Derives review facts from task timestamps; suggests estimate multiplier or reduced low-importance parallel work, requiring explicit application. | VD Daily Review / planner views | B / C | `src/domain/execution/review.ts` | Reimplement statistics and suggestions; do not replace VD review UI or write paths in this PR. | Wayline review-statistics test; VD review parity scenarios |
| `src/domain/migrations.ts`: `migrateLegacyProject`, `readLegacyStorage` | Converts old `vd-workspace-v1` project/task fields without changing identities; hours become minutes and fractional progress becomes 0–100. | VD legacy normalization in `App.tsx` | B / C | `src/domain/execution/migration.ts` | Keep VD's reader untouched. Provide pure conversion for future import/fixture validation; no new storage key or destructive migration. | Wayline legacy migration test; VD legacy parity scenario |
| `src/domain/models.ts`: `WaylineTask`, `WaylineProject`, capture/review models | Separates project membership, parent task, actionability, status, source and duration. | VD `Task`, `Goal`, `src/types/lifePlanning.ts` | B / C | `src/domain/execution/types.ts`, `adapter.ts` | Add a persistence-neutral execution contract and adapters. Reconcile both VD relationship directions and issue warnings instead of discarding a relation. | VD adapter parity scenario |
| `src/app/api/pilotdeck/understand/route.ts`, `src/lib/ai/*` | Server-side PilotDeck bridge with deterministic fallback and provider metadata. | VD `api/ai.js`, `api/intake.js`, `src/lib/aiClient.ts` | D | none in this PR | Out of scope: transport, keys, auth and provider configuration are not migrated. | Wayline P1–P4 scripts are reference-only |
| `src/components/core/*`, `src/app/page.tsx` | Separate Today / Plan / Review shell and Wayline brand. | VD App, existing planner/task/home surfaces | D | none in this PR | No large UI rewrite and no retained Wayline product concept. Later VD surfaces consume this domain. | Existing VD UI tests/build |

## Adapter policy and information boundary

`adaptVisualDeadlineExecution` converts existing VD records without a persistence
migration. `Goal.linkedTaskIds` and `Task.linkedGoalIds` are unioned; missing IDs and
one-sided links are emitted as `relationshipWarnings`. A task can therefore retain all
known relationships while a later repair UX decides whether to normalize them.

VD does not presently persist Wayline's `actionable`, `parentTaskId`, capture source,
capture ID, completed minutes, or an independent `projectId`. The adapter accepts an
optional metadata sidecar for those fields; absent metadata is explicit (`legacy-vd`,
no parent/capture, primary project derived from reconciled goals), not silently treated
as imported Wayline data. `startDate` maps to `startAfter`, and `estimatedDuration`
maps to minutes.
