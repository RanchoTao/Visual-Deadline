# Feature migration map

Legend:

- **KEEP** — retain behavior and ownership with small interface cleanup.
- **MERGE** — combine multiple implementations into one canonical capability.
- **MIGRATE** — preserve user value/data while moving ownership or schema.
- **HIDE** — keep code/data but remove from primary product surface.
- **DEPRECATE** — stop new use and remove only after compatibility evidence.
- **DELETE** — remove after all data/behavior gates pass; never first.

## Source-level disposition

| Existing module / subsystem | Current role | Target page / system | Action | Reason | Data risk | Migration dependency | Verification method |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `src/App.tsx` | Routing, stores, sync, mutations, composition | Application shell + services | MIGRATE | Too many ownership boundaries in one component | High: ordering bugs can overwrite data | Repository interfaces and route contract | Characterization tests; diff-scoped extraction; reload/sync E2E |
| `DesktopShell` | Desktop shell | Shared five-page shell | MIGRATE | Must share semantic destinations with mobile | Low | Route contract | Desktop navigation E2E |
| `MobileShell` | Mobile-only Today/Tasks/Profile/Settings product | Shared five-page shell | MIGRATE | Mobile Home is currently a different domain surface | Medium: Daily Quest state | NOW compatibility projection | Mobile navigation E2E at viewport boundary |
| `LifeOSNav` | Primary nav, account, sync, notifications, billing modal | Global nav + ME | MERGE | Navigation and settings/billing are interleaved | Low | Shared route IDs, ME page | Keyboard/mobile/desktop nav tests |
| `MobileBottomNav` | Alternate mobile nav inside desktop shell | Shared navigation component | MERGE | Duplicate navigation contract | Low | Shared route IDs | No duplicate nav at breakpoint |
| `HomePage` | Desktop Home projection | NOW | MIGRATE | Correct destination, incomplete execution contract | Low | Canonical NOW projection | Golden fixture renders same top task |
| `MiniTaskMatrix` | Small Home matrix | NOW summary / OPS link | KEEP | Useful compact pressure visualization | Low | Canonical ranking selector | Snapshot + ranking parity test |
| `RecommendationCard` | Legacy Top 3 cards | NOW queue | MIGRATE | Preserve presentation, replace private data input | Low | Canonical ranking selector | Legacy-vs-canonical golden cases |
| `domain/execution/homeProjection.ts` | Read-only legacy/canonical comparator | Migration diagnostics | KEEP then DEPRECATE | Essential rollout evidence; not a product feature | None | Canonical selector rollout | CI parity thresholds; remove after zero unexplained diffs |
| `pressureEngine.ts` and pressure utilities | Validated VD pressure behavior | Canonical priority service | KEEP | Product-defining behavior to preserve | High if formula changes | Characterization suite | Frozen fixtures around deadline boundaries |
| `domain/execution/priority.ts` | Wayline-derived eligibility/ranking | Canonical priority service | MERGE | Strong dependency/start/remaining-work semantics | Medium | Task adapter and pressure parity | Cross-engine comparison; explainable score components |
| `TaskPage` | Task command bar, matrix, list | OPS | MIGRATE | Becomes operational execution page | Low | Shared route and canonical repository | CRUD E2E and responsive smoke |
| `PriorityMap` matrix | Urgent/important visualization | OPS | KEEP | Core VD mental model | Low | Canonical Task projection | Quadrant golden tests |
| `PriorityMap` mobile Top 5 | Local urgency + importance ranking | NOW/OPS ranking | MERGE | Competes with Home ranking | Medium | Canonical ranking service | Same ordered IDs across surfaces |
| `TaskList` | Task list and archive actions | OPS | KEEP | Core operational view | Low | Canonical lifecycle adapter | CRUD + lifecycle regression tests |
| `TaskForm` | Manual Task create/edit | OPS / global capture | KEEP | Explicit user-authored path | Medium: legacy field semantics | Canonical command adapter | Round-trip every field; old-record fixture |
| `AITaskCommandBar` | AI-assisted task entry | Global Capture + OPS entry | MIGRATE | Capture must be shared, not task-page owned | Medium | Capture envelope and confirmation service | Create nothing before confirm; provenance test |
| `MultimodalComposer` | Text/file/voice/image composition and upload | Global Capture | KEEP | Correct single-composer direction | Medium: orphaned uploads | Capture session lifecycle | MIME/size/abort/retry tests |
| `api/intake.js` | Validates authenticated intake metadata | Capture service | KEEP | Strong server ownership boundary | Medium | Target capture schema | Auth/path/MIME/storage negative tests |
| `types/intake.ts` | Intake and draft contracts | Capture domain | MIGRATE | Needs canonical IDs, versions, provenance, consent | Low | Canonical domain types | Compile and schema-contract tests |
| `domain/execution/capture.ts` | Pure capture materialization | Capture compiler | MIGRATE | Reuse logic but remove Project as canonical output | Low | Goal/Milestone mapping rules | Wayline parity + v2 command fixtures |
| `domain/execution/adapter.ts` | Reconciles VD Goal/Task links | Compatibility anti-corruption layer | KEEP | Exposes one-sided and missing-link defects | None | Canonical entity model | Relationship warning fixtures |
| `domain/execution/migration.ts` | Imports Wayline project/task records | Import adapter | KEEP | Real reference behavior; should remain isolated | Medium if auto-applied | Explicit mapping review | Source fixtures, no-write assertion |
| `DailyQuestPage` | Persisted daily execution surface | NOW compatibility view | MERGE | Valuable ritual, duplicate task selection/state | High: carried/done semantics | NOW projection + Review model | Same task IDs; no copied mutable truth |
| Daily Quest generator | Deadline/importance/progress selection | Canonical priority service | DEPRECATE | Third recommendation formula | Medium | Canonical ranking | Comparison telemetry then removal |
| `DailyReview` state | Daily score/note/corrections | REVIEW record | MIGRATE | Review is durable user observation | Medium | Review schema | Import count/checksum and UI round-trip |
| reminder settings/mobile settings | Local reminder preferences | ME preferences | MIGRATE | Settings need one owner | Low | ME/preferences repository | Permission-state and reload tests |
| `LifeControllerPanel` | Wake/meal/sleep immediate control | NOW contextual module | MIGRATE | Useful only when it changes current execution | Medium: event history | Shared event model | Event/state/plan tests already present plus UI smoke |
| `domain/life-controller/*` | Event -> derived state -> bounded plan | Observation and NOW projection | KEEP | Clean source/derived separation | Low | Unified event repository | Existing 14 tests; timezone and duplicate-event cases |
| `life_events` table/migration | Typed per-user observation log | `execution_events`/observation family | MIGRATE | Preserve events; converge naming/actor/provenance | High | Additive target table and dual-read | Row counts, checksums, RLS cross-user tests |
| `LifeMapPage` | Planner plus collapsed Goal/Roadmap editor | PLAN | MIGRATE | Correct functional destination, fragmented models | High: plan/goal/roadmap links | Canonical Goal/Milestone/Task | Fixture with graph, timeline, accepted plan |
| `LifeOSPlanner` | 7-day planner UI and local plan state | PLAN | MIGRATE | Preserve proposal/accept flow, change inputs/ownership | High: accepted task writes | Plan/version schema and canonical commands | Reject causes zero writes; accept produces exact diff |
| `services/planner/lifePlanner.ts` | Deterministic plan/validator + optional provider | Planner service | KEEP | Good constraints and explicit warnings | Medium | Canonical resource/dependency adapters | Deterministic constraint suite |
| `types/lifePlanning.ts` | Parallel planning domain | Canonical model + plan DTOs | MERGE | Several types are target-ready but duplicate Task/Goal levels | Medium | Canonical type ADR | Type-level fixtures and adapters |
| `GoalRoadmapPanel` | Goal CRUD and AI roadmap entry | PLAN Goal editor | MIGRATE | Goal editing belongs in PLAN | Medium | Canonical Goal/Milestone repository | CRUD/link round-trip |
| `RoadmapGenerator` | Draft-first AI graph generator | PLAN proposal generator | MIGRATE | Preserve confirmation, emit canonical candidates | High: graph-to-entity mapping | Capture/proposal and plan version model | No writes before accept; mapping preview |
| `RoadmapCanvas` | Interactive graph presentation | PLAN graph projection | KEEP | Valuable visualization, no need as source of truth | Low | Canonical graph projection | Visual smoke and ID/reference test |
| Roadmap localStorage and SQL tables | Separate graph truth | Compatibility store -> canonical relations | MIGRATE then DEPRECATE | Duplicates Goal/Task hierarchy; current goal ID type mismatch | Critical | ID strategy, backfill, unresolved-node UI | Dry-run report, referential checks, export parity |
| `lifeViews.ts` / `PathMap` | Builds map projections and saved layouts | PLAN projections | KEEP | Projection approach is appropriate | Medium: saved custom nodes | Canonical read model + layout metadata | Projection fixtures and layout reload |
| static life timeline demo data | Hard-coded life stages/projects | Labs/demo only | HIDE then DELETE | Must not appear as user truth | Low | Real timeline projection | Production bundle/page contains no demo entities |
| `LogPage` overview/tasks/pressure/life/trends | Multi-tab data center | REVIEW | MIGRATE | Most content belongs to Review | Medium | Event/review projections | Metric characterization and empty-state tests |
| `LogPage` health placeholders | Unbacked health integration promises | Hidden future integration | HIDE | No source data or consent model | Privacy risk | Integration/consent ADR | Not present in primary UI |
| `ActivityLog` | Task archive/event-like display | REVIEW archive | MIGRATE | Currently reconstructs history from mutable Task fields | Medium | Append-only events | Historical fixture remains stable after edits |
| pressure history | JSONB snapshots/manual records | REVIEW observations | MIGRATE | Preserve manual vs derived distinction | High | Target event/measurement schema | Counts, source attribution, recomputation parity |
| `AIReviewPanel`, AI reports/artifacts | Generated reviews and summaries | REVIEW reports | MIGRATE | Keep outputs with model/input/provenance/version | Medium | AI report schema | Traceable input window; invalid output isolation |
| achievements/toasts | Recognition UI and records | REVIEW + global toast | KEEP | Separate from canonical execution truth | Low | Backup/cloud coverage | Reload/export tests |
| `SocialPage` and Social graph | Standalone relationship graph | Labs | HIDE | Outside frozen core loop | High: personal relationship data | Feature flag and complete backup | Primary nav absence; data remains exportable |
| `NotificationCenter` | Local seeded inbox | Global UI + notification service | MIGRATE | Placement is correct; persistence is disconnected | Medium | Notification repository/server producers | Read/unread sync and dedupe tests |
| notifications SQL | Normalized per-user rows | Notification service | KEEP | Suitable base with type cleanup | Medium | Runtime adapter and RLS tests | Cross-user denial, idempotent delivery |
| `ProfilePage` identity fields | Profile editor | ME | MIGRATE | Correct owner; needs identity/preference separation | Medium | Profile schema | Profile round-trip and avatar fallback |
| `MembershipPanel` in Profile | Purchase/status UI | ME subscription section | KEEP | Correct destination | Low | Recurring billing architecture | Billing state matrix UI tests |
| Membership modal in `LifeOSNav` | Duplicate full purchase UI | ME deep link | DEPRECATE | Global nav should not own billing workflow | Low | ME route | Only badge/deep link remains |
| `DataSafetyPanel` / backup | Export/import and rolling backups | ME data controls | MIGRATE | Correct capability, incomplete envelope | Critical | Schema v2 envelope before any data migration | Full key coverage, restore parity, corrupt-import tests |
| `DeveloperToolsPanel` | Browser AI/provider settings | ME Labs/development | HIDE | Provider keys/direct calls are not production UX | Security risk | Server AI configuration | Production-mode absence; secret scan |
| `src/storage/*` | Namespaced local repositories | Compatibility repository | MIGRATE | Must support dual-read, explicit versions, complete export | Critical | Canonical schema and migrator | Golden legacy snapshots; idempotent migrations |
| `src/lib/cloudSync.ts` | JSONB load/merge/delete-and-replace | Sync/import service | DEPRECATE | Whole-user delete/reinsert is unsafe and non-transactional | Critical | Typed schema, per-row upsert/tombstones, import job | Failure injection; no data loss; conflict report |
| custom Supabase Auth client | Email auth/session/REST/storage | Supported Supabase client + identity service | MIGRATE | Missing phone/OAuth/linking; manual security burden | High | Auth rollout and session compatibility | PKCE/OAuth/OTP/refresh/linking E2E |
| `supabase-schema.sql` | Drop/recreate base schema | Historical local bootstrap only | DEPRECATE | Destructive and not a chronological migration | Critical | Baseline migration reconstruction | CI rejects destructive deployment inputs |
| JSONB core tables | Current cloud Task/Goal/pressure truth | Typed canonical tables + legacy payload archive | MIGRATE | Weak constraints/relationships; still contains real data | Critical | Additive target schema and dual-read | Backfill ledger, counts, checksums, referential audit |
| avatar storage | Public avatar bucket and profile path | ME media service | KEEP with hardening | Valid feature; policy/grant coverage needs review | Medium | Auth client migration | Upload/update/delete and cross-user tests |
| billing checkout/webhook | One-time Paddle purchase and grant | Billing adapter | MIGRATE | Preserve server authority, add subscription lifecycle | Critical | Target subscription schema/catalog | Signed webhook fixtures, replay/order tests |
| billing orders/grants/memberships | One-time fixed-duration access | Payment refs + subscriptions + entitlements | MIGRATE | Historical purchases must remain valid while v2 becomes recurring | Critical | Provider mapping and reconciliation | Historical entitlement parity; sandbox lifecycle |
| `api/ai.js` and AI request layer | Server proxy plus developer direct-provider path | Server AI gateway | MIGRATE | Centralize policy, observability, and secret handling | High | Server configuration and report provenance | Secret scan, timeout/retry/invalid-output tests |

## Deletion rule

`DELETE` is deliberately absent from the first migration stages. Code or storage can be deleted only after all of these are true:

1. zero production reads for one release window;
2. complete export and restore coverage;
3. row/entity counts and checksums reconcile;
4. the rollback path has been exercised;
5. unresolved relationships are zero or explicitly quarantined;
6. product analytics show no remaining primary navigation/use dependency.
