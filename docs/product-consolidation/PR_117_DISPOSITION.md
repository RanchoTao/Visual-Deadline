# PR #117 disposition after real Wayline audit

PR #117 is not merged and is not this migration's base.

| PR #117 idea | Disposition | Reason |
| --- | --- | --- |
| Persistence-neutral domain before data migration | Retained | This migration keeps pure domain code and adapters read-only. |
| Explicit dependency direction | Retained | Execution tasks retain prerequisite IDs and block descendants until status is `done`. |
| Bidirectional goal/task relation risk | Retained and strengthened | The adapter unions both directions and exposes one-sided/missing-link warnings. |
| `PlanningModel` / empty milestones / synthetic default paths | Replaced | The real source is project/task/parent-task based; milestones and paths are not invented in this first behavior migration. |
| `deadlineRisk * 100 + importance * 10 + progress` recommendation | Discarded | It conflicts with validated VD/Wayline pressure and reverses remaining-work semantics. |
| “Wayline source unavailable” audit and import requirements | Discarded | Real source is available and documented at symbol level. |
| Generic future migration language | Replaced | `WAYLINE_SOURCE_AUDIT.md` gives implementation, target, strategy and tests per actual subsystem. |
| Auth/billing isolation | Retained | No auth, billing or Paddle files are modified. |
