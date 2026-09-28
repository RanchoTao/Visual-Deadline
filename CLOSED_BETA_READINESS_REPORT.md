# Closed Beta readiness report

## Implemented contracts

- Additive schema/RLS for beta applications, cohorts, invite redemption, admin roles/audit, admin access grants, AI quota/ledger, account controls, moderation, feedback, flags and email events.
- Chinese `/beta/apply`, server-side invite registration, server-only DeepSeek proxy and admin API contract.
- Existing billing and recurring entitlement records remain unchanged; admin gifts add independent `admin_grant` sources.

## Required external setup before production enablement

1. Apply the closed-Beta migration and run the pgTAP RLS suite.
2. Configure server-only Supabase service role, DeepSeek, Turnstile secret, and an external rate-limit provider.
3. Configure the browser Turnstile site key and validate Turnstile in the production hostname.
4. Seed the initial owner `admin_roles` row and beta cohorts/invites through a controlled operator runbook.

## Gates not claimed by code alone

No production secrets were configured, no Paddle settings were changed, and no real provider call was made. Database migration and RLS execution still require an available Supabase/Postgres engine.
