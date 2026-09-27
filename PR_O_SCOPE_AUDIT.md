# PR O scope audit — global account surfaces and cleanup gates

Scope: PR O on `codex/v2-global-account-cleanup`, based on `e8810ac` (PR N merged into `main`). This audit establishes the smallest safe implementation scope before code changes. It does not authorize legacy deletion, billing rollout, provider expansion, or Production secret changes.

## Already complete

- `V2AppShell` exposes exactly the five primary workspace destinations: `NOW`, `TASKS`, `PLAN`, `OPS`, and `REVIEW`.
- The authenticated account surfaces already have distinct non-primary paths: `/settings` and `/billing`.
- `/billing` is the normalized recurring Subscription / Billing surface and retains readable Billing v1 evidence in an explicit legacy section. Recurring checkout remains disabled by its existing rollout flag.
- `profiles` has owner-scoped RLS and persists profile presentation fields. `notifications` already has owner-scoped RLS, a dedupe key, and read metadata (`is_read`, `read_at`).
- Complete local export/restore already includes sanitized profile, reminder, and notification domains while excluding session/provider secrets.
- Existing Supabase migration chronology is additive; no root schema script is required or permitted.

## Incomplete or inconsistent

- The V2 shell bell only raises a toast (`Notifications will appear here when they are ready.`); it does not reach a Notifications surface or support deep links/back/forward.
- `notifications` is loaded only from owner-scoped browser storage in `App.tsx`. The existing cloud `notifications` table is not read, and marking a notification read is not persisted to it. This is R-36 exposure.
- V2 `ProfilePage` shows the Billing v1 membership widget directly, so membership control is duplicated instead of consistently routing to `/billing`.
- V2 reminder preferences are browser-local only even though profile settings are cloud-synced. Browser permission itself must remain device-local, while the account preference may be synchronized.
- `DeveloperToolsPanel` renders in `ProfilePage` without a production guard.
- There is no explicit cleanup-gate model or telemetry inspection contract. The required observation window for disabling any legacy reader/writer has not been demonstrated.

## Obsolete or legacy paths retained intentionally

- `MembershipPanel` and Billing v1 tables/reads remain functional through the `/billing` compatibility disclosure; no Billing v1 data, price ID, or provider path will be removed.
- Owner-scoped browser profile, reminder, and notification caches remain as rollback-compatible local state. PR O will not disable their reads or writes.
- Legacy desktop/mobile shell components remain in the repository but are not a V2 primary navigation path. This PR will not delete them.
- No cleanup flag can delete storage or disable a legacy read/write without recorded observation evidence, a rollback rehearsal, and a separate approval.

## Exact proposed changes

1. Add `/notifications` as an authenticated, non-primary global surface; wire the V2 bell to it and keep the only primary route inventory fixed at five entries.
2. Use the existing `notifications` table through the current authenticated REST client: load owner rows, preserve a monotonic read state across local/cloud copies, and persist an owned `is_read/read_at` update. No client-side provider evidence or privileged write is added.
3. Make reminder enablement/time account preferences part of the existing owner profile payload; browser notification permission remains explicitly device-local. Show this distinction in Profile / Account / Settings.
4. Remove the duplicate V1 membership widget from Profile / Settings; retain it solely in `/billing` under the existing legacy compatibility disclosure.
5. Render developer tools only in Vite development builds.
6. Add a pure cleanup-gate/telemetry contract and behavioral tests proving that no legacy read/write retirement can be enabled without the required matching-write, zero-fallback, support-runbook, and rollback evidence.
7. Add routing, account preference, notification cross-device, export, secret-scan, and cleanup-gate regression coverage.

## Persistence and migration impact

No new migration is required for the scoped implementation. It consumes only existing additive persistence:

- `public.profiles.data` for existing owner-scoped account preferences;
- `public.notifications` for existing owner-scoped notification rows and read state.

No table, policy, historical row, legacy payload, provider credential, or Paddle configuration will be deleted, rewritten, or moved. The existing RLS policies remain the authorization boundary.

## Cleanup gates and rollback

- **Legacy writes:** remain enabled. Required gate is one release of matching read/write telemetry with no unexplained divergence.
- **Legacy reads:** remain enabled. Required gate is a zero-fallback observation window plus a support runbook.
- **Deletion:** out of scope; requires a separately approved PR with immutable export/checksums and a restore rehearsal.
- **Rollback:** route account controls back to the existing `/settings` and `/billing` surfaces; retain local caches and cloud rows. The cleanup flag model defaults to no retirement.
- **Billing:** recurring checkout/processing flags retain their existing defaults; PR O makes no Paddle API, catalog, webhook, Sandbox, or Production change.

## Minimum acceptance matrix

- trigger-to-surface routes: avatar → `/settings`, membership → `/billing`, bell → `/notifications`;
- desktop and mobile primary navigation contains only the five frozen workspace destinations;
- authenticated profile/reminder and notification read state converge through current owner-scoped cloud rows;
- export remains complete and excludes secret-bearing values;
- production secret scan finds no provider/server secret exposed through `VITE_*` or browser account code;
- cleanup-gate tests keep legacy retirement disabled without evidence; rollback flag is verified;
- deep-link and browser history behavior is exercised for global account surfaces.
