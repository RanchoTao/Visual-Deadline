# Decisions

## D-001 — Integrate at home, add no top-level navigation

Life Controller directly answers the homepage question. A separate Life OS/Health/Daily/Today destination would fragment the control plane, so no new first-level module is created.

## D-002 — Preserve rather than delete existing homepage value

The old task heat map and Top 3 recommendation remain available in a collapsed “原有任务概览” section. On mobile, the old daily quest remains in a collapsed compatibility section. This is the smallest reversible change that gives NOW visual priority without deleting mature paths.

## D-003 — Use a dedicated event table

Life events are observations and must not be forced into Task JSONB. `life_events` is additive, user-owned, timestamped and metadata-extensible. No existing task/user data is migrated or rewritten.

## D-004 — State is derived and uncertainty is visible

Durations are calculated from event history. Missing history produces `unknown`; duplicate transitions produce warnings and are ignored for transition timing. The UI disables obvious duplicate wake/sleep capture.

## D-005 — Local-first degradation

Guest mode and a missing cloud migration must not destroy the Alpha loop. Events remain locally persistent and owner-scoped; the UI reports when cloud sync is not active. Signed-in cloud rows remain protected by explicit grants plus per-operation RLS policies.

## D-006 — No fake editing or intelligence

Alpha supports reliable undo, not timestamp editing. It does not select work tasks, diagnose health, or call an LLM. These omissions are explicit instead of represented by non-persistent controls.
