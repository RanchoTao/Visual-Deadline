# VisualDeadline workspace guidance

`VisualDeadline` is the production target. The separate Wayline checkout is a reference implementation: reimplement or integrate useful behavior within VisualDeadline's architecture rather than copying it blindly.

- Preserve user data and local-first behavior. Inspect before deleting or migrating anything.
- Do not commit secrets, `.env` files, credentials, or generated build output.
- Work on feature branches, keep commits focused and clean, and do not force-push or rewrite history.
- Run the applicable typecheck, tests, and production build before committing.
- Keep authentication, billing, and major product refactors in separate pull requests.
- Before changing existing work, inspect status, remotes, branch, and recent history. Treat Wayline's outer checkout as independent unless its nested active checkout is explicitly confirmed.
