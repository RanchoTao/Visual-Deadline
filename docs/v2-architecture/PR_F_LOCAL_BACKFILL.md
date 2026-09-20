# PR F local backfill boundary

`src/domain/v2/backfill.ts` is a pure planner over the PR B compatibility adapter. It creates no database connection and reports per-record SHA-256 source fingerprints when used by the administrative runner. The browser-safe fallback checksum is only deterministic; it is not described as cryptographic.

The planner only considers legacy `goals`, `tasks`, their explicit reciprocal Goal links, valid parent evidence, and valid task dependency edges. It does not import pressure logs, milestones, OPS/REVIEW resources, Capture, notifications, billing, profiles, or any other legacy domain. One-sided, missing, self, multiple, or cyclic relationships stay as warnings or unresolved evidence; they are never guessed into canonical foreign keys.

`npm run v2:backfill:local -- --input <fixture>` is report-only by default. `--apply` is a local administrative path only: it rejects `--linked`, `--project-ref`, the audited production ref, and non-local database URLs, and invokes only `supabase db query --local`. It creates or resumes a ledger job, inserts only per-entity canonical rows and mappings, and never uses cloud sync's delete-and-reinsert strategy. `VD_V2_FAIL_AT` supports `before-write`, `after-first-goal-batch`, `after-goal-mappings`, `after-first-task-batch`, `after-task-mappings`, `during-dependency-creation`, and `before-final-reconciliation` for local interruption tests.

The read compatibility surface in `src/domain/v2/shadowRead.ts` defaults to `legacy`. Shadow reads return the legacy value to callers and only emit comparison diagnostics. There is no production wiring, write path, or UI authority change in this PR.

Use `npm run v2:backfill:fixture` to generate the deterministic local scale fixture (6 Goals, 191 Tasks, 19 source dependency references). It deliberately contains one missing and one self dependency so the report demonstrates unresolved evidence.
