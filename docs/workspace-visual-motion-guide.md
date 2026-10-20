# VD workspace visual and motion guide (2026-10-20)

This is a **scoped** UI consistency pass. The authenticated workspace uses the **Now** page as its visual baseline: restrained blue-gray surfaces, 1px low-contrast borders, round corners, clear focus rings, and light shadows. The public marketing site, sign-in and payment views deliberately stay untouched.

## Design primitives

- `.vd-workspace`: authenticated workspace only; provides consistent form controls across Now / Tasks / Plan / Execute / Review.
- `.vd-surface`: main content panel with a soft outline, large corner radius and quiet shadow.
- `.vd-subpanel`: nested panel/editor; use sparingly to preserve hierarchy.
- `.vd-thinking-text`: breathing gradient on **actual in-flight request** status text. This is not a claim that the server emits intermediate thoughts or token streams.
- Native checkbox/radio/range/file inputs are excluded from the generic text-field rule.
- Respect `prefers-reduced-motion`; animation stops entirely when requested.
- Preserve semantic focus, error and warning treatments.

## How to review *motion* rather than only screenshots

On Windows 11 open **Snipping Tool → Record** (or use **Win + Shift + R** where available), select the VD region and record a short 15–30 second video. Include: pressing Send → waiting status with elapsed timer and breathing headline → Stop → retry → editable review. Keep the cursor visible so input delays and affordances can be inspected. Share the MP4 or a short GIF; screenshots alone cannot show timing.

When reporting a visual issue, include: URL/path, browser zoom and display resolution, expected behavior, the interaction performed, and a short recording. For performance issues, optional browser DevTools **Network** timings for `/api/ai` can distinguish model wait from rendering delays. Never share bearer tokens, request headers containing credentials or private task content unintentionally.

## Follow-ups

The current capture is still a one-response JSON request, not a streamed ChatGPT conversation. Expanding the entire interface to a unified component library with visual regression snapshots, design tokens for typography/spacing, and consistent dark-mode support is separate from this low-risk appearance pass.
