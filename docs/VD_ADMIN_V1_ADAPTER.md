# vd-admin-v1 跨仓库适配层

本层把 Admin 的传输 DTO 映射到 PR #139 既有权威域；不复制授权、会员、额度或计费规则。未合并，未部署，未执行远程迁移，公开内测仍 HOLD。

## 契约来源与连接方式

- 只读核对 `RanchoTao/Visual-Deadline-Admin` 的 `docs/VD_ADMIN_CONTRACT.md`、contracts、catalog、projection、RBAC 与真实 gateway。
- 基线提交：`f60840138af153d552c7bcb84b7ca605b225e4f0`。`tests/fixtures/vd-admin-v1-contract.json` 固定契约、源码 SHA-256（LF 规范化）及可供 Admin 测试消费的代表性 JSON 响应。没有修改 Admin 仓库或向其中复制业务规则。
- Admin 的 `VD_ADMIN_API_URL` 应为 `https://<VD-host>/api/`，**包括 `/api/`**；其网关在此基址后拼接 `v1/admin/{resource}`。这是连接说明，不是已配置的部署。
- `GET /api/v1/admin/{resource}`；`POST /api/v1/admin/{resource}/actions`。Vercel 两条显式 rewrite 指向同一个 `api/admin-v1.js`，排在原有 SPA fallback 前；其余 API、客户端路由与 billing cron 不变。
- 仅 VD 服务端读取 `VD_ADMIN_INTERNAL_TOKEN`；Admin 服务端使用同一个内部凭据。`.env.example` 只有空占位，不配置、打印或提交实际凭据，不使用 VITE/browser storage。浏览器构建秘密扫描覆盖此名称。

## 双重授权

固定长度 SHA-256 摘要经 `timingSafeEqual` 比较内部 bearer 凭据。缺失/错误 401，服务端未配置 503；契约必须为 `vd-admin-v1`，否则 426；actor 必须为 UUID，否则 400。内部凭据只证明调用方服务器，不证明 actor 权限。

`X-Admin-Role` 不参与授权。每次读取、命令和审计回执读取均重新查 VD `admin_roles`、Auth identity、enabled 状态及有效 account control。撤销角色/受限 actor 即使重放也不能读取邀请码。RPC 仅 service_role EXECUTE；anon/authenticated 无新 RPC 权限，内部 helper/直接 mutation worker 对 service_role 也不可执行。

| 角色 | 读取 | 操作 |
| --- | --- | --- |
| owner | 所有已实现资源 | 所有已实现操作；既有 owner-only 限制仍有效 |
| admin | users、invitations、entitlements、quotas、bans、beta-applications | 对应常规操作；保持既有申请审核权限 |
| support | users、feedback 元数据 | 无 |
| analyst | ai-usage；analytics 目前显式未实现 | 无 |
| reviewer | beta-applications | 仅申请审核 |

## 读取与最小化

实现 dashboard、users、beta-applications、invitations、entitlements、quotas、bans、audit、feedback、ai-usage、settings。

返回 `{items,nextCursor?,summary?}`，行都有稳定字符串 id。默认每页 50、最多 100，但不是全历史上限。UUID 升序 keyset 查询 `id > after`，数据库过滤/分页后才为选中的用户计算昂贵投影。游标绑定 resource、q/id/status/cohort/limit；不得跨查询重用。q 是字面邮箱/姓名/邀请码前缀搜索，不把 `%` 当通配符。分页是实时集合，不宣称并发写入时的数据库快照。

- users/entitlements/quotas 复用 `beta_admin_effective_entitlement` 的有效来源并集，以及 `beta_ai_quota_snapshot` 的当前策略周期，不从日期、套餐标签或 provider 状态重新授权。
- entitlement status 过滤与显示使用同一权威并集；users/quotas 的 status 过滤是 accountStatus。应用历史只投影最近 50 条真实审核审计；完整 audit 仍能持续分页。
- 不返回 Auth password/JWT/元数据原文、profile.data/tasks/goals/reviews 原文、feedback message/metadata、code_hash、provider secrets。Audit before/after 做状态字段白名单投影。
- lastActiveAt、活动计数未建立统一证据口径，返回 null；不将登录时间冒充产品活跃度。既有有效 legacy entitlement source 保留真实 source_type，不谎称 subscription。未撤销但未检查期间的 adminGrants 不伪标为 active。
- invitations 只返回前缀和元数据；legacy 未知 kind 为 null。新 kind 来自已提交审计，不追溯伪造旧记录。
- dashboard 自然日明确 UTC，费用单位 currency_minor，未知费用为 null；不存在可靠证据的 DAU/WAU/MAU 为 null。
- settings 宣告 `adminGrantSupport={contract:'vd-admin-tiers-v1',grantableTiers:['plus']}`、`contractVersion='vd-admin-v1'`、closedBeta=true。Provider readiness 仅返回配置存在与 unknown/pending，**不把存在凭据当 live acceptance**；不透露值，不声称限流已就绪。
- email/analytics/infrastructure/deployments：501 `ADMIN_RESOURCE_UNSUPPORTED`；restricted-content：403 `RESTRICTED_CONTENT_DISABLED`，即使 owner 也不开放。

## 操作映射与明确边界

