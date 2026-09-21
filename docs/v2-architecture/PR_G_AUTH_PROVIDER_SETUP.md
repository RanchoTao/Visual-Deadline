# PR G Auth provider setup

## Code ready

- Browser authentication is behind the narrow `IdentityClient` boundary and uses `@supabase/supabase-js` with persistent PKCE sessions. The SPA explicitly owns one callback exchange (`detectSessionInUrl: false`).
- Email/password login remains enabled. New email signup is independently deployment-gated by `VITE_AUTH_EMAIL_SIGNUP_ENABLED` and defaults to off. Google, GitHub, X OAuth 2.0, phone, identity linking, and guest-cloud-import flags also default to off.
- Confirmation-required email signups with no initial session can use `verifyOtp({ email, token, type: 'email' })`. The confirmation link flow remains supported as a fallback; the application does not store email OTPs.
- The phone portal appears only when `VITE_AUTH_PHONE_ENABLED=true`. It accepts Chinese mainland `+86` numbers only and asks Supabase Auth to create/sign in the user through its SMS OTP flow; the browser neither creates nor validates an OTP.
- `supabase/functions/send-sms-aliyun/index.ts` is an un-deployed HTTP Send SMS Hook implementation. It verifies the Standard Webhooks request, passes Supabase's OTP to Aliyun PNVS `SendSmsVerifyCode` only as template data, and never calls Aliyun `CheckSmsVerifyCode`.
- The only permitted browser redirect is `https://www.visualdeadline.com/auth/callback` (or a localhost callback during local development). Vercel must serve the Vite SPA for callback and client-side deep links; the callback remains a client-side PKCE handler, not a server endpoint.
- Guest import snapshots and previews are local and zero-write. Production canonical import is hard-disabled until the v2 schema and server execution gate are separately approved.

## Owner verified

- The `visualdeadline.com` Resend domain, DKIM, and SPF are verified; sending is enabled and open/click tracking is disabled.
- Supabase custom SMTP is saved with Resend externally. Its SMTP credential is never stored in this repository or frontend environment.

## Owner action required before enabling email signup

1. In Supabase Auth, set Site URL and add these redirect URLs:
   - `https://www.visualdeadline.com/auth/callback`
   - the exact approved localhost development callback, for example `http://localhost:5173/auth/callback`
2. Enable **Confirm email**. In the signup email template, include the six-digit `{{ .Token }}` for the in-product OTP screen and retain `{{ .ConfirmationURL }}` as the link fallback. Do not place either value in VD source.
3. Confirm the configured Resend SMTP sender can deliver both the token and fallback link to Gmail, Outlook, and QQ or 163. Test a real signup, OTP verification, confirmation-link verification, resend cooldown, expired token, and a refresh after `email_confirmed_at` changes.
4. Review Supabase Auth abuse controls and email rate limits. Only after all checks pass, set `VITE_AUTH_EMAIL_SIGNUP_ENABLED=true` in the intended build environment; it remains `false` by default.

## Owner action required before enabling Aliyun phone auth

1. In Alibaba Cloud PNVS, enable SMS Authentication and create or select an approved current system-provided SMS signature and SMS template for `SendSmsVerifyCode`. Record the configured code and validity variable names from that template. The bridge intentionally supplies Supabase's OTP as the configured code variable; it does not ask Aliyun to generate or verify one.
2. Create a least-privilege RAM principal or role limited to `dypns:SendSmsVerifyCode`; do not use a root-account access key. Keep its credentials outside this repository and browser environment.
3. Deploy `send-sms-aliyun` only after a controlled staging review, then configure Supabase **Authentication → Hooks → Send SMS** to call that HTTPS function. Generate a Standard Webhooks secret in Supabase and configure the same value server-side as `SEND_SMS_HOOK_SECRET`.
4. Set these server-only Edge Function secrets/config values: `SEND_SMS_HOOK_SECRET`, `ALIYUN_ACCESS_KEY_ID`, `ALIYUN_ACCESS_KEY_SECRET`, `ALIYUN_PNVS_SIGN_NAME`, `ALIYUN_PNVS_TEMPLATE_CODE`, `ALIYUN_PNVS_CODE_VARIABLE`, `ALIYUN_PNVS_VALIDITY_VARIABLE`, and optional `ALIYUN_PNVS_VALIDITY_SECONDS` (default `300`). Never set any of them as `VITE_*` values or commit them.
5. In Supabase Auth, enable phone login and ensure automatic phone confirmation is off so the Send SMS Hook receives an OTP. Set rate limits and CAPTCHA/abuse controls, then test only `+86` delivery, resend behavior, provider failure, bad webhook signature, and successful Supabase OTP verification.
6. Only after the staging path is verified may an owner set `VITE_AUTH_PHONE_ENABLED=true`. It remains `false` by default. This PR does not deploy the function, set secrets, enable the hook, or change production settings.

## Owner action required before enabling an OAuth provider

1. For each provider, register an application in that provider's developer console. Copy its **Supabase Auth callback URL** from the Supabase provider configuration, then enable the provider in Supabase and enter credentials there. Do not put a provider secret in VD source or browser environment variables.
2. Only after a real provider login and callback have been tested, set exactly its public build flag to `true`:
   - `VITE_AUTH_GOOGLE_ENABLED`
   - `VITE_AUTH_GITHUB_ENABLED`
   - `VITE_AUTH_X_ENABLED` (Supabase provider identifier: `x`, not the deprecated Twitter OAuth 1.0a identifier)
3. Keep `VITE_AUTH_IDENTITY_LINKING_ENABLED` and `VITE_AUTH_GUEST_IMPORT_ENABLED` false until their separate recovery and production-schema gates are approved.

## Explicit exclusions

Apple, WeChat, QQ, Douyin, Feishu, OAuth client secrets, SMS provider secrets, service-role keys, production provider enablement, deployment, and production Supabase configuration are not part of PR G.
