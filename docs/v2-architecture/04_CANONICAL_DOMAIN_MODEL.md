# Canonical domain model

## Modeling rules

1. Canonical entities store user-confirmed facts and durable lifecycle state.
2. Projections, recommendations, scores, plan proposals, and reports reference canonical IDs and are versioned or rebuildable.
3. Provider payloads are evidence, not product primary keys.
4. All IDs use UUIDs in the target schema. Legacy text IDs are retained in an `external_refs`/migration ledger until retirement.
5. Timestamps are UTC instants; timezone is an explicit user or plan preference.

## Core entities

### Goal

Represents an intended outcome, not a container for arbitrary tasks.

Required concepts: `id`, `userId`, `title`, `status`, `importance`, `createdAt`, `updatedAt`. Optional concepts: description, horizon, parent Goal, success criteria, target date, provenance, archived timestamp.

Statuses: `draft`, `active`, `paused`, `completed`, `abandoned`, `archived`.

### Milestone

A verifiable checkpoint belonging to exactly one Goal. It may depend on other Milestones and may group Tasks, but it is not a Task with a special label.

Required concepts: `id`, `userId`, `goalId`, `title`, `status`, ordering key, timestamps. Optional concepts: target date, success criteria, completion evidence, provenance.

Statuses: `planned`, `ready`, `in_progress`, `completed`, `skipped`, `blocked`, `archived`.

### Task

The atomic actionable unit for execution.

Required concepts: `id`, `userId`, `title`, `status`, `importance`, `progress`, `actionable`, timestamps. Optional concepts: `goalId`, `milestoneId`, parent Task, deadline, start-after, estimate, completed work, next action, cost, locked flag, provenance.

Statuses: `ready`, `in_progress`, `deferred`, `done`, `cancelled`, `archived`. Legacy `active/completed/abandoned` maps through an explicit adapter; values are not rewritten in-place during dual-read.

### Task dependency

An edge between Tasks. Required concepts: predecessor, successor, type, timestamps. Initial type: `blocks`; later types require an ADR. A task is executable only when every blocking predecessor is done and `startAfter` has passed.

## PLAN entities

PLAN owns long-term direction and decomposition: Goal → Milestone → Task, logical dependencies, Roadmap/Timeline projections, and versioned long-term proposals. It does not primarily own runtime capacity or resource allocation.

### Long-term plan version

An immutable PLAN proposal envelope with horizon, scope, status, generator, model/version if AI-assisted, assumptions, warnings, confidence, and a content checksum.

Statuses: `proposed`, `accepted`, `rejected`, `superseded`, `overridden`.

Accepting a long-term proposal executes an explicit command diff. The plan is not itself a mutable Task store.

## OPS entities

OPS owns rolling parallel-work decisions under finite real-world resources. These entities remain in the complete target model, but their physical persistence is deferred until OPS consumes them at runtime.

### Resource budget

A dated capacity statement: available minutes, attention capacity, energy, discretionary budget, and fixed commitments. It records source (`manual`, `estimated`, `imported`) and confidence. It is input evidence, not a promise.

### Resource allocation

An accepted allocation of a resource budget to a Goal, Milestone, or Task within an execution window. Allocations must not exceed their budget without a recorded override.

### Operations plan version

An immutable rolling schedule/replan proposal with capacity inputs, conflicts, trade-offs, allocations, generator, assumptions, warnings, confidence, and a content checksum.

Statuses: `proposed`, `accepted`, `rejected`, `superseded`, `overridden`.

Accepting an operations plan creates or supersedes execution windows and resource allocations. It does not take ownership of generic Task CRUD.

### Execution window

A bounded scheduled block for parallel execution. It references Tasks and an accepted Operations Plan Version. NOW may project the current action from these windows once OPS exists, but does not require an execution-window table during early Beta. A window never clones Task title, progress, or lifecycle as mutable truth.

## Capture entities

### Capture

One user intent envelope with raw text, source mode, lifecycle, owner, timestamps, and client idempotency key.

Statuses: `draft`, `submitted`, `processing`, `needs_confirmation`, `confirmed`, `materialized`, `failed`, `cancelled`.

### Capture attachment

Metadata for an uploaded asset: kind, MIME, byte size, storage provider/path, checksum, processing status, and retention state. Binary content stays in private object storage.

### Capture interpretation

Versioned extracted text/structure with provider/model, prompt/compiler version, confidence, warnings, and source references. Multiple interpretations may exist; none is canonical Task data.

### Capture candidate

A proposed Goal, Milestone, Task, dependency, or note generated from an interpretation. Confirmation records user edits and creates a materialization command with exact target IDs.

## Observation and review entities

### Execution event

