# Repository Structure Suggestion

Visualized-Deadline should be organized like a modern open-source product, not a disposable prototype. The structure below separates product code, brand assets, launch materials, AI experiments, plugins, and long-term roadmap artifacts.

---

## Suggested Structure

```text
Visualized-Deadline/
├── assets/
│   ├── brand/
│   ├── diagrams/
│   └── icons/
├── docs/
│   ├── BRANDING.md
│   ├── DEMO_GIF_IDEAS.md
│   ├── GROWTH_STRATEGY.md
│   └── REPOSITORY_STRUCTURE.md
├── screenshots/
│   ├── daily-control-center.png
│   ├── pressure-calibration.png
│   ├── life-map.png
│   └── social-graph.png
├── gifs/
│   ├── pressure-rising-demo.gif
│   ├── life-map-navigation.gif
│   └── ai-weekly-review.gif
├── src/
│   ├── components/
│   ├── features/
│   │   ├── pressure/
│   │   ├── tasks/
│   │   ├── life-map/
│   │   ├── social/
│   │   ├── logs/
│   │   └── profile/
│   ├── storage/
│   ├── types/
│   ├── utils/
│   ├── App.tsx
│   └── main.tsx
├── plugins/
│   ├── examples/
│   └── templates/
├── shell/
│   ├── navigation/
│   ├── layouts/
│   └── information-architecture.md
├── ai/
│   ├── prompts/
│   ├── evals/
│   ├── agents/
│   └── privacy.md
├── roadmap/
│   ├── pressure-engine.md
│   ├── plugin-ecosystem.md
│   ├── life-graph.md
│   └── ai-integration.md
├── CONTRIBUTING.md
├── SECURITY.md
├── ROADMAP.md
└── README.md
```

---

## Why This Structure Scales

### `assets/`

Stores long-lived brand and product media: banners, logos, diagrams, icons, and launch visuals. Keeping these out of `src/` prevents product code from becoming a dumping ground for marketing files.

### `docs/`

Holds evergreen product, contributor, branding, and strategy documents. This helps the repository communicate its vision even before every feature exists.

### `screenshots/`

Keeps README and release screenshots predictable. A polished screenshot library makes the project easier to share on GitHub, social media, launch posts, and issues.

### `gifs/`

Stores visual demos that explain why VD is different from normal todo apps. GIFs are especially important for a visualization-driven project because users need to see motion, pressure change, and graph interaction.

### `src/`

Contains the actual application. As VD grows, feature folders should map to product domains: pressure, tasks, life map, social graph, logs, profile, storage, and shell.

### `plugins/`

Reserved for the future plugin ecosystem. Keeping plugin examples and templates separate from core code communicates that extensibility is a serious long-term goal.

### `shell/`

VD is a shell-based life operating system, so shell information architecture deserves its own design space. This folder can hold navigation specs, layout experiments, and IA diagrams before they become code.

### `ai/`

Future AI features require careful prompt design, evaluation, privacy notes, and agent behavior documentation. Keeping AI work isolated makes it easier to review for privacy, safety, and tone.

### `roadmap/`

Long-form roadmap notes can live here while `ROADMAP.md` remains readable as the public overview.

---

## Naming Principles

- Prefer product-domain names over technical-only names.
- Keep privacy-sensitive areas explicit.
- Separate launch materials from source code.
- Make future extension points visible before they become large.
- Keep root-level files focused on GitHub trust: README, contributing, security, roadmap, license.
