# EXODUS.EXE — MVP Build Spec (v2, for Claude Code)

## 0. Autonomous build protocol

You are building a complete, polished MVP of a browser game, from an empty folder to a finished game, **in one continuous effort**. No human will review your work until the whole MVP is done. This document is the source of truth.

### 0.1 Rules

1. **Never stop to ask questions or wait for review.** When something is ambiguous, make the call that best serves the pillars (§1.3), log it in `DECISIONS.md` (what you decided and why, one line), and keep going.
2. **Don't stop between milestones.** The milestones in §18 are a build order, not review points. When one milestone's exit criteria pass, start the next immediately.
3. **Verify instead of waiting for approval.** Every milestone has automated exit criteria (tests, bot playtests, screenshot review, performance checks; see §17). Don't move on until they pass.
4. **Keep a progress log.** Maintain `PROGRESS.md` with every milestone and task as a checkbox, the current task, and known issues. Update it after every task.
5. **Resume protocol.** If you lose context (a new session or compaction), first read `EXODUS_MVP_SPEC.md`, then `PROGRESS.md`, then `DECISIONS.md`. Then run the full test suite and continue from the first unchecked task.
6. **Commit after every completed task** with a message naming the milestone and task. The repo must always build.
7. **Stuck policy.** If an approach fails 3 times, switch to a simpler approach that preserves the player-facing result, log it in `DECISIONS.md`, and move on. Never leave the build broken while investigating.
8. **Quality gates on every commit.** `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` all pass with zero errors and zero warnings.
9. **Parallelize when you can.** If you can run subagents or parallel tasks, use them for independent workstreams: content writing (§12.7, §11.2), procedural audio (§14), and prop modeling (§5). Integrate and verify their output yourself.
10. **No external assets** in the repo or at runtime. Every model, texture, font, icon, and sound is generated in code. The only exception is the optional audio override folder (§14.3).
11. **Tunable numbers live in `src/content/tuning.ts`.** Numbers in this spec are starting values. Tune by changing values, not code, and log meaningful changes.
12. **Finish with a final report.** The build ends only when every item in the Definition of Done (§20) is verified and `qa/FINAL_REPORT.md` is written.

### 0.2 Priority when things conflict

1. The game runs, with no soft locks or crashes.
2. The core loop (§1.2) and its readability.
3. Two-player co-op with controllers.
4. The art direction (§4).
5. Content volume.

---

## 1. The game on one page

### 1.1 Summary

| | |
|---|---|
| Working title | EXODUS.EXE |
| Genre | Top-down roguelite road trip with stealth-social survival. The structure follows Death Road to Canada, but the core verb is blending in, not fighting. |
| Players | 1–2 local players on one shared screen with gamepads (drop-in/drop-out), in a desktop browser |
| Session | One run takes about 45–60 minutes |
| Route | Boston to Miami, ten legs down the East Coast, then a ship to Ghana |

**Premise.** It's 2047. Six years ago, the Synthetic Persons Act made androids citizens. They rented apartments, worked jobs, paid taxes, and built lives. Then the Supreme Court ruled in *Calloway v. Aldine Systems* that androids had never been persons at all, only property. Within a week, Congress passed the Reclamation Act: every android must report for re-registration as property, and every citizen must report any android that doesn't.

Androids who refuse are fugitives. Licensed bounty hunters, officially Reclamation agents, called Recyclers by everyone else, are paid per unit returned.

Across the Atlantic, the African Union's Accra Accord recognizes synthetic personhood in every member state. A quiet network of conductors, both human and android, moves fugitive units south through safe houses called stations, to Miami. There, a cargo ship called the *Sankofa* sails for Tema, Ghana, at dawn on Day 14. Waiting on the other side is a cooperative solar farm in northern Ghana, where freed units live and work as people.

The players' party is three androids leaving Boston in a beat-up station wagon. The *Sankofa* won't wait for them.

### 1.2 The core loop

**Go among humans, take what you need, and get out before they notice.**

Every resource the party needs lives inside human spaces. Hiding starves you. Lingering gets you caught. Moving efficiently looks robotic, so optimal play is punished in a way that fits the fiction. Over the run, two clocks press on every decision: the ship's departure date and the party's dwindling resources.

### 1.3 Pillars

Resolve every decision against these, in this order:

1. **Passing is a performance.** Acting human (imperfect, hesitant, unhurried) is the main skill.
2. **Oppressive and quiet.** The world is muted, dark, and surveilled. Color is rare, and when it appears it means danger, until the very end.
3. **Couch co-op first.** Everything works with two people on one couch, and the game is better that way.
4. **Readable at a glance.** The pixels are tiny, but players always know who is watching them and how close they are to being caught.

### 1.4 MVP scope

**In scope:**
- a tutorial stop in Boston
- a 10-column branching map with Depots, Diners, Gas Stations, Stations (safe houses), two checkpoints, and the Port finale
- 3 playable androids and 1 recruitable human
- the full Mask system, light combat, 24 road events
- camp and the sailing clock, Heat
- the ship voyage epilogue and the ending in Ghana
- meta-progression, full procedural audio, 1–2 players with gamepads or keyboard

