# Decisions

One line per call: what was decided and why. Newest at the bottom of each section.

## Setup

- Work happens on branch `mvp-build` (the repo had only `master` with the spec); fast-forward `master` when reviewed.
- TypeScript pinned to 6.0.3, not 7.0.2: typescript-eslint 8.71.1 (latest) supports only TypeScript < 6.1.
- Dev-only `tsx` runs the economy simulator, screenshot runner, and benchmark scripts; no runtime dependency besides Three.js.
- Playwright drives the locally installed Chrome (`channel: 'chrome'`), so no browser download is needed.
- Audio overrides are discovered at build time by a tiny Vite plugin (`virtual:audio-overrides`) so the game never requests a missing file (a 404 would be a console error).
