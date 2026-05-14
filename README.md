<p align="center">
  <img src="./assets/visualdeadline-banner.png" alt="Visualized Deadline banner" />
</p>

# Visualized-Deadline
Visualized Deadline is a Flysoon Labs project by Rancho Tao.

**可视化 Deadline，非传统 Todo List。**

Visualized-Deadline（VD）现在以 飞升 Shell 的信息架构运行：它负责可视化 Deadline、认知压力、生活地图、社交关系、日志与个人系统设置。

## v0.9：飞升 Productization Foundation

- 顶部导航：在不刷新页面的情况下切换「首页 / 地图 / 社交 / 日志 / 我」。
- VD 默认模块：保留压力指数、压力校准、优先级地图、活动列表、归档日志、成就和本地持久化。
- 人生地图：使用本地可编辑节点图谱，以“我”为中心连接 Academic、Research、Fitness、Finance、Social、Content、Health 等生活领域。
- 社交：使用本地可编辑的有向关系图谱，以“我”为中心连接联系人节点。
- 我：本地编辑 nickname、height、weight、identity、skills、longTermGoals、currentStage，并集中放置数据安全、隐私与未来同步入口。
- 日志：独立展示已完成 / 已放弃项目、时间戳和活动类型，同时 VD 内仍保留小日志预览。
- 首次进入：先进行快速任务倾倒，再校准主观压力，最后补全任务信息。
- 当前关注：最多展示 3 个推荐活动，帮助用户选择而不是替用户决定。
- 表单体验：新建 / 编辑项目使用居中大弹窗，不再静默插入页面。
- 复盘记录：归档项目支持展开、删除与填写「复盘记录」。

## 压力模型

VD 不再把主观压力当作永久背景压力叠加到任务压力上。用户在引导或重新校准时输入的主观压力代表“当前这组任务给我的总体压力感”。

校准时记录：

```text
referencePressure = 用户输入的主观压力
referenceTaskLoad = 当前进行中任务负载之和
pressureRatio = referencePressure / referenceTaskLoad
```

日常估算：

```text
currentPressure = currentTaskLoad × pressureRatio - recoveryRelief
```

其中：

- `currentTaskLoad` 来自进行中任务的 `urgencyWeight × importanceWeight`。
- `pressureRatio` 是个体压力映射系数，来自最近一次校准样本。
- `recoveryRelief` 来自恢复 / 娱乐活动的轻微释放。
- 如果校准时没有进行中任务，系统会使用安全默认系数，避免除以 0。
- raw pressure 超过 100 时会显示 100+ 的 burnout risk 状态。

压力状态分区：

- 0-30：平稳
- 31-60：可控
- 61-80：高压
- 81-100：过载
- >100：压力爆表 / Burnout Risk

## 本地存储 keys

- `visualized-deadline.tasks`：任务与活动项目。
- `visualized-deadline.baselinePressure`：旧版本兼容键；现在只作为迁移参考，不再作为叠加型背景压力。
- `visualized-deadline.achievements`：已解锁成就。
- `visualized-deadline.profile`：本地个人主页资料与头像 data URL。
- `visualized-deadline.onboardingComplete`：首次引导是否完成。
- `visualized-deadline.pressureCalibration`：保存 `referencePressure`、`referenceTaskLoad` 与 `pressureRatio` 的校准快照。
- `visualized-deadline.lifeMap.nodes` / `visualized-deadline.lifeMap.edges`：人生地图节点与连接。
- `visualized-deadline.social.nodes` / `visualized-deadline.social.edges`：社交图谱节点与有向连接。

## 成就列表

- 初次进入 VD
- 第一次创建任务
- 第一次完成任务
- 第一次放弃低价值任务
- 第一次压力降到可控区
- 第一次完成 3 个任务
- 第一次完成 7 天内任务推进
- 第一次使用恢复/娱乐活动降低压力

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS
- localStorage
- @xyflow/react（当前仓库内以 local file dependency 形式提供图谱交互基础）

## 快速开始

```powershell
npm install
npm run dev
```

默认开发服务器会在终端输出本地访问地址，通常是：

```powershell
http://localhost:5173
```

## 可用脚本

```powershell
npm run dev
```

启动 Vite 本地开发服务器。

```powershell
npm run build
```

执行 TypeScript 编译检查并构建生产资源。

```powershell
npm run preview
```

预览生产构建结果。

## GitHub Pages 部署

本项目已配置 GitHub Actions 工作流。推送到 `main` 分支后，工作流会自动安装依赖、构建项目，并把 `dist` 部署到 GitHub Pages。

Vite 的 `base` 已设置为 `/Visualized-Deadline/`，适配仓库 Pages 地址。

## 数据兼容

旧版本 `localStorage` 任务会被自动兼容：

- 旧的 1-5 重要性会迁移到 1-10。
- 缺失的 `progress` 会补为 0。
- 缺失的 `activityType` 会补为 `task`。
- 缺失的 `lifecycleStatus` 会补为 `active`。
- 旧的 `done` 状态会视为 100% 进度和已完成。
- 如果没有 `onboardingComplete`，但已有旧任务或压力基线，会视为已完成引导，避免阻塞旧数据。
- 如果缺少 `pressureRatio` 或 `referenceTaskLoad`，会从旧压力值生成安全默认映射，避免除以 0。
- 如果没有成就、头像、人生地图、社交图谱数据，会使用安全默认值初始化。

## v0.7：Data Safety & Persistence Foundation

v0.7 将持久化逻辑集中到 `src/storage/`，业务组件不再直接调用浏览器存储 API。当前实现提供：

- 统一存储模块：`tasks`、`pressure`、`social`、`lifeMap`、`logs`、`settings`、`backup`、`schema`。
- JSON 导出格式：`schemaVersion`、`exportedAt`、`app` 与 `data` 固定封装，便于未来 IndexedDB、SQLite、云同步或账号系统复用。
- JSON 导入：校验 JSON、应用名和架构版本；不兼容版本会给出友好错误，不会导致应用崩溃。
- 自动备份：重要状态写入后刷新 `vd_backup_latest`，并保留 `vd_backup_1` 到 `vd_backup_3` 的滚动快照。
- 恢复安全：读取本地数据失败时会尝试从最近备份恢复，并通过“备份与恢复中心”提示用户。

导出的文件名格式为：

```text
VD-backup-YYYY-MM-DD-HH-mm.json
```

## v0.8-v0.9：Product Structure + Social Graph Reconstruction

后续产品化基础已按 Web-first 方向整理：

- 信息架构调整为「首页 / 地图 / 社交 / 日志 / 我」，其中「我」承担资料、系统状态、数据安全与未来隐私/同步入口。
- 首页变为 daily control center：优先展示当前压力、推荐项目、状态摘要、快捷动作、最近日志与未来 AI 协同占位。
- 社交图谱升级为多因素关系嵌入：好感度、熟悉度、信任、互动频率、最近互动、角色分类、情感亲近与影响权重都会参与距离、聚类和视觉分组。
- 图谱节点改为更紧凑的圆角卡片，保留头像占位、姓名、角色信息，并修复中心节点对比度。
- 图谱交互保持本地轻量：普通触控板滚动回到页面滚动，图谱缩放只通过 Ctrl/Cmd + 滚轮或显式按钮触发。
- PWA 准备仅做基础：viewport/theme 元信息、移动优先间距、触控交互和本地优先隐私占位；暂不实现安装、后端、认证或云同步。
