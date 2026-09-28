# Admin API contract

The separate operator console calls authenticated `/api/admin` with an `action`. Reads include `users`, `entitlement`, `ai_usage`, `applications`, `invites`, `account_controls`, and `audit`. Mutations include `grant_entitlement`, `revoke_entitlement`, `create_invite`, `disable_invite`, `review_application`, `set_account_control`, `unban`, and `grant_quota`.

The server resolves `admin_roles`; email comparisons are never authorization. Owner/admin mutations append an `admin_audit_log` row and return `X-Request-Id`. No admin browser client receives service-role access.