Append-only record of an observed or commanded transition. Concepts: event ID, user, entity type/ID, event type, occurred/recorded timestamps, actor (`user`, `system`, `ai`, `import`), source, idempotency key, structured metadata, and optional supersedes/correction reference.

Events do not replace current entity state; they explain and reconstruct how it changed. Corrections append a new event rather than mutate history.

### Review

A user-confirmed review for a time window with summary, rating/energy/pressure inputs, notes, corrections, and referenced entity/event IDs. Daily Review migrates here.

### AI report

Immutable generated analysis with report type, input window, referenced entity/event IDs, model/provider/version, content, structured findings, status, and user feedback. It must distinguish generated interpretation from measured facts.

## Identity, notification, and billing entities

### Profile and preferences

Profile stores user presentation fields. Preferences store timezone, reminders, planning limits, privacy choices, and feature flags. Authentication identities remain in Supabase Auth; product tables reference `auth.users.id` and never treat editable profile data as authorization input.

### Notification

One durable inbox item with type, title, summary, content, related entity reference, delivery/dedupe key, read timestamp, created timestamp, and optional expiration. Browser permission state is a preference, not a notification.

### Subscription

VD's normalized view of an ongoing billing relationship: provider, provider subscription/customer IDs, plan, status, current period, scheduled change, cancellation timestamps, and last provider event.

### Entitlement

Provider-independent capability grant with subject, capability, source type/source ID, validity interval, status, and reason. Product authorization queries entitlements, never raw Paddle events or browser checkout state.

### Billing event and payment reference

Billing Event is an immutable, idempotent processing record for provider notifications. Payment Reference records provider transaction/payment/refund identifiers and amounts. Sensitive raw payloads are minimized or retained only under a defined audit policy.

## Relationship summary

```text
User
 +- Profile
 +- Preferences
 +- Goal 1---* Milestone 0---* Task
 |                |              |
 |                + dependencies +---* TaskDependency *--- Task
 +- ResourceBudget 1---* ResourceAllocation
 +- PlanVersion 1---* ExecutionWindow *---1 Task
 +- Capture 1---* Attachment
 |         1---* Interpretation 1---* Candidate
 +- ExecutionEvent *---0..1 canonical entity
 +- Review *---* ExecutionEvent
 +- AIReport *---* canonical entity/event
 +- Notification
 +- Subscription 1---* PaymentReference
 +- Entitlement *---1 Subscription or legacy grant
```

## What is not canonical

- Home/Today/NOW cards;
- a matrix quadrant or rank position;
- Daily Quest copies of a Task;
- Roadmap graph nodes that duplicate Goal/Milestone/Task;
- pressure labels and charts (measurements/events may be canonical; renderings are not);
- AI suggestions until confirmed;
- Paddle browser events;
- Social graph records in v2 core;
- Wayline Project containers.

## Compatibility mappings

| Legacy concept | Canonical mapping | Rule |
| --- | --- | --- |
| VD Goal | Goal | Preserve legacy ID reference and all linked Task IDs during import. |
| VD Task | Task | `startDate -> startAfter`; lifecycle adapter is reversible. |
| Wayline Project | Goal or Milestone candidate | Never auto-promote; preview mapping and require confirmation. |
| Wayline parent Task | parent Task + dependency if behavior requires | Preserve hierarchy separately from blocking semantics. |
| Roadmap `MILESTONE` node | Milestone candidate | Resolve Goal and links before materialization. |
| Roadmap `TASK_GROUP` | Projection/group metadata | Not a canonical entity unless later promoted by ADR. |
| LifeNode | Goal/Milestone projection metadata | Migrate only user-authored fields; demo records are discarded. |
| DailyQuestItem | NOW projection + Task reference; later optional Execution Window reference | Item status derives from Task/event state; early Beta does not require OPS persistence. |
| LifeEvent | Execution Event with observation namespace | Preserve original type, timestamp, metadata, and owner. |
| membership grant | Entitlement source | Maintain exact validity interval for historical purchasers. |

## Page ownership summary

| Page/surface | Canonical ownership |
| --- | --- |
| NOW | Read-only heat zone, Top 3/current action projections plus Capture entry |
| TASKS | Task CRUD, lifecycle, progress, deadlines, matrix/list/filter projections, dependencies, Goal/Milestone grouping, archive |
| PLAN | Long-term hierarchy/decomposition, logical dependencies, Roadmap/Timeline projections, long-term proposal versions |
| OPS | Resource Budgets/Allocations, Fixed Commitments, Execution Windows, rolling operations plans, conflicts and replan |
| REVIEW | Execution history, Reviews, analysis, AI Reports/recommendations, archive projections |
| Global account UI | Profile/Settings, Subscription/Billing, Notifications; not primary navigation |
