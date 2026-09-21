# Authenticated workspace ownership isolation

## Invariant

An authenticated screen only consumes the workspace owned by the authoritative `session.user.id`. Browser presence, a legacy key, or a pending guest snapshot is not ownership. A stale active-owner marker fails closed to a safe loading state until the authoritative session owner has been bound and hydrated.

Auth has three explicit states: unresolved, resolved guest, and resolved `user:<session.user.id>`. Unresolved auth is never treated as guest: it does not change the marker, hydrate a workspace, or permit a workspace write.

## Storage model and legacy preservation

- Guest compatibility remains on existing legacy keys. Those keys are the guest workspace and recovery source; they are not deleted, renamed, or copied on login. Existing rolling backup envelopes continue to protect that legacy guest source only; this hotfix does not repurpose them into cross-owner imports.
- An authenticated cache uses `vd.workspace.user.<encoded user id>.<legacy key>`. It never falls back to a legacy guest key.
- `vd.workspace.active-owner.v1` is only device-local diagnostic/routing metadata. The session-derived owner is passed directly into every workspace binding, so a stale marker cannot select data or authorize a local/cloud read or write.
- `vd.guest-import.pending.v1` remains a separate immutable recovery snapshot. A disabled guest-import flag leaves it pending and shows `检测到本机数据，尚未导入到当前账号。`; it never makes guest data account-owned.

## Domain classification

| Classification | Domains |
| --- | --- |
| A. Guest/user workspace | tasks, goals, profile, baseline pressure, pressure calibration/history, onboarding, achievements, non-secret AI settings/artifacts, roadmaps, notifications, daily quest/review, reminders, social nodes/layout, Life Map/planning/OPS/REVIEW records, and Life Controller events. |
| B. Device-global | active-workspace routing marker; welcome/inactivity timestamp; backup/recovery envelopes; feature flags supplied at build time. |
| C. Ephemeral UI | active route/tab, viewport, modal/form state, toasts, loading/error text, current pressure clock, draft preview state, and pending in-memory confirmation UI. |

AI provider credentials are not workspace data: the existing sanitization/exclusion policy remains in force. Existing Life Controller event owner maps remain valid within the active owner-scoped workspace; their logical event owner is the same authenticated user ID.

## Session and cloud transition

1. Before auth, the guest source can be snapshotted by the existing immutable PR G flow.
2. On an authoritative session, the app selects `user:<session.user.id>`, hydrates only that local cache, then reads only that user's cloud rows. A binding records the owner that produced its value; setters and write effects reject stale bindings during A → B, logout, refresh, and OTP/OAuth transitions.
3. Account-local cache and matching cloud rows may reconcile by ID. Guest/legacy rows are never an input to that reconciliation.
4. A new user with no cache and no cloud records renders defaults/empty lists. An existing user sees only their cache and cloud records.
5. Every cloud read/write API requires an authenticated `WorkspaceOwner` and rejects a session-user mismatch before transport.
6. Logout returns the active workspace to guest. Switching A → B never exposes A's scoped cache; returning to A can recover A's scoped cache.

## Explicit boundaries

- Failed login, signup, OAuth, email OTP, or SMS OTP changes no workspace owner and creates no user-scoped cache.
- Guest import remains the only route by which preserved guest data can become account-owned, and its existing production executor gate remains disabled.
- This is a local ownership hotfix only: no Supabase schema/settings, deployment, provider flags, SMTP, or Aliyun configuration is changed here.

## Email OTP beta configuration contract

Before enabling email-signup E2E, configure Supabase Dashboard: **Authentication → Sign In / Providers → Email** with an Email OTP length of **6** and expiration of **600 seconds** (recommended for this beta). VD intentionally accepts exactly six digits. If the Supabase Email OTP length is not 6, the VD email OTP verification UI is not ready and `VITE_AUTH_EMAIL_SIGNUP_ENABLED` must remain false. This repository does not change that dashboard configuration remotely.

Password recovery is intentionally not exposed in the current UI: a complete `PASSWORD_RECOVERY` callback/new-password flow is required before it can be user-facing.
