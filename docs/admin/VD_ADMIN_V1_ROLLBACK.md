# VD Admin v1 rollout and rollback

## No deployment in this PR

Review and merge are separate user decisions. This work has neither deployed nor applied migrations to a remote project. Admin-1 remains a contract-tested separate console; this VD API is its next authoritative dependency. Free/Plus/Pro is the target tier model; production Admin requires AAL2. Billing stays in its existing Sandbox acceptance scope.

## Staging adoption order

1. Preserve a database backup and record the existing migration history. Reconcile any earlier landing `closed-beta-platform` migrations before adopting these names/tables; do not apply two competing schemas.
2. Apply both new migrations to isolated staging with synthetic users. Validate current ownership policies, Auth MFA, PostgREST execute grants, Storage write restrictions, legacy billing projection and account bootstrap before changing runtimes.
3. Provision only the independently verified existing owner through the security review procedure, with audit ticket. Configure the VD service-role, internal token and separate receipt key server-side. Configure the separate Admin gateway to VD origin with the same internal token; retain its confirmed UUID allowlist and AAL2 policy.
4. Test the actual console and SQL receipts using test identities. Leave public beta disabled, no email worker, no Auth ban worker and no global beta gate.
5. Review uncertain provider settlement monitoring and receipt retention/key rotation before any production operational enablement. This PR alone does not authorize that step.

## Stop access without destroying evidence

- Clear/revoke the internal token configuration and revoke affected operator directory entries under an approved server SQL change. Internal requests then fail closed; keep audit and receipt rows.
- Keep `VD_PUBLIC_BETA_APPLICATIONS_ENABLED` unset/false. Disable public endpoint traffic if it had been enabled. Retain application/redemption/outbox history; do not send queued mail during recovery.
- Disable AI endpoint traffic/provider configuration while investigating quota failures. Do not restore the old in-memory commercial limit while leaving AI operational.
- Preserve `VD_ADMIN_RECEIPT_KEY` securely so original receipts remain recoverable. Rotate the internal token independently. A new receipt key alone cannot decrypt old receipts; do not silently abandon their idempotency history.

## Business-state repair

Use new audited commands for compensating changes whenever authority is available: revoke a particular operator grant, revoke an override, or unban after independent review. These actions retain original evidence. Revoking an operator grant does not revoke Paddle/legacy Plus sources. Quota reset is an allowance epoch change; it cannot reconstruct deleted history, and this implementation never deletes it. An invitation already redeemed records admission separately; disabling its code prevents future redemption, while account controls address the admitted user's activity.

Account write restrictions survive rolling back the HTTP application. If cloud access must be restored, perform a reviewed normal-state transition for exactly the affected identities with change/audit evidence. Do not delete controls, rewrite history or remove ownership/RLS policies automatically. Read/export remains available for blocked users. No Supabase Auth propagation occurred here, so there is no external provider ban to reverse.

## Runtime/schema rollback

Restore a known application version only after evaluating AI and account-control behavior. Keep the additive schema, encrypted receipts, audit, quota ledger and restrictive policies for investigation; the old billing projector preserves `operator_grant` sources. Product Plus readers still consume `vd.plus`; Pro grants include that capability.

There is no destructive down migration. Dropping tables, deleting records or disabling RLS is not a routine rollback. Any exceptional schema repair requires verified backup, explicit review and a recovery plan. NOW/TASKS/PLAN/OPS/REVIEW, legacy memberships/subscriptions, REVIEW history and local export/restore are preserved by the tested migration chain.
