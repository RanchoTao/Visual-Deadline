# Wayline to VisualDeadline migration plan

## Status

Phase 1 is implemented on the isolated `codex/wayline-domain-migration` branch. It
does not merge PR #117, touch auth/billing/Paddle, alter cloud tables, change local
storage schemas, or replace a UI surface.

## Completed first migration

1. Source-level audit and A/B/C/D classification: `WAYLINE_SOURCE_AUDIT.md`.
2. New persistence-neutral `src/domain/execution` behavior derived from real Wayline.
3. VD Task/Goal adapter with bidirectional-link reconciliation warnings.
4. Golden parity tests for priority, executable eligibility, capture materialization,
   transitions, review actions, and legacy conversion.

## Compatibility and rollback

The new domain reads `Task` and `Goal` arguments only. It writes no browser storage,
Supabase data, backup envelope, auth record, billing state, or existing component
state. Removing the new modules restores the previous runtime unchanged. Existing
records remain readable because no record shape changed.

## Next stages

1. Integrate the adapter and Top 3 result into one small existing VD read-only
   projection, guarded by tests comparing current pressure output.
2. Add an explicit confirmed-capture adapter in VD's existing intake path, retaining
   provenance in an additive local schema after backup coverage is expanded.
3. Establish additive canonical persistence plus dual-read/export tests only after
   real user-data fixtures and a link-repair UX exist.
4. Consolidate the existing Home, Life Planner and Daily Quest recommendation surfaces
   only after they consume the same domain result.

## Non-goals for this PR

- No Wayline Zustand store, Next application shell, branding, localStorage key, or API
  transport is imported.
- No schema/table deletion, destructive rewrite, auth, billing, Paddle, provider key,
  or UI-navigation change occurs.
- Life Planner, Daily Quest, Timeline, Roadmap, Social and Life Controller remain.
