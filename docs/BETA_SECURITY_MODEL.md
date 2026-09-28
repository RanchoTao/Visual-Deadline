# Beta security model

Vercel/CDN provide network protections; application controls add server-side rate limiting, Turnstile verification, Supabase RLS, service-role-only operational writes, and append-only audit logging. Production fails closed when the configured Turnstile secret or external rate-limit provider is absent. Development bypass requires an explicit `VD_ALLOW_TURNSTILE_BYPASS=true`.

Secrets stay server-side: Supabase service role, DeepSeek key, Turnstile secret and payment credentials must never use `VITE_*`. Logs carry request IDs and operational metadata, never passwords, tokens, keys or authorization headers.
