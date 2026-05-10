# Visualized-Deadline

**可视化 Deadline，非传统 Todo List。**

Visualized-Deadline（VD）现在是 LifeOS Shell 的第一个工作模块：它仍然负责可视化 Deadline、认知压力与生活动量，同时为后续的人生地图、社交、个人主页和日志模块保留清晰入口。

## v0.6-alpha：LifeOS Shell

- 顶部导航：在不刷新页面的情况下切换「人生地图 / VD / 社交 / 个人主页 / 日志」。
- VD 默认模块：保留压力指数、主观压力基线滑杆、优先级地图、活动列表、归档日志、成就和本地持久化。
- 人生地图：展示 Academic、Research、Fitness、Finance、Social、Content、Health 七个生活领域的占位卡片。
- 社交：保留 relationship map、contact notes、social energy tracking、interaction review 的未来说明。
- 个人主页：本地编辑 nickname、height、weight、identity、skills、longTermGoals、currentStage。
- 日志：独立展示已完成 / 已放弃项目、时间戳和活动类型，同时 VD 内仍保留小日志预览。

## 压力模型

每个进行中项目会计算：

```text
itemPressure = urgencyWeight * importanceWeight * unfinishedWeight
```

总压力会计算：

```text
rawPressure = baselinePressure + weightedActiveItemPressure - relief
```

其中：

- `baselinePressure` 来自首次进入时的主观压力校准，也可以在 VD 压力卡片中用滑杆微调。
- `urgencyWeight` 根据截止时间远近计算，超期和 24 小时内更高。
- `importanceWeight` 来自 1-10 的重要性。
- `unfinishedWeight` 随进度降低，但保留最小未完成权重。
- `relief` 来自完成项目，以及恢复 / 娱乐活动带来的轻微减压。
- 常规显示归一到 0-100；raw pressure 超过 100 时会显示 100+ 的 burnout risk 状态。

压力状态分区：

- 0-30：平稳
- 31-60：可控
- 61-80：高压
- 81-100：过载
- >100：压力爆表 / Burnout Risk

## 本地存储 keys

- `visualized-deadline.tasks`：任务与活动项目。
- `visualized-deadline.baselinePressure`：主观压力基线。
- `visualized-deadline.achievements`：已解锁成就。
- `visualized-deadline.profile`：本地个人主页资料。

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
- 如果没有 `baselinePressure`，会显示首次压力校准。
- 如果没有成就数据，会初始化为空数组。
