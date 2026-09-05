# Information Architecture

VD 的一级页面职责固定为：

| 页面 | 定义 | 回答的问题 |
| --- | --- | --- |
| 首页 | Control Plane | What should I do now? |
| 任务 | Action Inventory | What can I do? |
| 人生 | Goals / Model | Where am I going? |
| 社交 | Relationships / Environment | Who is in my world? |
| 数据 | Observation | What happened? |

默认禁止为新能力增加一级导航。先判断信息属于 current action、candidate action、goal/model、relationship/environment 或 history/observation，再归入已有页面。

Alpha 0.1 将 Life Controller 放在首页最高层。桌面首页仍由既有首页入口承载；移动端沿用已有首个入口，但标签统一为“首页”。既有任务概览与今日任务计划未删除，改为折叠后的兼容区，避免与 NOW 争夺注意力。

长期信息流：人生定义目标与节律 → 任务提供候选行动 → 首页压缩 action space → 用户行动并记录 → 数据页回顾历史 → controller replan。Alpha 不提前改造其余页面。
