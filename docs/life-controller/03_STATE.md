# Life Controller State

## Current milestone

Alpha 0.1 code and local UI verification completed on 2026-09-05. Production database rollout remains pending.

## Implemented

- 通用 `LifeEvent`：`wake`、`meal`、`sleep_start`，开放 metadata/type 扩展面。
- IANA timezone 感知的 `LifeState` 推导。
- 重复/无效/未来事件显式 warning，不静默改变状态。
- deterministic NOW / NEXT / LATER planner，预留任务与日历输入。
- 桌面和移动首页共用 Life Controller UI。
- 一键快捷记录、最近 20 条历史、撤销最近记录。
- guest/user 本地隔离与 Supabase `life_events` 同步适配。
- additive migration 与 pgTAP RLS 测试。
- Node 领域测试和 npm `test` / `typecheck` scripts。

## Verified

- `npm test`: 12/12 domain tests passed after the final implementation。
- Existing manual Life Planner scenarios A–E and G: passed after bundling its required module entry for Node。
- `npm run typecheck`: passed。
- `npm run build`: passed; 105 modules transformed。
- `git diff --check`: passed。
- Browser console: no warnings or errors during the tested flow。
- 390 × 844 mobile viewport: wake state restored, meal and sleep recorded in one click, sleep plan suppressed work, undo replanned immediately, local-time history rendered, reload restored both events, bottom navigation and vertical scrolling remained usable。
- 1440 × 1000 desktop viewport: Life Controller remained first on Home and matched the existing light VD shell。
- Regression smoke: existing Tasks, Life and Timeline entry points opened successfully on the same local build。

## Known issues

- Supabase local containers are unavailable because Docker Desktop engine is not running; migration/RLS test has not yet executed locally。
- Production Supabase migration has not been applied from this checkout。
- Existing production bundle already exceeded Vite's 500 kB warning threshold; Alpha adds no new dependency but does not solve code splitting。
- The repository has no `lint` script, so `npm run lint` reports `Missing script: "lint"`; typecheck is reported separately and is not mislabeled as lint。

## Not implemented

- Task Controller、calendar、automatic scheduling、LLM planner。
- Preference editing UI and historical timestamp correction UI。
- Exercise/calories/nutrition/wearables/notifications/widgets/native integrations。
- Service-worker offline cache。

## Architecture decisions

- EVENT / TASK / PLAN / STATE / CONTROLLER remain separate。
- Derived durations are never persisted as event facts。
- The existing task overview remains available but collapsed below the controller。
- Local operation remains functional when the cloud migration is absent。

## Current blocker

No code blocker. Database integration verification requires a running Docker/Supabase local stack or an explicitly connected project.

## Next highest-value action

Apply the additive Life Controller migration to a connected staging Supabase project and run the RLS test there.
