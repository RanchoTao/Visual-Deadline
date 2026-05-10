# Visualized-Deadline

Visualized-Deadline 是一个帮助用户缓解任务过载和注意力分散的前端任务管理器。

核心理念：**人不应该把所有任务都记在脑子里。系统负责记录、分类、排序和提醒；用户只负责判断和执行。**

## v0.2 功能

- 创建任务：标题、描述、重要性（1-10）、截止时间、进度（0-100）。
- 管理任务：新增、编辑、删除；不再使用 todo / doing 工作流。
- 当前推荐任务：基于重要性和截止日期紧急程度计算优先级，并展示人类可读的推荐原因。
- 紧急重要矩阵：用二维坐标地图展示任务位置，而不是四个卡片象限。
- 倒计时：展示“还剩 6天 12小时”或“已超时 3小时”等截止时间状态。
- 进度可视化：展示进度百分比和小型进度条；进度 100% 视为已完成。
- 本地持久化：使用 `localStorage` 保存任务，并兼容旧版本任务数据。

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

## 项目结构

```text
.
├── .github
│   └── workflows
│       └── deploy.yml
├── index.html
├── package.json
├── README.md
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
└── src
    ├── App.tsx
    ├── main.tsx
    ├── styles.css
    ├── components
    │   ├── PriorityMap.tsx
    │   ├── ProgressBar.tsx
    │   ├── RecommendationCard.tsx
    │   ├── TaskForm.tsx
    │   └── TaskList.tsx
    ├── hooks
    │   └── useLocalStorage.ts
    ├── types
    │   └── task.ts
    └── utils
        ├── date.ts
        └── taskScoring.ts
```

## 优先级与推荐规则

内部推荐任务按以下公式计算：

```text
priority = importance * 10 + urgencyScore
```

`urgencyScore` 根据 `deadline` 计算：

- 已过期：50
- 24 小时内：40
- 3 天内：30
- 7 天内：20
- 更久以后：10
- 无截止日期或非法日期：0

系统会推荐优先级最高且进度未达到 100% 的任务。界面不会展示内部数值，只展示类似“重要性高，截止时间较近”的推荐原因。

## 紧急重要矩阵规则

- 横轴：截止日期紧急程度，越靠右越紧急。
- 纵轴：重要性，越靠上越重要。
- 每个任务以圆点展示，标题显示在圆点旁边。
- 悬停或点击任务圆点，可以查看描述、倒计时、截止时间、推荐原因和进度。

## 数据兼容

旧版本 `localStorage` 任务会被自动兼容：

- 旧的 1-5 重要性会迁移到 1-10。
- 缺失的 `progress` 会补为 0。
- 旧的 `done` 状态会视为 100% 进度。
- 旧的预计耗时字段不会再显示或要求输入。
