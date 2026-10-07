# EXODUS.EXE

A top-down roguelite road trip about passing as human. Three androids (and maybe a human conductor) drive fifteen hundred miles from Boston to Miami in fourteen days, stopping at depots, diners, and gas stations where everyone is watching, to make a ship to Ghana before it sails. One or two players, gamepad first. It runs in the browser: Three.js rendered at 640×360 through a palette lookup, with every model, sound, and line of text made in code. No asset files.

The design is in `EXODUS_MVP_SPEC.md`. Decisions made while building are in `DECISIONS.md`, and progress in `PROGRESS.md`.

## Run it

Node 22.12 or later.

```sh
npm install
npm run dev        # http://localhost:5173
```

Build and serve the static site the way any static host would:

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ at http://localhost:4173
```

**Deploy:** upload `dist/` to any static host (Netlify, GitHub Pages, an S3 bucket, nginx). Asset paths are relative, so it also works from a subfolder. Saves live in the browser's `localStorage` (one slot, plus unlocks and settings).

## Controls

| Gamepad                           | Keyboard (player 1) | Keyboard (player 2) | Action                                                 |
| --------------------------------- | ------------------- | ------------------- | ------------------------------------------------------ |
| Left stick (tilt partway to walk) | WASD                | Arrows              | Move                                                   |
| LB (hold)                         | Shift               | Right Shift         | Sprint                                                 |
| A                                 | E                   | Enter               | Interact (hold to search, plug in, revive)             |
| X                                 | Q                   | /                   | Blend (hold for every option)                          |
| Y                                 | F                   | .                   | Ability (Wren: Soothe, Brick: Heave, Vesper: Takedown) |
| RT (hold for heavy)               | Left click          | ,                   | Attack                                                 |
| B                                 | Space               | Right Ctrl          | Dash; back in menus                                    |
| RB                                | R                   | ;                   | Ping; Chat near your partner                           |
| Start                             | Esc                 | Backspace           | Pause; player 2 joins                                  |
| Back (hold 2 s to drop out)       | Tab                 | '                   | Party                                                  |
| D-pad                             | Z / C               |                     | Swap character (solo)                                  |

The mouse aims for player 1. A second player joins with Start on a second controller, or with Backspace for the keyboard's arrow layout. Button glyphs follow the device you last used; the settings can force Xbox or PlayStation names.

## Playtest in 10 minutes

Scene jumps start a scene directly with a fresh party: add `?scene=<name>` to the URL. Add `&players=2` for two keyboard players, `&seed=<n>` for a specific run, and `&debug=1` for the overlay and hotkeys (below).

1. **The Mask (3 min):** `?scene=depot`. Walk with a light stick tilt; then march in a straight line at full tilt and watch the eye fill (robotic movement). Stand still near people (stillness), Blend with X when the eye shows, search a shelf, then wait for the clerk's smoke break and search the locker in back. Plug in with Papers. Leave from the car when the first drone comes.
2. **A checkpoint (1 min):** `?scene=checkpoint`. Answer like a person, not too fast and not too slow; breathe on the ring, slightly off the beat. Answer robotically to see a bust.
3. **The road (2 min):** `?scene=map`. Pick a town; the drive may stop for a road event; then the stop, then camp (the panel spends Cells, Parts, and patches, and rests).
4. **The Port (3 min):** `?scene=port`. Cross the yard out of the Recyclers' and drones' sight, using the trucks and the crane's container as cover. At the arch, A shows Papers and X takes the breathing scan. Get to the gangway. Try `&heat=3` to see Recyclers holding the berth.
5. **The ending (1 min):** `?scene=voyage`, then `?scene=ending&tag=coop`, and `?scene=gameover&tag=allLost`.

What to look for: does every observer's reaction make sense from what they could see? Do the prompts read at a glance? Are red (danger) and cyan (scanners) only ever used for those?

Other jumps: `title`, `join`, `intro`, `tutorial`, `drive`, `diner`, `gas`, `station` (`&variant=0..2`), `compromised`, `camp`, `voyage`, `ending`, `gameover`. Stops also take `&region=newengland|corridor|piedmont|lowcountry`, `&weather=...`, `&variant=0|1`, `&heat=0..3`, `&alert=1`, `&skin=<0..100>`, `&integrity=<0..100>`.

**Debug hotkeys** (with `?debug=1`, or always in `npm run dev`): F1 overlay (FPS, draw calls, lights, tick time, view cones, awareness over heads, Suspicion, patrol clock, day and slack, run seed) · F2 +50 Cells, +5 Parts, +5 Papers · F3 skip ahead · F4 ALERT · F5 every android's Integrity to 10 · F6 cycle the weather · F7 pixel snapping · F8 palette debug view · F9 a day forward.

## Checks

```sh
npm run typecheck      # strict TypeScript
npm run lint           # ESLint (zero warnings) and Prettier
npm test               # unit tests (Vitest)
npm run test:bots      # bot playtests: every stop, checkpoints, the Port, a full run to Ghana (several minutes)
npm run sim:economy    # whole-run economy simulator; writes qa/economy.md
npm run qa:screens     # screenshot gallery of every scene, region, and weather; writes qa/screenshots/index.html
npm run bench          # 60 s performance benchmark; writes qa/bench.md
```

The bot playtests and the economy simulator fail the build when a balance band (spec §17.2, §17.3) is missed. `tools/bands.ts` and `tools/portbands.ts` run the same bands in parallel worker processes for tuning (`--set path=value` tries a tuning change without editing the file).

## Project structure

```
src/
  core/      contracts (types.ts), seeded RNG, math, the fixed-timestep loop, scenes, saves, URL config
  content/   tuning.ts (every tunable number), layouts, road events, questions, conversations, barks,
             Lantern messages, characters, regions
  sim/       the stop simulation, headless: perception and awareness, Blends, NPC routines, hostiles,
             combat, the party AI, the Port, night one's tutorial director
  run/       the run, headless: the map, legs, the sailing clock, Heat, camp, events, checkpoints,
             Stations, June, the Lantern triggers, the ending's tallies, memory cores and perks
  bots/      bots that play stops, checkpoints, the Port, and whole runs through PlayerIntent
  render/    the low-res pipeline, palettes and lookup tables, the camera, lights, levels, the stop view
  models/    procedural modeling: the kit, characters, props, vehicles, the ship, signs
  anim/      procedural animation poses
  audio/     the WebAudio engine, procedural sounds and music, the override loader
  ui/        the pixel UI surface, fonts, icons, the HUD, menus, panels, the phone
  scenes/    every scene (title, join, intro, map, drive, stops, Stations, checkpoints, camp, the Port,
             the voyage, Ghana, game over) and the run flow between them
