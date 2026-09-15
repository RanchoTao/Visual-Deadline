# VisualDeadline v2 architecture freeze

Status: **Accepted for implementation planning**

Date: 2026-09-15

Scope: product architecture, domain ownership, persistence direction, and migration order

Runtime impact of this document set: **none**

## Decision

VisualDeadline v2 is one life-execution product with five primary pages:

1. **NOW** — what to do now, current pressure/state, and fast capture.
2. **PLAN** — Goal → Milestone → Task decomposition, dependency-aware planning, and resource allocation.
3. **OPS** — operational task execution: matrix, filters, progress, dependencies, and bulk maintenance.
4. **REVIEW** — execution history, pressure and behavior trends, reviews, AI reports, and archived outcomes.
5. **ME** — identity, preferences, subscription, privacy, backup/restore, and integrations.

Social is removed from primary navigation and retained behind a hidden Labs/feature flag until it has a validated role in the core loop. It is not deleted during the v2 migration.

The product loop is:

```text
Capture -> Interpret -> Confirm -> Plan -> Execute -> Observe -> Review -> Adapt
```

No primary page owns a separate task truth, priority formula, or planning model. Pages are projections over one canonical domain.

## Frozen boundaries

| Boundary | Frozen decision |
| --- | --- |
| Core hierarchy | `Goal -> Milestone -> Task`; a Task may be independent, but a Milestone belongs to one Goal. |
| Project | Not a v2 canonical entity. Wayline `Project` is an import/compatibility container mapped to Goal or Milestone after explicit review. |
| Priority | One canonical pressure/priority engine. All ranked lists consume its output and may apply only declared eligibility filters. |
| NOW | A bounded projection, not another task store. It presents at most one current action and a small next queue. |
| PLAN | Creates versioned plan proposals. Only explicit acceptance may materialize or change canonical Tasks. |
| OPS | The authoritative editing surface for Tasks, dependencies, lifecycle, and progress. |
| REVIEW | Derived analytics and append-only observations. It must not duplicate mutable Task or Goal state. |
| Capture | Text, voice, image, and document share one intake envelope and one confirmation gate. |
| AI | AI output is advisory/draft material with provenance. It cannot silently mutate canonical entities or entitlements. |
| Storage | Additive migrations, dual-read/controlled-write, backfill, verification, then retirement. No destructive reset script. |
| Identity | One user may have multiple verified identities. Guest import is explicit, previewable, idempotent, and recoverable. |
| Billing | Paddle events are evidence; VD-owned subscription and entitlement records are product truth. Browser events never grant access. |
| Navigation | Desktop and mobile expose the same five information-architecture destinations. Responsive layout may differ; semantics may not. |

## Invariants

- Existing VisualDeadline pressure behavior is preserved through characterization tests before replacement.
- A canonical entity has one owner and one identifier. UI-specific records reference it; they do not clone it.
- Persisted source facts are distinguished from derived projections and AI suggestions.
- Every destructive migration step has a measured precondition, export/backup coverage, and rollback path.
- Every cloud table exposed through the Data API has explicit grants, RLS enabled, least-privilege policies, and negative cross-user tests.
- Provider secrets and service-role credentials remain server-only.
- The existing production application remains shippable at every PR boundary.

## Explicit non-goals

- No broad UI restyle or page rewrite in the architecture PR.
- No wholesale Wayline import, Zustand store import, Next.js shell import, or branding import.
- No deletion of Social data, Roadmaps, Daily Quest data, Life Controller events, or legacy JSONB rows before verified migration.
- No production Supabase schema execution or Paddle catalog change from this document set.
- No claim that phone auth, OAuth linking, recurring subscriptions, or guest migration already work.

## Implementation gate

This freeze authorizes small, reversible implementation PRs only in the order and with the gates in [09_MIGRATION_SEQUENCE.md](./09_MIGRATION_SEQUENCE.md). Any change to the five-page model, canonical entities, or provider-of-record rules requires a new ADR that supersedes this file.

## Supporting documents

- [01_PRODUCT_ARCHITECTURE.md](./01_PRODUCT_ARCHITECTURE.md)
- [02_CURRENT_SYSTEM_AUDIT.md](./02_CURRENT_SYSTEM_AUDIT.md)
- [03_FEATURE_MIGRATION_MAP.md](./03_FEATURE_MIGRATION_MAP.md)
- [04_CANONICAL_DOMAIN_MODEL.md](./04_CANONICAL_DOMAIN_MODEL.md)
- [05_DATABASE_TARGET_SCHEMA.md](./05_DATABASE_TARGET_SCHEMA.md)
- [06_AUTH_AND_IDENTITY.md](./06_AUTH_AND_IDENTITY.md)
- [07_BILLING_AND_ENTITLEMENTS.md](./07_BILLING_AND_ENTITLEMENTS.md)
- [08_CAPTURE_ARCHITECTURE.md](./08_CAPTURE_ARCHITECTURE.md)
- [09_MIGRATION_SEQUENCE.md](./09_MIGRATION_SEQUENCE.md)
- [10_RISK_REGISTER.md](./10_RISK_REGISTER.md)
