# EXODUS.EXE: final report

Built autonomously from `EXODUS_MVP_SPEC.md` (spec §0), milestone by milestone (M1–M8, `PROGRESS.md`), with every design and tuning decision logged in `DECISIONS.md`.

## What was built

A complete browser game: one or two players on gamepads or the keyboard drive three androids (and maybe June, a human conductor) from Boston to the Port of Miami in fourteen days, then sail to Ghana.

- **The run:** title, join, intro, the tutorial stop in Boston (night one), then a generated ten-column map. Each leg is a drive (road events), then a stop, a Station, or a checkpoint, then camp. The sailing clock, Heat and enforcement escalation, Lantern's messages, and autosave with Continue run underneath.
- **The stops:** real-time stealth-social scenes on a 60 Hz deterministic simulation. Depots, diners, and gas stations come in two layouts each; Stations in three interiors, and compromised Stations; plus checkpoint busts. All are built on the Mask system: perception, awareness, Blends, Chat, sympathizers, the patrol clock, ALERT and the Recyclers, light combat, shutdown, revive, and carry. Each character has their own ability and tell.
- **Checkpoints:** the queue, the interrogation (the "too perfect" timing rule), the breathing scan, Papers, and the bust.
- **The finale:**
  - **The Port, before dawn in a thunderstorm:** the dawn clock; a stealth crossing of the container yard, with yard trucks and a gantry crane as moving cover; the terminal gate's scanner arch (Papers or a breathing scan); the waterline path; Recyclers holding the berth; the horn and the 60 s gangway timer.
  - **After it:** the voyage, with the palette crossfading into the first warm color, then Ghana (Tema's quay and the solar cooperative) with epilogue lines for who made it and who didn't, the stats, and memory cores with unlocks.
  - **Game overs:** both of them.
- **Presentation:**
  - **Rendering:** 640×360 through a palette lookup with Bayer dither, a pixel-stable camera, toon shading, pooled lights, fog, and weather particles. Everything is modeled in code: characters, over a hundred props, vehicles, and the ship.
  - **Animation:** procedural, posed at 12 fps.
  - **Audio:** all procedural, with music layers and an override folder.
  - **UI:** a pixel UI in two bitmap fonts, with HUD portraits rendered from the 3D heads.
  - **Screens and polish:** transitions on every scene change, settings and the pause menu, typewriter text, and juice.
- **Verification:**
  - **Tests:** unit tests, bot playtests for every band, a headless full run to Ghana, and the whole-run economy simulator.
  - **Visual QA:** a screenshot gallery with a palette check on every frame, plus a shimmer test.
  - **Performance and playthroughs:** a 60 s performance benchmark, and scripted browser playthroughs of whole runs.

## Spec audit

Status: **done** (implemented and verified), **partial** (implemented with a noted gap), **cut** (not built; logged). Nothing was cut.

Test names are quoted from `tests/*.test.ts` (unit) and `tests/bots/*.bots.ts` (bands). Screenshots are in the gallery, `qa/screenshots/index.html` (`npm run qa:screens`).

| §         | Requirement                       | Status       | Evidence                                                                                                                                                                                                                                                                                                                                                                              |
| --------- | --------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0         | Autonomous build protocol         | done         | `PROGRESS.md` (every task checked), `DECISIONS.md`, a commit per task naming its milestone; typecheck, lint, test, and build run before each commit (one commit, 7c758f1, let a lint failure through in a generated report; the next fixed it)                                                                                                                                        |
| 1.1–1.3   | Premise, core loop, pillars       | done         | The intro and the Mask system below; content.test "includes the intro, Ghana, and game over text from the spec"                                                                                                                                                                                                                                                                       |
| 1.4       | MVP scope                         | done         | Everything in scope is built. Nothing out of scope was built.                                                                                                                                                                                                                                                                                                                         |
| 2.1–2.2   | Timeline, factions, people        | done         | Intro, Lantern, the six keepers, Captain Mensah (content.test quotas)                                                                                                                                                                                                                                                                                                                 |
| 2.3       | The route                         | done         | run.test "every generated map is valid: Boston to the Port, checkpoints at 4 and 8, three Stations, no crossings"; regions by column; gallery covers all four regions                                                                                                                                                                                                                 |
| 2.4       | The Underground Railroad parallel | done         | content.test "uses no banned words, slurs, historical people, or memorial sites" and "the banned-word check actually catches things"; the content review below                                                                                                                                                                                                                        |
| 2.5       | Voice guide                       | done         | content.test "uses sentence case for event titles and choice labels"; the content review below                                                                                                                                                                                                                                                                                        |
| 3.1       | Stack                             | done         | `package.json` pins exact versions; Three.js is the only runtime dependency. TypeScript is 6.0.3 because typescript-eslint doesn't support 7 yet (`DECISIONS.md`). Playwright drives the system Chrome.                                                                                                                                                                               |
| 3.2       | Architecture rules                | done         | ESLint bans `three`, the DOM, and `Math.random` in `core`, `sim`, `run`, `content`, and `bots`. Tests: sim.test "is deterministic for the same seed and inputs" and input.test "ticks at a fixed rate regardless of frame rate". The bots and the economy run headless in Node.                                                                                                       |
| 3.3       | Folder structure                  | done         | `src/` as specified, plus `src/scenes/runflow.ts`, the run controller                                                                                                                                                                                                                                                                                                                 |
| 3.4       | Core contracts, versioned saves   | done         | `src/core/types.ts`; core.test "migrates a version 0 save", "discards a corrupted save with a message instead of crashing", and "rejects unknown future versions"                                                                                                                                                                                                                     |
| 3.5       | Scene flow                        | done         | `src/scenes/runflow.ts`; `tools/playthrough.ts` plays the whole flow in the browser (below)                                                                                                                                                                                                                                                                                           |
| 3.6       | Browser concerns                  | done         | `src/game.ts`: fullscreen, the cursor hides after 2 s, pause on `visibilitychange`, "Restoring graphics" on context loss, audio on first input. core.test "parses URL parameters".                                                                                                                                                                                                    |
| 4.1       | Low-res pipeline                  | done         | `src/render/pipeline.ts`; M1's 1080p and 1440p screenshots; the palette test                                                                                                                                                                                                                                                                                                          |
| 4.2       | Pixel-stable camera               | done         | The shimmer test (`tools/visualtests.ts`); render.test "snaps to whole texels and reports the sub-texel remainder" and "keeps an identical camera inside one texel cell"; F7 toggles snapping                                                                                                                                                                                         |
| 4.3       | Camera framing                    | done         | render.test "puts a standing character at 22–28 texels tall in the low-res buffer"; sim.test "leashes two players: they can never separate past the frame"; `hud-coop`                                                                                                                                                                                                                |
| 4.4       | Shading                           | done         | Toon shading with a 3-step gradient and vertex colors. Canvas textures appear only on signs, screens, posters, and the ship's name. The character outline is kept (`DECISIONS.md` M1), with blob shadows. The optional shadow map is not used.                                                                                                                                        |
| 4.5       | Palettes and color rules          | done         | render.test "has the spec palette sizes", "builds a lookup table that only contains palette colors", and "never maps ordinary muted colors to the reserved red or cyan"; every gallery frame palette-checked; `voyage-dawn` shows the crossfade; the color-rule review below                                                                                                          |
| 4.6       | Light, fog, glow, particles       | done         | At most 8 pooled lights (measured in the bench). `src/render/particles.ts` covers snow, sleet, rain with splashes, wisps, motes, dust, and insects; sparks on hits. Lightning respects reduce flashing. weather.test "lightning flashes briefly restore full range in a storm".                                                                                                       |
| 4.7       | Regions and weather               | done         | Gallery: every stop and drive in every region and every weather it can roll                                                                                                                                                                                                                                                                                                           |
| 5.1       | The kit                           | done         | render.test "builds primitives with outward-facing triangles" and "applies the transform stack and routes glow geometry"                                                                                                                                                                                                                                                              |
| 5.2       | Characters                        | done         | `src/models/rig.ts` and `looks.ts` (8 hair shapes, party silhouettes, skin tones spread evenly). Chassis seams: `hud-low-skin`. Chevrons and Recyclers: `hud-alert`.                                                                                                                                                                                                                  |
| 5.3       | Props and buildings               | done         | 105 modeled props; props.test "has the props the spec asks for"; south walls cut away, and the Port's containers drop low around characters                                                                                                                                                                                                                                           |
| 5.4       | Vehicles                          | done         | props.test "builds the party wagon in every configuration", "builds the Recycler van, with red only on the light bar while it is on", and "builds the Sankofa within budget with warm deck lights"                                                                                                                                                                                    |
| 6         | Procedural animation              | done         | `src/anim/poses.ts`: 47 poses, every one listed included; poses step at 12 fps (a tuning value); integrity.test "a glitch interrupts what the unit was doing, freezes it briefly, and observers notice (+20)"                                                                                                                                                                         |
| 7.1       | Gamepad manager                   | done         | input.test "detects PlayStation pads"; rumble through `vibrationActuator`, silently skipped where missing                                                                                                                                                                                                                                                                             |
| 7.2       | Player slots                      | done         | input.test "lets player 2 join on the arrow-key layout with Backspace and keeps the layouts apart" and "drops a player after holding Back for two seconds, and promotes player 2"; sim.test "drops player 2 (their member turns AI) and rejoins next to player 1" and "swaps characters in single player with the D-pad"                                                              |
| 7.3       | Keyboard fallback                 | done         | input.test "maps WASD to a natural walking pace and Shift to full tilt". Keyboard player 2 joins with Backspace (`DECISIONS.md` M1). The README and the pause menu list both layouts.                                                                                                                                                                                                 |
| 7.4       | Gamepad controls                  | done         | input.test "distinguishes a blend tap from a hold"; README controls table                                                                                                                                                                                                                                                                                                             |
| 8.1       | Perception                        | done         | mask.test "out of sight, awareness decays"; weather.test; stops.test "anyone's running steps carry a few meters; walking steps don't (except Brick's)"                                                                                                                                                                                                                                |
| 8.2       | What raises suspicion             | done (tuned) | sim.test "flags robotic movement…", "does not flag natural, varying movement", "builds stillness suspicion after 4 s, and a Blend resets it", and "makes sprinting suspicious"; shutdown.test "carrying a shut-down unit is very suspicious to anyone who sees it"; weather.test "standing in the rain with no reaction is skipping a human need"; rate changes are in `DECISIONS.md` |
| 8.3       | Blend actions and Chat            | done         | abilities.test "her Blends work 30% better than anyone else's"; stops.test "one coffee order at the counter gets the whole party coffee"; two-player bots Chat; tutorial.test                                                                                                                                                                                                         |
| 8.4       | Awareness states and feedback     | done         | mask.test "anyone else who reaches Alarmed raises ALERT"; icons and the eye glyph in `hud-alert`                                                                                                                                                                                                                                                                                      |
| 8.5       | Sympathizers                      | done         | mask.test "a sympathizer who has noticed helps once instead of raising the alarm"; 12% of civilians and staff, 25% of dock workers                                                                                                                                                                                                                                                    |
| 8.6       | Exposure and ALERT                | done         | Bot bands (exposure means any ALERT); `hud-alert`; the car waits 10 s (`DECISIONS.md`)                                                                                                                                                                                                                                                                                                |
| 8.7       | Patrol clock                      | done (tuned) | stops.test "each patrol comes a little early or late, the same way for the same seed" and "runs 15% faster per Heat level, and faster from Day 7 and again from Day 11"; base times are in `DECISIONS.md`                                                                                                                                                                             |
| 8.8       | Weather and region effects        | done         | weather.test covers all six rows                                                                                                                                                                                                                                                                                                                                                      |
| 8.9       | Combat                            | done (tuned) | abilities.test "fights best: a three-hit combo and a dash that recharges 30% faster"; light hits don't stun (Deviations, below)                                                                                                                                                                                                                                                       |
| 8.10      | Shutdown, revive, loss            | done         | shutdown.test, 9 tests: revive within 15 s for 1 Part; pick up and carry; half speed except Brick; reclaimed after a 3 s scan; left behind; June helped up or arrested; the stop ends when every android is lost. run.test "Parts repair Hull, patches restore Skin, 2 Parts revive a carried unit".                                                                                  |
| 9.1       | Resources and starting values     | done (tuned) | `src/run/party.ts`; abilities.test "below 15 Battery: half speed, no sprint, no dash, no ability"; run.test "an android still at 0 Battery when camp ends is lost…"; per-leg costs are tuned (Deviations)                                                                                                                                                                             |
| 9.2–9.5   | Wren, Brick, Vesper, June         | done         | abilities.test (19 tests: every ability, tell, and strength); run.test June (6 tests: Hunger, Rations, Health, Trust, kiosk Heat, Stations two columns ahead)                                                                                                                                                                                                                         |
| 10.1      | Stop structure                    | done         | stops.test "every stop type has two layout variants (Stations three), with rows of equal width"                                                                                                                                                                                                                                                                                       |
| 10.2      | Charging Depot                    | done         | Depot bot bands; `depot-*` (12 shots)                                                                                                                                                                                                                                                                                                                                                 |
| 10.3      | Diner                             | done         | stops.test "one coffee order…" and "diners and gas stations have a corkboard; at Heat 2+ standing near it draws +6/s"; diner bot bands; `diner-*`                                                                                                                                                                                                                                     |
| 10.4      | Gas Station                       | done         | stops.test "gas stations have parts aisles, a garage, a register, an EV charger, and a sweeping camera" and "plug in from the lot side, pump gas, and the car charges on a spoofed session"; gas bot bands; `gas-*`                                                                                                                                                                   |
| 10.5      | Station and compromised Station   | done         | stops.test Stations (6 tests); compromised.bots; `station-0`–`station-2` and `compromised`                                                                                                                                                                                                                                                                                            |
| 10.6      | NPC routines, distraction windows | done         | `src/sim/npc.ts` (smoke breaks, the guard's phone, waitress, cook, mechanic, dock workers, sweeps, drones); the bands' cautious bots use the windows                                                                                                                                                                                                                                  |
| 10.7      | Party AI                          | done         | stops.test "waits outside while its player goes into a back office" and "catches up at a walk when left behind, even after the player stops"; sim.test "two intent streams move two characters; the third follows as AI"                                                                                                                                                              |
| 10.8      | Layout format and validation      | done         | stops.test "every layout validates: exits, containers, and points reachable, no point inside a wall"                                                                                                                                                                                                                                                                                  |
| 10.9      | Loot and pacing                   | done         | Depot bands: cautious 20–40 Cells in 120–200 s, greedy 40–75 Cells                                                                                                                                                                                                                                                                                                                    |
| 11.1–11.2 | Checkpoint flow, interrogation    | done (tuned) | run.test checkpoints (3 tests, including timing windows); checkpoint bot bands; content.test "include the spec examples verbatim"; penalties tuned (Deviations)                                                                                                                                                                                                                       |
| 11.3      | Breathing scan                    | done         | mask.test (window, missed breath, "too regular", early press); integrity.test "being scanned costs 4"                                                                                                                                                                                                                                                                                 |
| 11.4      | Bust                              | done         | The bust compound stop (`DECISIONS.md` M5); busts in the economy library; `checkpoint`                                                                                                                                                                                                                                                                                                |
| 11.5      | The Port                          | done         | port.test (9 tests: the dawn clock, the horn and gangway timer, boarding, the arch, Mensah, trespass, Recyclers by Heat, the held berth, moving cover); Port bot bands; `port`, `port-yard`, `port-berth`                                                                                                                                                                             |
| 11.6      | Heat                              | done (tuned) | run.test "rises with ALERT and knockouts, decays a little each quiet leg, more at a Station, and caps at 3"; posters at Heat 2+; compromised Stations at Heat 3                                                                                                                                                                                                                       |
| 11.7      | Enforcement escalation            | done         | stops.test "runs 15% faster per Heat level, and faster from Day 7 and again from Day 11"; run.test "the guard starts warier with Heat and late in the run; the meter decides it"                                                                                                                                                                                                      |
| 12.1      | Run flow and autosave             | done         | run.test "a run mid-way survives the save slot and continues exactly as it would have"; the browser playthroughs                                                                                                                                                                                                                                                                      |
| 12.2      | The map                           | done         | run.test map (4 tests); `map`                                                                                                                                                                                                                                                                                                                                                         |
| 12.3      | The sailing clock                 | done         | run.test "with no delays the party reaches the Port on Day 11 (3 days of slack)" and "Day 14 anywhere but the Port: the ship has sailed"                                                                                                                                                                                                                                              |
| 12.4      | Drive scene                       | done (tuned) | run.test "a leg costs a day, its distance in car battery, and the tuned Battery per android" and "without enough charge the party walks: 15 Battery each and a day extra"; `drive-*` (12 shots)                                                                                                                                                                                       |
| 12.5      | Camp                              | done         | run.test camp (4 tests); `camp-*`                                                                                                                                                                                                                                                                                                                                                     |
| 12.6      | Integrity                         | done         | integrity.test (6 tests: glitches, stress, factory reset)                                                                                                                                                                                                                                                                                                                             |
| 12.7      | Road events                       | done         | content.test road events (7 tests, including "transcribe the specified events faithfully"); run.test road events                                                                                                                                                                                                                                                                      |
| 12.8      | Lantern messages                  | done         | content.test "has at least 20 Lantern messages and every trigger at least once" and "include the spec Lantern messages verbatim"                                                                                                                                                                                                                                                      |
| 12.9      | Tutorial and tips                 | done         | tutorial.test "walk → blend → search → charge → leave, solo; the drone comes for the last step" and "two players get the chat lesson; a restart starts from the step it is given"; `tutorial`                                                                                                                                                                                         |
| 12.10     | Content quotas                    | done         | content.test quotas (7 tests)                                                                                                                                                                                                                                                                                                                                                         |
| 13.1–13.2 | UI principles and writing         | done         | render.test bitmap fonts (3 tests); content.test "fits the UI font and has clean whitespace"; the large text setting                                                                                                                                                                                                                                                                  |
| 13.3      | HUD                               | done         | `hud-alert`, `hud-coop`, `hud-low-skin`, `hud-low-integrity`; portraits rendered from the 3D heads (`src/render/portraits.ts`)                                                                                                                                                                                                                                                        |
| 13.4      | Screens and transitions           | done         | `title`, `join-1p`, `join-2p`, `intro`; input.test "dissolves out, swaps, and dissolves in"                                                                                                                                                                                                                                                                                           |
| 13.5      | Settings                          | done         | Every listed setting (`Settings` in `src/core/types.ts`, `src/ui/menus.ts`); `qa/CHECKLIST.md`                                                                                                                                                                                                                                                                                        |
| 14        | Audio                             | done         | audio.test (10 tests: complete cue list, overrides, seeded music); the README's cue table                                                                                                                                                                                                                                                                                             |
| 15        | Meta-progression                  | done         | meta.test (6 tests)                                                                                                                                                                                                                                                                                                                                                                   |
| 16.1      | The voyage                        | done         | ending.test (3 voyage tests); `voyage-night`, `voyage-dawn`                                                                                                                                                                                                                                                                                                                           |
| 16.2      | Ghana                             | done         | ending.test (4 tests); `ghana-quay`, `ghana-coop`                                                                                                                                                                                                                                                                                                                                     |
| 16.3      | Game over                         | done         | `gameover-lost`, `gameover-sailed`; the `lost` and `missed` playthroughs                                                                                                                                                                                                                                                                                                              |
| 17.1      | Unit tests                        | done         | 346 tests in 18 files, all passing                                                                                                                                                                                                                                                                                                                                                    |
| 17.2      | Bot playtests                     | done         | Below                                                                                                                                                                                                                                                                                                                                                                                 |
| 17.3      | Economy simulator                 | done         | Below, and `qa/economy.md`                                                                                                                                                                                                                                                                                                                                                            |
| 17.4      | Visual QA                         | done         | Below                                                                                                                                                                                                                                                                                                                                                                                 |
| 17.5      | Performance                       | done         | Below, and `qa/bench.md`                                                                                                                                                                                                                                                                                                                                                              |
| 17.6      | Debug tools                       | done         | The `?debug=1` overlay and F1–F9 (`src/game.ts`); every `?scene=` jump (the gallery uses them)                                                                                                                                                                                                                                                                                        |
| 17.7      | Docs and the final report         | done         | `README.md`, `qa/CHECKLIST.md`, this report                                                                                                                                                                                                                                                                                                                                           |
| 18        | Build order                       | done         | `PROGRESS.md`                                                                                                                                                                                                                                                                                                                                                                         |
| 19        | Cut order                         | nothing cut  |                                                                                                                                                                                                                                                                                                                                                                                       |
| 20        | Definition of done                | done         | See "Definition of done" at the end                                                                                                                                                                                                                                                                                                                                                   |

## Verification results

### Unit tests

`npm run test`: **346 tests in 18 files, all passing**, covering everything §17.1 lists. typecheck, lint (ESLint and Prettier, zero warnings), and build pass at the final commit.

### Bot playtests (spec §17.2, `npm run test:bots`, 100 seeded attempts per row)

All 31 band tests pass. Exposure means any ALERT during the stop.

| Stop                | Policy           | Solo                                  | Two-player             | Band                           |
| ------------------- | ---------------- | ------------------------------------- | ---------------------- | ------------------------------ |
| Depot               | cautious         | exposure 17%, 27.5 Cells, 131 s       | 24%, 33.1 Cells, 129 s | 10–30%, 20–40 Cells, 120–200 s |
| Depot               | greedy           | 51%, 68.5 Cells                       | 50%, 66.2 Cells        | 40–65%, 40–75 Cells            |
| Depot               | reckless         | 98%                                   | 100%                   | at least 90%                   |
| Diner               | cautious         | 17%, 170 s                            | 26%, 159 s             | 10–30%, 120–200 s              |
| Diner               | greedy           | 45%                                   | 41%                    | 40–65%                         |
| Diner               | reckless         | 99%                                   | 97%                    | at least 90%                   |
| Gas station         | cautious         | 24%, 149 s                            | 18%, 148 s             | 10–30%, 120–200 s              |
| Gas station         | greedy           | 41%                                   | 56%                    | 40–65%                         |
| Gas station         | reckless         | 98%                                   | 98%                    | at least 90%                   |
| Compromised Station | cautious         | 0% (bag taken 100%)                   | 0% (100%)              | at most 30%                    |
| Compromised Station | reckless         | 100%                                  | 100%                   | at least 90%                   |
| Checkpoint          | human answerer   | passes 90%                            | passes 100%            | passes at least 85% at Heat 0  |
| Checkpoint          | robotic answerer | busted 96%                            | busted 100%            | busted at least 90%            |
| The Port            | cautious, Heat 0 | an android aboard 81% (all three 68%) | 87% (72%)              | at least 70%                   |
| The Port            | cautious, Heat 3 | 27% (all three 4%)                    | 31% (1%)               | at most 40%                    |

The scripted full run (`tests/bots/fullrun.bots.ts`, every scene simulated live) reaches Ghana in 4 of 6 seeds; the other two end in the ship sailing without anyone and in every android lost.

### Economy simulator (spec §17.3, `npm run sim:economy`, 2,000 runs per policy)

| Policy             | Reaches Ghana | Band      | Missed the ship | All lost | Sailed without anyone |
| ------------------ | ------------- | --------- | --------------- | -------- | --------------------- |
| Competent          | 58.9%         | 40–60%    | 0.9%            | 0.9%     | 39.3%                 |
| Skilled and greedy | 71.9%         | 60–80%    | 0.2%            | 0.1%     | 27.8%                 |
| Random choices     | 4.6%          | under 10% | 78.8%           | 1.3%     | 15.3%                 |

- Competent median slack on arrival at the Port: **2 days** (band 1–3).
- Seeds that can't survive leg 1 from the starting state: **0**.

The full distributions, the stop library, and the Port library are in `qa/economy.md`.

### Visual QA (spec §17.4)

- **Gallery:** `qa/screenshots/index.html` holds 77 shots: every scene, every stop type in every region and weather it can roll, the drive in every region and weather, camp per region, Stations and a compromised Station, the checkpoint, the Port (lot, yard, berth), a patrol drone, the HUD solo, co-op, in ALERT, at low Skin, and at low Integrity, the voyage at night and at sunrise, Tema, the cooperative, and both game overs. Every shot is palette-checked, and none logged a console message.
- **I looked at every image.** The review found and fixed:
  - drone searchlights quantizing to gray;
  - the party car still being an early placeholder in most scenes;
  - the drive framing missing its billboards and scanner towers;
  - oncoming traffic modeled as the party's own wagon;
  - a speech bubble mixing with a stop's name;
  - co-op prompts running into the AI rows;
  - an overflowing hint on the join screen.

  A separate pass over every screen with **large text** on fixed the join, map, and co-op prompt layouts.

- **Palette test:** 0 of 230,400 pixels off-palette (`tools/visualtests.ts`). The epilogue shots check against the epilogue palette, and the sunrise against both.
- **Shimmer test:**
  - A snapped pan across a static scene keeps static edges pixel-identical: 0 mismatches over 48 frames with fog and vignette off.
  - With everything on, frames inside a texel cell are identical, and under 1.5% of pixels change per texel step (0.81%), from the screen-anchored fog and vignette.
  - The unsnapped control does shimmer, as it should.
- **Color rules:** red and cyan appear only in their reserved meanings across the gallery:
  - Red: the ALERT banner, suspicion icons and the eye glyph, Recyclers' baton tips and van light bar, chassis seams on low Skin, and the low Battery bar.
  - Cyan: drone searchlights and lenses, ID kiosks, the scanner arches, the scanner tower's beam, and scan rings.
  - Signs, lamps, and taillights are amber or fog white. The palette's reserved-hue gate keeps lit brick and teal fog from quantizing into either color.

### Performance (spec §17.5, `npm run bench`)

The heaviest case (a Corridor depot in a storm, two players, ALERT, every observer active), 60 s at 1920×1080 in Chrome:

| Budget                | Measured            | Limit   |
| --------------------- | ------------------- | ------- |
| Frame time, p95       | 3.7 ms (p99 4.8 ms) | 16.7 ms |
| Draw calls            | 16                  | 150     |
| Triangles             | 20,717              | 200,000 |
| Active dynamic lights | 8                   | 8       |
| JS heap               | 33 MB               | 400 MB  |
| Gzipped bundle        | 0.31 MB             | 2.5 MB  |
| Load to title         | 1.2 s               | 5 s     |

Frame time is measured with vsync and the frame-rate cap off (413 fps on average), so the interval between frames is what a frame costs. With vsync on, the same run held exactly 60 fps (3,602 frames in 60 s). Per-frame CPU time is 3.3 ms at p95.

### Whole runs in the browser (spec §20)

`tools/playthrough.ts` plays the built game (`vite preview`) from the title back to the title through the real scene flow, failing on any console error or warning, a scene that won't move on, or a run that ends in the wrong place:

- **Solo, to Ghana:** title → join → intro → night one → nine legs (gas stations, depots, diners, two Stations, both checkpoints, a camp after each stop) → the Port → the voyage → Ghana → title.
- **Two players, to Ghana:** the same route with player 2 on the keyboard's arrow layout.
- **All units lost:** night one → game over → title.
- **The ship missed:** day 14 on the road → game over → title.

All four pass with no console messages.

## Content review (spec §2.4, §2.5)

A dedicated review pass over every written string: road events, questions, camp and voyage conversations, keepers, barks, Lantern, epilogues, the intro, and the UI.

- **Echo structure, not artifacts.** The parallels live where the spec puts them:
  - the law: _Calloway v. Aldine Systems_ and the Reclamation Act's compelled reporting;
  - the network: conductors, Stations, the infrared porch-light beacon, Lantern's coded texts;
  - the hunters (Recyclers), forged Papers, and Wanted posters.
- **No real history borrowed.** A scan of all content found no real historical people, spirituals or coded songs, slave narratives, plantation or auction imagery, or real memorial sites. Ghana's coastal castles never appear. The Ghana of the ending is Tema's working container port and a modern solar cooperative in the north, both specific and dignified.
- **No slurs,** invented or historical, applied to androids anywhere. The scan's only hits in player-facing text were a human child ("A boy, maybe eight") and the "Master volume" setting.
- **Analogy, not equivalence.** The androids' story never claims to equal real history. It shows ordinary people resisting and complying: the boy at the gas station whose nanny was taken, the woman passing crackers through a car window in a six-hour line, the cop who only mentions a taillight.
- **A diverse cast.** The human characters have agency and specificity: the Station keepers (Dolores, a retired bus driver; Bernadette's church kitchen in Savannah, and others), June the conductor, and Captain Efua Mensah.
- **Voice (§2.5).** Short sentences, concrete details, quiet, and dry humor ("The man with the wand is busy with a bear"). There are no speeches; stage directions stay restrained ("He sits. The deck holds."). UI text is sentence case and prompts are plain verbs. Failure text says plainly what happened and never apologizes.

## Deviations from the spec's numbers

Tuning came first: when a band failed, a value in `src/content/tuning.ts` changed if one could fix it. Where the cause was a missing rule (most of the Port's, and the light-hit stagger), a rule was added. Every change is logged in `DECISIONS.md`. The spec numbers that moved:

- Battery drain per leg is 12 (spec: 5), and car battery per leg is 12–18 (spec: 8–14). With the spec's values, careful runs never wanted for energy, and the economy bands failed.
- Heat decays 0.25 per quiet leg (spec: 0.5).
- The patrol clock's first drone, sweep, and second drone come at about 125, 185, and 245 s (spec: about 90, 150, and 210). That way a cautious visit that leaves at the first drone lands in the 120–200 s band.
- A spoofed charging session draws +10.7/s while watched (spec: +10/s for using a charger with a spoofed ID).
- Checkpoint penalties: "too fast" is +25 (spec: +15), and "too regular" breathing is +30 (spec: +15). With the spec's values, a robotic answerer playing solo was busted only 72% of the time (band: at least 90%).
- Light hits no longer stagger a Recycler or break its telegraphed swing (§8.9's wind-up stays; heavies still stagger), because mashing light hits made every fight free.

Rules the spec leaves open, added for the bands:

- **In stops:**
  - lingering: an observer who has watched someone for 20 s grows suspicious even of normal behavior;
  - drone searchlights expose anyone they hold;
  - the party AI breathes right 92% of the time.
- **At the Port:**
  - trespassing in the yard;
  - the stacks shadow drone beams;
  - Recyclers holding the berth keep the gangway up;
  - one Recycler per Heat level is posted at the gangway's foot;
  - the arch is warier at higher Heat;
  - ALERT locks the gate.

  These give the Port band its Heat gradient.

## Known issues, by severity

1. **Medium: real controllers not tested.** Gamepad input, glyphs, rumble, and disconnects are covered by unit tests with simulated pads, and the browser runs used the keyboard (this machine has no controllers attached). The manual checklist (`qa/CHECKLIST.md`) covers real pads and should be run before release.
2. **Low: the bands are tuned against bots.** The tightest margins on the band seeds are the greedy gas station (solo) and greedy diner (two-player) at 41% against a 40% floor; 400-attempt runs (`npx tsx tools/bands.ts --n 400`) put the means 4 or more points inside every band. Human players will differ.
3. **Low: the Port is hard at high Heat by design.** A careful party gets someone aboard 40% of the time at Heat 2 and 27–31% at Heat 3, losing mostly at the berth, where one Recycler per Heat level holds the gangway's foot.
4. **Low: performance was measured on one machine.** The benchmark ran on this development machine's GPU in headless Chrome. The margins are wide (3.7 ms against 16.7), but low-end integrated GPUs are untested.
5. **Cosmetic: the gantry crane is drawn squat** (at 45% of its height) so its girders don't hide the apron, and it reads more as a frame than a machine.
6. **Cosmetic: drone beams near bright lamps.** Where a drone's searchlight crosses a headlight's or floodlight's glow, the cyan stipple washes to gray, which is physically plausible but slightly less legible.
7. **By design: synthesized audio.** Every sound and all music are synthesized placeholders, with an override folder for recordings (§14.3).

## Definition of done (spec §20)

- **A complete run, solo and with two players, with no soft locks, crashes, or console messages.**
  - The browser playthroughs above play the built game from the title back to the title: solo and two-player to Ghana, all units lost, and the ship missed. Each failed on any console error or warning and found none.
  - The headless full runs reach Ghana in 4 of 6 seeded runs with every scene simulated live; the other two end the way a run should (the ship sailing without anyone, and all lost).
  - The second player in the browser runs used the keyboard's second layout, since this machine has no controllers attached. Gamepad input is covered by the unit tests, and real pads are on the manual checklist (`qa/CHECKLIST.md`).
- **All automated verification passes:** unit tests, bot bands, economy bands, visual QA, and performance budgets (above).
- **Art direction:**
  - Every gallery frame is quantized to its palette.
  - The shimmer test holds.
  - The scenes stay dark and quiet until the sunrise, and red and cyan keep to their meanings.
- **Written content:** the dedicated content review is recorded above.
- **Every system is implemented:** see the audit. Nothing was cut.
- **`npm run build` produces a static `dist/`:** the gallery, the playthroughs, and the benchmark all run against `vite preview` of the build.
- **Docs:** `README.md`, `DECISIONS.md`, `PROGRESS.md` (every item checked), `qa/CHECKLIST.md`, and this report.

## Suggested next steps

- **Real controllers:** run `qa/CHECKLIST.md` with an Xbox pad and a DualSense: joining and dropping, disconnects mid-stop, glyph switching, and rumble.
- **The Port at high Heat:** a careful party gets someone aboard 40% of the time at Heat 2 and 27–31% at Heat 3. Most of those losses come at the berth, where one Recycler per Heat level holds the gangway's foot. Playtests should check that clearing the berth reads as the challenge it is, and not as a wall.
- **Port bot margins:** a smarter bot (one that times its crossing of the apron to the crane's container) would put the Heat 0 band further from its 70% floor, and make the band a better proxy for good human play.
- **Art:** a second pass over the Port's yard (the gantry crane is drawn squat so it doesn't hide the apron, and reads more as a frame than a machine).
- **Playtests with people:** the bands are tuned against bots. The first real sessions should check the tutorial's pacing, the readability of the Port's berth rule (the gangway rising while Recyclers stand at it), and whether the Heat 1–2 Port difficulty feels fair.
- **Audio files:** drop recordings into `public/audio/` (see the README's cue table) to replace the synthesized placeholders.
