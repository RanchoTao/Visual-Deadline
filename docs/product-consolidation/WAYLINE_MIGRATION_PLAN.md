# Wayline migration plan

## Source-availability gate

**Status: blocked on source delivery.** The audit found no Wayline checkout, submodule, sibling directory, Git remote/branch, dependency, archive, or readable source module. Therefore there are no actual Wayline files that can honestly be classified or mapped in this revision. Invented file names or feature behavior would violate the migration requirement.

The concrete import manifest is in [WAYLINE_IMPORT_REQUIREMENTS.md](./WAYLINE_IMPORT_REQUIREMENTS.md). Once supplied, replace the inventory below with a file-by-file analysis before moving code.

## VisualDeadline destinations already established

These are actual VD destinations against which supplied Wayline modules will be evaluated:

| Capability | VD destination | Current VD source to reconcile |
| --- | --- | --- |
| Canonical goal/deadline/milestone/task/dependency/path vocabulary | `src/domain/planning/model.ts` | `src/types/task.ts`, `src/types/lifePlanning.ts`, `src/types/roadmap.ts` |
| Backward-compatible projection | `projectLegacyPlanningModel` in `src/domain/planning/model.ts` | `src/lib/lifeViews.ts` projections |
| Current action and deadline risk | `src/domain/planning/recommendation.ts` | `src/utils/taskScoring.ts`, `src/services/planner/lifePlanner.ts`, `src/utils/dailyQuest.ts` |
| Planning/replanning engine | Future modules under `src/domain/planning/` | `src/services/planner/lifePlanner.ts` and component callbacks in `LifeOSPlanner.tsx` |
| Planning UI | `src/components/life-planner/` | `GoalRoadmapPanel`, `PathMap`, timeline, Daily Quest |
| Storage adapters/migrations | `src/storage/` and additive `supabase/migrations/` | JSONB tasks/goals plus vNext local keys |
| Cloud synchronization | `src/lib/cloudSync.ts` | bulk task/goal replacement and separate life events |
| AI plan provider | `src/services/planner/` | `ConfiguredPlannerProvider`, goal/task prompt services |
| Tests | `tests/planningDomain.test.mjs` plus future fixtures/evals | life-controller/planner scenario tests |

## Classification method (must use actual source)

For every supplied Wayline package, route, service, model, migration, prompt, and test:

- **A — migrate substantially as-is:** implementation has no Wayline brand/runtime coupling, fits the canonical model, has tests, and is stronger than the VD equivalent.
- **B — reimplement using VD architecture:** valuable behavior depends on Wayline persistence, framework, auth, transport, or state machinery.
- **C — merge with existing VD feature:** semantics overlap a VD capability and maintaining both would yield two sources of truth.
- **D — discard:** generic task-manager behavior, obsolete experiment, payment/auth coupling, duplicate implementation, untested mock, or behavior outside the core loop.

Each inventory row must include: exact Wayline path and exported symbol; user behavior; dependencies; persisted fields and migrations; test path; classification with evidence; exact VD destination; compatibility/rollback plan; and acceptance tests.

## Provisional capability decisions (not source classifications)

These are product-level targets only and must not be misread as findings about Wayline code:

| Requested capability | Intended treatment after inspection | Reason |
| --- | --- | --- |
| Goal decomposition | C/B | Merge into canonical milestones/tasks; do not retain string-only and graph-only decompositions |
| Execution paths/routes | C | Reconcile `ExecutionPath`, Life Map paths, and roadmap edges into one persisted construct |
| Milestones | B/C | VD lacks a stable milestone record; adopt supplied semantics only after mapping |
| Task dependencies/sequencing | C | Preserve existing `Task.dependencyIds` through an adapter, then migrate to explicit dependencies |
| Planning UX | B/C | Keep one Planning → NOW flow; avoid another top-level Wayline shell |
| Dynamic replanning | A or B, evidence-dependent | Prefer tested deterministic policy; AI may propose but validation must remain local/deterministic |
| Progress tracking | C | `Task.progress` stays user-compatible; consolidate planner events and Daily Quest updates around it |
| Current-action recommendation | C | One recommendation service should replace competing rankers after comparison tests |
| Timeline/path visualization | C | Reuse VD graph/timeline shell if it can accurately render canonical paths |
| AI planning | B/C | Use VD `aiClient` transport and explicit validation; do not import auth/provider secrets |

## Safe first consolidation completed

- Added a persistence-neutral canonical planning model covering all requested entities.
- Added a legacy Goal/Task projection that preserves existing records and materializes explicit dependency direction/default goal paths.
- Added deterministic deadline-risk/current-action selection that excludes unmet dependencies.
- Added domain tests. No Wayline code is claimed, no UI is removed, no stored schema changes, and no auth/payment code is touched.

## Planned stages after source arrives

1. **Inventory and contract tests:** run Wayline tests, capture fixtures for decomposition, route ordering, replanning, and recommendation; complete the actual A/B/C/D table.
2. **Adapters:** map Wayline records into `PlanningModel`; add golden tests comparing source output to VD output without writes.
3. **Persist canonical IDs:** write an additive, idempotent migration with provenance and rollback/export support. Dual-read, canonical-write only after validation.
4. **Engine merge:** select one deterministic planner/risk/recommendation path. Keep AI as proposal generation behind schema validation.
5. **UI merge:** make Home/NOW the single recommendation, Planning the editor, and Path/Timeline projections of the same model.
6. **Deprecation:** hide duplicate surfaces behind Labs, measure/verify data access, then remove code in later PRs without dropping user tables.

## Acceptance criteria for the remaining merge

- A saved goal can be decomposed into ordered milestones and executable tasks with stable IDs.
- Cycles and dangling dependencies are rejected or surfaced, never silently scheduled.
- Exactly one current action is recommended with an inspectable reason, or an explicit “no executable work” state.
- Completing/skipping/postponing the action records progress, recalculates risk, and produces a bounded replan.
- Existing local/cloud Goal and Task data projects without loss, and export/import round-trips all new planning entities.
- Path and timeline render the same task order/dependencies.
- Offline deterministic behavior works without AI; malformed AI plans cannot write data.
