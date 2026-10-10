# Community source and official cloud: current policy

> **Status (2026-10-11):** This document explains the current open-source scope and a possible commercial direction. It does **not** announce paid plans, a launch date, a new license, or production-grade service guarantees.

## What is open today

The code published in [RanchoTao/Visual-Deadline](https://github.com/RanchoTao/Visual-Deadline) currently carries an Apache License 2.0 file. That license permits use, modification, redistribution, and commercial use under its conditions. Consult third-party notices and dependency licenses for separately licensed material.

A public repository is a **published code snapshot**, not a promise to mirror all active development, private prototypes, provider integrations, or operational infrastructure. Users can continue to use a released version under the license applicable to that release.

Public code does **not** include, and should never be treated as permission to access, user databases, backups, private memories, payment credentials, server secrets, or hosted accounts.

## Why an official service might charge money

Buying hosting and operating software involves more than obtaining the code:

| Self-managed community route | Possible official managed service |
| --- | --- |
| Download the published source | Use a hosted app with little setup |
| Configure storage and external providers yourself | Cloud storage, synchronization, and backups operated by the provider |
| Handle deployment, upgrades, and monitoring | Managed upgrades, recovery processes, and support |
| Provide your own compatible AI model and API access where supported | Optional metered/limited AI capacity and maintained model integrations |
| Assume responsibility for operating the installation | Pay for ongoing operations and convenience |

These are possible service boundaries, not claims that every self-host feature or managed feature works today.

A user is paying for **the service**, not merely for access to already-released Apache-2.0 source files. The same person may choose to self-host instead.

## Product boundary

- **Community source:** published UI, domain logic, schemas, interfaces, docs, and supported local workflows in the repository.
- **Managed Cloud:** a possible official offering for authenticated accounts, data storage, sync, backups, and maintenance. Production reliability and pricing require real validation.
- **Intelligence:** an exploratory paid tier for context-aware planning, memory, and agent-assisted work. Model providers, usage budgets, and user permissions must be explicit before launch.
- **Private development:** future proprietary modules, internal experiments, and production operation details may be maintained outside the public repo. Do not assume a private component already exists just because it is described here.

The public repo currently includes some authentication, cloud, AI, and billing implementation code. **Implemented != configured != verified in a deployed environment != publicly available.**

## Data ownership and safety

- Do not commit personal task content, relationship graphs, journals, or user memory.
- No secret tokens, webhook signatures, service-role keys, raw provider credentials, or production backups may enter public commits.
- Browser-local data is tied to a browser/device unless explicitly exported or synced. Account/cloud routes have different privacy and retention boundaries.
- Export, recovery, and understandable data flows are part of the product goal; do not claim end-to-end encryption or certifications without evidence.
- AI operations must indicate what user context is sent and to which provider, and must respect permissions.

See [SECURITY.md](../SECURITY.md) for vulnerability reporting and security expectations.

## Future licensing decisions

**There is no license change in this document.** The current repository LICENSE remains Apache-2.0.

The copyright owner may offer later *owned* code under different terms or use separate licensing for new modules. However:

1. The rights already granted to recipients of previously published Apache-2.0 code are not retroactively revoked.
2. Code written by outside contributors, or based on third-party code, needs a rights and license review before any relicensing.
3. A hosted-service noncompete restriction usually means a **source-available** license, not OSI-approved open source.
4. Apache-2.0, AGPL, and proprietary service terms solve different problems. No license by itself creates an operating-service advantage.

Do not edit LICENSE or relicense a release as an incidental documentation cleanup. Make any future decision as a distinct, reviewed change with a precise affected-version scope.

## Not yet promised

No price table, trial period, unlimited AI usage, uptime SLA, enterprise support, or release frequency is guaranteed by this document. Billing code currently exists behind rollout gates; a verified payment lifecycle and user demand are required before advertising a paid service.

For how reviewed source moves into public releases, see [PUBLIC_RELEASE_PROCESS.md](./PUBLIC_RELEASE_PROCESS.md).
