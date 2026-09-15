# Risk register

Scale: likelihood and impact are `Low / Medium / High / Critical`. “Gate” is the condition that must be satisfied before exposure or deletion.

| ID | Risk | Likelihood | Impact | Detection/evidence | Mitigation | Rollback | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-01 | Current cloud sync deletes all user rows before reinsertion; failure can leave partial/empty cloud state | High | Critical | Failure injection between DELETE and POST | Per-row/versioned writes, tombstones, transaction/import job | Stop v2 writes; restore from immutable snapshot/legacy | No delete-and-replace on canonical tables |
| R-02 | Guest sign-in silently merges local/cloud with cloud winning same-ID conflicts | High | Critical | Collision fixtures and source audit | Preview, conflict ledger, explicit confirmation | Preserve both copies and local snapshot | Guest import collision/retry suite |
| R-03 | Backup envelope omits Roadmap, notifications, Daily Quest/Review, reminders, AI settings | High | Critical | Enumerate storage keys versus export schema | Versioned complete export with explicit secret exclusions | Continue old local stores; restore snapshot | Full round-trip before migrations |
| R-04 | Core text IDs conflict with UUID relationships such as `roadmaps.goal_id` | High | High | Referential dry-run report | UUID canonical IDs plus legacy ref ledger; quarantine unresolved | Legacy read remains available | Zero unexplained relationship loss |
| R-05 | Three ranking formulas yield different “next” work | High | High | Shadow comparison across real/synthetic fixtures | One canonical eligibility/ranking service; explainable components | Feature flag to legacy selector | Defined parity threshold and reviewed differences |
| R-06 | Changing pressure formula erodes product behavior | Medium | Critical | Boundary characterization corpus | Preserve VD pressure engine; merge only proven execution filters | Switch selector flag back | Frozen pressure tests |
| R-07 | Daily Quest persists copied Task execution state and diverges | High | High | Task mutation then reload/review fixture | Store Task references/projection state only | Legacy Daily Quest read-only | Same canonical IDs/status across NOW/TASKS |
| R-08 | Roadmap, LifeNode, Goal, Milestone-like layers and Tasks duplicate hierarchy | High | Critical | Entity/link inventory and graph audit | Type-specific candidate mapping; projections over canonical model | Keep legacy graph read-only | Mapping preview and unresolved quarantine |
| R-09 | Plan acceptance partially writes Tasks | Medium | Critical | Interrupt after each command | Transactional command diff, idempotency, plan decision state | Resume/revert via recorded before/after commands | Accept/reject atomicity suite |
| R-10 | `App.tsx` extraction changes initialization/sync order | High | High | StrictMode/reload/rapid auth tests | Strangler interfaces and one concern per PR | Revert extraction; no schema dependency | Behavior characterization |
| R-11 | Desktop/mobile page semantics remain different | High | Medium | Route matrix at viewport boundary | Shared semantic route IDs and page contracts | Legacy shell flag | Cross-viewport navigation E2E |
| R-12 | Social data is deleted when removed from navigation | Medium | High | Export/count checks before nav change | HIDE only; keep storage and export | Restore Labs flag | Backup coverage and explicit later deletion approval |
| R-13 | Static demo timeline/life records are mistaken for user facts | Medium | High | Production fixture/source markers | Hide demo data; require provenance | Disable projection | No demo entities in production primary views |
| R-14 | Review history reconstructed from mutable Tasks changes retroactively | High | High | Edit old Task and compare prior timeline | Append-only events and windowed Reviews | Render legacy timeline with warning | Historical stability tests |
| R-15 | Derived pressure snapshots and manual observations are conflated | Medium | High | Source-field audit | Preserve source/event type; recompute only derived records | Retain raw legacy payload | Manual records unchanged after recompute |
| R-16 | Custom auth client misses OAuth/PKCE/linking edge cases | High | Critical | Auth callback/session/security tests | Supported Supabase client behind interface | Disable new providers; retain email flow | Provider and recovery matrix |
| R-17 | Access/refresh tokens in localStorage amplify XSS | Medium | Critical | XSS/CSP audit, token storage inspection | Supported defaults, CSP, sink cleanup, short session policy | Force logout/revoke sessions if exposed | Security review before broader providers |
| R-18 | Identity linking merges populated accounts incorrectly | Medium | Critical | Two-account collision tests | Separate credential linking from domain merge; explicit resolution | Unlink/recover credentials; preserve both domains | No silent populated-account merge |
| R-19 | Phone OTP invites abuse/cost/account enumeration | High | High | Rate/provider abuse tests | Provider quotas, CAPTCHA/rate limits, generic responses, recovery policy | Disable phone flag | Abuse budget and runbook |
| R-20 | OAuth/phone rollout locks out users after unlink | Medium | Critical | Last-identity and recovery scenarios | Deny unlink of last usable method; recent-auth requirement | Admin-assisted recovery with audit | Recovery drills |
| R-21 | RLS policy/grants expose cross-user data | Medium | Critical | Two-user and anon SQL tests | Explicit grants, RLS, `(select auth.uid())`, same-owner relation guards | Revoke API grants/disable feature | Negative policy suite on every table |
| R-22 | Root `supabase-schema.sql` destroys production data | Medium | Critical | CI migration lint/deployment manifest | Deprecate and exclude; chronological additive baseline | Restore database backup/PITR | Destructive script cannot enter deployment |
| R-23 | Avatar/intake storage policy permits unintended read/write/delete | Medium | High | Cross-user object tests | Private assets, path ownership, operation-specific policies | Revoke policies/disable uploads | Storage RLS matrix |
| R-24 | Capture provider output creates incorrect entities | High | High | Invalid/adversarial output fixtures | Schema validation, provenance, editable confirmation | Reject candidate; raw capture intact | Zero canonical writes before confirm |
| R-25 | Orphaned uploads create privacy/cost leak | High | Medium | Object-to-attachment reconciliation | Checksums, quotas, retention states, delayed cleanup | Stop cleanup/upload flags | Cleanup dry-run and audit log |
| R-26 | Guest binary assets cannot migrate but Tasks reference them | Medium | High | Import manifest verifies every object | Mark unresolved, upload explicitly, never fabricate URL | Keep local asset/export | Zero broken durable refs |
| R-27 | Browser-stored AI key/direct provider calls leak secrets or data | Medium | Critical | Production bundle/storage/secret scan | Server AI gateway; Developer Tools hidden in production | Disable direct-provider flag; rotate exposed key | No production user key path |
| R-28 | AI reports present generated claims as measured facts | High | High | Provenance/content review | Input window/refs/model/status; UI labels generated vs observed | Hide/invalidate report | Traceability tests |
| R-29 | Existing billing v1 is mistaken for recurring subscription support | High | High | Catalog/migration inspection | Separate recurring price IDs and Subscription model | Keep legacy one-time checkout only | Sandbox subscription lifecycle |
| R-30 | Browser checkout event grants Plus prematurely | Low | Critical | Webhook/browser adversarial test | Entitlements only from verified server state | Rebuild entitlements; revoke bad grant | No client grant code |
| R-31 | Duplicate or concurrent webhooks extend access twice | Medium | Critical | Replay/concurrency tests | Unique provider event/ref IDs and per-subscription locking | Deterministic rebuild | Exactly-once effect under replay |
| R-32 | Out-of-order billing events reactivate canceled/refunded access | High | Critical | Permuted event sequence suite | Occurred/version ordering plus provider fetch/reconciliation | Rebuild from provider evidence | All sequence permutations |
| R-33 | Subscription and historical grant overlap double-counts/shortens access | Medium | High | Legacy purchaser fixtures | Freeze explicit overlap commercial rule | Preserve max valid legacy interval | Historical entitlement parity |
| R-34 | Sandbox and production provider data mix | Low | Critical | Environment mismatch tests | Store environment on bindings/events; fail closed | Disable checkout/webhook environment | Deployment configuration guard |
| R-35 | Missing webhook produces stale entitlement | Medium | Critical | Scheduled reconciliation diff | Provider reconciliation using same projector | Manual replay/reconcile | Missed-event recovery test |
| R-36 | Notification rows exist but runtime remains local/seeded, causing duplicates | High | Medium | Cross-device/read-unread test | Durable dedupe keys and one repository | Disable server producers, retain local inbox | Delivery/read idempotency |
| R-37 | Cleanup deletes legacy data in same release that disables reads | Medium | Critical | PR/deployment review | Separate releases and observation window | Re-enable legacy reads | Zero fallback telemetry + restore drill |
| R-38 | OPS is treated as a renamed Task page and takes CRUD/matrix/list ownership from TASKS | High | High | Page contract and route/component audit | Enforce TASKS owner for generic Task state; OPS consumes Tasks for scheduling only | Disable OPS route/feature flag | No generic Task CRUD/matrix/list implementation owned by OPS |
| R-39 | PLAN retains runtime Resource Budget/Allocation/Execution Window ownership | Medium | High | Domain import and page dependency audit | Split long-term planner from operations planner; move runtime resource types to OPS | Keep resource scheduling disabled | PLAN tests contain no runtime allocation ownership |
| R-40 | Complete target schema becomes an accidental Beta prerequisite | High | High | Migration/launch checklist audit | Label Beta-required versus later/deferred; introduce tables only with consuming surface | Skip/deactivate deferred migrations | Beta succeeds without OPS/REVIEW future tables |
| R-41 | Profile/Settings/Billing/Notifications reappear as a `ME` primary route | Medium | High | Exact navigation inventory on desktop/mobile | Global avatar, membership, and bell surfaces with no primary `ME` route | Restore corrected navigation contract | Primary routes equal NOW/TASKS/PLAN/OPS/REVIEW exactly |

## Highest-priority blockers

The following block any automated data migration: R-01, R-02, R-03, R-04, R-08, R-21, and R-22.

The following block public Auth/Billing launch: R-16 through R-20 and R-29 through R-35.

R-38 through R-41 block page-shell and Beta-scope acceptance even when no data migration occurs.

## Risk review cadence

- Reassess this register in every v2 implementation PR.
- A risk can close only with linked test/reconciliation evidence, not because code was merged.
- New unknown data shapes or provider behavior create a new risk entry before migration continues.
- Any Critical migration failure automatically returns the affected feature flag to the last verified read/write path; it does not authorize destructive repair.
