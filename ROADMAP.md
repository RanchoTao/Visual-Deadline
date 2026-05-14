# Visualized-Deadline Roadmap

Visualized-Deadline (VD) is evolving from a visual deadline prototype into a pressure-aware, local-first life operating system.

The roadmap is intentionally ambitious, but staged. Each phase should produce a usable product, not just infrastructure.

---

## v0.x Foundations

Goal: stabilize the local-first product shell and make the core idea understandable within seconds.

### Product shell

- [ ] Refine Home / Map / Social / Logs / Me navigation.
- [ ] Improve mobile responsiveness across all primary views.
- [ ] Add consistent empty states and loading states.
- [ ] Create a clear first-run onboarding path.
- [ ] Make “current focus” useful without feeling bossy.

### Pressure foundations

- [ ] Stabilize urgency × importance task pressure calculation.
- [ ] Improve subjective pressure calibration copy.
- [ ] Add pressure history snapshots.
- [ ] Add recovery activity modeling.
- [ ] Make overload and burnout-risk states visually distinct.

### Data safety

- [ ] Harden JSON export/import validation.
- [ ] Add user-readable backup summaries.
- [ ] Improve local backup recovery messaging.
- [ ] Document local storage schema.
- [ ] Add migration tests for legacy data.

### Graph foundations

- [ ] Improve life map node editing.
- [ ] Improve social graph layout and readability.
- [ ] Add relationship metadata editing polish.
- [ ] Make graph interactions predictable on touchpads and mobile.

### Documentation and launch assets

- [ ] Add polished screenshots.
- [ ] Add first demo GIFs.
- [ ] Create a short product video script.
- [ ] Add contributor-friendly issue templates.
- [ ] Document the pressure model with diagrams.

---

## v1.0 Productization

Goal: make VD feel reliable, understandable, and worth starring or trying.

### Experience quality

- [ ] Complete visual design pass across the shell.
- [ ] Add keyboard-friendly flows for task creation and editing.
- [ ] Improve accessibility, contrast, focus states, and screen-reader labels.
- [ ] Add responsive tablet and mobile layouts.
- [ ] Polish microcopy and emotional tone.

### Product clarity

- [ ] Create an interactive sample dataset/demo mode.
- [ ] Add “Why this is pressure” explanations to task recommendations.
- [ ] Add guided examples for students, founders, creators, and researchers.
- [ ] Add an in-app glossary for pressure, recovery, domains, and life graph.

### Reliability

- [ ] Add unit tests for pressure calculations.
- [ ] Add integration tests for import/export.
- [ ] Add regression checks for local data migrations.
- [ ] Add release checklist and versioning policy.

### Distribution

- [ ] Improve GitHub Pages deployment.
- [ ] Add PWA install support if product experience is ready.
- [ ] Publish a stable v1.0 release with demo assets.
- [ ] Create launch post and contributor guide.

---

## AI Integration

Goal: add AI assistance without sacrificing user agency or privacy.

### Local-first AI posture

- [ ] Define AI privacy principles.
- [ ] Show exactly what context is sent to an AI model.
- [ ] Support redaction before AI analysis.
- [ ] Design optional local-model compatibility path.

### AI assistant capabilities

- [ ] Daily pressure summary.
- [ ] Weekly review generation.
- [ ] Suggested next actions with explanation.
- [ ] Overloaded life-domain detection.
- [ ] Relationship follow-up suggestions.
- [ ] Task decomposition for high-pressure items.
- [ ] Reflection prompts for abandoned tasks.

### AI evaluation

- [ ] Create example life scenarios.
- [ ] Evaluate recommendation usefulness and tone.
- [ ] Detect overly aggressive or guilt-inducing suggestions.
- [ ] Add safety checks for sensitive personal content.

---

## Plugin Ecosystem

Goal: let VD become a platform without losing trust.

### Plugin architecture

- [ ] Define plugin manifest format.
- [ ] Create plugin lifecycle: install, enable, disable, update, remove.
- [ ] Add permission model for data domains.
- [ ] Create plugin sandbox strategy.
- [ ] Document plugin API boundaries.

### First-party plugin ideas

- [ ] Calendar import.
- [ ] Markdown task import/export.
- [ ] GitHub issues pressure adapter.
- [ ] Habit tracker adapter.
- [ ] Academic deadline pack.
- [ ] Finance recurring obligation pack.
- [ ] Relationship maintenance pack.

### Community ecosystem

- [ ] Add plugin template.
- [ ] Add plugin examples.
- [ ] Add plugin review guidelines.
- [ ] Add marketplace metadata proposal.

---

## Social Systems

Goal: represent relationship health and social pressure with nuance.

### Relationship graph

- [ ] Improve social node clustering.
- [ ] Add interaction recency indicators.
- [ ] Add relationship strength and trust visualization.
- [ ] Add optional reminders for neglected relationships.
- [ ] Add private notes with clear local-first handling.

### Social pressure model

- [ ] Model social obligations separately from tasks.
- [ ] Identify high-impact relationships needing attention.
- [ ] Represent emotional closeness without turning people into scores.
- [ ] Add healthy boundaries and recovery-aware social suggestions.

---

## Life Graph

Goal: unify tasks, domains, people, goals, logs, achievements, and time.

### Graph data model

- [ ] Define entities: task, project, goal, domain, person, log, achievement, event.
- [ ] Define relationships: depends on, supports, blocks, belongs to, affects, requires recovery from.
- [ ] Build migration path from current life/social graphs.

### Visualization

- [ ] Show pressure propagation across connected nodes.
- [ ] Highlight overloaded domains.
- [ ] Show goals unsupported by current actions.
- [ ] Show tasks disconnected from meaningful goals.
- [ ] Add time horizon layers: today, week, month, year, life stage.

---

## Pressure Engine

Goal: make pressure calculation explainable, adaptable, and useful.

### Model improvements

- [ ] Add nonlinear deadline urgency curves.
- [ ] Add effort estimates.
- [ ] Add uncertainty and ambiguity pressure.
- [ ] Add dependency pressure for blocked tasks.
- [ ] Add context-switching cost.
- [ ] Add recovery debt and energy state.

### Explainability

- [ ] Show pressure contribution per task.
- [ ] Show what changed since yesterday.
- [ ] Show simulated effect of completing, postponing, or abandoning a task.
- [ ] Add “why this matters” explanations.

### Calibration

- [ ] Add recurring subjective check-ins.
- [ ] Learn pressure ratio trends over time.
- [ ] Detect when the model no longer matches user experience.
- [ ] Allow manual override with transparent reasoning.

---

## Future World-Model Ideas

Goal: help users simulate life pressure before making decisions.

These are exploratory, not near-term promises.

- Future pressure timeline simulation.
- Deadline collision detection.
- Life-domain imbalance forecasting.
- “If I accept this project, what happens?” simulation.
- Social maintenance load forecasting.
- Burnout risk scenario planning.
- Goal-path simulation from current habits and deadlines.
- AI-generated weekly life map diff.
- Multi-agent planning where specialized agents represent health, work, finance, social, and recovery perspectives.
- Personal operating system snapshots for major life stages.

---

## Roadmap Principle

VD should only become more powerful if it also becomes more humane.

The goal is not to pressure users into doing more. The goal is to help users see pressure clearly enough to make better decisions.
