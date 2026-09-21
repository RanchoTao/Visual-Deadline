# PR G Auth provider setup

## Code ready

- Browser authentication is behind the narrow `IdentityClient` boundary and uses `@supabase/supabase-js` with persistent PKCE sessions. The SPA explicitly owns one callback exchange (`detectSessionInUrl: false`).
- Email/password login remains enabled. New email signup is independently deployment-gated by `VITE_AUTH_EMAIL_SIGNUP_ENABLED` and defaults to off. Google, GitHub, X OAuth 2.0, phone, identity linking, and guest-cloud-import flags also default to off.
- The only permitted browser redirect is `https://www.visualdeadline.com/auth/callback` (or a localhost callback during local development).
- Vercel must serve the Vite SPA for callback and client-side deep links; the callback remains a client-side PKCE handler, not a server endpoint.
- Guest import snapshots and previews are local and zero-write. Production canonical import is hard-disabled until the v2 schema and server execution gate are separately approved.

## Owner verified

- The `visualdeadline.com` Resend domain, DKIM, and SPF are verified; sending is enabled and open/click tracking is disabled.
- Supabase custom SMTP is saved with Resend externally. Its SMTP credential is never stored in this repository or frontend environment.

## Owner action required before enabling a provider

1. In Supabase Auth, set Site URL and add these redirect URLs:
   - `https://www.visualdeadline.com/auth/callback`
   - the exact approved localhost development callback, for example `http://localhost:5173/auth/callback`
2. For each provider, register an application in that provider's developer console. Copy its **Supabase Auth callback URL** from the Supabase provider configuration, then enable the provider in Supabase and enter credentials there. Do not put a provider secret in VD source or browser environment variables.
3. Only after a real provider login and callback have been tested, set exactly its public build flag to `true`:
   - `VITE_AUTH_GOOGLE_ENABLED`
   - `VITE_AUTH_GITHUB_ENABLED`
   - `VITE_AUTH_X_ENABLED` (Supabase provider identifier: `x`, not the deprecated Twitter OAuth 1.0a identifier)
4. Before `VITE_AUTH_PHONE_ENABLED=true`, configure an SMS provider in Supabase, verify E.164 delivery, rate limits, CAPTCHA/abuse protection, resend cooldown, recovery policy, and provider-unavailable handling.
5. Keep `VITE_AUTH_IDENTITY_LINKING_ENABLED` and `VITE_AUTH_GUEST_IMPORT_ENABLED` false until their separate recovery and production-schema gates are approved.

## Still required before `VITE_AUTH_EMAIL_SIGNUP_ENABLED=true`

1. Production `/auth/callback` serves the SPA on direct load and refresh.
2. Supabase Confirm Email is enabled.
3. A real signup email is delivered and its link completes successfully.
4. `email_confirmed_at` transitions as expected and the session persists after refresh.
5. Abuse and rate-limit settings are reviewed.

## Explicit exclusions

Apple, WeChat, QQ, Douyin, Feishu, OAuth client secrets, SMS provider secrets, service-role keys, and production provider enablement are not part of PR G.
