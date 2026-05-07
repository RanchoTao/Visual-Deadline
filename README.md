# Visualized-Deadline

Visualized-Deadline 是一个帮助用户缓解任务过载和注意力分散的前端任务管理 MVP。

核心理念：**人不应该把所有任务都记在脑子里。系统负责记录、分类、排序和提醒；用户只负责执行。**

## MVP 功能

- 创建任务：标题、描述、重要性、截止时间、预计耗时、状态。
- 管理任务：新增、编辑、删除、标记进行中、标记完成。
- 当前推荐任务：基于重要性和截止日期紧急程度计算最高优先级任务。
- 艾森豪威尔矩阵：按「重要性」和「截止日期紧急程度」自动分到四个象限。
- 本地持久化：使用 `localStorage` 保存任务，暂不接后端、数据库或 AI API。
- 低压力 UI：首页只展示当前推荐、矩阵、未完成任务列表和添加按钮。

## 技术栈

- React
- TypeScript
- Vite
- Tailwind CSS
- localStorage

## 快速开始

```bash
npm install
npm run dev
```

默认开发服务器会在终端输出本地访问地址，通常是：

```bash
http://localhost:5173
```

## 可用脚本

```bash
npm run dev
```

启动 Vite 本地开发服务器。

```bash
npm run build
```

执行 TypeScript 编译检查并构建生产资源。

```bash
npm run preview
```

预览生产构建结果。

## 项目结构

```text
.
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
    │   ├── EisenhowerMatrix.tsx
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

## 任务评分规则

当前推荐任务按以下公式计算：

```text
score = importance * 10 + urgencyScore
```

`urgencyScore` 根据 `deadline` 计算：

- 已过期：50
- 24 小时内：40
- 3 天内：30
- 7 天内：20
- 更久以后：10
- 无截止日期或非法日期：0

系统会推荐 `score` 最高且 `status !== 'done'` 的任务。

## 矩阵分类规则

- 重要任务：`importance >= 4`
- 紧急任务：`urgencyScore >= 30`，即已过期、24 小时内或 3 天内。

四个象限：

- Important & Urgent：立即做
- Important & Not Urgent：计划做
- Not Important & Urgent：尽快处理
- Not Important & Not Urgent：可以延后或删除

## 核心概念可视化

![Deadline-Importance Matrix](https://raw.githubusercontent.com/RanchoTao/Visualized-Deadline/main/matrix.png)
