# Closed Beta architecture

Visual Deadline is the authoritative system for applications, invitations, cohorts, account controls, quotas, entitlements and audit records. Visual-Deadline-Admin is an operator client only.

`/beta/apply` submits through `/api/beta-apply`; browser roles cannot query or mutate operational tables. Registration uses `/api/beta-register`: the server validates an invite, creates the Auth user, then calls the locked `redeem_beta_invite` RPC. A failure cleans up the newly created Auth user, and the RPC increments usage and creates the redemption in one transaction.

Existing users retain normal login. New email registration requires an invite. Signup cohort/source is immutable once first recorded.
