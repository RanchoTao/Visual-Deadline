# VisualDeadline simplification plan

## Principle

The primary product must answer: **“What should I work on now in order to hit my important deadlines?”** Classification below is conservative: “deprecate/delete” means staged UI/code retirement after data export and usage verification, never immediate table or migration destruction.

## Feature disposition

| Feature | Classification | Evidence and action |
| --- | --- | --- |
| Tasks, deadlines, progress, completion/archive | **KEEP** | Core execution facts in `Task`; retain backward compatibility and make canonical adapters authoritative. |
| Pressure engine/calibration/history | **KEEP** | Distinctive risk input. Fold its signal into deadline-risk/recommendation rather than maintaining a separate destination experience. |
| Goal records | **KEEP** | Canonical top of loop; resolve bidirectional task links and roadmap-string fields incrementally. |
| Life Planner NOW / rolling plan | **MERGE** | Closest implementation of target loop. Move component-contained conversion/replan logic into `src/domain/planning`; drive it from canonical records. |
| Existing home recommended-task ranking | **MERGE** | Replace with the one canonical recommendation only after parity tests; preserve pressure as an input/explanation. |
| Daily Quest | **MERGE** | Treat as a daily projection/checklist of the accepted execution path, not a separate task/review source. |
| AI Goal Roadmap suggestions | **MERGE** | Parse accepted output into draft canonical milestones/tasks/dependencies; retain original AI artifact for provenance. |
| vNext LifeNode paths and generic Roadmap graphs | **MERGE** | One `ExecutionPath` model, with Map and Timeline as read/edit projections. Do not keep two edge/status taxonomies. |
| Timeline | **KEEP** | Useful deadline/path projection, provided it consumes canonical model rather than its own rows. |
| Logs/review | **KEEP** | Progress feedback and replan evidence belong in the core loop; merge Daily Review, AI Review, and execution events around one event contract. |
| Notifications/deadline reminders | **KEEP** | Useful output of deadline-risk changes; notification delivery should consume canonical risk events. |
| AI task intake/analysis | **KEEP** | Intake reduces capture friction; analysis should propose canonical changes rather than create parallel decomposition strings. |
| Life Controller sleep/meal state | **MOVE TO LABS** | Tested and useful, but biological-state NOW competes with execution NOW. Later expose capacity/safety constraints to planner. |
| Social graph | **MOVE TO LABS** | Broad life-system concept with high UI/data complexity and weak direct role in deadline execution. Preserve storage and cloud profile data. |
| Achievements | **MOVE TO LABS** | Motivation layer is not required for planning correctness; keep data and unobtrusive unlocks while removing primary navigation weight. |
| Health/behavior/life-stat analytics | **MOVE TO LABS** | Retain pure derivations that inform capacity; avoid separate dashboards in primary workflow. |
| Membership/billing | **KEEP, ISOLATE** | Existing commercial infrastructure; no changes in this consolidation. It must not define planning domain behavior. |
| Developer tools | **MOVE TO LABS** | Diagnostic surface should be explicit dev/labs UI, not primary product. |
| Demo life-plan fixtures | **DELETE** | `src/services/planner/demoData.ts` has no production import. Remove in a dedicated cleanup after confirming no docs/build tooling consumes it. |
| `RoadmapCanvas.tsx` and thin `RoadmapGenerator` placeholder | **DEPRECATE** | Generic roadmap flow is not meaningfully implemented. Hide only after canonical Path view covers saved roadmap access. |
| String fields `Task.decomposition`, `stages`, `milestoneSuggestions`, `Goal.roadmapSuggestions` | **DEPRECATE** | Continue reading/exporting them; stop new writes after canonical entities exist. Never erase historic content automatically. |
| Duplicate relation `Goal.linkedTaskIds` | **DEPRECATE** | Choose canonical relationship ownership after source audit; dual-read and repair discrepancies during migration. |
| Separate mobile/desktop IA types | **MERGE** | Use one conceptual Home / Plan / Execute / Review navigation, responsively rendered. |

## Navigation target

A reviewable eventual primary IA is:

1. **Now** — one recommended current action, reason, risk, and progress control.
2. **Plan** — goals, milestones, dependencies, accepted execution path, and replan controls.
3. **Timeline** — deadlines/path/risk projection.
4. **Review** — progress events, outcomes, and plan changes.
5. **Settings** — account, data safety, AI, membership, and a Labs entry.

This plan does not immediately hide current modules because a Wayline implementation comparison and data-access audit are still missing.

## Deletion safeguards

- Do not drop Supabase tables/columns or remove historical migrations.
- Include all canonical entities and deprecated fields in backups before canonical writes ship.
- Instrument or manually audit read/write paths before hiding a surface.
- Provide a dual-read period and an export fixture from each supported legacy schema.
- Make migrations additive/idempotent with provenance (`source`, legacy ID, migration version).
- Remove code only after equivalent data is accessible from the retained flow and tests cover import/rollback.

## Suggested PR sequence

1. Import Wayline and complete actual file-level classification/fixtures.
2. Expand canonical adapters to LifeNode/Roadmap/Wayline and add validation/cycle detection.
3. Centralize storage keys and backup every planning record; add canonical persistence additively.
4. Replace Home, Life Planner NOW, and Daily Quest rankers with one recommendation service.
5. Merge Map/Roadmap/Timeline projections; move Social/Life Controller/Achievements to Labs.
6. After a deprecation window, remove placeholder/demo code and stop writes to legacy string fields.
