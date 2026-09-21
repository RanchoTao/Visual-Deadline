# Auth and identity architecture

## Current state

Before PR G, VisualDeadline used a custom Supabase REST Auth client. PR G replaces its Auth path with the supported client, preserving email/password and session persistence. Phone, OAuth, identity linking, and production guest import remain independently gated; only a local zero-write guest preview is available by default.

## Target outcomes

- Email/password remains supported.
- Phone OTP is supported only after an SMS provider, abuse controls, rate limits, and recovery policy are configured.
- Google, GitHub, and X OAuth 2.0 use Authorization Code + PKCE through the supported Supabase client when independently enabled. X uses Supabase's current `x` provider identifier.
- One product user can link multiple verified identities.
- Guest data moves to an account through a previewable, idempotent import, never an implicit merge-and-replace.
- Account recovery, unlinking, deletion, and audit events are designed before public rollout.
- Auth and identity settings open from Avatar → Profile / Account / Settings. They are a global account surface, not a primary page.

Supabase phone sign-in requires a configured provider and separates OTP request from verification: [Phone Login](https://supabase.com/docs/guides/auth/phone-login). Supabase can automatically link identities with the same verified email and offers manual linking via `linkIdentity` (documented as beta), so the product must account for provider limitations and recovery paths: [Identity Linking](https://supabase.com/docs/guides/auth/auth-identity-linking).

## Identity model

Supabase Auth owns credentials, identity-provider records, email/phone verification, and sessions. VD owns:

- profile and preferences;
- import history;
- identity-link audit events that contain provider/type and outcome, not tokens;
- user-facing recovery state;
- domain records keyed by immutable `auth.users.id`.

Editable profile fields and raw user metadata are never authorization inputs.

## Supported flows

### Email/password

1. Sign up.
2. Present verification status and resend/recovery actions.
3. Establish a session through the supported client.
4. Only an explicit snapshot captured before authentication is guest input. Do not infer guest ownership from ordinary authenticated local cache; do not begin cloud writes automatically.

### Phone OTP

1. Normalize to E.164 and obtain explicit consent.
2. Request OTP with server/provider rate limits and non-enumerating responses.
3. Verify OTP and establish the session.
4. Offer identity linking only while the current account is strongly authenticated.
5. Never use phone number as a product primary key.

### Google / GitHub / X OAuth

1. Start PKCE OAuth with an allow-listed redirect URL and CSRF state.
2. The SPA callback handler exchanges the one-use PKCE code exactly once, then removes callback parameters from the URL. `detectSessionInUrl` remains false so Supabase does not race the explicit handler.
3. Detect whether this is a new user, automatically linked verified identity, or separate account.
4. Present explicit resolution when two populated VD accounts cannot be safely auto-merged.

### Identity linking

- Require a fresh/recent session for manual link or unlink.
- Never unlink the last usable login method.
- Show provider, verified address/phone, link date, and recovery implication.
- Account-domain merge is separate from Auth identity linking. Linking credentials must not silently choose which account's Tasks win.

## Guest-to-account migration

### Why current behavior is unsafe

Current sign-in hydration merges arrays by ID, lets cloud win collisions, and then deletes/reinserts all cloud rows. It provides no preview or transactional recovery and does not cover all local domains.

### Target state machine

```text
NO_GUEST_SOURCE / GUEST_SOURCE_PENDING / GUEST_IMPORT_DISABLED
 -> guest_detected
 -> inventory_created
 -> preview_ready
 -> user_confirmed
 -> import_running
 -> verifying
 -> completed
        or -> needs_resolution / failed_recoverable
```

### Inventory and preview

While conclusively unauthenticated, before an email/OAuth/phone action starts, capture a sanitized immutable `vd.guest-import.pending.v1` snapshot. It stores snapshot ID/checksum, creation time, backup schema version, state, optional request ID, and the PR D sanitized backup envelope; it contains no authorization code, PKCE verifier, access/refresh token, or provider secret. Existing authenticated cache is never reclassified as guest input. Show:

- new records to add;
- identical records to skip;
- same-ID/content conflicts;
- relationship repairs;
- records requiring user choice;
- data that cannot yet migrate but remains local/exportable.

### Conflict rules

| Case | Default |
| --- | --- |
| Same legacy ref and same checksum | Skip as already imported |
| Same canonical ID and identical content | Skip |
| Same ID, different content, one strictly newer with valid version lineage | Offer recommended newer version; record decision |
| Same ID, ambiguous lineage | Keep both through new canonical IDs and ask user to reconcile |
| Missing relationship target | Import entity, quarantine link, preserve source ref |
| Cloud deletion versus local live record | Never infer; surface explicit conflict |
| Local deletion without tombstone | Do not delete cloud data |

### Import execution

- Production execution is hard-disabled in PR G. A local-only executor binds the destination to the authenticated test owner and reuses the PR F planner/ledger/apply/reconciliation semantics.
- Each source record maps through `legacy_entity_refs` with a unique constraint.
- Writes are small transactional batches ordered by dependencies. Beta imports only domains supported by the active persistence stage: profile/preferences, Goals, Milestones, Tasks, dependencies, current Capture data, and any enabled notification/billing continuity records. Deferred OPS resources and REVIEW events/reports are imported only when those owning surfaces activate durable persistence.
- Progress is resumable. Retry reads the ledger and continues; it does not replay successful materializations.
- Local data remains unchanged until cloud reconciliation passes. The user may download the snapshot at any time.
- Before confirmation, recompute the current local source checksum; if it differs from the reviewed snapshot, reject with `GUEST_IMPORT_SOURCE_CHANGED` and require a new preview. Completion compares counts, checksums, unresolved references, and representative reads under the user's RLS session.

### After completion

Mark the local snapshot imported but retain it for a defined recovery window. Do not silently clear browser data. Offer “keep local backup” and “remove imported local copy” as separate explicit actions.

## Session migration

Move from the custom client to the supported Supabase client behind an `IdentityClient` interface. Roll out in stages:

1. characterize existing email/session callback behavior;
2. add the supported client without changing UI;
3. handle existing stored session once, then remove the legacy token key after successful establishment;
4. enable PKCE OAuth providers behind flags;
5. enable phone OTP only after provider and abuse testing;
6. enable linking and guest import after recovery tests.

Never log access/refresh tokens. Apply a strict CSP, audit dangerous HTML sinks, and keep short-lived sessions/refresh rotation consistent with Supabase settings.

## Required tests

- Signup, verification, sign-in, refresh, logout, password recovery.
- OAuth success, cancel, state mismatch, redirect mismatch, duplicate provider callback.
- Phone request/verify, expired/wrong code, rate limit, provider failure.
- Auto-link, manual link, link collision, unlink-last-identity denial.
- Guest import for empty/cloud-only/local-only/collision/interrupted/retried cases.
- Two real test users proving cross-user RLS denial for every migrated domain.
- XSS-focused session storage review and secret/token log scan.

## Rollback

Provider flags can be disabled independently. The email flow remains available during rollout. Guest import is append-only/idempotent; disabling new imports does not invalidate completed mappings. Legacy local data and export remain available until the recovery window and reconciliation gates close.

## Global account UI contract

- Avatar opens Profile / Account / Settings.
- Account/Security contains verified identities, provider links, sessions, recovery, and account deletion.
- Settings contains preferences, privacy/data/export, AI settings, and integrations.
- Billing may be linked from Settings but is owned by the separate global Subscription / Billing surface.
- None of these destinations is part of `NOW / TASKS / PLAN / OPS / REVIEW` primary navigation.
