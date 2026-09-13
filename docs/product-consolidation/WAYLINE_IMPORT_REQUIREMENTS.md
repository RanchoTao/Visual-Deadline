# Wayline import requirements

## Blocking finding

No readable Wayline source was present on 2026-09-13. To finish consolidation without guessing, supply a complete checkout or archive (including Git submodules/LFS objects) at a stable path, plus the items below. Read-only access is sufficient for the analysis stage.

## Required source and configuration

1. Package/workspace manifests and lockfiles, exact runtime/toolchain versions, build/test/typecheck/lint commands.
2. All application source for frontend routes/components/state, backend/API/jobs, domain services, and shared packages.
3. Database schemas, every migration in order, seeds/fixtures, generated client types, and relationship/constraint definitions.
4. Goal decomposition, milestone, task, dependency, sequencing, route/path, progress, risk, recommendation, and replanning modules.
5. Planning UX: capture/editor/review/current-action/path/timeline components and navigation definitions.
6. AI prompts, structured-output schemas/parsers/validators, model/provider adapters, tool definitions, evals, and representative redacted fixtures.
7. Persistence/state code including offline behavior, sync/conflict policy, caches, event logs, plan/version history, and migrations between client schema versions.
8. Tests for planners and domain invariants, API/integration/browser tests, snapshots/golden data, and test setup.
9. Feature flags, experiment registry, telemetry event catalog, background schedulers/notifications, and documented abandoned features.
10. Asset/license inventory and third-party notices sufficient to establish that code and dependencies can legally be absorbed into the Apache-2.0 VD repository.

## Required behavior clarification

Provide current product/schema documentation or testable examples for:

- Dependency edge direction, supported edge types, cycle behavior, and cross-goal dependencies.
- Whether milestones own tasks, paths own tasks, tasks may appear in multiple paths, and branch/merge semantics.
- Deadline timezone, all-day/end-of-day policy, recurring work, duration units, and overdue calculation.
- Progress source of truth and effects of complete, reopen, skip, postpone, partial progress, and estimate changes.
- Recommendation tie-breaking, blocked/no-action states, capacity constraints, and explanation/risk output.
- Replan triggers, locked/manual edits, plan acceptance/versioning, rollback, idempotency, and audit trail.
- AI fallback behavior, privacy/redaction, malformed output handling, and which writes require user confirmation.
- Multi-user/team concepts, if any; VD is currently primarily per-user and no team assumptions should leak into the model.

## Safe sample data

Supply a redacted database/export fixture for at least:

- a simple linear goal → milestones → tasks path;
- parallel tasks and a branch that later merges;
- an unmet dependency and a dependency cycle;
- overdue, timezone-bound, date-only, and no-deadline work;
- completed/reopened/postponed tasks and a replanned path with locked work;
- deleted/archived entities and dangling legacy references;
- malformed AI output and offline deterministic fallback.

No production secrets or personal user data are required or desired. Provide `.env.example` names only, with credentials removed.

## Definition of “available”

Wayline is available when the agent can locally read source and history, install or use existing dependencies, run its documented checks, locate its persisted contracts, and trace the above behaviors to exact files. A screenshot, product description, compiled minified bundle, API endpoint without server contracts, or design mock alone is not adequate for a file-level migration.

## Import handoff format

Preferred: a sibling checkout `/workspace/Wayline` at the exact commit to migrate, with submodules initialized and a note naming the branch/tag. Alternative: add a read-only Wayline remote/submodule to this repository or provide an archive plus commit hash. Include a short `IMPORT_NOTES.md` containing commands, architecture entry points, known failing tests, required non-secret environment variables, and licensing provenance.

## Work unblocked by receipt

Once supplied, the next change can produce an exact Wayline file/module → VD destination matrix, execute both test suites, create canonical adapters and golden parity tests, and select the lowest-risk behavior to migrate. Database writes, navigation removal, and legacy-field retirement remain later reviewed stages.
