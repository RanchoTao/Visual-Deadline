# VisualDeadline v2 domain boundary

This directory is the persistence-neutral contract boundary for the frozen v2 architecture. It defines canonical entities, repository ports, minimal projection references, persistence-stage metadata, and a pure read-only adapter over the current VisualDeadline stores.

It does not wire runtime behavior, create database tables, replace stores, rank tasks, schedule resources, implement REVIEW history, or introduce a canonical `Project`. Wayline `Project` remains import-only. The adapter deliberately creates no Milestones because legacy task/goal links do not contain enough evidence to infer them.

## Lifecycle compatibility

| Legacy | Canonical projection | Quality |
| --- | --- | --- |
| `active` | usually `ready` | ambiguous: legacy cannot distinguish `ready`, `in_progress`, or `deferred` |
| `completed` | `done` | exact only when progress is 100; otherwise ambiguous |
| `abandoned` | `cancelled` | lossy: legacy does not preserve terminal intent precisely |

Every task receives a `LifecycleMapping`, and ambiguity or loss is also returned as structured diagnostics. The source lifecycle value remains in compatibility metadata. Persisted legacy records are never rewritten.

## Why there is no reverse adapter in PR B

A lossless canonical-to-legacy round trip is impossible: v2 has more lifecycle states, a singular canonical goal relationship, explicit Milestones and dependency edges, while the legacy model has a three-state lifecycle, two independently stored many-to-many goal link directions, no real Milestone entity, and dependency IDs without edge metadata. A reverse adapter would either fabricate data or hide loss. PR B therefore preserves legacy IDs and source metadata, returns unresolved relationships explicitly, and leaves reverse migration to a later persistence migration with an approved loss policy.
