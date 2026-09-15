# Product architecture

## Product promise

VisualDeadline reduces the decision cost between an incoming intention and a completed, reviewed action. The system owns the loop from capture through adaptation; it is not a collection of independent dashboards.

## Five-page information architecture

| Page | Primary question | Owns | Must not own |
| --- | --- | --- | --- |
| NOW | What should I do now, and why? | Current execution projection, state summary, quick capture, one-click transitions | A separate priority formula, persisted daily task copies, full editing |
| PLAN | How should goals become feasible work? | Goal/Milestone structure, dependencies, resource budgets, plan proposals and acceptance | Direct silent task writes, unversioned AI plans, a parallel roadmap truth |
| OPS | What work exists and how is it progressing? | Task CRUD, dependency editing, matrix/list views, lifecycle, progress, estimates | Long-form analytics, subscription/settings, another recommendation engine |
| REVIEW | What happened and what should change? | Events, outcomes, reviews, trends, AI reports, archives | Mutable copies of Tasks/Goals, invented historical facts |
| ME | Who am I and how is the system configured? | Profile, identities, preferences, privacy, data controls, subscription, integrations | Core execution workflow, duplicated membership entry points |

Global UI contains the account/avatar control, notification inbox, sync status, and quick capture trigger. Membership status may appear as a compact badge, but purchase/manage flows belong to ME.

## One loop, one truth

```text
                       +----------------------+
                       |      Capture         |
                       | text/voice/image/doc |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       | Interpret + Confirm  |
                       | candidates/provenance|
                       +----------+-----------+
                                  |
                                  v
   +---------+         +----------------------+         +---------+
   | REVIEW  |<--------| canonical domain     |-------->|  PLAN   |
   | observe |         | Goal/Milestone/Task  |         | propose |
   +----+----+         +----------+-----------+         +----+----+
        ^                         |                          |
        |                         v                          |
        |              +----------------------+             |
        +--------------| NOW / OPS execution  |<------------+
                       +----------------------+
```

Canonical records hold user-confirmed facts. Projections answer page questions. Plans, recommendations, analytics, and AI reports reference canonical IDs and can be rebuilt.

## Page composition

### NOW

- Current state: time, pressure, resource/attention signal, and blockers.
- One `current` Task, a bounded `next` queue, and a small `later` summary.
- Quick transitions: start, complete, defer, or explain blockage.
- Unified Capture entry.
- Optional Life Controller suggestions only when they affect immediate execution.

NOW is derived from canonical Tasks, dependencies, accepted execution plan, resource state, and the canonical priority engine. Daily Quest becomes a compatibility view over this projection; it does not persist copied task fields.

### PLAN

- Goal list and Goal detail.
- Milestone sequence and cross-entity dependencies.
- Resource budgets and fixed commitments.
- Versioned plan proposals with assumptions, warnings, confidence, and diff.
- Explicit accept/reject/override actions.
- Graph/timeline visualizations as alternate projections of the same entities.

Roadmap nodes that represent goals, milestones, or tasks migrate into canonical entities. Knowledge/skill/stage decoration remains projection metadata until a product requirement makes it canonical.

### OPS

- All active, deferred, completed, and cancelled Tasks.
- Urgent/important matrix and list/table projections.
- Dependency/blocker inspection.
- Accurate remaining-work, deadline, estimate, progress, and lifecycle editing.
- Batch hygiene and archived-item access.

The matrix is retained as a visualization. Its mobile Top 5 list must consume the same ranking result used by NOW, not its current local formula.

### REVIEW

- Timeline from append-only execution and life events.
- Daily/weekly review records and explicit user notes.
- Pressure trends, completion behavior, estimate accuracy, and allocation variance.
- AI reports that cite their input window and entity IDs.
- Achievements as derived or separately versioned recognition records.

Current `LogPage` tabs consolidate here. Health placeholders remain hidden until backed by real data and consent.

### ME

- Profile and verified identities.
- Preferences: timezone, reminders, planning constraints, and AI settings.
- Subscription and entitlement state plus Paddle customer-portal entry.
- Privacy, export/import, account deletion, and integration management.
- Developer tools only behind a development/Labs gate.

## Responsive contract

Desktop and mobile route to the same semantic page IDs: `now`, `plan`, `ops`, `review`, `me`. A mobile tab may render a compact page variant, but `NOW` cannot resolve to Daily Quest while desktop `NOW` resolves to a different Home product. Page state belongs to routing/navigation state, not viewport-specific domain state.

## Cross-cutting services

| Service | Responsibility |
| --- | --- |
| Canonical repository | Transactional read/write of canonical entities and versions |
| Projection layer | Read models for NOW, matrix, graph, timeline, and reports |
| Priority engine | Eligibility, pressure, urgency, importance, remaining work, blockers |
| Planner | Deterministic baseline plus optional AI provider; emits proposals only |
| Capture compiler | Converts confirmed interpretations into canonical commands |
| Event recorder | Append-only observations with actor, source, and idempotency key |
| Identity service | Sessions, verified identity links, guest import ownership |
| Entitlement service | Provider-independent capability decisions |
| Sync/import service | Idempotent migration and reconciliation; never delete-and-replace by default |

## Architectural acceptance criteria

- One canonical top-task fixture produces consistent ordering in NOW, OPS matrix/list, and planner inputs.
- The same route IDs and page purposes are observable on mobile and desktop.
- A plan can be proposed and rejected without changing Tasks.
- A capture can be interpreted and abandoned without creating Tasks.
- REVIEW can be rebuilt from canonical entities/events without storing duplicate task snapshots as mutable truth.
- ME is the only full membership/settings destination.