tools/       bands, economy, screenshots, benchmark, browser helpers
tests/       unit tests (*.test.ts) and bot playtests (tests/bots/*.bots.ts)
qa/          the economy report, benchmark report, screenshot gallery, manual checklist, final report
```

`core`, `sim`, `run`, `content`, and `bots` are headless (no Three.js, no DOM, no `Math.random`; ESLint enforces it), so they run in Node for tests, bots, and the economy simulator. Rendering, UI, and scenes read the simulation and never change it. All input reaches the simulation as a `PlayerIntent` per player slot.

## Tuning guide

Every number that shapes play lives in `src/content/tuning.ts`, grouped by system:

| Section                                             | What it controls                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `movement`, `combat`, `shutdown`                    | Speeds, dash, attacks, Recycler and gunner hits, revive and carry                                            |
| `awareness`, `rates`, `observers`, `blend`, `tells` | The Mask: how fast observers notice what, how Blends and Chat calm them, each android's tell                 |
| `npc`, `patrol`, `alert`, `weather`                 | Routines and distraction windows, the patrol clock, ALERT and the van, weather's effect on sight and hearing |
| `charging`, `search`, `loot`, `battery`             | Charging rates, search times, what containers hold, Battery drain per leg                                    |
| `start`, `run`, `heat`, `escalation`                | Starting resources, leg costs and the sailing clock, Heat gains and decay, enforcement by day                |
| `checkpoint`, `breathing`                           | Interrogation timing windows and penalties, the breathing scan                                               |
| `station`, `integrity`                              | What Stations fix, Integrity's stresses and glitches                                                         |
| `port`                                              | The dawn clock, the gate's scan, Recyclers at the Port, the berth, the gangway, moving cover                 |
| `meta`, `epilogue`                                  | Memory cores and perks, the ending's pacing                                                                  |

When a balance band fails, change these values (not code), re-run the band (`npm run test:bots`, `npm run sim:economy`, or the parallel tools with `--set`), and log the change in `DECISIONS.md`.

## Audio

Every sound and all music are synthesized at runtime with WebAudio (master, music, SFX, and ambience buses; panned by screen position, faded with distance). To replace any cue with a recording, put `public/audio/<cue>.mp3` or `.ogg` in the project; it's loaded and used instead of the synthesized version. The cues (generated from `src/audio/cues.ts` by `npx tsx tools/cuetable.ts`):

| Cue               | Kind  | What it is                                                           |
| ----------------- | ----- | -------------------------------------------------------------------- |
| `step_asphalt`    | Sound | Footstep on asphalt: a gritty tap.                                   |
| `step_tile`       | Sound | Footstep on tile: a short click.                                     |
| `step_snow`       | Sound | Footstep in snow: a muffled crunch.                                  |
| `step_wood`       | Sound | Footstep on wood: a hollow knock.                                    |
| `step_heavy`      | Sound | Brick's heavy step: lower and louder.                                |
| `servo`           | Sound | A very quiet, short servo whirr on android movement.                 |
| `dash`            | Sound | Dash: an inhuman whoosh.                                             |
| `scanner_sweep`   | Sound | Handheld cyan scanner: a sine glide over soft noise.                 |
| `kiosk_beep`      | Sound | ID kiosk key beep.                                                   |
| `kiosk_ok`        | Sound | ID kiosk accepts: two rising beeps.                                  |
| `kiosk_fail`      | Sound | ID kiosk rejects: a low double buzz.                                 |
| `van_screech`     | Sound | A Recycler van screeching in.                                        |
| `hit_light`       | Sound | Light hit.                                                           |
| `hit_heavy`       | Sound | Heavy hit with a metallic ring.                                      |
| `baton_swing`     | Sound | Stun baton swing with an electric crackle.                           |
| `emp_charge`      | Sound | EMP rifle charging: a rising whine (about 0.8 s).                    |
| `emp_shot`        | Sound | EMP shot: a cold, zappy burst.                                       |
| `knockout`        | Sound | A human knocked out: a body hitting the floor.                       |
| `shutdown`        | Sound | An android powering down.                                            |
| `reboot`          | Sound | An android rebooting.                                                |
| `glitch`          | Sound | Glitch: a bit-crushed, stuttering fragment.                          |
| `stool_break`     | Sound | A stool breaking under Brick.                                        |
| `bash`            | Sound | Bashing open a locked door or container.                             |
| `shove`           | Sound | Shoving a person or a heavy object.                                  |
| `thunder`         | Sound | Thunder: a low burst with a long rolling tail.                       |
| `ship_horn`       | Sound | The Sankofa's horn: deep, long, two-tone.                            |
| `ui_move`         | Sound | Menu cursor move.                                                    |
| `ui_confirm`      | Sound | Menu confirm.                                                        |
| `ui_back`         | Sound | Menu back.                                                           |
| `ui_error`        | Sound | Menu error or unavailable action.                                    |
| `type_tick`       | Sound | Typewriter tick, one per character.                                  |
| `phone_buzz`      | Sound | Phone vibrating twice: a Lantern message.                            |
| `pickup`          | Sound | Picking up loot.                                                     |
| `breath_beat`     | Sound | Breathing scan pulse.                                                |
| `breath_ok`       | Sound | A breath counted during a scan.                                      |
| `breath_miss`     | Sound | A missed breath during a scan.                                       |
| `car_door`        | Sound | Station wagon door closing.                                          |
| `car_start`       | Sound | Station wagon starting up (electric).                                |
| `alarm_pop`       | Sound | An observer turns Alarmed: a short, sharp stab.                      |
| `notice`          | Sound | An observer turns Curious: a soft blip.                              |
| `search`          | Sound | Rummaging through a container.                                       |
| `plug_in`         | Sound | Plugging into a charger.                                             |
| `unplug`          | Sound | Unplugging from a charger.                                           |
| `chat`            | Sound | Co-op Chat: muffled, indistinct talk.                                |
| `coffee`          | Sound | Coffee poured into a cup.                                            |
| `gate_raise`      | Sound | A barrier gate motoring up.                                          |
| `crash`           | Sound | A crash: the car through a barrier, or a big impact.                 |
| `suspicion_thump` | Sound | Suspicion heartbeat: a low servo-thump.                              |
| `wind_snow`       | Loop  | Snow wind: slowly shifting band-passed noise.                        |
| `rain`            | Loop  | Rain with random drips.                                              |
| `rain_heavy`      | Loop  | Heavy rain: a thicker wash with more drips and splashes.             |
| `lamp_hum`        | Loop  | Sodium street lamp hum.                                              |
| `fluorescent`     | Loop  | Fluorescent tube buzz with random flicker clicks.                    |
| `siren`           | Loop  | A distant police siren.                                              |
| `alarm`           | Loop  | Two-tone facility alarm (ALERT).                                     |
| `station_room`    | Loop  | Station interior: low radio murmur, a clock, now and then a kettle.  |
| `port`            | Loop  | The port: crane motors and water slapping the quay.                  |
| `car_engine`      | Loop  | Inside the station wagon on the road.                                |
| `drone`           | Loop  | Surveillance drone hover hum.                                        |
| `charging`        | Loop  | Charger hum while plugged in.                                        |
| `camp_night`      | Loop  | Night camp: crickets and a little wind, very quiet.                  |
| `sea`             | Loop  | Waves against the Sankofa's hull.                                    |
| `crowd`           | Loop  | Diner murmur with cutlery clinks.                                    |
| `title`           | Music | Title: dark ambient pad with sparse high notes.                      |
| `scene`           | Music | Stops: dark ambient pad; the tension and ALERT layers ride on top.   |
| `station`         | Music | Stations: a softer, warmer pad.                                      |
| `camp`            | Music | Camp: a quiet, sparse pad.                                           |
| `epilogue`        | Music | Sunrise and Ghana: a warm, major-key plucked melody over a soft pad. |
| `gameover`        | Music | Game over: a slow, low pad.                                          |
