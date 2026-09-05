# VD Life Controller Vision

Visual Deadline 正在从 deadline visualization / task management 逐步扩展为 personal state-goal-action control system。

核心问题是：**What should I do now?**

长期控制器将接收：

```text
State + Goals + Constraints + Available Actions
                         ↓
                    Controller
                         ↓
                    Next Action
```

Alpha 0.1 只验证 sleep + meal 的最小闭环：记录 `wake`、`meal`、`sleep_start`，推导当前状态，再由透明的确定性规则生成 NOW / NEXT / LATER。它不做医疗判断，不调用 LLM，也不声称已经理解工作任务、日历或能量。

长期闭环为 Observe → State → Plan → Act → Record → Replan；本轮完成其中最小、可持续记录的一段。
