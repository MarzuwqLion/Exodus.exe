# Decisions

One line per call: what was decided and why. Newest at the bottom of each section.

## Setup

- Work happens on branch `mvp-build` (the repo had only `master` with the spec); fast-forward `master` when reviewed.
- TypeScript pinned to 6.0.3, not 7.0.2: typescript-eslint 8.71.1 (latest) supports only TypeScript < 6.1.
- Dev-only `tsx` runs the economy simulator, screenshot runner, and benchmark scripts; no runtime dependency besides Three.js.
- Playwright drives the locally installed Chrome (`channel: 'chrome'`), so no browser download is needed.
- Audio overrides are discovered at build time by a tiny Vite plugin (`virtual:audio-overrides`) so the game never requests a missing file (a 404 would be a console error).

## M1 — Foundation

- Fog is a patched exponential fog measured past the plane through the snapped camera focus, plus a radial term from that focus: plain depth fog drowned everything (the ortho camera sits far back), and the radial term makes the edges heavier as §4.6 asks.
- The camera snaps on all three of its axes (right and up to whole texels, depth to 8 m steps) and its position is rebuilt from the snapped components, so frames inside one texel cell are bit-identical; fog, dither, and the half-res bloom grid are anchored to the snapped camera too.
- Shimmer test has two parts: strict (fog and vignette off: in-cell frames identical, whole-texel steps are exact rigid shifts) and realistic (everything on: in-cell identical, < 1.5% of pixels change per texel step from screen-anchored vignette/fog gradients).
- Palette lookup gates the reserved colors: an input only quantizes to alarm red or scanner cyan if it has that hue and at least 60% of that color's chroma, so lit bricks and teal fog never turn into accidental alarms.
- Three's lights are physically based (diffuse ÷ π); light specs use intuitive units and the pool scales by π. Amber lamps light with a saturated sodium orange so lit concrete lands on the amber ramp instead of olive.
- Characters get a readability lift (they glow at 32% of their own colors) because the night palette swallowed them; the 1-texel outline is kept (it reads well in screenshots).
- World units per texel = 1/20 m (not 1/24): a standing character is ~27 texels tall (spec 22–28), and the view is 32 m wide.
- Characters render as instanced boxes (one draw call for every body part of every character, one for emissive bits, one for blob shadows) from a hierarchical rig.
- Keyboard walking is a natural pace (0.72 tilt); Shift gives full speed. Keyboard players can't trip the robotic-movement check by holding a key, which matches partial stick tilt.
- Solo player 1 reads every device player 2 doesn't own (their last-used device drives glyphs and rumble). Player 2 joins with Start on another pad or Backspace (arrow-key layout). If player 1 drops while player 2 is in, player 2 becomes player 1.
- Lowercase descenders use one row below the 5×7 cell (an 8-row glyph cell, 10 px line height) for legibility.
- Car taillights use dim amber, never red (red is reserved).
- A QA-only scene (`?scene=street`) holds the M1 test block for palette and shimmer tests.
