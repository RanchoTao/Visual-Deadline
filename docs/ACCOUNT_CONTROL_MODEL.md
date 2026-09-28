# Account control model

Account controls preserve reason, effective time, optional expiry and audit history. `active`, `restricted`, `suspended`, and `banned` are business records; a provider-level Auth ban, if later enabled, is additional enforcement only.

Expired controls no longer apply. Server-side AI and privileged operations reject restricted, suspended and banned users; safe login, account status and export paths are not removed by this migration.
