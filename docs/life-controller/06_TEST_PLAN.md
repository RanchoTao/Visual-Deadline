# Test Plan

## Domain automation

Run `npm test`. The suite covers:

1. Empty history → unknown.
2. Wake → awake.
3. Wake → current time → awake duration.
4. Sleep start → wake → sleep duration.
5. Meal → current time → elapsed time.
6. Multiple meals → meals today.
7. Cross-midnight duration.
8. IANA timezone date-boundary conversion.
9. Duplicate wake.
10. Duplicate sleep start.
11. Undo latest event.
12. Serialized local store reload.
13. Multi-owner local isolation and merge deduplication.
14. NOW/NEXT/LATER cardinality.

## Database security

Run `npx supabase test db` with the local stack running. `supabase/tests/life_events_rls_test.sql` checks table shape, RLS enablement, own-row CRUD and cross-user denial/invisibility.

## Static/build

- `npm run typecheck`
- `npm run build`
- `git diff --check`
- `npm run lint` only if a lint script exists; Alpha does not label typecheck as lint.

## Browser

Desktop and a narrow mobile viewport must verify:

- NOW is the first clear action and never contains more than one item.
- Unknown state does not show invented duration.
- Wake/meal/sleep each record in one click.
- Duplicate wake/sleep is disabled or rejected.
- History shows local-time rendering.
- Undo removes the latest event and state replans immediately.
- Reload retains owner-scoped local events.
- Touch targets, safe-area padding and scroll remain usable.
- Existing task modules, navigation, Life Map and Timeline still open.

## 2026-09-05 measured result

- Domain: 12/12 passed.
- Existing Life Planner scenarios A–E and G: passed via its manual Node test entry.
- Typecheck and production build: passed.
- Mobile 390 × 844 and desktop 1440 × 1000: passed the flows above.
- Console: no warning/error entries during browser verification.
- Database: not executed because the local Supabase Postgres endpoint at `127.0.0.1:54322` was unavailable; the pgTAP file remains ready for a running local stack or staging project.
- Lint: unavailable because the existing repository has no lint script.