每个请求须有 UUID requestId 或 Idempotency-Key；同时存在必须相同。action/target/reason/input 严格验证，不接受浏览器任意 capability/subscription/price 字段。

| Admin 操作 | 既有 beta_admin_command action | 说明 |
| --- | --- | --- |
| entitlements/grant | grant_entitlement | plus/省略 tier；days=1/7/30/90 或带时区 validUntil 或 permanent；source 映射既有 grant_type |
| entitlements/revoke | revoke_entitlement | 必须显式 grantId；事务内检查属于 target 用户，不影响订阅/其他来源 |
| invitations/create | create_invite | kind/cohort/limit/expiresAt/note；target=new |
| invitations/disable、revoke | disable_invite | revoke 是停用别名，非删除 |
| beta-applications/shortlist、approve、reject | review_application | shortlisted/approved/rejected；reviewer 范围仅此 |
| quotas/adjust | grant_quota | 非负增量 delta 或显式 unlimited；既有 owner/测试账号策略不变 |
| quotas/reset | reset_quota | 既有当前策略周期补偿，不永久抬高以后额度 |
| bans/restrict、suspend、ban | set_account_control | restricted/suspended/banned；days 在事务首次执行时解析 |
| bans/unban | unban | 原有 active 转移，保留历史 |

赠送来源：beta_gift→beta、admin_grant→manual、admin_compensation→compensation、promotion/testing 保持原值。永久赠送仍只能 owner/testing；unlimited 仍是明确独立命令，不等于 reset。

**当前契约子集的已知限制：** 未带 grantId 的 revoke 为 400 `GRANT_ID_REQUIRED`，不擅自批量撤销；绝对 quota limit、负 delta 不映射到不存在的权威减少规则，400 拒绝；invite enable/expire 400 `ADMIN_COMMAND_UNSUPPORTED`。Admin 的相关控件仍需按此能力限制展示或后续显式实现，不能把拒绝当成功。Pro 为 409 `PRO_NOT_SUPPORTED`，数据库同样拒绝。approve-and-email/resend/email 操作为 409 `EMAIL_INTEGRATION_PENDING`，不审核、不入假 outbox、不发送邮件。

## 原子审计与幂等

唯一命令引擎仍是 `beta_admin_command`。actor/requestId 主键、完整 action/input SHA-256、已有 advisory transaction lock 和已提交 result_json 继续生效。适配层 action 别名、target、reason 和原始 input 进入同一指纹；不同别名也不能复用 key。

新增迁移 `20260928150104_closed_beta_admin_v1_adapter.sql`：

1. 只增加 audit 的 `adapter_command` JSONB 证据及 service-only 读取 RPC/索引。
2. dispatcher 设置并清理 transaction-local transport context；现有 worker 的 audit INSERT trigger 在同一事务捕获它。原有 domain action/target/reason/before/after 不重写、不删除。
3. mutation + audit + receipt + private invite result 仍一事务；缺失匹配审计则整个新命令回滚。
4. quota 命令将**当次**权威 snapshot 一起存入原有 receipt；重放不返回后续状态。
5. API 只从已提交命令对应的真实 audit 行投影 auditEvent。创建邀请码等别名的 action/target/reason 来自已提交 adapter_command，不从后来请求临时拼造。没有确切回执则 fail closed。
6. 邀请码 plaintext 仍仅来自原有 private actor/key replay；不加入 audit、通用 receipt 或列表。没有第二个幂等表/缓存。

新 migration 不改已有 migration，不关闭 RLS，不开放客户端写，不读取 provider 凭据，不改 Paddle/计费/AI output 合约或 rollout。

## 可复现验证

常规：`npm test`、`npm run typecheck`、`npm run build`、`git diff --check`。

隔离本地 PostgreSQL（明确 localhost，拒绝远程）：

```powershell
# 指向一个全新空本地库；pg driver 可使用仓库外的隔离安装。
$env:VD_TEST_PG_DRIVER='<local-tools>/node_modules/pg/lib/index.js'
$env:VD_TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55439/<fresh-local-db>'
node scripts/test-closed-beta-postgres.mjs
$env:VD_TEST_ADMIN_REPO='D:/Projects/Visual-Deadline-Admin'
node scripts/test-admin-v1-cross-repo.mjs
```

后一个脚本验证 SHA pins、仅转译并执行真实 Admin gateway，再通过 VD handler 和 service-role SQL RPC 连接本地测试库。HTTP transport/PostgREST 是本地 bridge，**不是 deployed Vercel/Supabase HTTP 验证**；事务、角色、锁和审计是实际 PostgreSQL。脚本会在隔离测试库新增测试 fixture，不可用既有业务库运行。Admin 文件不修改。

当前实测：17/17 迁移、14 suites/714 pgTAP assertions；34 个跨仓库检查，含 130 行三页读取、5 并发重试同一 result/audit、改 payload 409、撤销 actor 403（包括等待 advisory lock 期间撤销）、reviewer 审核和邀请码脱敏。新 HTTP 契约测试 52 项；全套测试结果见 REVIEW_PREPARATION.md 最新一节。

部署/公开内测仍 HOLD：尚未配置真实内部 token、尚未执行远程本迁移，尚未做实际两部署互联验证；原有 staging/provider/product gates 保留。不能据本地 PASS 声称 merge-ready。
