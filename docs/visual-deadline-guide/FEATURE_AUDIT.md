# Visual Deadline 功能状态审计

审计日期：2026-09-02  
代码基线：`main` / `a3b13d0`  
产品版本：`package.json` 为 1.0.1；页面品牌常量为 2.0.0  
存储结构版本：0.8

> 状态说明：**已实现**表示存在可运行的前端或服务端链路；**部分实现**表示主要界面存在，但仍依赖配置、演示数据或尚未闭环的外部服务；**预留**表示当前主要是说明或扩展接口。本文档不把演示数据、占位入口或未来规划描述为正式能力。

| 模块 | 功能 | 状态 | 代码或页面依据 | 限制与说明 |
| --- | --- | --- | --- | --- |
| 访问 | 本地模式 | 已实现 | `AuthPanel.tsx`、浏览器 localStorage | 无账号也可体验；数据留在当前浏览器 |
| 访问 | 邮箱密码注册/登录 | 部分实现 | `useSupabaseAuth.ts`、`supabaseClient.ts` | 依赖 Supabase 与邮件验证配置；需继续做端到端验证 |
| 访问 | 云同步 | 部分实现 | `cloudSync.ts`、Supabase schema | 任务、目标、压力和资料已接入；受 RLS、网络和表结构配置影响 |
| 引导 | 三步初始问答 | 已实现 | `OnboardingFlow.tsx` | 收集注意事项、主观压力、重要性和截止时间 |
| 首页 | 当前任务热区 | 已实现 | `HomePage.tsx`、`MiniTaskMatrix.tsx` | 根据任务时间和重要性展示 |
| 首页 | Top 3 下一步建议 | 已实现 | `RecommendationCard.tsx`、`taskScoring.ts` | 属于规则和评分建议，不构成结果保证 |
| 任务 | 紧急—重要矩阵 | 已实现 | `PriorityMap.tsx` | 支持桌面端完整视图及移动端适配 |
| 任务 | 任务/项目创建与编辑 | 已实现 | `TaskForm.tsx`、`TaskPage.tsx` | 支持状态、重要性、截止时间、进度等字段 |
| 任务 | 派生进度与逾期分级 | 已实现 | `taskDerivedState.ts`、`progress.ts` | 自动进度是时间估计，不代表真实完成证据 |
| 任务 | AI 自然语言录入 | 部分实现 | `AITaskCommandBar.tsx`、`api/intake.js` | 依赖 AI 后端配置；写入前需要用户确认 |
| 任务 | 图片、文档和录音入口 | 部分实现 | `MultimodalComposer.tsx` | 能力取决于浏览器与后端接口；不等同于全部格式均已解析 |
| 压力 | 实时压力指数 | 已实现 | `pressureEngine.ts`、`PressureCard.tsx` | 个人效率辅助指标，不是医学或心理诊断 |
| 压力 | 主观压力校准 | 已实现 | `PressureCalibration.tsx`、`OnboardingFlow.tsx` | 任务负载为零时不能完成校准 |
| 压力 | 压力曲线和重算 | 已实现 | `PressureTimeline.tsx`、`pressureHistory.ts` | 样本少时趋势解释有限 |
| 人生 | Life OS NOW | 已实现 | `LifeOSPlanner.tsx` | 今日时间、注意力、精力属于规划估计 |
| 人生 | Planning / 七日滚动计划 | 已实现（含演示路径） | `lifePlanner.ts`、`demoData.ts` | AI 规划依赖配置；存在确定性回退方案和演示节点 |
| 人生 | Life Map 目标图谱 | 已实现（含演示数据） | `LifeMapPage.tsx`、`RoadmapCanvas.tsx` | 当前默认节点用于演示层级与依赖关系 |
| 人生 | Timeline 人生时间轴 | 已实现（含演示数据） | `LifeTimelineSection.tsx`、`data.ts` | 部分人生阶段和年度目标是种子数据 |
| 社交 | 社交图谱与联系人 | 已实现 | `SocialPage.tsx`、`storage/social.ts` | 好感度决定可视距离；不代表客观关系评价 |
| 社交 | CSV/vCard 导入 | 已实现 | `SocialPage.tsx`、相关解析逻辑 | 需要用户主动授权文件 |
| 社交 | 微信好友直接读取 | 预留/不支持 | `docs/wechat-contact-import.md` | Web/PWA 不应使用逆向协议或本地数据库抓取 |
| 数据 | 生命状态总览 | 已实现 | `LogPage.tsx`、analytics 目录 | 数据量少时主要显示观察期状态 |
| 数据 | 任务执行分析 | 已实现 | `behaviorAnalytics.ts` | 拖延和稳定性是行为信号，不是人格判断 |
| 数据 | 压力核心 | 已实现 | `pressureAnalytics.ts` | 高压样本不足时不计算恢复速度 |
| 数据 | 人生结构 | 已实现 | `lifeStats.ts` | 统计取决于任务分类和长期目标关联质量 |
| 数据 | 健康准备 | 预留 | `healthMetrics.ts`、`LogPage.tsx` | 睡眠、HRV、穿戴设备尚未形成正式接入闭环 |
| 数据 | 长期趋势 | 部分实现 | `LogPage.tsx` | 当前有基础汇总，月度/年度演化仍在扩展 |
| 数据 | AI 第三人称洞察 | 部分实现 | `reviewPrompt.ts`、`AIReviewPanel.tsx` | 依赖 AI 配置与足够的任务/压力历史 |
| 档案 | 生命日志、成就和重要状态 | 已实现 | `ActivityLog.tsx`、`AchievementsPanel.tsx` | 低信息量重复记录会折叠 |
| 账户 | 个人资料与头像 | 已实现 | `ProfilePage.tsx`、`avatarStorage.ts` | 云头像依赖 Supabase Storage 配置 |
| 全局 | 消息中心 | 已实现 | `NotificationCenter.tsx` | 当前主要承载系统消息、风险提醒和分析结果 |
| 会员 | Free/Plus 展示与权限层 | 已实现 | `MembershipPanel.tsx`、`billing.ts` | 高级功能仍会随版本扩展 |
| 支付 | Paddle Checkout 与 webhook | 部分实现 | `billing-checkout.js`、`billing-webhook.js` | 生产环境需要校验密钥、商品、回调和幂等性 |
| 隐私 | 隐私政策与用户协议 | 已实现 | `PrivacyPolicyPage.tsx`、`TermsPage.tsx` | 用户仍需避免输入密码、证件号等敏感信息 |
| 数据安全 | 导入、导出与本地备份 | 已实现 | `storage/backup.ts`、`DataSafetyPanel.tsx` | 导入文件需要通过应用名和 schema 校验 |
| 移动端 | 底部导航和响应式页面 | 已实现 | `MobileShell.tsx`、`MobileBottomNav.tsx` | 仍需按真实设备持续做视觉回归 |

## 发布前优先核验

1. 邮箱注册、验证、回调、登录和重新发送的完整闭环。
2. Paddle 支付、webhook、会员权限刷新和重复回调幂等性。
3. Supabase RLS：不同用户之间的数据隔离。
4. AI 请求只发送完成当前功能所必需的字段。
5. 移动端首页、任务、人生和数据页的真实设备表现。

