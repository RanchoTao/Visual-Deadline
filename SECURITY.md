# Security Policy

Visualized-Deadline (VD) is a pressure-aware life operating system. Because it can contain personal tasks, relationships, goals, logs, and future AI-generated life context, security and privacy are central product requirements.

---

## Supported Versions

VD is currently early-stage. Security fixes will focus on the active `main` branch unless release branches are introduced later.

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

The current application stores user data in the browser by default. This includes tasks, pressure calibration, achievements, profile data, life map nodes, social graph nodes, logs, and backup snapshots.

Local-first principles:

- Personal data should remain on the user’s device unless the user explicitly opts into sync or export.
- Backups should be portable and human-auditable where practical.
- Future cloud sync should be optional, transparent, and designed with encryption in mind.
- Future AI features should clearly explain what context is sent to a model, if any.
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
- future sync/authentication weaknesses.

---

## Future Security Goals

VD’s long-term security roadmap includes:

- documented data schema and migration policy;
- safer backup validation and recovery flows;
- encrypted export options;
- optional encrypted sync architecture;
- plugin permission manifests;
- sandboxing for third-party plugins;
- security review checklist for AI features;
- threat model for life graph and social graph data;
- privacy-preserving analytics, if analytics are ever introduced;
- clear user-facing data controls.

---

## Out of Scope for Early Prototype Reports

The following may be treated as lower priority during early development unless paired with a concrete exploit:

- missing enterprise compliance certifications;
- absence of cloud security controls before cloud sync exists;
- attacks requiring full control of the user’s local machine or browser profile.

Even when something is out of scope, thoughtful reports are welcome.
