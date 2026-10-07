# EXODUS.EXE — Build progress

Source of truth: `EXODUS_MVP_SPEC.md`. Decisions: `DECISIONS.md`.
Resume protocol (spec §0.1 rule 5): read the spec, then this file, then `DECISIONS.md`, run the full test
suite, and continue from the first unchecked task.

**Current task:** M1.1 Project setup

## M1 — Foundation

- [ ] M1.1 Project setup: Vite, strict TypeScript, ESLint, Prettier, Vitest, Playwright, npm scripts
- [ ] M1.2 Core contracts (`src/core/types.ts`) and `src/content/tuning.ts`
- [ ] M1.3 Core utilities: seeded RNG, noise, math, tween, event bus, URL config, save with migration
- [ ] M1.4 Fixed-timestep game loop (60 Hz + interpolation) and scene manager
- [ ] M1.5 Input: intents, keyboard, gamepad manager, player slots, glyphs
- [ ] M1.6 Low-res pipeline: 640×360 target, whole-number upscale, resize and devicePixelRatio
- [ ] M1.7 Palettes, OKLab lookup quantization, Bayer dither, emissive bloom, vignette
- [ ] M1.8 Pixel-stable camera (texel snapping + sub-texel screen offset), framing, shake
- [ ] M1.9 Toon shading, geometry kit, builder API, merging and instancing
- [ ] M1.10 Test street block with procedural props, pooled lights, fog
- [ ] M1.11 Snow particles (instanced, wind-driven)
- [ ] M1.12 One character walking with gamepad and keyboard
- [ ] M1.13 Exit: unit tests, palette test, shimmer test pass; 1080p and 1440p screenshots reviewed

## M2 — Characters and co-op input

- [ ] M2.1 Full humanoid rig (instanced parts), variants, party silhouettes, exposed chassis
- [ ] M2.2 Procedural animation library (12 fps poses), 8-direction facing, glitch effect
- [ ] M2.3 Two-player join and drop, character assignment
- [ ] M2.4 Shared camera with zoom and leash
- [ ] M2.5 Glyphs, rumble, disconnect handling
- [ ] M2.6 Exit: simulated two-player input test passes; screenshots show both players framed

## M3 — The depot loop

- [ ] M3.1 Collision grid, layout format and validation, two depot layouts
- [ ] M3.2 Stop simulation core: actors, movement, collision, A* pathfinding
- [ ] M3.3 NPC routines and distraction windows
- [ ] M3.4 Perception, awareness, states, sympathizers
- [ ] M3.5 Suspicious behaviors (sprint, dash, robotic movement, stillness, zones, needs)
- [ ] M3.6 Blend actions, radial, co-op Chat
- [ ] M3.7 Charging with Papers or hack; loot containers and searching
- [ ] M3.8 Patrol clock, drones, routine sweep with breathing scan, ALERT and Searching
- [ ] M3.9 Recyclers, light combat, dash, shutdown, revive, carry, loss
- [ ] M3.10 Leaving by car and the stop outcome
- [ ] M3.11 Party AI
- [ ] M3.12 Stop scene rendering (layout to 3D), NPC visuals, awareness icons
- [ ] M3.13 HUD (panels, bars, eye, prompts, patrol pips, pickups) and suspicion audio
- [ ] M3.14 Bot framework and depot bots; exit: every depot band passes solo and two-player

## M4 — The other stops

- [ ] M4.1 Diner (two layouts): ordering, coffee, booths, TV rumors, waitress expectations
- [ ] M4.2 Gas Station (two layouts): car charging, rotating camera, garage
- [ ] M4.3 Stations (three interiors), keepers, benefits, trades, compromised Stations
- [ ] M4.4 Every ability and tell
- [ ] M4.5 June's systems (legal ID, conductor, Patch, hunger, Trust)
- [ ] M4.6 Glitches, Integrity, factory reset
- [ ] M4.7 Weather and region stealth effects
- [ ] M4.8 Wanted posters
- [ ] M4.9 Exit: layout validation passes for every layout; bot bands pass in every stop type

## M5 — The run

- [ ] M5.1 Map generation, validation, reveal rules
- [ ] M5.2 Map scene rendering and the sailing clock
- [ ] M5.3 Drive scene (all regions and weather, billboards, fast-forward, walking legs)
- [ ] M5.4 Events engine and 24 road events
- [ ] M5.5 Remaining content (§12.10): questions, conversations, keepers, barks, Lantern, epilogue, voyage
- [ ] M5.6 Camp scene and management panel
- [ ] M5.7 Lantern message system
- [ ] M5.8 Checkpoints: queue, interrogation, breathing scan, bust
- [ ] M5.9 Heat and enforcement escalation
- [ ] M5.10 Save and continue (autosave at camp and Station)
- [ ] M5.11 Exit: checkpoint bot bands and economy simulator bands pass

## M6 — The finale

- [ ] M6.1 The Port: dawn clock, container yard, terminal gate, berth and gangway timer
- [ ] M6.2 The voyage with the palette crossfade
- [ ] M6.3 Ghana ending, epilogue lines, stats screen
- [ ] M6.4 Both game overs
- [ ] M6.5 Memory cores and unlocks
- [ ] M6.6 Exit: Port bot band passes; a scripted full run reaches Ghana headless

## M7 — Presentation and polish

- [ ] M7.1 Title, join, intro
- [ ] M7.2 Tutorial and first-time tips
- [ ] M7.3 Transitions (pixel dissolve, scanline wipe)
- [ ] M7.4 Full procedural audio, music layers, override loader
- [ ] M7.5 Settings and pause menu
- [ ] M7.6 Typewriter text and juice (hit-pause, knockback, sparks, shake, pickup pops)
- [ ] M7.7 Art pass over every prop and lighting setup using the screenshot gallery
- [ ] M7.8 Exit: fresh screenshot gallery shows no off-style or unreadable scenes

## M8 — QA, performance, and documentation

- [ ] M8.1 Debug overlay, hotkeys, scene jumps (§17.6)
- [ ] M8.2 Performance benchmark; budgets pass
- [ ] M8.3 README.md and qa/CHECKLIST.md
- [ ] M8.4 Final full-spec audit and qa/FINAL_REPORT.md

## Known issues

- none yet
