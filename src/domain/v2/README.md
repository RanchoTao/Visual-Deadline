# VisualDeadline v2 domain boundary

This directory is the persistence-neutral contract boundary for the frozen v2 architecture. It defines canonical entities, repository ports, minimal projection references, persistence-stage metadata, and a pure read-only adapter over the current VisualDeadline stores.

It does not wire production runtime behavior, create database tables, replace stores, schedule resources, implement REVIEW history, or introduce a canonical `Project`. Wayline `Project` remains import-only. The adapter deliberately creates no Milestones because legacy task/goal links do not contain enough evidence to infer them.

## Ranking contract

`rankCanonicalTasks` is a pure, read-only selector. It composes the established VisualDeadline `importance-urgency-v1` pressure calculation with explicit lifecycle, progress, actionable, `startAfter`, and dependency eligibility. Canonical dependency truth comes only from the request's `TaskDependency` edges; the selector never reads legacy compatibility metadata from a Task. Legacy shadow callers may additionally pass transient unresolved dependency evidence produced from PR B diagnostics. It does not schedule resources or repair compatibility relationships. Every candidate remains in the result with structured score components, state checks, blockers, and exclusion reasons.

Ranking order is deterministic:

1. total VD task score, descending;
2. pressure contribution, urgency, then importance, descending;
3. valid deadline then creation timestamp, ascending;
4. binary task ID, ascending.

The selector requires an explicit `now`. Existing deadline parsing is deliberately preserved for PR C: a date-only string such as `2026-09-17` follows JavaScript's UTC-midnight parsing, an invalid deadline receives the established no-deadline urgency `0.5`, and the explanation marks those cases as `DATE_ONLY_UTC` or `INVALID_AS_NO_DEADLINE`. `startAfter` is stricter: an invalid value is ineligible as `INVALID_DATA`, and a value equal to `now` is ready.

`buildLegacyRankingShadowComparison` calls the existing Home, PriorityMap, and Daily Quest selection behaviors and classifies their differences from the canonical selector. The existing production selectors remain authoritative until a later cutover gate.

## Lifecycle compatibility

| Legacy | Canonical projection | Quality |
| --- | --- | --- |
| `active` | usually `ready` | ambiguous: legacy cannot distinguish `ready`, `in_progress`, or `deferred` |
| `completed` | `done` | exact only when progress is 100; otherwise ambiguous |
| `abandoned` | `cancelled` | lossy: legacy does not preserve terminal intent precisely |

Every task receives a `LifecycleMapping`, and ambiguity or loss is also returned as structured diagnostics. The source lifecycle value remains in compatibility metadata. Persisted legacy records are never rewritten.

## Why there is no reverse adapter in PR B

A lossless canonical-to-legacy round trip is impossible: v2 has more lifecycle states, a singular canonical goal relationship, explicit Milestones and dependency edges, while the legacy model has a three-state lifecycle, two independently stored many-to-many goal link directions, no real Milestone entity, and dependency IDs without edge metadata. A reverse adapter would either fabricate data or hide loss. PR B therefore preserves legacy IDs and source metadata, returns unresolved relationships explicitly, and leaves reverse migration to a later persistence migration with an approved loss policy.
