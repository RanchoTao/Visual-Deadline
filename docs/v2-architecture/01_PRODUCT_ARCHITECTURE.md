# Product architecture

## Product promise

VisualDeadline reduces the decision cost between an incoming intention and a completed, reviewed action. The system owns the loop from capture through adaptation; it is not a collection of independent dashboards.

## Final five-page information architecture

The primary navigation is exactly: **NOW / TASKS / PLAN / OPS / REVIEW**.

| Page | Primary question | Owns | Must not own |
| --- | --- | --- | --- |
| NOW | What should I do now? | Task heat zone, current Top 3, current action, multimodal Capture | A separate Task store, CRUD suite, or private ranking formula |
| TASKS | What work exists and what state is it in? | All Task CRUD; urgency × importance matrix; full list and filters; lifecycle, progress, deadlines; dependency inspection/editing; Goal/Milestone grouping; archive/completed/deferred/cancelled views | Runtime resource allocation, long-term planning, another recommendation engine |
| PLAN | How do I get from here to the long-term goal? | Goal → Milestone → Task decomposition; AI long-term decomposition; Roadmap; past/present/future Timeline; logical dependencies and milestones; versioned plan proposals | Primary runtime resource allocation, silent Task writes, a parallel Roadmap truth |
| OPS | Given limited real-world resources, how should competing work progress in parallel? | Parallel-task operating system; rolling planning; execution windows; capacity; finite time, attention, energy, and optional money allocation; resource budgets/allocations; fixed commitments; multi-project scheduling; conflicts and replan | Generic Task CRUD/matrix/list ownership, account settings, long-form review analytics |
| REVIEW | What happened and what should change? | Execution history, reviews, completion/delay analysis, pressure/trends, AI reports/recommendations, archive | Mutable copies of Tasks/Goals, invented historical facts |

ME is not a page or route. Global account surfaces are reached from persistent controls:

- Avatar → Profile / Account / Settings
- Avatar-left membership control → Subscription / Billing
- Notification bell → Notifications
- Billing may also be opened from Settings
- Settings owns profile, account/security, preferences, privacy/data/export, AI settings, and integrations

Social remains hidden in Labs and its data is retained.

## One loop, one truth

```text
                       +----------------------+
                       |        NOW           |
                       | Capture + act now    |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       | canonical domain     |
                       | Goal/Milestone/Task  |
                       +----+---------+-------+
                            |         |
                  +---------+         +----------+
                  v                              v
          +---------------+             +---------------+
          | PLAN          |             | TASKS         |
          | decompose     |             | own work state|
          +-------+-------+             +-------+-------+
                  |                             |
                  +-------------+---------------+
                                v
                        +---------------+
                        | OPS           |
                        | allocate/replan|
                        +-------+-------+
                                |
                                v
                        +---------------+
                        | REVIEW        |
                        | observe/adapt |
                        +---------------+
```

Canonical records hold user-confirmed facts. Projections answer page questions. Plans, recommendations, resource allocations, analytics, and AI reports reference canonical IDs and are versioned or rebuildable.

## Page composition

### NOW

- Task heat zone using the canonical pressure engine.
- Current Top 3 and one explicit current action.
- Bounded next/later context without copying mutable Task state.
- Multimodal Capture for text, voice, image, and document.
- Optional immediate state signal only when it changes what is safe or feasible now.

NOW is derived from canonical Tasks, dependencies, accepted plan/OPS state, and the canonical priority engine. Daily Quest becomes a compatibility presentation over this projection.

### TASKS

- Create, read, edit, archive, restore, complete, defer, and cancel Tasks.
- Full Task list with filters and lifecycle views.
- Urgency × importance matrix and consistent ranked views.
- Deadline, progress, estimate, remaining work, and next-action editing.
- Dependency inspection/editing and blocked-state explanation.
- Goal/Milestone grouping without duplicating hierarchy.
- Completed, deferred, cancelled, and archived access.

