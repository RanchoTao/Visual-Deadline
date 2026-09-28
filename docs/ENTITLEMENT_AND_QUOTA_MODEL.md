# Entitlement and quota model

`vd.plus` remains the single entitlement capability. Effective access is the union of independently valid recurring, Billing v1 and `admin_grant` entitlement rows. Admin gifts create a new source and never alter Paddle periods or legacy records.

AI quota is independent of Plus entitlement. The database chooses a configured free/plus/pro policy plus active per-user grants. `consume_ai_quota` locks per user, records a request ID before the provider call, and rejects over-quota requests with a Chinese user error. Usage events are append-only except their server-side processing-to-final status update.
