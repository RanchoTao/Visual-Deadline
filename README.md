<p align="center">
  <img src="./banner.png" alt="Visual Deadline banner" />
</p>

<div align="center">

# Visual Deadline (VD)

### Visualize pressure, not just tasks.

An evolving personal planning and execution workspace: capture work, organize goals, understand deadline pressure, plan dependencies, and review what actually happened.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](./LICENSE)
[![React](https://img.shields.io/badge/React-TypeScript-3178C6)](https://react.dev/)
[![Project status](https://img.shields.io/badge/Status-Early%20stage-lightgrey)](./ROADMAP.md)

**[Web app](https://visual-deadline.vercel.app) · [Roadmap](./ROADMAP.md) · [Community & Cloud](./docs/COMMUNITY_AND_CLOUD.md) · [中文简介](#中文简介)**

</div>

---

## What is VD?

Most task managers show what is due. **VD aims to show why something matters now, how it relates to bigger goals, and whether the work is actually moving forward.**

VD began as a personal pressure-visualization project. The codebase has since expanded into a V2 workspace for planning and execution. It remains an **early-stage, independently developed product**, not a finished or independently certified personal AI agent.

The main workspace currently has five destinations:

| Workspace | Purpose |
| --- | --- |
| **NOW / 现在** | See the current work context and what needs attention. |
| **TASKS / 任务** | Capture, inspect, and organize tasks. |
| **PLAN / 计划** | Connect goals, milestones, and tasks. |
| **OPS / 执行** | Work with dependencies, scheduling, and execution plans. |
| **REVIEW / 回顾** | Inspect activity history and reflect on outcomes. |

The repository also contains earlier pressure, life-map, social-graph, and local-first experiences. Some older components coexist with V2 for compatibility; they are **not all primary V2 navigation destinations**.

## What is implemented, and what is not?

The distinctions below describe **code visible in this public repository**. They are not claims that a hosted production feature has been launched or independently verified.

| Area | Status in the public codebase | Important boundary |
| --- | --- | --- |
| V2 five-page workspace | Implemented in source | Experience and mobile polish continue. |
| Task, goal, milestone, dependency, scheduling domains | Implemented in source | Scheduling models are not a promise of autonomous real-world execution. |
| Review history and reporting domains | Implemented in source | Durability depends on the configured storage and migration path. |
| Local data and import/export | Implemented in source | Back up important data; browser-local storage is device-specific. |
| Supabase authentication and owner-scoped cloud data paths | Implemented in source | Requires correct deployment configuration and access-control validation. |
| Server-side AI integration | Implemented in source | Requires a deployed backend and provider credentials; model usage has cost and privacy implications. |
| Billing and recurring entitlements | Implemented behind rollout controls | **Not a public claim of active, verified paid subscriptions.** |
| MCP / third-party tool ecosystem | Under development / planned | Do not assume a publicly released, supported MCP integration. |
| Long-term memory, predictive planning, autonomous agents | Research direction | Not production-ready product claims. |

For a more precise engineering inventory, see [PR O scope audit](./PR_O_SCOPE_AUDIT.md), [recurring billing contract](./docs/BILLING_RECURRING_V2.md), and the [roadmap](./ROADMAP.md).

## Try the source locally

Requirements: Node.js and npm compatible with the versions in this project's lockfile.

```bash
git clone https://github.com/RanchoTao/Visual-Deadline.git
cd Visual-Deadline
npm ci
npm run dev
```

For verification:

```bash
npm run typecheck
npm test
npm run build
```

The development server runs locally; **running the frontend is not the same as configuring the full hosted service**. Authentication, cloud storage, AI, and billing require additional environment variables and/or external providers. Never put server-only API keys or service-role secrets in browser-side `VITE_*` variables.

Reference documents: [local development](./LOCAL_DEVELOPMENT.md), [AI backend](./docs/ai-backend.md), [billing integration](./docs/BILLING_RECURRING_V2.md), and [security](./SECURITY.md).

## Local data, cloud data, and privacy

VD supports browser-local workflows and also contains authenticated cloud-data paths. **Do not assume all signed-in usage remains entirely on your device.** The actual data path depends on the feature, session, configuration, and deployment. Read the product's privacy notices before entering sensitive information into a hosted deployment.

- Personal task, goal, review, and relationship content is **user data**, not material for the public GitHub repository.
- A public source-code license does **not** publish any user's database, backups, or AI conversation context.
- Export and recovery matter; important content should not depend on a single browser cache.
- Cloud and AI features must clearly disclose where information is sent and protect access with server-side checks.

See [SECURITY.md](./SECURITY.md) for reporting issues and the current trust boundaries.

## Open source and the hosted service

The **code committed to this public repository** is distributed under [Apache-2.0](./LICENSE). It can be used, changed, and commercially redistributed under that license's terms. Publishing a version here does not imply that every ongoing experiment, operations system, or future service component will be publicly released.

The intended model is:

- **Community / self-managed:** use the published code, operate it yourself, and control your own infrastructure.
- **Official hosted service (planned commercial direction):** optional convenience, hosting, synchronization, backups, maintenance, and support.
- **AI services (proposed):** optional model-backed planning and agent functionality with explicit usage and cost limits.

These are **product directions, not current price or availability commitments**. Self-hosting may require services and configuration beyond `npm run dev`. See [Community & Cloud policy](./docs/COMMUNITY_AND_CLOUD.md) and [public release process](./docs/PUBLIC_RELEASE_PROCESS.md).

## Development and contributions

This public repository is a **versioned source and community release channel**. Public releases may lag active development. The maintainer may also develop future features privately and publish reviewed portions later. Public branches, issues, and PRs should not be mistaken for a guarantee that every proposed feature will ship.

Contributions are welcome for issues and improvements within the published codebase. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) before submitting a PR.

## Roadmap and research

Near term: usable V2 experience, dependable data export and account boundaries, mobile UX, understandable planning and review, honest deployment documentation.

Later, if validated: stronger cloud onboarding, MCP integrations, explainable AI planning, longitudinal memory, and agent execution with explicit user authorization.

Follow [ROADMAP.md](./ROADMAP.md) for staged priorities. The roadmap is a direction, not a delivery promise.

## 中文简介

**VD（Visual Deadline）** 最初是一个让任务压力可视化的个人项目，现在正逐步发展为覆盖「现在、任务、计划、执行、回顾」的个人规划与执行工作空间。

- **已进入代码库：** V2 工作区、目标与任务模型、部分调度和回顾能力、本地数据管理、账户及云端相关实现。
- **需要独立配置和验收：** 云服务、AI 后端、订阅与支付。代码存在不等于功能已在生产环境正式开放。
- **正在探索：** MCP 接入、长期记忆、预测式任务规划及 Agent 自动执行。
- **开源与收费并不冲突：** 公开代码允许按许可证自行运行；未来官方可能针对托管、同步、维护和 AI 服务收费。**尚未公布正式套餐和价格。**

这个仓库公开的是开源代码和产品文档，**不是用户数据库**。在网页端使用云功能前，请确认当前部署的数据处理与隐私说明。开发与发布边界参见 [开源与云服务说明](./docs/COMMUNITY_AND_CLOUD.md)。

---

## License

The material licensed in this repository is provided under the [Apache License, Version 2.0](./LICENSE), subject to any separately identified third-party notices and licenses. Previously distributed versions retain their existing grants. The maintainers have **not** changed this repository's license as part of this documentation update.
