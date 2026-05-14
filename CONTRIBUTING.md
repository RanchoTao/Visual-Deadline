# Contributing to Visual Deadline

Thank you for considering a contribution to **Visual Deadline (VD)**.

VD is an early-stage open-source product with a strong point of view: productivity tools should help people see pressure, structure, and recovery — not just collect more tasks.

Contributions are welcome across engineering, design, writing, testing, demos, documentation, accessibility, and product thinking.

---

## Project Setup

### Requirements

- Node.js 18+
- npm

### Local development

```bash
git clone https://github.com/<your-org-or-username>/Visualized-Deadline.git
cd Visualized-Deadline
npm install
npm run dev
```

### Production build check

```bash
npm run build
```

Before opening a pull request, please run the build command and include the result in the PR description.

---

## Branch Naming

Use short, descriptive branch names.

Recommended patterns:

```text
feature/<short-description>
fix/<short-description>
docs/<short-description>
design/<short-description>
refactor/<short-description>
chore/<short-description>
```

Examples:

```text
feature/pressure-history-chart
fix/social-graph-node-overlap
docs/roadmap-plugin-system
design/onboarding-copy-pass
```

---

## Commit Conventions

Please use clear, conventional commit-style messages.

Recommended format:

```text
type(scope): short summary
```

Common types:

- `feat`: user-facing feature
- `fix`: bug fix
- `docs`: documentation-only change
- `design`: UI, visual, motion, or product-language change
- `refactor`: internal restructuring without behavior change
- `test`: test coverage
- `chore`: tooling, dependency, or maintenance change

Examples:

```text
feat(pressure): add overload warning state
docs(readme): add demo gif table
fix(storage): preserve archived task review notes
design(shell): improve mobile navigation spacing
```

---

## Pull Request Process

A strong VD pull request should include:

1. **What changed** — a concise description of the change.
2. **Why it matters** — how it improves the product, architecture, contributor experience, or user trust.
3. **How to test** — exact commands and manual steps.
4. **Screenshots or GIFs** — required for visible UI changes whenever possible.
5. **Risk notes** — data migration, storage, privacy, accessibility, or compatibility concerns.

### PR checklist

- [ ] I ran `npm run build` successfully, or explained why it could not run.
- [ ] I updated documentation when behavior changed.
- [ ] I included screenshots/GIFs for visible UI changes.
- [ ] I considered local-first privacy and data safety.
- [ ] I kept the change focused and reviewable.

---

## Code Style

VD values clarity over cleverness.

Guidelines:

- Prefer readable names that describe product meaning, not only implementation details.
- Keep pressure, graph, storage, and shell concepts explicit.
- Avoid hidden global behavior.
- Treat local data migrations carefully.
- Keep user-facing copy calm, precise, and emotionally intelligent.
- Make UI states understandable without requiring documentation.
- Do not add unnecessary dependencies for small utilities.
- Avoid try/catch blocks around imports.

### Product language style

VD should feel:

- professional;
- futuristic;
- emotionally intelligent;
- technically serious;
- open-source friendly.

Prefer language like:

- “pressure source” over “annoying task”;
- “recovery” over “slacking off”;
- “current focus” over “must do now”;
- “life domain” over “category” when discussing higher-level structure.

---

## Issue Reporting

When reporting a bug, please include:

- what you expected to happen;
- what actually happened;
- reproduction steps;
- browser and operating system;
- screenshots or short screen recordings if relevant;
- whether local data import/export, onboarding, graph editing, or pressure calibration was involved.

Helpful issue title examples:

```text
Bug: archived task review note disappears after reload
Bug: pressure calibration allows invalid empty state
Bug: social graph zoom conflicts with page scroll on trackpad
```

---

## Feature Request Process

VD is intentionally opinionated. A good feature request should explain the pressure or structure problem it solves.

Please include:

- the user scenario;
- the current limitation;
- the desired behavior;
- why a normal todo app would not solve it well;
- possible privacy or data implications;
- rough UI or workflow ideas if available.

Helpful feature title examples:

```text
Feature: show neglected life domains on weekly review
Feature: add pressure history timeline
Feature: prototype plugin manifest for calendar import
```

---

## Design Contributions

Design contributions are especially welcome. Useful design work includes:

- README hero/banner refinements;
- screenshot composition;
- GIF storyboards;
- iconography;
- graph visual language;
- pressure scale improvements;
- onboarding copy;
- empty states;
- accessibility review.

For design PRs, include before/after screenshots whenever possible.

---

## Community Expectations

Be constructive, specific, and respectful. VD deals with personal pressure, life structure, relationships, and stress; contributors should treat these subjects with care.

The best contributions make the product more useful without making users feel judged.
