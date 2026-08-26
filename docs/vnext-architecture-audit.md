# VD vNext Architecture Audit

## 可复用基础

- `Task`、`Goal`、紧急重要矩阵及 pressure/attention 推导继续作为执行与优先级入口；Planner 只消费这些信号，不创建另一套可见 Priority Score。
- `useLocalStorage`、备份 schema 与 Supabase 同步适合承载向后兼容的本地模型；现有 AI settings 和 OpenAI-compatible request 层可作为 Planner Provider 的传输层。
- 人生页已有 Roadmap、React Flow vendor 和时间轴，可以演进为 Goal Graph 与 Phase Timeline。

## 本轮新增/修改

- 增加六层人生模型、Goal 状态、Dependency、资源快照、append-only Execution Event、Plan Version 与 Review 类型。
- 增加确定性 Planner/Validator：限制 Focus 数量、时间/预算、依赖、完成状态和锁定任务，并将未入选目标明确 defer。
- 人生页增加 NOW、Planning、Life Map 和 Timeline 四个渐进视图；Planner 结果必须先接受才写入任务系统。
- 任务保留原有重要度、Deadline 和生命周期，并只增加可选的 `nextAction`、规划来源及锁定字段。

## Migration 风险

- 现有 Goal 缺少层级/状态时按 L1 + waiting 解释，不破坏旧记录；Task 新字段均为可选。
- vNext 图、资源、计划和事件先存独立 namespaced localStorage，避免改变现有云表；正式上云前需要为事件做幂等 ID、版本号和 append-only RLS。
- Demo 数据只在 vNext store 为空时作为展示上下文，不写入正式 Goal/Task 列表。