The current `TaskPage`, `PriorityMap`, `TaskList`, and `TaskForm` converge here. Every ranking projection consumes the same canonical engine used by NOW.

### PLAN

- Goal and Milestone hierarchy and success criteria.
- Goal → Milestone → Task decomposition.
- AI-assisted long-term decomposition with editable provenance.
- Roadmap and past/present/future Timeline as projections of canonical entities.
- Logical dependencies between long-term entities.
- Immutable, versioned plan proposals with assumptions, warnings, confidence, diff, and accept/reject/override actions.

PLAN defines intended structure and direction. It may express high-level feasibility assumptions, but runtime capacity, execution windows, resource budgets, and allocations belong to OPS.

### OPS

- Rolling plan across multiple simultaneous Goals/Milestones/Tasks.
- Execution windows and current scheduling horizon.
- Available capacity and fixed commitments.
- Finite time, attention, and energy budgets and allocations.
- Optional money or other constrained-resource budgets.
- Multi-project scheduling without making Project a mandatory canonical entity.
- Conflict detection, trade-off explanations, replan, and user overrides.

OPS consumes canonical Tasks from TASKS and direction/proposals from PLAN. It does not become a second Task CRUD surface. Its outputs are execution windows, resource allocations, and explainable scheduling decisions.

### REVIEW

- Timeline from append-only execution and life events.
- Daily/weekly reviews and explicit user notes.
- Completion, delay, estimate, allocation, pressure, and behavior analysis.
- AI reports and recommendations that cite their input window and entity IDs.
- Archive and historical outcomes.

Current `LogPage` content consolidates here. Health placeholders remain hidden until backed by real data and consent.

## Global account surfaces

These surfaces are outside primary navigation:

| Trigger | Surface | Ownership |
| --- | --- | --- |
| Avatar | Profile / Account / Settings | identity display, account/security, preferences, privacy/data/export, AI settings, integrations |
| Membership control left of avatar | Subscription / Billing | plan, entitlement, payment history, manage subscription |
| Notification bell | Notifications | durable inbox, read state, related-entity deep links |

The account menu may link from Settings to Billing, but no `ME` primary route is created. Developer tools remain behind a development/Labs gate.

## Responsive contract

Desktop and mobile route to the same semantic page IDs: `now`, `tasks`, `plan`, `ops`, `review`. A compact mobile page may differ in layout, but not in ownership. `NOW` cannot resolve to a separate Daily Quest product, and TASKS cannot disappear behind OPS.

## Cross-cutting services

| Service | Responsibility |
| --- | --- |
| Canonical repository | Transactional read/write of canonical entities and versions |
| Projection layer | Read models for NOW, TASKS matrix/list, PLAN graph/timeline, OPS schedules, and REVIEW reports |
| Priority engine | Eligibility, pressure, urgency, importance, remaining work, blockers |
| Long-term planner | Goal/Milestone/Task decomposition and versioned proposals for PLAN |
| Operations planner | Capacity/resource-aware rolling scheduling and replanning for OPS |
| Capture compiler | Converts confirmed interpretations into canonical commands |
| Event recorder | Append-only observations with actor, source, and idempotency key |
| Identity service | Sessions, verified identity links, guest import ownership |
| Entitlement service | Provider-independent capability decisions |
| Sync/import service | Idempotent migration and reconciliation; never delete-and-replace by default |

## Architectural acceptance criteria

- The primary destinations are exactly NOW, TASKS, PLAN, OPS, REVIEW on desktop and mobile.
- One canonical top-task fixture produces consistent ordering in NOW and TASKS matrix/list projections.
- Generic Task CRUD, matrix, filters, and lifecycle editing exist in TASKS, not OPS.
- PLAN can propose and reject long-term decomposition without changing Tasks.
- OPS can schedule competing Tasks under constrained capacity without owning their CRUD truth.
- Capture can be interpreted and abandoned without creating canonical entities.
- REVIEW can be rebuilt from canonical entities/events without storing duplicate mutable Task snapshots.
- Avatar, membership control, and notification bell open their respective global account surfaces.
