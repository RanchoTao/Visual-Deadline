# Public release process

> Policy proposal recorded on 2026-10-11. This document describes the **intended workflow** for future releases. It does not claim that a private canonical repository, automation pipeline, or paid cloud service has already been established.

## Purpose

Keep a coherent, safe public GitHub project while allowing the maintainer to iterate privately on unreleased features and operational details.

**Direction:** private/working development → scope selection → tests and manual checks → privacy/license review → public commit or tagged release.

The current public source is already distributed under Apache-2.0. This process cannot undo earlier recipients' permissions.

## Minimum public release gate

1. **Scope:** list exactly which changes will become public. Do not export experimental or commercial modules by mistake.
2. **Security:** inspect the selected files and commit diff for tokens, secrets, personal data, private endpoints, production config, credentials, and generated artifacts. Check file history separately when relevant.
3. **Licensing:** confirm that published files are the maintainer's contributions or are redistributable under their applicable licenses; preserve required notices and author attributions.
4. **Docs:** explain what works with a local install, what requires remote infrastructure, and what remains off behind flags. Do not claim untested deployment success.
5. **Tests:** run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` in an appropriate environment. Report any test not run rather than claiming a pass.
6. **Migration safety:** review storage changes, owner isolation, backup/export compatibility, and rollback. Never overwrite production data as part of a public code release.
7. **Review:** compare against the last published version, review the full diff, and then merge/tag intentionally.
8. **Notes:** issue concise release notes with supported features, known gaps, and upgrade steps.

## What the public project is (and is not)

- A channel for released source, community issues, documentation, and independently useful code.
- Not necessarily the latest in-progress feature branch.
- Not the production secret store, payment administration environment, or personal user database.
- Not a license to imply a publicly visible plan or experiment has shipped.

## Repository hygiene

- Prefer readable, stable history rather than frequent force-pushes to `main`.
- Clean up contributor-facing install paths, README promises, stale screenshots, and confusing status labels.
- Archive obsolete planning docs by clearly marking their historical scope instead of silently portraying them as the current roadmap.
- Keep a short changelog or release summary when a published version differs meaningfully.
- Do not remove genuine contributor attribution or represent rewritten history as the original history.
- In case of leaked credentials, rotate/revoke credentials first; history rewriting alone is insufficient.

## Suggested future ownership layout (not created here)

| Logical area | Visibility direction | Responsibility |
| --- | --- | --- |
| Public community source | Public | Releasable code, docs, community contributions |
| Main development | Private, if adopted | Unreleased product work and experiment integration |
| Operations and administration | Private, if adopted | Infrastructure, support, billing operations, internal tools |

The layout can start with only one public repository and one private development repository; do not create premature infrastructure.

## Release cadence

Publish when a reviewed, genuinely useful version is ready. A monthly schedule is an optional aspiration, **not** a guarantee. Product reliability and privacy take precedence over a publicity cadence.
