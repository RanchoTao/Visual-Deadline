# Architecture

## Repository audit

- Frontend: Vite 8 + React + TypeScript + Tailwind CSS plugin。
- Backend: Vercel-style `api/*.js` endpoints；Life Controller Alpha 不新增后端 runtime。
- Database/Auth: 自有轻量 Supabase REST/Auth client；核心表由 SQL 与 `supabase/migrations` 管理，用户数据通过 `auth.uid()` RLS 隔离。
- Existing task model: `Task` 继续表示候选行动；事件不写入 Task JSONB。
- Homepage: desktop 使用 `HomePage`；小于 768px 时由 `MobileShell` 的首个入口承载。
- State: React hooks + versioned localStorage；登录后再与 Supabase 同步。
- PWA: manifest/icons 已存在，当前没有 service worker/offline cache。
- Tests at baseline: 只有手工入口的 `tests/lifePlanner.mjs`，没有 `test`/`typecheck` scripts；Alpha 补齐领域测试入口。
- Build: `tsc -b && vite build`；基线构建通过。

## Domain boundaries

```text
LifeEvent (observed fact)
        ↓
LifeState (derived, never persisted as fact)
        ↓
Rule Planner (deterministic structured output)
        ↓
Homepage Control Plane (render + capture)
```

`LifeEvent` 保存绝对 ISO timestamp、开放 type 和 flexible metadata。`awakeDuration`、`lastSleepDuration`、`timeSinceLastMeal` 等只在 `deriveLifeState` 中计算。

时间计算使用 `Date` 表示绝对 instant，使用 IANA timezone 与 `Intl.DateTimeFormat(..., { timeZone })` 计算本地日期和展示；跨午夜和 DST 不依赖浏览器日期字符串拼接。

规则默认值集中在 `createDefaultLifePreferences`：目标睡眠 8 小时、睡眠 23:30、起床 07:30、进食间隔 4–6 小时。Alpha 没有设置页；后续应由人生/个人模型页编辑。

Planner 输入已预留 `availableTasks`、calendar、projects、deadlines，但 Alpha 传入空任务并明确不进行工作任务选择。

## Persistence

- Guest/local: `visualized-deadline.lifeController.eventsByOwner`，以 `guest` 或 Supabase user id 分区，避免同一浏览器不同账号互相读取生活记录。
- Cloud: `public.life_events` 独立追加式表；不覆盖 tasks/goals，不删除旧数据。
- Sync: 登录后按 event id 合并并 upsert；撤销使用带 `id + user_id` 条件的 DELETE。migration 未部署时，本地闭环继续可用并显示明确降级状态。
- RLS: authenticated 角色仅获得 CRUD grants；每个操作都有 ownership policy，UPDATE 同时包含 USING 与 WITH CHECK。
