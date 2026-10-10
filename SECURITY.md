# Security Policy

Visual Deadline (VD) is a pressure-aware life operating system. Because it can contain personal tasks, relationships, goals, logs, and future AI-generated life context, security and privacy are central product requirements.

---

## Supported Versions

VD is early-stage. Report issues affecting a published version and include the affected commit or deployed URL. Security fixes generally target the active `main` branch; deployment and release support should not be assumed for older snapshots.

| Version | Supported |
| --- | --- |
| `main` | Yes |
| older prototypes | Best effort |

---

## Vulnerability Reporting

If you discover a security or privacy issue, please do **not** open a public issue with exploit details.

Preferred reporting path:

1. Email the maintainer or project security contact listed in the repository profile.
2. Include a clear description of the issue.
3. Include reproduction steps, affected versions, browser/runtime details, and impact.
4. If possible, include a minimal proof of concept that avoids exposing personal data.

If no private contact is available yet, open a public issue titled:

```text
Security: private vulnerability report requested
```

Do not include sensitive details in that public issue. A maintainer should then coordinate a private channel.

---

## Responsible Disclosure

VD follows a responsible disclosure approach:

- Reports will be acknowledged as quickly as possible.
- The maintainer will investigate, reproduce, and assess impact.
- Fixes should be prioritized based on severity and exploitability.
- Public disclosure should wait until a fix or mitigation is available.
- Credit may be given to reporters who want acknowledgement.

---

## Privacy Philosophy

VD’s product philosophy is built on trust:

> A life operating system should help users understand pressure without extracting their life into someone else’s black box.

This means VD should prefer:

- local-first storage;
- explicit export and import;
- transparent data models;
- minimal data collection;
- clear user consent for future sync or AI features;
- privacy-preserving defaults;
- readable explanations of what data is stored and why.

---

## Local-First Data Principles

VD has browser-local features **and** implemented authentication / Supabase cloud data paths. Guest and signed-in data flows are not identical; the actual destination depends on the feature, user session, and deployed configuration. Do not assume all signed-in information stays on one device. Browser-local content can be lost if local browser data is cleared without a backup.

Local-first principles:

- Make local and hosted data boundaries visible to users; avoid presenting signed-in cloud storage as purely local.
- Backups should be portable and human-auditable where practical.
- Test cloud authorization and owner isolation (including Supabase RLS) in the actual deployment, and document retention, backup and deletion behavior.
- AI features should explain which context is transmitted, which provider receives it, and what user controls exist. Server-side keys must never reach browser bundles.
- Data migrations should avoid destructive behavior and preserve user trust.

---

## Security Areas of Interest

Please report issues involving:

- accidental exposure of local data;
- unsafe backup import behavior;
- data loss during migration;
- cross-site scripting risks;
- unsafe rendering of user-provided text;
- dependency or build-chain vulnerabilities;
- future plugin permission bypasses;
- future AI prompt/context leakage;
- sync/authentication weaknesses and cross-account access;
- cloud billing entitlements and webhook authorization flaws.

---

## Future Security Goals

VD’s long-term security roadmap includes:

- documented data schema and migration policy;
- safer backup validation and recovery flows;
- encrypted export options;
- evaluation of encrypted sync and explicit key-management tradeoffs;
- plugin permission manifests;
- sandboxing for third-party plugins;
- security review checklist for AI features;
- threat model for life graph and social graph data;
- privacy-preserving analytics, if analytics are ever introduced;
- clear user-facing data controls.

---

## Current limitations and reporting priority

Cloud authentication, owner isolation, accidental user-data exposure, payment/webhook trust boundaries, and provider-secret leakage are **in scope now**, because the repository already contains cloud, AI, and billing code. A feature flag does not make a real vulnerability harmless if a deployment enables the feature.

Do not infer end-to-end encryption, compliance certifications, independent audits, penetration tests, backups, or uptime guarantees from this document. Report reproducible security issues privately. Vulnerabilities that require complete control of a user's local machine may be lower priority, but reports are still welcome.

For product and self-host/hosted distinctions, see [Community & Cloud](./docs/COMMUNITY_AND_CLOUD.md).