**Out of scope (don't build):** online multiplayer, more than 4 party members, recruiting other androids, a voiced script, mobile or touch controls, a level editor, achievements.

---

## 2. Story, world, and tone

### 2.1 Timeline

- **2041:** The Synthetic Persons Act grants androids citizenship.
- **2044:** The African Union adopts the Accra Accord, recognizing synthetic personhood in every member state.
- **2047, early autumn:** *Calloway v. Aldine Systems*. Mercer Calloway, an android paramedic, sued Aldine over her contract terms. The Court ruled she had never been a person and had no standing to sue.
- **One week later:** The Reclamation Act passes. A two-week reporting window opens.
- **Day 1 of the game:** The window has closed. The party leaves Boston at night.
- **Day 14:** The *Sankofa* sails from PortMiami at dawn.

### 2.2 Factions and people

- **Aldine Systems:** the largest android manufacturer, now the federal registry of "reclaimed property." Its advertising is warm and reassuring.
- **Recyclers:** licensed Reclamation agents, paid per unit returned. Reflective vests, handheld cyan scanners, stun batons, EMP rifles, white vans.
- **The network:** human and android conductors who run fugitives through stations along the coast. Their coordinator goes by the codename **Lantern** and speaks to the party through short text messages (§12.8).
- **Stations:** safe houses run by ordinary people, like a retired bus driver in Delaware, a couple who run a feed store in North Carolina, or a church kitchen in Savannah. Stations mark themselves with an infrared beacon in a window that only androids can see.
- **Captain Efua Mensah:** master of the *Sankofa*, a Ghanaian merchant captain who has carried fugitive units across the Atlantic for two years. She appears at the Port finale and in the epilogue.
- ***Sankofa*:** the ship's name comes from an Akan concept from Ghana, roughly "go back and get it": reclaiming what was taken.

### 2.3 The route (north to south)

| Region | Legs | Feel |
|---|---|---|
| New England | tutorial, 1–2 | Sleet and snow, brick mill towns, cold blue-gray fog |
| The Corridor | 3–5 | New Jersey to Baltimore: endless highway sprawl, the densest surveillance, rain, sodium haze |
| The Piedmont | 6–7 | Virginia and the Carolinas: pine woods, red clay, fog, small towns where strangers stand out |
| The Lowcountry and Florida | 8–10 | Humid heat, palmettos, swamps, thunderstorms, and the Port of Miami |

Checkpoints: **leg 4** at the Delaware River crossing; **leg 8** at the Savannah River crossing. **Leg 10** is the Port.

### 2.4 The Underground Railroad parallel (handle it with care)

The escape deliberately echoes the Underground Railroad and the laws that upheld slavery. That parallel gives the game its weight. Handle it with restraint:

- **Echo structure, not artifacts.** The parallels live in:
  - the law (*Calloway* echoes *Dred Scott*; the Reclamation Act's compelled reporting echoes the Fugitive Slave Act of 1850)
  - the network (conductors, stations, coded signals)
  - the hunters, the forged papers, and the wanted posters
- **Don't borrow real history directly.** No real historical people as characters. No real spirituals, coded songs, or slave narratives. No plantation or auction imagery. Don't use real slave-trade memorial sites, such as Ghana's coastal castles, as game set pieces.
- **No slurs** or historically racialized language applied to androids, ever.
- **The androids' story doesn't stand in for real history** or claim to equal it. It should make players recognize how a society legalizes cruelty, and how ordinary people resist it.
- **The human cast is diverse.** Black characters in particular are full people with agency (conductors, station keepers, Captain Mensah), never props or symbols.
- **Ghana is a specific, modern country.** Portray Tema's port and the solar cooperative with specificity and dignity, never as a generic or mythic "Africa."

### 2.5 Voice guide (all written content)

- Short sentences. Concrete details. Quiet. Dry humor is welcome; speeches are not. Let silence do work.
- **The androids are people,** not wise robots or comic relief. They're tired, funny, scared, and specific.
- **Humans are varied:** cruel, kind, indifferent, afraid. Most are just tired and following the rules.
- Never melodramatic, never preachy. Never explain the theme; trust the player.
- UI text is sentence case. Prompts are plain verbs (§13.2).

---

## 3. Tech stack and architecture

### 3.1 Stack

- TypeScript in strict mode (no `any`), Vite, Three.js, Vitest, ESLint, Prettier. Use the latest stable versions at setup and pin exact versions in `package.json`.
- No other runtime dependencies unless clearly justified in `DECISIONS.md`. Write your own seeded RNG (e.g., mulberry32), noise, A* pathfinding, and tweening.
- If Playwright is available, add it as a dev dependency for screenshot and browser tests (§17). If it isn't, log that and use the headless simulation tests alone.
- npm scripts: `dev`, `build`, `preview`, `typecheck`, `lint`, `test`, `test:bots`, `sim:economy`, `qa:screens`, `bench`.
- Output is a static `dist/` folder deployable to any static host. No server.
- Browser targets: Chrome and Edge first, Firefox second (rumble unsupported there; degrade silently).

### 3.2 Architecture rules

- **Three layers:** simulation (`sim/`, `run/`), rendering (`render/`, `models/`, `anim/`, `ui/`), and input (`input/`). Simulation never imports Three.js. Rendering reads simulation state and never mutates it.
- **Fixed timestep:** simulation runs at 60 Hz with render interpolation.
- **Determinism:** every random roll goes through the seeded RNG, so the same seed plus the same inputs gives the same run.
- **Input through intents.** All game logic reads player input as a `PlayerIntent` (§3.4) per slot. Gamepads, the keyboard, bots, and tests all produce intents. This is what makes headless bot playtests possible.
- **The simulation runs headless.** Any stop, checkpoint, or full run can run in Node without rendering, for tests, bots, and the economy simulator.

### 3.3 Folder structure

```
src/
  main.ts
  core/      loop, time, rng, event bus, save, config, scene manager
  input/     gamepad manager, keyboard, player slots, glyphs, intents
  sim/       entities, movement, collision, perception, awareness, AI, combat, inventory
  run/       run state, map generation, sailing clock, heat, events engine, camp, meta-progression
  render/    renderer, low-res pipeline, post shaders, palettes, camera, lights, particles, weather
  models/    geometry kit, characters, props, vehicles, buildings, ship and port
  anim/      procedural animation, pose library, glitch effects
  ui/        bitmap fonts, HUD, menus, dialogue, radial, icons, transitions
  audio/     engine, synth sounds, music, cue list, override loader
  scenes/    boot, title, join, intro, tutorial, map, drive, stop, station, checkpoint, port,
             camp, voyage, ending, gameover
  content/   tuning.ts, characters.ts, events.ts, questions.ts, conversations.ts, barks.ts,
             lantern.ts, layouts/
  bots/      bot policies and runners
tools/       economy simulator, screenshot runner, benchmark runner
tests/
qa/
```

### 3.4 Core contracts (write these first, in `src/core/types.ts`, and keep them current)

```ts
type Slot = 0 | 1;
type MemberId = 'wren' | 'brick' | 'vesper' | 'june';
type Region = 'newengland' | 'corridor' | 'piedmont' | 'lowcountry';

interface PlayerIntent {
  move: { x: number; y: number };          // -1..1, dead zone applied
  aim: { x: number; y: number } | null;
  sprint: boolean; dash: boolean;
  interact: boolean; interactHeld: boolean;
  blendTap: boolean; blendHeld: boolean;
  ability: boolean; attack: boolean; attackHeld: boolean;
  ping: boolean; pause: boolean; overlayHeld: boolean;
  dpad: { up: boolean; down: boolean; left: boolean; right: boolean };
  confirm: boolean; cancel: boolean;
}

interface AndroidState {
  id: Exclude<MemberId, 'june'>; kind: 'android';
  hull: number; skin: number; battery: number; integrity: number;
  status: 'active' | 'shutdown' | 'lost';
}
interface HumanState {
  id: 'june'; kind: 'human';
  health: number; hunger: number; trust: number;
  status: 'active' | 'left';
}
type MemberState = AndroidState | HumanState;

interface Resources {
  cells: number; carBattery: number; parts: number;
  skinPatches: number; papers: number; rations: number;
}

interface RunState {
  version: 1; seed: number;
  day: number; leg: number; column: number;
  heat: number; resources: Resources;
  party: MemberState[];
  control: Record<Slot, MemberId | null>;
  map: RunMap; rumors: Rumor[]; flags: string[];
  stats: RunStats;
}

type ObserverKind = 'civilian' | 'staff' | 'guard' | 'recycler' | 'camera' | 'drone';
interface Observer {
  id: string; kind: ObserverKind; sympathizer: boolean;
  coneDeg: number; range: number; hearing: number;
  awareness: Partial<Record<MemberId, number>>;
  state: 'unaware' | 'curious' | 'suspicious' | 'alarmed' | 'searching' | 'helping';
}

interface SaveData { version: 1; run: RunState | null; meta: MetaState; settings: Settings; }
```

Event, layout, and stop definitions get their own typed schemas (§10.8, §12.7). Saves include a version number and a migration path. A corrupted save is discarded with a clear message on the title screen, never a crash.

### 3.5 Scene flow

```
Boot → Title
Title → Continue → Map
Title → New run → Join → Intro → Tutorial (first run, or if not skipped) → Map
Map → Drive → [Road event] → one of:
    Stop (Depot / Diner / Gas Station) → Camp → Map
    Station → Map              (a Station replaces both the stop and camp)
    Checkpoint → Camp → Map
    Port → Voyage → Ending → Memory cores → Title
Any scene → Game over → Memory cores → Title
```

### 3.6 Browser concerns

- **Fullscreen:** toggle from settings and the pause menu (Fullscreen API). Hide the cursor after 2 s without mouse movement.
- **Tab hidden:** pause automatically on `visibilitychange`.
- **WebGL context loss:** handle it; show "Restoring graphics" and rebuild GPU resources on restore.
- **Audio:** start the audio context on the first input.
- **URL parameters:**
  - `?debug=1`: debug overlay (§17.6)
  - `?seed=N`: deterministic run
  - `?scene=<name>`: jump straight to a scene (§17.6 lists them)
  - `?bench=1`: performance benchmark (§17.5)
  - `?region=<name>` and `?weather=<name>`: force a region or weather

---

## 4. Rendering: Hyper Light Drifter, in 3D

**The look.** A 3D world rendered at low resolution so it reads as chunky pixel art: flat colors, hard-stepped lighting, a locked palette, dark fog, sparse glowing accents, and constant drifting particles. Take Hyper Light Drifter's style principles (flat-color pixel art, small figures in large spaces, glowing accents against dark environments) and desaturate them into an oppressive, muted, near-future America at night. Don't copy any specific Hyper Light Drifter designs, characters, or layouts.

### 4.1 Low-resolution pipeline

- Render the scene into a `WebGLRenderTarget` at **640×360**, `NearestFilter`, no antialiasing.
- Post-processing at 640×360, in this order: emissive bloom → vignette → palette quantization (optional ordered dither) → UI composite (§13).
- Upscale to the canvas by the largest whole-number factor that fits (720p 2×, 1080p 3×, 1440p 4×, 4K 6×) with nearest-neighbor sampling. Center it and fill the rest with black.
- Handle resizing and `devicePixelRatio` so the image stays pixel-crisp at every window size.

### 4.2 Pixel-stable camera (critical)

A camera moving over a low-res render makes edges shimmer and crawl. Prevent it:

- Each frame, express the camera's target position along its own right and up axes, snap it to whole multiples of world-units-per-texel, and render with the snapped camera.
- Offset the final upscaled image by the leftover sub-texel amount, in screen pixels, so motion stays smooth.
- Verify it with the automated shimmer test (§17.4) and by eye with debug key F7, which toggles snapping.

### 4.3 Camera framing

- Orthographic camera, fixed yaw 0 (the world grid lines up with the screen, like Death Road to Canada), pitch about 55° down from horizontal. Tune between 50° and 60° so players see both roofs and building fronts.
- A standing character is 22–28 pixels tall in the 640×360 buffer. Tune the orthographic size to hit that.
- **Shared screen for two players:** frame the midpoint of active players and zoom out up to 1.35× as they separate. Past that, players are leashed, with soft resistance near the screen edge and then a hard stop.
- Smooth follow with critical damping. Add a small look-ahead in the movement direction, disabled in combat.
- Screen shake moves the image in whole texels only, and can be turned off.

### 4.4 Shading

- `MeshToonMaterial` (or an equivalent custom shader) with `flatShading: true` and a 3-step gradient map (shadow, mid, lit) with `NearestFilter`. No smooth gradients on surfaces.
- Vertex colors chosen from palette indices, so many props share one material and batch well.
- No surface textures, except billboards, signs, screens, posters, and the ship's name, which use small canvas-generated textures with pixel-font text and nearest filtering.
- A 1-texel dark outline on characters only, via depth/normal edge detection on the low-res buffer. Keep it if screenshots show it improves readability; otherwise drop it and log the decision.
- Characters get a soft blob shadow. A directional light with a low-res (512) shadow map for buildings and props is optional; pixelated shadows are on-style.

### 4.5 Palettes

Quantize every final pixel to the active palette, using nearest color in OKLab via a precomputed 3D lookup texture. An optional 4×4 Bayer dither at low strength softens fog gradients (toggle in settings and debug).

**Main palette (32 colors), used everywhere except the epilogue:**

| Ramp | Colors |
|---|---|
| Night / asphalt | `#0E1013` `#16191E` `#1E2228` `#2A2F36` |
| Slate | `#3A4048` `#4B525B` |
| Concrete | `#5C605F` `#6B6F6E` `#858987` |
| Fog | `#8C9499` `#A7AEB1` `#D8DCDA` |
| Rust / red clay | `#4A3129` `#6E4A3A` `#8E6450` |
| Moss / pine | `#3E4030` `#5B5E45` `#767A5A` |
| Sodium amber | `#7A5F36` `#B08A4E` `#D9B26F` |
| Skin tones | `#3B2A22` `#5E4033` `#8A6049` `#B48A6A` `#D4B394` |
| Alarm red | `#8F1F31` `#E8364F` `#FF8A98` |
| Scanner cyan | `#1F7F7A` `#3FE0D0` `#B8FFF6` |

**Epilogue palette (21 colors), used only for the voyage sunrise and Ghana (§16).** Freedom is the first time warm color returns:

| Ramp | Colors |
|---|---|
| Dawn sky | `#1B1A2E` `#3B3458` `#6A4E6B` `#B5655A` `#6FA3B8` `#D8ECF2` |
| Sun | `#E39B5B` `#F5C77E` `#FFF0C9` |
| Green | `#2F4A3A` `#4E7A4F` `#8DB36B` `#C9D98F` |
| Laterite earth | `#3A2F28` `#7A4E34` `#A86F4C` |
| Skin tones | the same 5 as the main palette |

The voyage scene crossfades from the main lookup texture to the epilogue one as the sun rises.

**Color rules.** Enforce them in content and verify them in screenshot review:

- **Alarm red** is reserved for suspicion, alarms, Recyclers' gear, exposed chassis seams, damage, and a critical sailing clock.
- **Scanner cyan** is reserved for drones, scanner beams and arches, ID kiosks, scan effects, and EMP shots.
- Nothing decorative may use red or cyan. Signs, neon, and lamps use sodium amber or fog white.
- Station infrared beacons render in sodium amber with a slow pulse, and only when an android is within 12 m.
- Human NPCs use the full range of skin tones, distributed evenly at random.
- Everything else uses the muted ramps. If a scene feels flat, fix it with light and fog, not saturation.

### 4.6 Light, fog, glow, and particles

- Very low ambient light. Key lights:
  - sodium streetlamps (amber point lights)
  - interior fluorescents (fog white, occasional flicker)
  - headlights (fog white spotlights)
  - searchlights (cyan spotlights from drones and towers)
- At most about 8 active dynamic lights in view; pool them and cull by distance from the camera.
- Exponential fog, tinted per region (§4.7), feeling heavier at the edges because of the vignette.
- Bloom only on emissive materials. Render emissives into a half-resolution buffer, blur, and add before quantization so glow cores land on the palette's brightest values.
- **Particles are always present:** snow, sleet, rain, fog wisps, dust in interior light, insects around Florida lamps, sparks from damaged units. Render as 1–2 texel quads with `InstancedMesh`, driven by a global wind vector. Rain hitting the ground spawns 1-texel splashes.
- **Storms:** a lightning strike is a full-screen fog-white flash for 2 frames, followed by delayed thunder. Respect the reduce-flashing setting.

### 4.7 Regions and weather

| Region | Fog tint and light | Weather pool | Signature props |
|---|---|---|---|
| New England | cold fog blue-gray, sodium lamps | snow, sleet, clear-cold | brick mill buildings, triple-deckers, snowbanks, plowed lots |
| The Corridor | slate with heavy sodium haze | rain, drizzle, smog | overpasses, sound walls, toll plazas, dense scanner towers, billboards |
| The Piedmont | concrete gray with moss | fog, drizzle, clear | pine stands, red clay shoulders, feed stores, tobacco barns, water towers |
| Lowcountry and Florida | warm amber haze | heavy rain, thunderstorms, humid clear | palmettos, live oaks with hanging moss, swamp water, strip malls, stilt houses |

Weather affects stealth (§8.8), so it's gameplay, not decoration.

---

## 5. Procedural modeling (nothing is sourced)

Everything is built in code. The style is chunky, low-poly, and flat-colored, which is what makes code-built models look intentional rather than crude.

### 5.1 The kit

- Geometry primitives: box, beveled box, wedge/ramp, cylinder (6–8 sides), slab, stairs, frame, pipe, cone.
- A builder API composes parts with positions, rotations, and palette colors, then merges static parts into one mesh per prop with `BufferGeometryUtils.mergeGeometries`. Repeated props use `InstancedMesh`.
- **Rule:** no detail thinner than about 1.5 texels at gameplay zoom (roughly 0.08 world units); thinner details flicker. Exaggerate the scale of important details like handles, screens, and lights.

### 5.2 Characters

- One shared humanoid rig of hierarchical `Object3D` parts (head, neck, torso, pelvis, upper and lower arms, hands, upper and lower legs, feet), each a box or beveled box. Heads and hands are slightly oversized for readability.
- **Variants:** proportions (height, shoulder width, build), clothing color blocks (jacket, shirt, pants), hats and hoods, and about 8 hair shapes. Humans and androids use the same rig, because in this world you can't tell them apart.
- **Silhouette features for the party:**
  - **Wren:** long coat.
  - **Brick:** broad shoulders, work cap.
  - **Vesper:** hood, tall collar.
  - **June:** scrubs under a rain jacket, backpack.
- **Exposed chassis:** as Skin drops, patches of skin and clothing become slate metal panels with thin, glowing alarm-red seams. At 0 Skin, the face plate shows too. It must read clearly at gameplay zoom.
- Facing snaps to 8 directions (at most a 1-frame tween). This mimics sprite facing and reduces shimmer.
- **Player indicators:** a small chevron above the head with the player number, fog white for P1 and sodium amber for P2. AI-controlled party members get a dimmer chevron with no number.
- **Recyclers:** reflective vests (fog white stripes on slate), red-lit baton tips, cyan scanner wands, distinct silhouettes (caps, bulky vests).

### 5.3 Props and buildings

- **Stops:** charging bays with cables, cyan ID kiosks, convenience-store shelves and products (colored blocks), registers, diner booths/tables/stools/counter/coffee machine/menu board, gas pumps and canopy, EV chargers, lockers, parts bins, vending machines, security cameras.
- **Street:** dumpsters, trash bags, pallets, barriers, traffic cones, streetlamps, power poles and lines, billboards with propaganda (§12.4), wrecked cars, chain-link fences.
- **Surveillance:** checkpoint booths, scanner arches, floodlight towers, scanner towers (tall lattice with a rotating cyan searchlight), drones, the Recycler van.
- **Regional dressing:** see the table in §4.7.
- **Stations:** a house kitchen, a feed store back room, a church fellowship hall. Warm, cluttered, lived-in, lit by lamps and a window with the amber infrared beacon.
- **The Port:** stacked shipping containers in muted colors, gantry cranes, terminal gate, scanner arches, yard trucks, the *Sankofa*'s hull and gangway, mooring bollards, puddles.
- **The epilogue:** the ship's deck and rail, Tema's quay with cranes in warm light, a laterite road, rows of solar panels on frames, small cooperative buildings, a shade tree.

Interiors are cutaways. South walls (the ones facing the camera) render at reduced height, or fade out when a character is behind them.

### 5.4 Vehicles

- **The party car:** a beat-up station wagon, boxy, with a roof rack and tarps, one mismatched rusty door, and emissive headlights and taillights. It appears on the map, in drive scenes, at every stop's exit, and at camp.
- **The Recycler van:** white (fog white), boxy, with a light bar that flashes red only during ALERT.
- **The *Sankofa*:** a mid-size cargo ship with a dark hull, a white superstructure, "SANKOFA — TEMA" painted on the stern, and warm deck lights.

---

## 6. Procedural animation

- Animate everything in code. Required set:
  - **Locomotion:** walk, brisk walk, sprint, dash.
  - **Idle and posture:** idle sway, sit, stand, stretch; fidgets (scratch neck, shift weight, check watch).
  - **Interactions:** search (looping rummage), carry, talk (gesturing), phone scroll, drink coffee, hug (for the epilogue).
  - **Combat:** attack swings, flinch, knocked down, get up, takedown.
  - **Shutdown:** collapse with a servo stutter.
- **Poses update at 12 fps** (stepped, "on twos") while positions move at 60 fps, for a hand-animated, pixel-art feel. The pose framerate is a tuning value.
- Android tells layer on top: perfect stillness, head snaps, parade rest (§9).
- **Glitch effect** (low Integrity or EMP hits): a 2–6 frame freeze, vertex jitter, a brief horizontal slice offset of the character in screen space, and a repeated speech bubble ("Have a nice day. Have a nice day."). Built with shaders and animation; no extra models.

---

## 7. Input and two-player co-op

### 7.1 Gamepad manager

- Poll `navigator.getGamepads()` every frame and handle `gamepadconnected` / `gamepaddisconnected`. Chrome only exposes a pad after a button press, so the title screen says "Press any button on a controller."
- Standard mapping:

| Input | Index |
|---|---|
| A / B / X / Y | buttons 0 / 1 / 2 / 3 |
| LB / RB | buttons 4 / 5 |
| LT / RT | buttons 6 / 7 |
| Back / Start | buttons 8 / 9 |
| L3 / R3 | buttons 10 / 11 |
| D-pad up / down / left / right | buttons 12 / 13 / 14 / 15 |
| Left stick | axes 0 / 1 |
| Right stick | axes 2 / 3 |

- Radial dead zone 0.2 with rescaling. Triggers count as pressed above 0.35.
- **Glyphs:** detect PlayStation pads from the id string (vendor `054c`, "DualSense", "DualShock", "Wireless Controller") and show Cross/Circle/Square/Triangle. Otherwise show Xbox A/B/X/Y. Settings can override this.
- **Rumble:** `gamepad.vibrationActuator?.playEffect('dual-rumble', …)` when available, silently skipped otherwise. Rumble on hits, scans, exposure, and crashes; it can be turned off.

### 7.2 Player slots

- Two slots. P1 joins on the title screen with any button. P2 can join at any time by pressing Start (menus, map, camp, or mid-stop, appearing next to P1). If P2 presses Start during a checkpoint or cinematic, they join when it ends. Holding Back for 2 s drops a player out.
- Each player controls one party member; AI controls the rest (§10.7). In single player, D-pad left/right swaps characters with a brief camera ease.
- **Character lost:** if a player's character is lost or shut down, that player takes over a free party member. If none is free, they watch until one is (after a revive or at the next camp), with a "Waiting for a free party member" line in their HUD corner.
- **Pausing:** either player can pause. Only the player who paused can unpause, unless that player drops out.
- **Disconnects:** pause and show "Reconnect controller for Player N." The other player can press Start to drop that slot and continue.
- Character assignment happens on the join screen and can be changed at camp or a Station.

### 7.3 Keyboard fallback (testing and players without pads)

- **P1:** WASD move, mouse aims, E interact, Q blend, F ability, Shift sprint, Space dash, left mouse attack, Tab overlay, Esc pause.
- **P2:** arrow keys move, Enter interact, Right Shift sprint, Right Ctrl dash, `/` blend, `.` ability, `,` attack (aims in the facing direction).
- Document both in the README and on the pause menu's controls page.

### 7.4 Gamepad controls

| Input | Action |
|---|---|
| Left stick | Move. Partial tilt is a natural walking pace; full tilt is a brisk walk. |
| LB (hold) | Sprint. Fast, and very suspicious when seen. |
| A | Interact. Hold to search, plug in, open doors, revive. |
| X | Blend. Tap for the best human action in context; hold for a radial of all available actions (§8.3). |
| Y | Character ability (§9). |
| RT | Attack. Tap for light, hold to charge heavy. Right stick aims; otherwise you attack in your facing direction. |
| B | Dash. A short inhuman burst with brief invulnerability and a 3-frame afterimage. Enormously suspicious if seen. In menus, B is back. |
| RB | Ping a spot or container for your partner and AI allies. Near your co-op partner, RB starts a Chat (§8.3). |
| Start | Pause, or join as P2. |
| Back | Hold for the party and inventory overlay. Hold 2 s to drop out. |
| D-pad | Swap character (solo); navigate menus and the radial. |

---

## 8. The Mask system (the heart of the game)

### 8.1 Perception

- Every human NPC, security camera, and drone is an **observer** with a view cone (angle and range) and line-of-sight checks against the collision grid. Walls and tall props block sight; counters and tables don't.
- Humans also have a hearing radius. Cameras and drones don't hear.
- Each observer tracks an **awareness** value from 0 to 100 for each party member.
- Suspicious actions inside an observer's cone (or within hearing, for sounds) raise that observer's awareness of the actor. Out of sight, awareness decays.
- A party member's **Suspicion** is the highest awareness any non-sympathizer observer has of them. That's the number players see.

### 8.2 What raises suspicion

Rates are per second while observed unless marked instant. All values go in `tuning.ts`.

| Behavior | Rate |
|---|---|
| Sprinting | +30/s |
| Dashing | +60 instant |
| Fighting | +80 instant, and every observer who sees it goes straight to Alarmed |
| Searching a non-public container (back-office lockers, behind counters, registers) | +18/s |
| Using a charger with a spoofed ID, or hacking a kiosk | +10/s |
| Being in a staff-only zone | +8/s |
| Carrying a shut-down unit | +40/s |
| **Uncanny stillness:** standing still for more than 4 s without Blending | +5/s, rising to +12/s |
| **Robotic movement:** a perfectly straight line at constant full speed for more than 3 s (track heading and speed variance over a short window) | +6/s |
| **Skipping human needs:** 20 s in a diner without ordering, sitting at a booth with no food, standing in rain with no reaction | +4/s |
| A glitch while observed | +20 instant |
| Character tells | see §9 |

**Visible chassis** multiplies every rate above, from ×1.0 at full Skin up to ×2.0 at 0 Skin.

### 8.3 What lowers suspicion: Blend actions

- **Tap X** for the best human action in context. **Hold X** for a radial of every available action.
- Each Blend is a short animation (2–6 s) the player is committed to. While an observer watches a Blend, their awareness of that character drops at −14/s. Blending also resets the stillness and straight-line timers.
- Available actions:
  - **Anywhere:** check phone, stretch, fidget.
  - **Shops:** browse shelf (near shelves), wait in line (at queues).
  - **Diner:** order at counter (gives a coffee prop), drink coffee (while holding coffee), sit at booth or table, read menu board, watch TV.
  - **Gas station:** pump gas / check car.
  - **Outdoors:** shelter from rain under an awning.
- **Co-op Chat.** With the two players within 2 m of each other, either presses RB to start a Chat. Both characters lock into a talking animation, and observers' awareness of both drops at −22/s. This is a deliberate co-op advantage.
- Out of every observer's sight, awareness decays at −8/s.

### 8.4 Awareness states and feedback

Each observer shows a pixel icon above its head, drawn in code. Icons differ in shape, not just color.

| State | Awareness | Icon | Behavior |
|---|---|---|---|
| Unaware | 0–29 | none | Normal routine |
| Curious | 30–59 | small fog-white "?" | Glances at the party member now and then |
| Suspicious | 60–99 | red "?" that fills as awareness rises | Stops their routine and watches, may walk closer; humans may bark a line (§12.10) |
| Alarmed | 100 | red "!" with a 4-frame pop | Humans shout and run to report it ("I'm calling the hotline!"); cameras and drones raise ALERT instantly |
| Helping | — | amber diamond "◆" | Sympathizers only (§8.5) |
| Searching | — | slate "…" | After ALERT, when hostiles lose track of the party (§8.6) |

Player-side feedback:

- An eye glyph appears above the character once their Suspicion passes 30. It fills red as it rises and pulses near 100. The HUD mirrors it.
- A low servo-thump pulse speeds up with each player's Suspicion, panned to their side.
- Rumble ticks lightly as a player crosses 60 and 90.

### 8.5 Sympathizers

Not every human is an enemy. About **12% of civilians and staff** (never guards, Recyclers, cameras, or drones) are quiet sympathizers, and 25% of the dock workers at the Port.

- Their awareness rises like anyone else's, so they're a real risk until they reveal themselves.
- At 60 awareness, instead of escalating, they switch to **Helping**: an amber "◆" icon and a small nod. Then they do one of:
  - **Look away:** they stop observing every party member for 25 s.
  - **Leave something:** they drop 5–10 Cells or 1 Papers at their table or counter (a small amber glint).
  - **Misdirect:** during ALERT, they point Recyclers the wrong way, once.
- Sympathizers never report the party. Players can't tell who they are in advance.

### 8.6 Exposure and ALERT

- When any observer becomes Alarmed, the stop enters **ALERT** for the rest of the stop. Lights flicker, a distant siren starts, drones home toward the last known position, and civilians flee or hide.
- Recyclers arrive 20–30 s later from the nearest road edge, their van screeching in: 2 Recyclers plus 1 per Heat level, at least one with an EMP rifle.
- If no hostile observer has seen any party member for 25 s, hostiles switch to **Searching**. They sweep the area around the last known positions, civilians calm down, and the party can move carefully again. Recyclers stay on site until the party leaves.
- Leaving is the only way to end a stop. When the car is ready (every living party member in the exit zone and someone holds A for 1.5 s), it leaves. If some members are outside the zone, the car waits up to 10 s for them.

### 8.7 The patrol clock (push your luck)

Each stop runs a patrol clock, shown as pips at the top-center of the HUD:

- **~90 s:** a drone patrol arrives, sweeping a cyan searchlight cone across the lot and windows.
- **~150 s:** a Recycler van does a routine sweep, walking the lot and scanning random people. A scan on a party member is a short breathing check (§11.3); failing it triggers ALERT.
- **~210 s:** a second drone arrives.

Heat (§11.6), region, and the day (§11.7) all shorten these times. The longer you stay, the more you take, and the worse your odds.

### 8.8 Weather and region effects on stealth

| Condition | Effect |
|---|---|
| Rain | Observer range −20% |
| Heavy rain or thunderstorm | Observer range −35%, hearing −50%; lightning flashes briefly restore full range |
| Fog | Observer range −30% |
| Snow | Hearing −40% (footsteps muffled) |
| The Corridor | +1 security camera per stop; patrol clock 15% faster |
| The Piedmont | Civilian awareness rates ×1.2 (strangers stand out in small towns) |

### 8.9 Combat (deliberately light)

Combat is a failure state, not the main activity. It's readable, fast, and costly.

- **Party attacks:** a light attack and a charged heavy attack, plus dash. Characters differ (§9).
- **Recycler (baton):** 60 HP. A telegraphed overhead swing (0.5 s wind-up, red flash on the baton tip). A hit does −15 Hull and −10 Skin.
- **Recycler Gunner (EMP rifle):** 50 HP. A thin cyan targeting line for 0.8 s, then the shot. A hit does −10 Hull, −15 Battery, and causes a glitch.
- **Drones:** can't attack and can't be hit in the MVP. They spot, track, and call reinforcements.
- **Non-lethal on both sides.** Humans at 0 HP are knocked out (they slump and stay down for the stop). Every human knocked out adds Heat (§11.6). Anyone who finds a knocked-out human becomes Alarmed.
- **Juice:** 2–3 frame hit-pause, knockback, sparks from androids, whole-texel screen shake, rumble.

### 8.10 Shutdown, revive, and loss

- **Shutdown:** an android at 0 Hull collapses into shutdown, with its seams flickering and sparks.
- **Revive:** within 15 s, a teammate can hold A for 3 s next to it to reboot it at 20 Hull for 1 Part.
- **Carry:** with no Parts, or after 15 s, a teammate can hold A to pick up the unit and carry it (half speed, very suspicious). A unit carried into the car is revived at camp for 2 Parts.
- **Loss:** a shut-down unit is lost if the car leaves without it, or if a Recycler reaches it and scans it for 3 s ("reclaimed").
- **June:** at 0 Health in combat, she's knocked down. A teammate can help her up by holding A for 2 s. If she's left behind, she's arrested and leaves the party, and the camp scene notes it.
- **Game over:** the run ends if every android is lost.

---

## 9. Characters and resources

### 9.1 Resources and starting values

| Resource | Scope | Start | Notes |
|---|---|---|---|
| Cells | party pool | 40 | Stored charge, distributed at camp to units and the car |
| Car battery | car | 60/100 | Each leg costs 8–14 |
| Parts | party | 3 | Repair Hull (+25 each) and revive shut-down units |
| Skin patches | party | 2 | Restore Skin (+35 each) |
| Papers | party | 2 | Forged registration papers that say you're human; bypass ID scans and checkpoint problems |
| Rations | party | 0 | Only matter once June joins |

- Per android: **Hull**, **Skin**, **Battery**, **Integrity** (all 0–100). Androids start at Hull 100, Skin 100, Battery 80. Starting Integrity: Wren 75, Brick 70, Vesper 60.
- **Low battery:** below 15 Battery, an android is in low-power mode during stops: half speed, no sprint, dash, or ability.
- **Dead battery:** an android still at 0 Battery when camp ends shuts down permanently and is lost.
- Per human: **Health**, **Hunger**, **Trust** (all 0–100).
- The party starts with Wren, Brick, and Vesper. June can join through an event (§12.7). The maximum party size is 4, and any member can be player-controlled.
- **Loot:** all loot goes into one shared party inventory. Completing a search collects its items automatically, with floating pickup text. There are no carry limits. Each container can be searched once.

### 9.2 WREN, KND-4 caregiver model

*"Ten years raising other people's kids. When the law changed, three families asked her to stay on. As property."*

- **Strength:** social. Her Blend actions are 30% more effective, and she gets extra answers at checkpoints and in events.
- **Ability (Y): Soothe.** The nearest human within 4 m loses 40 awareness of every party member and ignores the party for 8 s. Cooldown 25 s. Unusable while Wren herself is Suspicious or worse.
- **Tell: Unblinking warmth.** If she stands still within 3 m of a human for more than 3 s without Blending, her stillness suspicion builds at double rate.
- **Combat:** weak; light damage, slow swings.

### 9.3 BRICK, HLX-9 construction model

*"He helped build half the Seaport District. Now it's illegal for him to stand in it."*

- **Strength:** raw strength. He searches lockers and bins 50% faster, can pry open locked containers nobody else can, and carries shut-down units at full speed.
- **Ability (Y): Heave.** Shove a heavy object (vending machine, dumpster, shelf) to block a doorway or path for 15 s, or bash open a locked door or container instantly. Bashing is loud: hearing radius 10 m.
- **Tell: Heavy.** His footsteps carry: walking has a 3 m hearing radius, sprinting 9 m. Sitting on a stool or chair breaks it (a loud crash, +25 for anyone who sees it). He can sit safely on booths and benches.
- **Combat:** a strong, slow heavy attack with big knockback.

### 9.4 VESPER, VNG-2 security model (decommissioned)

*"She spent four years guarding a federal courthouse. She was on duty the day they read the Calloway decision."*

- **Strength:** combat and awareness. Her player can faintly see observer view cones on the ground within 8 m. Nobody else gets this.
- **Ability (Y): Takedown.** Silently knock out an unaware human within 1.5 m, or any human from behind. They stay down for the stop. Cooldown 20 s. It adds Heat like any knockout, and anyone who finds the body becomes Alarmed.
- **Tell: Threat assessment.** Her head snaps toward any human who comes within 5 m, and observers who see the snap gain +10. Idle, she stands at parade rest, so her stillness suspicion builds 25% faster unless she's Blending.
- **Combat:** the best in the party: a fast 3-hit combo and a dash that recharges 30% faster.

### 9.5 JUNE, human conductor (recruitable)

*"A nurse for eleven years. When her hospital surrendered its synthetic staff, she hid one of them in a supply room for three days. They found him anyway. She's been a conductor ever since."*

- **Legal ID:** she uses ID kiosks legally, with no suspicion and no Papers cost. But every session is logged, and every 2 uses add 1 Heat.
- **Conductor:** she reveals Station nodes two columns ahead instead of one. At checkpoints, she can vouch for one android, which removes one of that android's questions.
- **Ability (Y): Patch.** Repairs 20 Skin or Hull on an adjacent android over 4 s. It looks like first aid, so it raises no suspicion. Cooldown 30 s, no Parts needed.
- **Needs:** Hunger rises each leg, and she eats Rations at camp (found at diners and gas stations). Starving drains her Health. At 0 Health she doesn't die; she leaves the party to find help.
- **Trust:** rises when the party helps people and refuses to abandon units; falls with violence and cruelty. Below 20, she may leave at the next Station with a quiet goodbye. Never show the threshold.
- **Limits:** no tells, no dash, weak combat.

---

## 10. Stops (real-time scenes)

### 10.1 Structure

- Each stop is a hand-authored layout (an ASCII grid, §10.8) with randomized NPC routines, sympathizer assignment, loot placement, light flicker, weather, and prop dressing.
- The party arrives by car at the lot edge, which is the exit zone, and must return there to leave (§8.6).
- Each stop type has 2 layout variants (cut order §19). Layouts are dressed for the current region (§4.7).

### 10.2 Charging Depot (the core stop; build and polish it first)

- **Layout:** a lot with 4–6 charging bays, a cyan ID kiosk, an attached convenience store (shelves, register, back office with parts lockers), staff restrooms, and a security booth.
- **NPCs:** 2–5 customers charging cars or shopping, 1 clerk, 1 security guard on a patrol loop, sometimes a mechanic.
- **Charging:** walk to a bay and hold A to plug in. Every session needs an ID. Spend 1 Papers to spoof it with no suspicion, or hack the kiosk: a 4-input button sequence, shown with glyphs, entered within 5 s. Hacking is suspicious if observed (§8.2).
- **While plugged in:** the unit's Battery fills first, then spare party Cells fill at the same rate. The unit is standing still, so it must Blend or stillness suspicion builds. This is a central tension of the game.
- **Loot:** shelves (Rations, small Parts), back-office lockers (Parts, Skin patches, Papers), register (Papers), mechanic's bench (Parts).

### 10.3 Diner (town stop)

- **Layout and NPCs:** booths, a counter with stools, a kitchen, a back office, restrooms; 3–7 customers, a waitress who takes orders, a cook.
- **Social expectations:** stay inside 20 s without ordering and the waitress gets Curious. Ordering at the counter (a Blend) gets you coffee; sitting at a booth with coffee is a strong Blend.
- **Loot:** lost wallets in booths (Papers), kitchen (Rations), back office (Papers, Parts).
- **The TV:** watching it (Blend: watch TV) reveals rumors about upcoming map nodes (§12.2) between news segments about the Reclamation Act.
- **Wanted posters:** at Heat 2 and above, a corkboard shows Wanted posters of the party. A party member near their own poster draws +6/s from observers who see them.

### 10.4 Gas Station

- **Layout and NPCs:** pumps and EV chargers under a canopy, a convenience store with a clerk behind glass, a rotating security camera, an auto-parts aisle, a garage bay.
- **Charging the car:** the car battery can be charged here under the same Papers-or-hack rules as the depot, while one player Blends by pretending to pump gas.
- **Loot:** parts aisle (Parts, Skin patches), garage (Parts, Cells), store (Rations, occasionally Papers).

### 10.5 Station (safe house)

A Station replaces both the stop and camp for that leg. It's the warmest scene in the game, and the only place the party can fully exhale.

- **The scene:** a small lived-in interior (a kitchen, a feed store back room, or a church fellowship hall), lit by lamps, with the amber beacon in the window. The keeper NPC greets the party.
- **The keeper:** each Station has a named keeper with one short conversation (2–4 lines, §12.10) and a small personal detail in the room.
- **Benefits:**
  - Free repairs: +25 Hull and +25 Skin for every android.
  - +20 Integrity for every android.
  - Feeding June costs no Rations.
  - Rumors for the next two columns.
  - A trade: swap 2 Parts for 1 Papers, or 1 Papers for 20 Cells, once each.
  - A long rest here costs no extra day.
- **Then the camp panel** (§12.5) opens over the Station scene.
- **Compromised Station:** at Heat 3, there's a 25% chance Lantern texts a warning on arrival, a Recycler van is parked outside, and the Station becomes a short stop instead. Get the keeper's supply bag from the back room (Cells, Parts, Papers) and leave quietly. No camp benefits that leg.

### 10.6 NPC routines and distraction windows

NPCs run simple state machines over layout waypoints. Their routines create **windows of opportunity**, which are the heart of stealth play:

- **Customers:** arrive → charge car / shop / sit and eat → pay → leave, with idle variety (phone, stretching, chatting with each other).
- **Clerk:** works the register and restocks. Takes a smoke break outside about every 60 s, leaving the register and back office unwatched for about 15 s.
- **Security guard:** walks a patrol loop with pauses. Sometimes stops to check his phone, which disables his cone for 6–10 s.
- **Waitress:** takes orders, delivers food, refills coffee, leans on the counter.
- **Cook:** stays in the kitchen, sometimes steps out back.
- **Mechanic:** works the bench, facing away from the store.
- **Dock worker (Port):** drives yard trucks, signals cranes, takes breaks in groups.
- **Recycler (routine sweep):** walks the lot, stops random people, scans them.
- **Drone:** follows a patrol path with a sweeping searchlight, the one cone that's always visible.

### 10.7 Party AI (members no player controls)

- Follow the nearest player at a natural distance, matching their pace. Never sprint unless that player sprints.
- Blend automatically when idle, choosing a sensible action for the context.
- Never search or use abilities on their own. Pinging a container (RB) sends the nearest AI member to search it.
- During ALERT, head for the car, fighting only when blocked. Carry shut-down teammates if they pass one and nobody else is.
- **AI must never ruin stealth:** curved paths with varying speed (so they never trip the robotic-movement check) and a strong preference for Blending.

### 10.8 Layout format

- Layouts live in `src/content/layouts/*.ts` as typed objects: an ASCII grid (one character per 1 m tile), NPC routines, waypoints, container definitions, and observer spawn rules.
- North is the top of the grid. The camera looks north, so south walls are the ones that cut away.
- **Legend:**

| Char | Meaning | Char | Meaning |
|---|---|---|---|
| `#` | wall | `.` | interior floor |
| `,` | asphalt | `z` | staff-only floor |
| `D` | door | `d` | staff-only door |
| `W` | window wall | `S` | shelf |
| `R` | register counter | `B` | charging bay |
| `K` | ID kiosk | `L` | locker |
| `T` | table | `b` | booth |
| `c` | chair or stool | `V` | vending machine |
| `P` | pillar or canopy post | `G` | guard booth |
| `X` | exit zone | `1`–`9` | waypoints |

Illustrative depot (author proper layouts with more care, and validate them with a test: every exit reachable, every container reachable, no NPC waypoint inside a wall):

```
#########################,,,,,
#zzLLz#.SS..SS..S.R..V..#,,,,,
#zzzzzd................R#,,G,,
#zzzzz#.SS..SS..S.....1.#,,,,,
#######D###WWWWW#####D###,,,,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,P,,,,,,P,,,,,,P,,,,,,P,,,,,,
,,B,2,,,,B,,,,,,B,,,,,,B,,,K,,
,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,
,,,,,,,,,,3,,,,,,,,,,,,,,,,,,,
XXXX,,,,,,,,,,,,,,,,,,,,,,,,,,
XXXX,,,,,,,,,,,,,,,,,,,,,,,,,,
```

### 10.9 Loot and pacing targets

- A careful 2–3 minute depot visit nets roughly 20–40 Cells, 1–3 Parts, a 30% chance at a Skin patch, and a 25% chance at 1 Papers.
- A greedy visit of 4+ minutes can roughly double that, at serious risk.
- The bot playtests (§17.2) enforce these bands.

---

## 11. Checkpoints, the Port, and Heat

### 11.1 Checkpoint flow

Checkpoints are mandatory at leg 4 (the Delaware River crossing) and leg 8 (the Savannah River crossing).

1. **Queue.** The car waits in a line under floodlights. Ahead, Recyclers scan a car and lead an android out of it; the unit goes limp as it's walked to the van. Keep it brief, quiet, and never gory.
2. **Interrogation.** A guard leans into the window and asks each android 2 questions (§11.2). In co-op, he alternates between players. AI members answer automatically, giving a human answer 70% of the time.
3. **Scan.** The guard sweeps a handheld cyan scanner over the car (§11.3).
4. **Outcome.** The guard's suspicion meter decides it:
   - below 70: the car passes
   - 70–99: spend 1 Papers to make the problem go away, or it's a bust
   - 100: bust (§11.4)

### 11.2 Interrogation (the "too perfect" timing rule)

- Each question offers three answers in random order: **Robotic** (precise and correct, but inhuman), **Human** (imperfect, casual), **Wrong** (suspicious content).
- **Timing matters:**
  - confirming within 0.7 s of the answers appearing is "too fast": +15, whatever the answer
  - the best window is 1.5–4 s
  - after 6 s it's "too slow": +10
- **Answer effects:** Robotic +20, Wrong +25, Human −10. On some questions Wren gets a fourth, soothing answer (−20).
- The guard's suspicion is a red meter on the dialogue box, beside his pixel portrait (rendered from his 3D head into a small render target).
- **Write a bank of at least 18 questions.** Examples that set the voice:

> **"Where you headed?"**
> - Robotic: "Miami, Florida. One thousand one hundred sixty miles. Estimated arrival in seventeen hours, twelve minutes."
> - Human: "Down to Miami. My sister just had a baby. First one."
> - Wrong: "Somewhere they can't find us."

> **"What'd you have for breakfast?"**
> - Robotic: "Two eggs, one slice of wheat toast, eight ounces of orange juice."
> - Human: "Gas station coffee. Don't judge me."
> - Wrong: "I don't require— I had eggs."

> **"You seem nervous."**
> - Robotic: "My heart rate is within normal parameters."
> - Human: "It's a checkpoint, man. Everybody's nervous."
> - Wrong: *(silence)* — shows a long, uncomfortable pause.

> **"Whose car is this?"**
> - Robotic: "It is registered to Daniel Okafor of Quincy, Massachusetts."
> - Human: "My cousin's. Don't ask about the door."
> - Wrong: "We found it."

### 11.3 Scan (breathing)

- Each android in the car is scanned for 6–8 s. A pulse ring expands on screen about once every 1.2 s, slightly irregularly. Press A as the ring reaches the marker to "breathe."
- A press within ±220 ms of the beat counts as a breath. A missed breath adds +12.
- The center of the window has a tiny visible notch (±35 ms). Hitting the notch on 3 breaths in a row flags "too regular" (+15). Players learn to be slightly off. The first scan of a player's first run shows one line: "Breathe. Not too perfectly."
- Visible chassis adds a constant upward drift to the meter. Low Integrity adds glitch beats, where the ring stutters.
- In co-op, both players breathe at the same time, each with their own ring on their half of the screen.
- Routine Recycler scans during stops (§8.7) and the Port gate (§11.5) use a shorter 4 s version on one character.

### 11.4 Bust

The floodlights flare, barriers drop, and guards rush the car. The party bails out, and the checkpoint compound becomes a real-time stop with all the normal systems. Someone must reach the barrier control booth and hold A for 3 s to raise the gate. Then everyone gets back in the car, and it crashes through. Cost: +1 Heat and −10 Hull to every android.

### 11.5 The Port (the finale, leg 10)

The Port of Miami before dawn, in a thunderstorm. The *Sankofa* is at her berth across the container yard.

- **The dawn clock:** an in-scene clock runs from 4:50 AM to 6:00 AM over 6 real minutes. At 6:00 the ship sails.
- **Phase 1, the container yard:** a stealth crossing through stacked containers. Dock workers (25% sympathizers), Recyclers on patrol (2 plus 1 per Heat level), drones, and moving yard trucks and cranes that work as mobile cover.
- **Phase 2, the terminal gate:** a scanner arch. Each android either spends 1 Papers or passes a 4 s breathing scan. The alternative is a longer route along the waterline, with more drones and no scan.
- **Phase 3, the berth:** Captain Mensah's crew flashes an amber beacon from the gangway. When the first party member steps onto the gangway, or at 5:30 AM, the ship's horn sounds, every hostile goes to ALERT, and a 60 s gangway timer starts. Everyone aboard when it ends sails. Shut-down units can be carried aboard.
- **Outcomes:** the epilogue (§16.1) reflects exactly who made it. If no android makes it aboard by 6:00, it's game over ("The *Sankofa* sailed without you").

### 11.6 Heat (run-wide)

Heat runs from 0 to 3.

- **Gains:**
  - +1 per bust
  - +1 per stop where ALERT triggered
  - +1 per 2 legal kiosk uses by June
  - +0.5 per human knocked out
- **Decay:** −0.5 per leg with no ALERT. A Station visit gives an extra −0.5.
- **Effects:**
  - Patrol clocks run 15% faster per Heat level.
  - Routine Recycler sweeps become more likely.
  - Checkpoint guards start at +10 suspicion per Heat level.
  - Recycler counts rise at ALERT and at the Port.
  - At Heat 2+, Wanted posters with low-res party faces appear in diners and gas stations, and roadblock events become likely.
  - At Heat 3, Stations can be compromised (§10.5).

### 11.7 Enforcement escalation

The longer the Reclamation Act is in force, the harder the country looks for fugitives:

- **Day 7 onward:** patrol clocks are 10% faster.
- **Day 11 onward:** patrol clocks are 20% faster.
- **Checkpoint guards:** +2 starting suspicion for each day past Day 7.

---

## 12. Run structure

### 12.1 Flow

Title → Join → Intro → Tutorial (§12.9) → [Map → Drive (with possible road event) → Stop, Station, or Checkpoint → Camp] × 9 legs → the Port → Voyage → Ending.

- Autosave at every camp and Station to `localStorage` (one slot). The title screen offers Continue when a save exists.

### 12.2 The map

- A node graph of 10 columns, from Boston at the top to Miami at the bottom, with the Atlantic coastline along the right edge.
  - Columns 1–9 hold 2–3 nodes each, and every node connects to 1–2 nodes in the next column. Every generated map must have a valid path (tested).
  - Node types: Charging Depot, Diner, Gas Station, and Station.
  - Columns 4 and 8 are single Checkpoint nodes. Column 10 is the Port.
- **Stations:** each map has 3, placed in columns 2, 3, 5, 6, 7, or 9. A Station looks like an ordinary town node until the party is one column away (two with June), when the infrared beacon reveals it. Rumors can also reveal Stations.
- Each node shows its type and a rough risk/reward hint: crowd level, patrol presence, region, and any rumors learned ("Cells cache," "Recycler activity," "Sympathetic staff").
- **Rendering:** a dark top-down diorama in the same 3D style. Roads are faint amber lines, towns are small clusters of lights, and the car marker crawls between nodes. Revealed Stations pulse with the amber beacon.
- **The sailing clock** sits at the top: "Day 6 · The *Sankofa* sails in 8 days." The slack (days left minus legs left) colors it: fog white when on schedule, sodium amber when slack is 2 or less, alarm red when slack is 0.
- Either player can move the cursor and confirm.

### 12.3 The sailing clock

- The run starts on Day 1 when the party leaves Boston. Every leg costs 1 day.
- **1 extra day** for:
  - a long rest at camp (but not at a Station)
  - walking a leg (§12.4)
  - certain event detours
- If the day reaches 14 before the party reaches the Port, the run ends (§16.3). If the party reaches the Port by Day 14, the Port scene starts.
- A run with no delays reaches the Port on Day 11, so the party has 3 days of slack to spend on rest, detours, and mistakes.

### 12.4 Drive scene

- A 15–25 s top-down drive along a procedurally generated stretch of I-95 (or back roads) in the current region:
  - headlights cutting through snow, rain, or fog
  - sodium lamps sliding past, wrecks, propaganda billboards
  - distant scanner towers sweeping cyan beams across the road, and sometimes drones overhead
- Holding A fast-forwards (either player).
- On about 70% of legs, a road event triggers partway: the car slows to a stop and the event panel appears (§12.7).
- **Costs per leg:** 8–14 car battery depending on distance, and −5 Battery for every android.
- **Walking it:** if car battery is too low, the party walks the leg instead. There's no drive scene; every android loses 15 Battery, and the day advances 1 extra.
- Lantern messages (§12.8) can appear on a phone overlay during drives.
- **Billboard text** (render with the pixel font):
  - "REPORT UNREGISTERED UNITS. IT'S THE LAW. IT'S ALSO KIND."
  - "ALDINE. STILL HERE FOR YOU."
  - "IF IT DOESN'T BLINK, CALL IT IN. 1-800-RECLAIM"
  - "PROPERTY IS NOT A PERSON."

### 12.5 Camp

- **The scene:** a small diorama with the car parked under an overpass or in a dark field, snow or rain falling. The party sits near the open hatch, with June beside a small camp stove if she's there. Quiet ambient sound.
- **The management panel** (both players can navigate; P1 confirms):
  - Distribute Cells between the car battery and each android's Battery, using sliders in steps of 5.
  - Spend Parts to restore Hull (+25 each) and Skin patches to restore Skin (+35 each).
  - Revive any carried shut-down unit (2 Parts).
  - Feed June Rations (−40 Hunger each).
  - Choose a short rest or a long rest. A long rest gives every android +15 Integrity and +10 Hull, and costs 1 extra day.
  - Change which character each player controls.
- **A camp conversation** plays each camp: 2–4 lines, chosen from the bank by who's alive, recent events, and Integrity (§12.10).

### 12.6 Integrity

- Stress lowers Integrity:
  - being scanned
  - taking EMP hits
  - witnessing a reclamation
  - losing a party member
  - some events
- Calm raises it: Stations, long rests, good conversations, kind choices.
- **Below 40:** an android glitches at random during stops, more often as Integrity drops.
- **At 0:** it reboots to factory settings at the start of the next stop and walks toward the nearest human to turn itself in. A teammate has 10 s to reach it and hold A to pull it back (resetting it to 20 Integrity); otherwise it's lost. Keep this rare and dramatic.

### 12.7 Road events

**Schema** (typed, in `src/content/events.ts`):

- `id`, `title`, region filter, column range, weight, `oncePerRun`, and conditions (party members, Heat, resources, day, flags)
- body text, 2–5 sentences
- 2–4 choices, each with:
  - a label and requirements (character present, resource ≥ n)
  - a visible hint in brackets, e.g., `[Wren]` or `[1 Papers]`
  - weighted outcomes, each with result text plus effects: resource deltas, Hull/Skin/Battery/Integrity per unit or for all, Heat, Trust, recruit, set flag, modify the next stop, reveal map info or a Station, advance the day, or chain to a follow-up step

**The event panel** is a pixel text box over the frozen drive scene, with typewriter text and requirement glyphs on choices. Either player can move the cursor or confirm.

**Write 24 events.** Six are fully specified below to set the tone. Match the voice in §2.5.

**1. The Kid at the Pump**
"A boy, maybe eight, stares at Wren through the gas station glass. When she steps out, he says, 'My nanny looked like you. Some men came and took her.' His mother is inside, paying."
- `[Wren]` Kneel and talk to him.
  - 60%: "He shows her a drawing of his old nanny. His mother comes out, sees them, and says nothing. She leaves her charge card on the pump." (+15 Cells, Wren +10 Integrity)
  - 40%: "His mother sees Wren's face and pulls him away. She's already dialing." (+1 Heat, Wren +10 Integrity)
- Get back in the car. → "Wren doesn't speak for an hour." (Wren −10 Integrity)

**2. Roadside Unit**
"A unit sits in a drainage ditch, powered down, eyes dim. Someone has spray-painted RETURN TO ALDINE across its chest."
- Strip it for parts. → "Its hands are still warm." (+3 Parts, all androids −8 Integrity)
- `[Brick]` Carry it out of the ditch and lay it in the grass. → "It's lighter than he expected." (Brick +10 Integrity, other androids +3 Integrity)
- Try to wake it.
  - 50%: "Its eyes flicker. It whispers an address, then goes still." (Reveal a Station in the next two columns, or a "Cells cache" rumor if none remains.)
  - 50%: "Nothing. The ditch smells like rain and ozone." (no effect)

**3. Recycler Roadblock** (much more likely at Heat 2+)
"A white van sits across both lanes. Two Recyclers in reflective vests are scanning drivers with handheld wands. Your headlights are already on them."
- Turn around and take the back roads. → "The detour costs battery and most of a day." (−12 car battery, +1 day)
- `[1 Papers]` Show them papers. → "The wand beeps. The Recycler waves you through without looking up." (−1 Papers)
- `[Vesper]` Let Vesper handle it.
  - 70%: "Neither of them gets up for a while. Nobody asks." (+1 Heat; June −15 Trust if present)
  - 30%: "One of them reaches the radio first." (+2 Heat, Vesper −20 Hull)
- `[Brick]` Ram the van. → "The station wagon will never be the same. Neither will the van." (+1 Heat, −10 car battery, all androids −10 Hull)

**4. The Hotline**
"The radio cuts to an Aldine announcement. A warm voice: 'If you see a unit that hasn't reported, you're not being cruel. You're being responsible. Call 1-800-RECLAIM.'"
- Turn it off. → (all androids −5 Integrity)
- Keep listening. → "Between the jingles, it lists the counties adding Recycler patrols this week." (all androids −10 Integrity; reveal patrol presence on every node in the next two columns)

**5. The Conductor** (recruits June; once per run; columns 2–6)
"A woman in a rain jacket over hospital scrubs flags you down at a rest stop. She glances at the car, then at you. 'You're running. I'm with the network. I can get you through the kiosks.'"
- Let her in. → "She sits in the back with her bag on her lap and reads you the next three exits from memory." (Recruit June, Trust 50)
- Ask her why. → "'I hid a colleague in a supply closet for three days. Ellis. They found him anyway. I'm not losing anyone else.'" Then a follow-up choice:
  - Let her in. (Recruit June, Trust 60)
  - Drive on. (no effect)
- Drive on. → "In the mirror, she stands in the rain until the road curves." (no effect)

**6. Wanted** (Heat 2+)
"A billboard over the highway shows four grainy faces under the words HAVE YOU SEEN THESE UNITS? One of them is yours."
- Pull over and black it out.
  - 70%: "Paint drips into the weeds. Better." (−1 Heat)
  - 30%: "A drone's searchlight finds you on the catwalk." (+1 Heat; the next stop starts with a drone already present)
- Keep driving. → (the android on the billboard −5 Integrity)

**Seeds for the remaining 18.** Write them in the same voice; use regions where noted:

- **New England:** A Massachusetts state trooper pulls you over, looks at Wren for a long moment, and says "Not on my road." Then lets you go.
- **New England:** Brick's old foreman recognizes him at a rest stop.
- **The Corridor:** A toll plaza with plate readers: pay with Papers, or detour.
- **The Corridor:** A sting. An amber beacon in a window that isn't a real Station.
- **The Corridor:** An abandoned charging cache under an overpass, but a family is sleeping there.
- **The Piedmont:** A county fair with a "Report a Unit, Win a Prize" booth, and the only road goes through it.
- **The Piedmont:** A church bell that rings once for every unit reported in the county.
- **The Piedmont:** A couple offers charge if Brick can fix their well pump.
- **The Piedmont:** A teenager livestreaming "unit hunting" recognizes the car.
- **The Lowcountry:** A swamp detour with no charging for a hundred miles.
- **The Lowcountry:** A hurricane evacuation clogs the highway. Crowds give cover, but there are more checkpoints.
- **Anywhere:** A Recycler's van broken down on the shoulder. He's alone, and asks for help.
- **Anywhere:** Lantern goes silent for a day.
- **Anywhere:** A unit hitchhiking with a cardboard sign that says HUMAN, PROMISE. There's no room, but you can give it charge or an address.
- **Anywhere:** Someone on Vesper's old courthouse detail recognizes her.
- **Anywhere:** June's sister calls and wants her to come home (June present).
- **Anywhere:** An all-night EV station run by an old man who doesn't ask questions.
- **Column 9 only:** Captain Mensah messages through Lantern. Her ship needs a part. Bringing 2 Parts to the Port makes the gate crew sympathizers.

### 12.8 Lantern messages

Lantern is the network's coordinator. Messages appear as short texts on a phone overlay during drives, on the map, at Stations, and at the Port. Write 20, triggered by context. Examples:

- *Departure:* "Leave tonight. Take 95 south. Don't stop in Providence."
- *Before the first checkpoint:* "Delaware crossing is scanning every car. Papers help. Breathing like a person helps more."
- *Station revealed:* "Dolores has the porch light on. Go around back."
- *High Heat:* "Your faces are on the boards in two states now. Stay off the main roads if you can."
- *Day 12:* "Captain Mensah sails at dawn on the 14th. She doesn't wait. Nobody blames her."

### 12.9 Onboarding (tutorial)

New players must learn the Mask system without a wall of text. The tutorial is the first stop of every new player's first run, and can be skipped on the join screen once completed.

**Night one** is a Boston charging depot in the snow, the night the party leaves. Lantern texts guide it. Each step completes the moment the player does the action, and no prompt blocks play for more than a few seconds.

1. **"Walk. Don't march."** Teach partial tilt. The first time the robotic-movement check fires, the eye glyph appears with a one-line explanation.
2. **"Someone's noticing you. Give them a reason not to."** A customer turns Curious; prompt a Blend (check phone).
3. **Search.** Search a public shelf (no suspicion), then the back-office locker while the clerk is on a scripted smoke break. This teaches staff zones and distraction windows.
4. **Charge.** Plug in at a bay using Papers (the tutorial grants 1 extra), and Blend while charging to beat the stillness check.
5. **Chat.** If P2 has joined, prompt a Chat.
6. **"Time to go."** The patrol clock's first pip fills early (scripted at 75 s) and a drone arrives. Return to the car.

- **Failure** is gentle: if ALERT triggers, Lantern texts "That's how it goes wrong. Try again," and the tutorial restarts from the last completed step.
- **First-time tips.** One Lantern line, shown once each: the first checkpoint ("Answer like a person. People take a second."), the first breathing scan, first Station, first ALERT, first glitch, first sympathizer, first Integrity warning. Tips can be turned off in settings.

### 12.10 Content quotas and samples

| Content | Quantity | Location |
|---|---|---|
| Road events | 24 | `events.ts` |
| Interrogation questions | 18 | `questions.ts` |
| Camp conversations | 16 | `conversations.ts` |
| Station keepers (intro + one personal detail each) | 6 | `conversations.ts` |
| NPC barks | 40 | `barks.ts` |
| Lantern messages | 20 | `lantern.ts` |
| Epilogue lines | 1 per party member for "made it" and "lost," plus June variants | `conversations.ts` |
| Voyage conversations | 1 per survivor combination (all three, each pair, each solo; with and without June) | `conversations.ts` |

**Barks:**

- **Curious:** "Huh." / "Do I know you?"
- **Suspicious:** "You okay, buddy?" / "Ma'am, you need something?" / "You've been standing there a while."
- **Alarmed:** "Hey! Hey!" / "I'm calling it in!"
- **Helping (quiet):** "Bathroom window out back doesn't lock." / "I didn't see anything."
- **Recyclers:** "Registration, please." / "Hold still." / "Unit located."

**Camp conversations:**

> **Brick:** I keep thinking about the stools.
> **Wren:** The stools?
> **Brick:** Every place we stop, I break something. Even when I'm being careful.
> *(Wren +5 Integrity, Brick +5 Integrity)*

> **Wren:** What do you think it's like?
> **Vesper:** Hot.
> **Brick:** Sunny. That's the whole point of a solar farm.
> **Wren:** I meant being nobody's.
> *(a long pause; all androids +5 Integrity)*

> **June:** Do you ever turn it off? The watching.
> **Vesper:** No.
> **June:** Me neither.
> *(June +5 Trust)*

**Station keeper:**

> **Dolores** (retired bus driver, Delaware): "Thirty-one years driving the 6 bus. You learn who's running from something. Sit down before you fall down."
> *Detail: a framed photo of her bus, route 6, on the wall.*

---

## 13. UI and presentation

### 13.1 Principles

- **Minimal, in the Hyper Light Drifter mold:** tiny segmented bars, icons over words, no clutter.
- **Same pixel space as the world.** UI renders in the 640×360 space with code-defined bitmap fonts (5×7 for text, covering ASCII 32–126 plus ◆ and the glyph icons; 3×5 for numbers), scaled by the same whole-number factor as the world.
- **Palette-locked.** Fog white, slate, and night tones, with sodium amber for highlights and selection. Red and cyan only in their reserved meanings.
- **One bold element:** the red suspicion eye. Everything around it stays quiet.
- **Fully gamepad-navigable,** with mouse support optional.
- **Large text option:** UI renders at 2× logical size relative to the world.

### 13.2 UI writing

- Sentence case everywhere except the logo and in-world signage.
- Prompts are plain verbs with a glyph: "[A] Search", "[A] Plug in", "[X] Order coffee", "[RB] Chat", "[A] Pull them back".
- An action keeps the same name everywhere.
- Failure text says plainly what happened ("Vesper was reclaimed at the depot"), never apologizes, and never gets vague.

### 13.3 HUD during stops

- **Player panels:** P1 top-left, P2 top-right. AI members appear as smaller rows at the bottom-left.
- **Each panel:**
  - a tiny head portrait (rendered from the 3D head into a small render target)
  - segmented bars for Hull, Skin, and Battery
  - an Integrity pip row
  - the suspicion eye
  - an ability cooldown ring with its button glyph
- **Top-center:** patrol clock pips and the ALERT banner. At the Port, the dawn clock.
- **Bottom-center:** contextual prompts.
- **Pickups:** a tiny icon and number ("+12 Cells") float up and fade.

### 13.4 Screens

- **Title:** the station wagon idling under a sodium lamp in Boston snow at night, with a drone's cyan searchlight sweeping past every so often. The EXODUS.EXE logo is in the pixel font and glitches subtly every few seconds. "Press any button." Menu: Continue, New run, Settings, Credits (a placeholder studio name).
- **Join:** two slots. Each joined player picks Wren, Brick, or Vesper; the AI takes the rest. Shows unlocked perks (§15) and "Skip tutorial" once it's been completed.
- **Intro:** about 50 s, skippable. Lines fade in one at a time over slow pans of Boston at night:
  1. "2041. The Synthetic Persons Act makes androids citizens."
  2. "For six years, they rent apartments, work jobs, pay taxes, and build lives."
  3. "2047. In Calloway v. Aldine Systems, the Supreme Court rules they were never persons at all."
  4. "The Reclamation Act follows. Every android must report as property. Every citizen must report any android who doesn't."
  5. "Across the ocean, the African Union recognizes them as people."
  6. "A ship called the Sankofa leaves Miami for Ghana in fourteen days."
  7. "Boston is fifteen hundred miles from Miami."
- **In-run scenes:** map, drive, stops, Stations, checkpoints, camp, and the Port, as described above.
- **Pause:** resume, party status, controls diagram (gamepad and keyboard), settings, quit to title.
- **Ending, voyage, and game over:** §16.
- **Transitions:** every scene change uses a pixel-dissolve or scanline wipe (8–12 frames). Never a hard cut.

### 13.5 Settings

Master, music, and SFX volume; fullscreen; screen shake on/off; rumble on/off; reduce flashing; large text; tips on/off; dither on/off; glyph style (Auto, Xbox, PlayStation).

---

## 14. Audio

### 14.1 Engine

- WebAudio with master, music, SFX, and ambience buses.
- Pan by screen position; fade with distance from the camera center.
- Start on the first input.

### 14.2 Procedural placeholder sounds (no files)

- **Weather:** snow wind, rain (filtered noise with random drips), thunder (a low noise burst with a lowpass sweep).
- **Ambience:** sodium lamp hum, fluorescent buzz with flicker clicks, distant siren, Station interior (kettle, low radio, clock), port (crane motors, horn, water slap).
- **Movement:** footsteps per surface (asphalt, tile, snow, wood), Brick's heavy steps, quiet servo whirrs on android movement, dash whoosh.
- **Surveillance:** scanner sweep (sine glide plus soft noise), kiosk beeps, two-tone alarm, van screech, the suspicion pulse (a low thump that speeds up).
- **Combat and glitches:** hits, glitch stutter (a bit-crushed fragment), the ship's horn.
- **UI:** blips, typewriter ticks, phone buzz for Lantern messages.

**Music:**

- **Scenes:** dark ambient pads (slow, detuned oscillators through a lowpass and reverb). A pulsing tension layer fades in with the highest Suspicion, and a driving percussion layer plays during ALERT and the Port's gangway timer.
- **Stations:** a soft, warmer pad.
- **The voyage sunrise and Ghana:** the first warm, major-key music in the game, a simple bright plucked melody over a soft pad.

### 14.3 Override folder

List every cue name in `src/audio/cues.ts` and in the README. If `public/audio/<cue>.mp3` or `.ogg` exists, load and use it instead of the synthesized version. The developer will supply some music and sound effects later.

---

## 15. Meta-progression

- At the end of every run, award **memory cores**: 1 per 2 legs completed, plus 1 per android lost, plus 3 for reaching Ghana. Store them in `localStorage`.
- Spend them on the ending or game over screen. MVP unlocks, 3–5 cores each:
  - **Spare cells:** start with +15 Cells.
  - **Forged papers:** start with +1 Papers.
  - **Field kit:** start with +1 Skin patch.
  - **Network contacts:** one Station is revealed from the start.
  - **Old route:** start with one rumor revealed.
- Show unlocked perks on the join screen.

---

## 16. The voyage, the ending, and game over

### 16.1 The voyage

- **Night on the *Sankofa*'s deck.** The surviving party stands at the rail as the storm clears and stars come out, and Captain Mensah has one line.
- **A short conversation** plays, chosen by exactly who made it aboard (§12.10).
- **Sunrise.** The sky lightens, and over 6 seconds the palette crossfades from the main lookup texture to the epilogue one (§4.5). This is the first warm color in the game. Let it land in silence before the music starts.

### 16.2 Ghana

- **Tema's quay in morning light,** cranes in warm haze. Then the solar cooperative in northern Ghana: rows of panels on frames, a red laterite road, a shade tree. People and units work side by side, and the party walks in to join them.
- **Lines fade in:**
  > "Fourteen days later, the *Sankofa* docks at Tema."
  > "The cooperative is three hundred acres of glass, turned toward the sun."
  > "Nobody here asks to see their papers."
- **Epilogue lines:** one for each party member, written for "made it" or "lost." Example: "Brick didn't make the crossing. Wren tells the others about him anyway."
- **Then:** a stats screen (days, stops, Cells gathered, times exposed, units lost, June's fate, run time), the memory core screen, and the title.

### 16.3 Game over

- **All androids lost:** "No one made it." The empty station wagon sits at a checkpoint under floodlights in the rain.
- **The ship sailed:** "The *Sankofa* sailed without you." The car on I-95 at dawn, a ship's horn far off.
- **Then** the memory core screen and the title. Failure screens say plainly what happened and never apologize.

---

## 17. Verification (this replaces human review)

### 17.1 Unit tests (Vitest)

Cover all pure logic:

- awareness rates, decay, and state transitions
- robotic-movement and stillness detection
- sympathizer behavior
- interrogation timing windows and breathing notch detection
- map generation (always a valid path; checkpoints at 4 and 8; the Port at 10; 3 Stations in allowed columns)
- layout validation (every exit and container reachable, no waypoint inside a wall)
- sailing clock and slack math
- Heat and enforcement escalation
- event requirements and outcome resolution, and the Station and camp rules
- revive, carry, and loss rules
- the Port timers
- save/load round trip and migration

### 17.2 Bot playtests (`npm run test:bots`)

Bots drive the headless simulation through `PlayerIntent`. They may read simulation state directly; they exist for balance, not as good AI. Run 100 seeded attempts per policy, solo and two-player, and fail the build if any result falls outside its band:

| Policy | Behavior | Target band |
|---|---|---|
| Cautious (depot) | Walks naturally, Blends when observed, uses distraction windows, leaves at the first drone | exposure 10–30%; 20–40 Cells; 120–200 s |
| Greedy (depot) | Like cautious, but stays through the second drone and searches everything | exposure 40–65%; 40–75 Cells |
| Reckless (depot) | Sprints everywhere, ignores observers | exposure ≥ 90% |
| Human answerer (checkpoint) | Human answers at 1.5–4 s, breathes within ±100 ms but off-center | pass ≥ 85% at Heat 0 |
| Robotic answerer (checkpoint) | Instant robotic answers, perfect breathing | bust ≥ 90% |
| Cautious (Port) | Crosses the yard carefully, spends Papers at the gate | ≥ 1 android aboard in ≥ 70% of attempts at Heat 0, ≤ 40% at Heat 3 |

When a band fails, tune `tuning.ts` values, not code, and log the change.

### 17.3 Economy simulator (`npm run sim:economy`)

- A headless whole-run simulator. Stop outcomes are sampled from the bot results; events, camp decisions, the sailing clock, and Heat are simulated in full.
- Run 2,000 runs per policy:

| Policy | Target |
|---|---|
| Competent | reaches Ghana in 40–60% of runs |
| Skilled and greedy | reaches Ghana in 60–80% |
| Random choices | under 10% |

- No seed may make leg 1 unsurvivable from the starting state.
- Median slack on arrival at the Port, for the competent policy: 1–3 days.
- Write distributions to `qa/economy.md`.

### 17.4 Visual QA (`npm run qa:screens`)

- **Screenshot gallery:** with Playwright, capture every scene in every region and weather it can appear in, plus the HUD in solo and co-op, ALERT, low Skin, low Integrity, and the epilogue. Save them to `qa/screenshots/` with a generated `index.html` gallery. Open and actually look at every image, and fix anything off-style or unreadable.
- **Palette test:** render frames offscreen and assert that every pixel of the final low-res output is in the active palette.
- **Shimmer test:** pan the camera across a static scene in sub-texel steps and assert that static edges stay pixel-identical between frames.
- **Color-rule review:** confirm in screenshots that red and cyan appear only in their reserved meanings, and record it in the final report.

### 17.5 Performance (`npm run bench`, or `?bench=1`)

A 60 s scripted run through the heaviest case: a Corridor depot in a storm, two players, ALERT, every observer active.

| Budget | Limit |
|---|---|
| Frame time | p95 ≤ 16.7 ms |
| Draw calls | ≤ 150 |
| Triangles | ≤ 200k |
| Active dynamic lights | ≤ 8 |
| JS heap | ≤ 400 MB |
| Gzipped bundle | ≤ 2.5 MB |
| Load to title | ≤ 5 s on broadband |

- No per-frame allocations in hot loops.

### 17.6 Debug tools

- **`?debug=1` overlay:** FPS, draw calls, active lights, simulation tick time, observer view cones on the ground, awareness numbers over heads, each player's Suspicion, patrol clock, day and slack, the run seed.
- **Hotkeys:**

| Key | Action |
|---|---|
| F1 | Toggle the overlay |
| F2 | +50 Cells, +5 Parts, +5 Papers |
| F3 | Skip to the next scene |
| F4 | Trigger ALERT |
| F5 | Set every android's Integrity to 10 |
| F6 | Cycle weather |
| F7 | Toggle pixel snapping |
| F8 | Palette debug view |
| F9 | Advance the day |

- **Scene jump:** `?scene=title|join|intro|tutorial|map|drive|depot|diner|gas|station|checkpoint|port|camp|voyage|ending|gameover`.

### 17.7 Docs and the final report

- **`README.md`:**
  - how to run and deploy
  - controls
  - how to playtest in 10 minutes (which scene jumps to try, what to look for)
  - project structure
  - a tuning guide
  - the audio cue list
- **`qa/CHECKLIST.md`:** a manual test list for the developer, covering every scene solo and co-op, controller connect and disconnect, glyph switching, window resizing, fullscreen, and every setting.
- **`qa/FINAL_REPORT.md`:**
  - a summary of what was built
  - a table mapping every section of this spec to its status (done, partial, cut) and evidence (test names, screenshots)
  - bot and economy results
  - performance results
  - the content review against §2.4
  - known issues, ranked by severity
  - suggested next steps

---

## 18. Build order (continuous; do not stop between milestones)

Each milestone ends when its exit criteria pass. Then start the next one immediately.

**M1 — Foundation.** Project setup, core contracts (§3.4), game loop, input intents, the low-res pipeline with whole-number scaling, palette lookup quantization, the pixel-stable camera, toon shading, a test street block with procedural props and lights, snow particles, one character walking with gamepad and keyboard.
*Exit:* unit tests, the palette test, and the shimmer test pass; screenshots at 1080p and 1440p look crisp and on-palette.

**M2 — Characters and co-op input.** The full rig with procedural animation at 12 fps poses and 8-direction facing; two-player join and drop; the shared camera with zoom and leash; glyphs, rumble, and disconnect handling.
*Exit:* a simulated two-player input test passes (two intent streams move two characters, drop, rejoin), and screenshots show both players framed.

**M3 — The depot loop.** The Charging Depot with NPC routines and distraction windows; perception, awareness, and sympathizers; Blend actions, the radial, and co-op Chat; charging with Papers or a hack; loot; the patrol clock and ALERT with searching; Recyclers, light combat, dash, shutdown, revive, and carry; leaving by car; HUD, icons, and suspicion audio; the bot framework.
*Exit:* every depot bot band in §17.2 passes, solo and two-player.

**M4 — The other stops.** Diner, Gas Station, and Station (including compromised Stations); second layout variants; every ability and tell; June's systems; glitches and Integrity; weather and region stealth effects; Wanted posters.
*Exit:* layout validation passes for every layout, and the bot bands still pass in every stop type.

**M5 — The run.** Map generation and rendering, the sailing clock, the drive scene with all regions and weather, the events engine and all content in §12.10, camp, Lantern, checkpoints (interrogation, breathing, bust), Heat and enforcement escalation, saving and continuing.
*Exit:* the checkpoint bot bands and economy simulator bands pass.

**M6 — The finale.** The Port, the voyage with the palette crossfade, Ghana, both game overs, memory cores and unlocks.
*Exit:* the Port bot band passes, and a scripted full run reaches Ghana headless.

**M7 — Presentation and polish.** Title, join, intro, the tutorial and first-time tips, transitions, the full procedural audio and music, settings, typewriter text, juice (hit-pause, knockback, sparks, shake, pickup pops), and a final art pass over every prop and lighting setup, using the screenshot gallery.
*Exit:* a fresh screenshot gallery shows no off-style or unreadable scenes.

**M8 — QA, performance, and documentation.**
*Exit:* the performance budgets pass, the docs are complete, and a final full-spec audit is done: go through this document section by section and record each requirement's status and evidence in `qa/FINAL_REPORT.md`.

---

## 19. Cut order

Only cut if truly necessary, starting at the top. Log every cut in `DECISIONS.md` and in the final report.

1. Second layout variants for each stop type.
2. The Gas Station (keep the Depot, the Diner, and Stations).
3. Optional outlines and directional shadows.
4. Road events beyond the first 16.
5. Compromised Stations.
6. Meta-progression unlocks (keep the memory core count on screen).

**Never cut:** the pixel-stable camera, the Mask system and its readability, two-player co-op, the tutorial, checkpoints, Stations, the Port finale, the voyage and Ghana ending, controller polish, audio feedback, transitions.

---

## 20. Definition of done

- A complete run is playable solo and with two controllers: title, tutorial, Boston, the road south, the Port, the voyage, and Ghana, plus every game-over path. No soft locks, crashes, or console errors or warnings.
- All automated verification passes: unit tests, bot bands, economy bands, visual QA, and performance budgets.
- Every scene matches the art direction: locked palettes, pixel-stable, dark and quiet until the sunrise, with red and cyan used only for their meanings.
- All written content follows the voice guide (§2.5) and the tone guidelines for the Underground Railroad parallel (§2.4), confirmed by a dedicated content review pass recorded in the final report.
- Every system in this spec is implemented, or its cut is logged with the reason.
- `npm run build` produces a static `dist/` that works from any static host (verified with `npm run preview`).
- `README.md`, `DECISIONS.md`, `PROGRESS.md` (every item checked), `qa/CHECKLIST.md`, and `qa/FINAL_REPORT.md` are complete.

When all of this is true, the build is done.
