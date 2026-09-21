# PR G Auth provider setup

## Code ready

- Browser authentication is behind the narrow `IdentityClient` boundary and uses `@supabase/supabase-js` with persistent PKCE sessions. The SPA explicitly owns one callback exchange (`detectSessionInUrl: false`).
- Email/password login remains enabled. New email signup is independently deployment-gated by `VITE_AUTH_EMAIL_SIGNUP_ENABLED`. Google, GitHub, X OAuth 2.0, identity linking, and guest-cloud-import flags remain separately gated.
- Confirmation-required email signups with no initial session use `verifyOtp({ email, token, type: 'email' })`. The confirmation link flow remains a fallback; VD never stores email OTPs.
- The phone portal appears only when `VITE_AUTH_PHONE_ENABLED=true`. It accepts Chinese mainland +86 numbers and asks Supabase Auth to create/sign in the user through its SMS OTP flow; the browser neither creates nor validates an OTP.
- `supabase/functions/send-sms-aliyun/index.ts` implements the production-tested Supabase Send SMS Hook bridge to Aliyun PNVS. It verifies Standard Webhooks, accepts Supabase hook phone payloads in either `+861...` or `861...` form, normalizes them to PNVS local-number format, transports Supabase's six-digit OTP through `SendSmsVerifyCode`, and never calls Aliyun `CheckSmsVerifyCode`.
- The Aliyun SDK bridge uses the Deno-compatible npm module namespace at runtime. The verified resolver scans the full module export graph, prefers the exported `Client` constructor, falls back to the constructor exposing `sendSmsVerifyCodeWithOptions`, and resolves `SendSmsVerifyCodeRequest` by name. Diagnostic export-key truncation is kept separate from constructor traversal.
- The only permitted browser redirect is `https://www.visualdeadline.com/auth/callback` (or a localhost callback during local development). Vercel serves the Vite SPA for callback and client-side deep links.
- Guest import snapshots and previews are local and zero-write. Production canonical import remains hard-disabled until its separate schema/server execution gate is approved.

## Production verified

- The `visualdeadline.com` Resend domain, DKIM, and SPF are verified; Supabase custom SMTP is configured externally.
- Email signup delivers a six-digit verification code through Resend and the verification path has been exercised against production.
- Supabase phone auth is enabled with six-digit OTPs and the Send SMS Hook points to the deployed `send-sms-aliyun` Edge Function.
- The production Edge Function has the required server-only secrets configured, verifies the Supabase Standard Webhooks signature, and has completed a real Aliyun PNVS send.
- A real +86 phone signup completed OTP verification successfully in production. The resulting phone user was confirmed and did not inherit guest/account task or goal data.
- The PNVS beta transport currently uses an Aliyun system-provided sender signature/template. That sender branding is acceptable for beta transport only; a future branded sender requires a compliant SMS product/signature path and should be implemented as a transport swap, not by changing Supabase OTP authority.

## Email configuration contract

1. Supabase Email OTP length must remain **6**. Recommended beta expiry is **600 seconds**.
2. The signup template should contain `{{ .Token }}` for the in-product OTP screen and may retain `{{ .ConfirmationURL }}` as a fallback.
3. Resend SMTP credentials stay outside this repository and outside `VITE_*` variables.
4. Before changing email auth behavior, re-test signup, OTP verification, resend cooldown, expired token, fallback link, and session persistence after refresh.

## Aliyun PNVS production contract

1. Supabase remains the OTP authority. The Edge Function sends `sms.otp` to Aliyun as template data; Aliyun must not generate or verify the login OTP.
2. The RAM principal must remain least-privilege for `dypns:SendSmsVerifyCode`; do not use root-account credentials.
3. Required Edge Function secrets/config:
   - `SEND_SMS_HOOK_SECRET`
   - `ALIYUN_ACCESS_KEY_ID`
   - `ALIYUN_ACCESS_KEY_SECRET`
   - `ALIYUN_PNVS_SIGN_NAME`
   - `ALIYUN_PNVS_TEMPLATE_CODE`
   - `ALIYUN_PNVS_CODE_VARIABLE`
   - `ALIYUN_PNVS_VALIDITY_VARIABLE`
   - `ALIYUN_PNVS_VALIDITY_SECONDS` (production currently uses 300 seconds)
4. Phone confirmation must remain enabled so Supabase actually emits and verifies SMS OTPs. Keep SMS OTP length at 6 and align Supabase expiry with the PNVS validity window.
5. The bridge intentionally supports the two formats observed/accepted at the boundary: `+861xxxxxxxxxx` and Supabase-hook `861xxxxxxxxxx`. Both normalize to the 11-digit mainland number while PNVS receives `CountryCode=86`.
6. Do not reintroduce the original Node-only constructor assumptions. Supabase Edge Runtime is Deno-based; the runtime resolver exists because the Aliyun npm package namespace differs from ordinary Node/CommonJS examples.
7. Temporary successful-request payload-shape logging is not part of the repository-stable implementation. Provider/SDK diagnostics must remain sanitized and must never log phone numbers, OTP values, AccessKey secrets, or webhook secrets.

## OAuth providers

1. For each provider, register an application in its developer console and use the Supabase Auth callback URL shown by that provider configuration.
2. Enable only after a real provider login/callback test, then set the corresponding public flag:
   - `VITE_AUTH_GOOGLE_ENABLED`
   - `VITE_AUTH_GITHUB_ENABLED`
   - `VITE_AUTH_X_ENABLED`
3. Keep `VITE_AUTH_IDENTITY_LINKING_ENABLED` and `VITE_AUTH_GUEST_IMPORT_ENABLED` disabled until their separate recovery/production gates are approved.

## Explicit exclusions

Apple, WeChat, QQ, Douyin, Feishu, branded mainland-SMS sender migration, OAuth client secrets, SMS credentials, service-role keys, and production secret values are not stored in this repository.
