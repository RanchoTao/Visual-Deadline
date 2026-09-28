# Invite system

Invite plaintext is generated only for the operator response and only its SHA-256 hash is persisted. Validation checks enabled state, expiry and remaining uses. `invite_codes.used_count` is updated under an advisory transaction lock by `redeem_beta_invite`; one user can have only one redemption.

The validate endpoint is advisory UX only. The authoritative check and consumption occur after successful Auth-user creation in the server-only redemption RPC. Error messages deliberately reveal only invalid, expired, used-up, or disabled state.
