# EXODUS.EXE — Build progress

Source of truth: `EXODUS_MVP_SPEC.md`. Decisions: `DECISIONS.md`.
Resume protocol (spec §0.1 rule 5): read the spec, then this file, then `DECISIONS.md`, run the full test
suite, and continue from the first unchecked task.

**Current task:** M7.7–M8.4: the gallery review, the benchmark, and the final report

Background workstreams (subagents): written content (§12.10), procedural audio (§14), prop modeling (§5.3–5.4).

## M1 — Foundation

- [x] M1.1 Project setup: Vite, strict TypeScript, ESLint, Prettier, Vitest, Playwright, npm scripts
- [x] M1.2 Core contracts (`src/core/types.ts`) and `src/content/tuning.ts`
- [x] M1.3 Core utilities: seeded RNG, noise, math, tween, event bus, URL config, save with migration
- [x] M1.4 Fixed-timestep game loop (60 Hz + interpolation) and scene manager
- [x] M1.5 Input: intents, keyboard, gamepad manager, player slots, glyphs
- [x] M1.6 Low-res pipeline: 640×360 target, whole-number upscale, resize and devicePixelRatio
- [x] M1.7 Palettes, OKLab lookup quantization, Bayer dither, emissive bloom, vignette
- [x] M1.8 Pixel-stable camera (texel snapping + sub-texel screen offset), framing, shake
- [x] M1.9 Toon shading, geometry kit, builder API, merging and instancing
- [x] M1.10 Test street block with procedural props, pooled lights, fog
- [x] M1.11 Snow particles (instanced, wind-driven)
- [x] M1.12 One character walking with gamepad and keyboard
- [x] M1.13 Exit: unit tests, palette test, shimmer test pass; 1080p and 1440p screenshots reviewed

## M2 — Characters and co-op input

- [x] M2.1 Full humanoid rig (instanced parts), variants, party silhouettes, exposed chassis
- [x] M2.2 Procedural animation library (12 fps poses), 8-direction facing, glitch effect
- [x] M2.3 Two-player join and drop, character assignment
- [x] M2.4 Shared camera with zoom and leash
- [x] M2.5 Glyphs, rumble, disconnect handling
- [x] M2.6 Exit: simulated two-player input test passes; screenshots show both players framed

## M3 — The depot loop

- [x] M3.1 Collision grid, layout format and validation, two depot layouts
- [x] M3.2 Stop simulation core: actors, movement, collision, A* pathfinding
- [x] M3.3 NPC routines and distraction windows
- [x] M3.4 Perception, awareness, states, sympathizers
- [x] M3.5 Suspicious behaviors (sprint, dash, robotic movement, stillness, zones, needs)
- [x] M3.6 Blend actions, radial, co-op Chat
- [x] M3.7 Charging with Papers or hack; loot containers and searching
- [x] M3.8 Patrol clock, drones, routine sweep with breathing scan, ALERT and Searching
- [x] M3.9 Recyclers, light combat, dash, shutdown, revive, carry, loss
- [x] M3.10 Leaving by car and the stop outcome
- [x] M3.11 Party AI
- [x] M3.12 Stop scene rendering (layout to 3D), NPC visuals, awareness icons
- [x] M3.13 HUD (panels, bars, eye, prompts, patrol pips, pickups) and suspicion audio
- [x] M3.14 Bot framework and depot bots; exit: every depot band passes solo and two-player

## M4 — The other stops

- [x] M4.1 Diner (two layouts): ordering, coffee, booths, TV rumors, waitress expectations
- [x] M4.2 Gas Station (two layouts): car charging, rotating camera, garage
- [x] M4.3 Stations (three interiors), keepers, benefits, trades, compromised Stations
- [x] M4.4 Every ability and tell
- [x] M4.5 June's systems (legal ID, conductor, Patch, hunger, Trust)
- [x] M4.6 Glitches, Integrity, factory reset
- [x] M4.7 Weather and region stealth effects
- [x] M4.8 Wanted posters
- [x] M4.9 Exit: layout validation passes for every layout; bot bands pass in every stop type

## M5 — The run

- [x] M5.1 Map generation, validation, reveal rules
- [x] M5.2 Map scene rendering and the sailing clock
- [x] M5.3 Drive scene (all regions and weather, billboards, fast-forward, walking legs)
- [x] M5.4 Events engine and 24 road events
- [x] M5.5 Remaining content (§12.10): questions, conversations, keepers, barks, Lantern, epilogue, voyage
- [x] M5.6 Camp scene and management panel
- [x] M5.7 Lantern message system
- [x] M5.8 Checkpoints: queue, interrogation, breathing scan, bust
- [x] M5.9 Heat and enforcement escalation
- [x] M5.10 Save and continue (autosave at camp and Station)
- [x] M5.11 Exit: checkpoint bot bands and economy simulator bands pass

## M6 — The finale

- [x] M6.1 The Port: dawn clock, container yard, terminal gate, berth and gangway timer
- [x] M6.2 The voyage with the palette crossfade
- [x] M6.3 Ghana ending, epilogue lines, stats screen
- [x] M6.4 Both game overs
- [x] M6.5 Memory cores and unlocks
- [x] M6.6 Exit: Port bot band passes; a scripted full run reaches Ghana headless

## M7 — Presentation and polish

- [x] M7.1 Title, join, intro
- [x] M7.2 Tutorial and first-time tips
- [x] M7.3 Transitions (pixel dissolve, scanline wipe)
- [x] M7.4 Full procedural audio, music layers, override loader
- [x] M7.5 Settings and pause menu
- [x] M7.6 Typewriter text and juice (hit-pause, knockback, sparks, shake, pickup pops)
- [ ] M7.7 Art pass over every prop and lighting setup using the screenshot gallery
- [ ] M7.8 Exit: fresh screenshot gallery shows no off-style or unreadable scenes

## M8 — QA, performance, and documentation

- [x] M8.1 Debug overlay, hotkeys, scene jumps (§17.6)
- [x] M8.2 Performance benchmark; budgets pass
- [x] M8.3 README.md and qa/CHECKLIST.md
- [ ] M8.4 Final full-spec audit and qa/FINAL_REPORT.md

## Known issues

Ranked by severity in `qa/FINAL_REPORT.md`. In short:

- The Port is hard at high Heat by design: a careful bot gets someone aboard 40% of the time at Heat 2 and 27–31% at
  Heat 3 (band: at most 40%), losing mostly at the held berth.
- The tightest stop band margins on the test seeds are gas greedy 1P and diner greedy 2P at 41% (floor 40%);
  `npx tsx tools/bands.ts --n 400` puts the true means 4 or more points inside every band.
- The Port band at Heat 0 is 81% solo against a 70% floor, measured with a careful bot rather than people.
