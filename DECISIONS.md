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

## M2–M3 — Characters, co-op, the depot loop

- Charging on a spoofed session (Papers or a hack) raises suspicion while watched (+11/s): §8.2 lists "using a charger with a spoofed ID" and androids have no real ID. Papers still beat hacking: no 5 s minigame and no extra +10/s while hacking.
- Lingering (§1.2 "lingering gets you caught"): an observer who has watched a member for more than 20 s gains +3/s rising to +5/s, even for normal behavior. Blending still outpaces it.
- Proximity: awareness gains scale from ×1.35 at point blank to ×0.6 at the edge of an observer's range; guards and Recyclers gain ×1.5 (trained eyes) outside ALERT.
- Patrol clock base times are 125/185/245 s (the spec's ~90/150/210 were starting values), so a cautious visit that leaves at the first drone lands in the 120–200 s band.
- Loot: fewer Cells in containers (charging is the main Cells source), locker Skin patch chance 40%.
- The bots model a person, not a perfect reflex: they react to the eye glyph (Suspicion over 30) after 0.5–1.2 s and let stillness reach 2.5–5 s before covering it. Calibrating against perfect reflexes made every careful visit risk-free.
- Exposure in the bot bands means any ALERT during the stop.
- Both depots got an exterior staff door into the back hall: from the bays the office was a 20 s walk, longer than the clerk's 15 s smoke break, so the distraction window was unusable.
- Routine breathing scans resolve on the scanned member's side (pass, fail, or cut short by ALERT or a departing scanner). A Recycler leaving mid-scan used to freeze the member forever.
- The parked car blocks its footprint; the party spawns on its camera side; the party AI only heads for exit tiles it can reach.
- During ALERT, hostiles who see a party member gain an extra +60/s (+18/s while Searching) on top of ×3 gains, so Blending doesn't hide you from people already hunting you.
- Guards fight with batons like Recyclers (the spec only describes Recycler combat); civilians never fight.
- An active member outside the exit zone when the car leaves is left behind (lost; June is arrested). The car waits 10 s and the HUD counts down.

## M4 — The other stops

- Bot bands apply in every stop type: exposure (cautious 10–30%, greedy 40–65%, reckless ≥ 90%) and the cautious visit length (120–200 s). The Cells bands stay the depot's, since charging is where Cells come from (§10.9). Band attempts cycle every layout through all four regions.
- Diner, Gas Station, Station, and checkpoint layouts are drawn with a small grid builder (rooms, lines, text), not hand-counted rows.
- The car charges on the depot's rules: the session is spoofed (+11/s while watched), and pumping gas (a Blend) covers it.
- The Gas Station's rotating camera sits on the canopy post by the EV charger (140° sweep). Its first drone circles the forecourt, and the second sweeps back and forth along the pumps.
- Diners park the car at the far edge of the lot (§10.1 puts the exit zone at the lot edge). Their drone patrols back and forth along the far side of the lot, sweeping the lot and the front windows. With the car at the door, a diner visit was nearly risk-free.
- A layout can give the second drone its own beat (route `drone2`); otherwise it flies the first one's the other way round. Drones come in over a random point of their loop.
- The patrol clock is approximate: each patrol comes up to 8 s early or late (seeded), so a stop's danger doesn't hinge on one exact timing.
- Lingering ramps to +10/s (was +5/s, then +7/s). Blend fatigue: after 40 s of watching someone, an observer's Blend drop fades over 200 s to 45%.
- Drone searchlights expose anyone inside at +36/s (×1.5 for trained eyes), so a sweep catches anyone it holds for about two seconds.
- Anyone's running footsteps carry 4 m (Brick's tell carries further). Sprinting through a kitchen behind the cook's back is heard.
- After 20 s inside a diner without ordering, the waitress gets Curious (awareness 30) on top of the skipping-needs rate (§10.3).
- One coffee order covers the table: everyone present gets coffee.
- Party AI: waits just outside a staff room instead of trailing its player in. When left behind, it catches up at an easy walk (60% of brisk) even if its player has stopped; it used to crawl at 0.7 m/s and get caught in the open. AI Brick avoids stools. AI Vesper never snaps her head, since the tell is the player's to manage.
- Bots model what a player sees. They notice the eye glyph (Suspicion over 30) after 0.5–1.2 s, and a cautious bot backs off a private search once it does (it used to abort at a hidden 25). They watch staff, guards, Recyclers, and cameras, not every customer's gaze.
- Bots loiter like customers when idle (browse near the store, or take a booth with coffee). Two-player bots Chat when side by side. Greedy bots stay until 40 s after the second drone and retry a container they backed off from after 25 s. Bots wait at the car for the party (the AI within 6 m, the other player within 3 m) for up to 45 s.
- Two-player bots split the work: at depots and gas stations Brick searches while Wren charges. At diners Wren searches while Brick sits, because his footsteps make him a poor sneak in a crowded room.
- Stations: the keeper greets the party the moment a player steps inside, and the conversation plays in a typed dialogue box (A finishes a line, then moves on; B skips). The Station panel follows: what the keeper fixed, what else the Station gives, the two trades, "Look around first", and "Rest here". Talking to the keeper again reopens the panel.
- The keeper's care (+25 Hull, +25 Skin, +20 Integrity per android) applies once per visit, when the panel first opens. June's free meal, the rumors, and the free long rest are listed there and applied by the camp (M5).
- The car can't leave from a Station. The party rests there instead, and the scene ends with a "rested" outcome.
- Near the keeper's personal detail (by the fridge, the back-room door, or the walk-in cooler), a caption describes it. The props themselves come with the art pass.
- Compromised Station: the van is parked outside from the start. One Recycler goes through the house and one walks a beat around it, on loops generated from the house's walls and floor. Lantern's warning shows on arrival. The lamps are mostly off. Careful bots take the bag every time; reckless ones get caught every time.
- Lantern texts use a phone overlay at the bottom left that types the message in, holds it long enough to read, and slides away. Messages queue.
- June's Patch is an ability press, not a hold. It runs its 4 s without A held and stops if the patient walks off. It used to need A held, which cancelled it on the first frame.
- Losing any party member costs every android still with the party 15 Integrity, the moment it happens: reclaimed, left behind, turned in, or June arrested. It used to apply only to reclamations.
- Heave shoves vending machines, the only free-standing heavy fixture in the layouts.
- June's run-level systems are pure functions for the camp and the events engine: Hunger per leg, Rations at camp (free at a Station), starving, leaving at 0 Health, Trust and the quiet goodbye below 20, Heat from logged kiosk sessions, and Stations shown two columns ahead.
- Wanted posters: one small poster per android (a red header, hair or hat, skin, jacket, a line of print), pinned on the corkboard as unlit paper at Heat 2+. Gas stations got a corkboard in the store.

## M5 — The run

- The map: columns after a single node (Boston, the checkpoints) hold two towns, so every town stays reachable; the others hold 2–3. Roads never cross. Town names go column by column down the real route; the checkpoints are the Delaware River and Savannah River crossings; a keeper's town is theirs alone.
- A hidden Station shows on the map as an ordinary stop type (a decoy) until its beacon is revealed.
- Rumors attach to nodes. A Cells cache, Recycler activity, or sympathetic staff changes that node's stop; a patrol rumor shows patrol presence; a Station rumor reveals the Station. The diner TV adds rumors about the next two columns.
- Each leg advances the day when the party sets out. Walking is decided by the car battery against the leg's cost. Road events roll only on driven legs, never on the leg into the Port.
- Heat rules live with the run: +1 for an ALERT stop, +0.5 per knockout, +1 per two logged kiosk sessions, +1 per bust; −0.5 at the end of a leg with no ALERT, and another −0.5 at a Station.
- Checkpoint tuning: "too fast" costs +25 (was 15), "too regular" breathing costs +30 (was 15), and the party AI breathes right 92% of the time (was 85%). With the spec's values, a solo robotic answerer was busted only 72% of the time, because the AI's human answers diluted the player's. Now the human answerer passes 90% solo and 100% two-player at Heat 0; the robotic one is busted 96% and 100%.
- June vouches for the android with the lowest Integrity unless the players choose. The guard alternates between the androids question by question.
- The economy simulator plays whole runs headless and samples each stop from a library of stop-bot outcomes: every stop type, compromised Stations, and checkpoint busts, for three bot policies at Heat 0 and 2. It applies each outcome as a change to the run. Charging that overflows a full Battery becomes Cells.
- Economy tuning to hit the §17.3 bands. With the spec's starting values, energy was so loose that careful runs never wanted for charge. Each leg now drains 10 Battery per android (was 5) and 12–18 car battery (was 8–14). Heat decays 0.25 per quiet leg (was 0.5). Results over 2,000 runs: competent 53% reach Ghana (median slack 2 days), skilled and greedy 66%, random 7%.
- A checkpoint is stress: each android loses 10 Integrity watching a unit led to the van in the queue (witnessing a reclamation) and 4 for its scan.
- The skilled and greedy policy is greedy while Heat can still decay and careful from column 7 or Heat 1.5. It trades Parts for Papers and never Papers away, since Papers carry the Port gate.
- Until the Port has its own bot results (M6), the simulator models it: 50% at Heat 0 for a careful party, +10 points per Papers spent at the gate, +8 for Captain Mensah's part, −12 per Heat level. With the starting two Papers that gives 70% at Heat 0 and 34% at Heat 3, the Port band.
- Checkpoint busts: raising the barrier keeps its progress when a hit knocks someone off the switch, and only the two guards are on site. The Recyclers come by van like any ALERT. The guards used to swarm the booth with a Recycler and a gunner already there, and 71% of solo busts lost a unit.
- Bot stops start after a leg's drive drain (now 10 Battery). A checkpoint bust compound always starts in ALERT with the gate down; bots raise it from the booth, then leave.
- The run flow is one controller (`src/scenes/runflow.ts`) that the scenes call back into: map → drive (or straight to arrival when walking) → stop, Station, compromised Station, checkpoint, or the Port → camp → map. The run state lives there and in the save slot; scenes only read it.
- Autosave happens when camp starts (at a Station too) and when camp ends. A saved camp remembers whether it was at a Station, so Continue reopens it in the keeper's light. The camp conversation rolls after the save, from the saved seed, so a resumed camp plays the same conversation.
- The map diorama is built from the same kit as the stops: amber road lines between nodes, a cluster of small lights per town, a coastline on the right, a pulsing amber beacon over each revealed Station, and the car marker crawling to the chosen town over 1.6 s. The selected node's info panel shows its type, region, crowd, patrol presence, and rumors.
- Drives last 15–25 s (seeded per leg). The road is a corridor of props (jersey barriers, sodium lamps, wrecks, regional dressing, billboards with the four slogans painted in the pixel font) that scrolls past the parked car's lit pool. Scanner towers sweep a thin cyan beam; holding A fast-forwards ×4. A road event stops the car 35–65% of the way along.
- Road events open a panel over the stopped car with the event's text and its choices, each with its requirement in brackets ([Wren], [1 Papers]). Choices the party can't take show dimmed. The outcome text replaces the choices until A is pressed; either player can choose.
- The camp panel uses ◀ ▶ sliders for Cells (steps of 5). Repairs, patches, and revives list only the androids who need them. Either player moves the cursor; only player 1 confirms.
- Checkpoint scene: a 7 s queue (a unit is led to the van ahead of the party), then the guard's questions in a tall box with the answers listed below it. Answers appear 0.4 s after the question so a reflex press counts as too fast. The AI's answers take 1.6–3.4 s. The breathing scan shows each player's ring. A meter of 70–99 offers Papers; a bust drops the party into the checkpoint stop with the gate down.
- The Port is a placeholder scene in M5. It resolves the crossing with the economy simulator's model, so runs can finish end to end until the M6 Port replaces it.

## M6 — The finale

- The Port's layout, north at the top: the Sankofa's berth and gangway; the open apron; the terminal fence (chain link: see-through, not climbable) with the gate's scanner arch; the container yard (stacks in strips with narrow aisles, a main aisle to the gate, three truck lanes); the waterline path along the west quay edge outside the yard fence; the perimeter fence with two holes cut in it; the landside lot where the car is left. The gangway has rails along both sides, so it's boarded only at its foot.
- Trespassing: being seen in the yard, on the waterline path, or on the apron without having come through the gate raises awareness at +9/s. The lot and the queue at the gate are public. The yard is a stealth crossing, not a walk.
- At the Port, the container stacks shadow the drones' searchlights (the stacks are taller than the beam is steep). Elsewhere drones still see over everything.
- The arch takes 1 Papers per android (+1 for a carried unit), or a 4 s breathing scan. The scan starts 10 points warier per Heat level, like checkpoint guards (§11.6). June walks through. ALERT locks the arch, so a party exposed in the yard has to take the waterline path. If Captain Mensah's part was delivered, the 2 Parts are handed over at the gate and her friends there wave the party through, even under ALERT.
- Moving cover: three yard trucks shuttle along the truck lanes, and a gantry crane carries a container low across the apron. They block sight and movement, and stop for anyone in their way.
- The horn sounds at the first step onto the gangway or at 5:30. Every hostile goes to ALERT and makes for the gangway's foot, and 2 more Recyclers come out of the terminal. The ship sails when the 60 s gangway timer ends, at 6:00, or as soon as nobody is left ashore.
- ALERT before the horn: the terminal sends 2 + 1 per Heat level Recyclers (like the van, §8.6) to secure the berth. They hold posts around the gangway's foot, chase only within 4 m of their posts, and brace against knockback.
- Heat at the Port: 2 + 1 per Heat level Recyclers walk the yard (spec), and from Heat 1 one Recycler per Heat level stands across the gangway's foot ("they know you're coming"). Another yard drone joins every 2 Heat levels, and an apron drone from Heat 1. Two drones fly the waterline path.
- Mensah's crew won't lower the gangway onto Recyclers: while any active Recycler is within 5 m of its foot, the foot is up and the party has to clear the berth. Whoever is already on the gangway keeps climbing. Hostiles never go up the gangway.
- Combat (§8.9, "costly"): a light hit no longer stuns a Recycler or breaks its telegraphed swing; a charged heavy staggers it for 0.6 s and breaks the swing. Mashing light hits used to hold any number of Recyclers down, which made every fight free.
- Party AI at the Port follows its player through the arch (Papers first, else the scan), waits on the apron side rather than walk all the way round while its player is still in the yard, and helps clear the berth. AI members fight with light swings only (AI Brick used to throw instant heavies a player has to charge for).
- A shut-down unit carried in the car is laid by the car at the Port, to be carried aboard.
- Port bot band (§17.2, cautious, spends Papers at the gate; 60 attempts): at least one android aboard 97% at Heat 0, 77% at Heat 1, 52% at Heat 2, 13–17% at Heat 3.
- The Port scene dresses the stop view. The Sankofa lies alongside with her waterline 2 m down, so her deck meets the top of the gangway, and her deck lamps burn at 70%. The gangway is hinged at the deck and its foot swings up while the berth is held. The crew's beacon double-flashes, faster after the horn. The yard trucks back up rather than turn, and the gantry crane is drawn at 45% of its height so its girders don't hide the apron.
- Yard and apron containers are real containers, one or two high. A strip of them drops low while anyone stands just behind it (north of it, away from the camera). The cutaway rule walls follow statically, done dynamically here, so nobody is hidden in an aisle.
- `&` renders as chain link at the Port and as a striped barrier elsewhere (the checkpoint's barrier was invisible). The Port has its own surroundings: the harbor north and west, the terminal's sheds east with a lit door where the Recyclers come out, the city south. Floodlights on the fence replace the generic streetlamps.
- Colour rule (§4.5): the palette lookup's reserved-hue gate is now about 18° (was about 32°). Amber light on rust paint lands about 23° from alarm red in OKLab hue and was quantizing into red rings around the Port's lamps.
- The run ends the moment the ship sails or a game over hits: memory cores are awarded once, the save slot is cleared, and play time stops counting. "Legs completed" is the run's leg count; an all-lost game over counts every android as lost.
- Unlocked perks apply to every new run. Network contacts reveals one random hidden Station; Old route adds one rumor about a stop ahead. Both use their own seeded streams, so the run's own rolls don't change.
- The core screen opens with the cursor on Continue and ignores input for 0.8 s, so pressing through the ending never spends cores by accident. Both players move the cursor; player 1 confirms; owned or unaffordable perks are dimmed.
- Shut-down units carried aboard are brought back online by the ship's engineer before the deck scene.
- The voyage: no music on the night deck, only sea and rain. The storm clears over 9 s (the rain eases, the clouds part, the stars come out). Mensah speaks at 6.5 s, then the conversation plays (A advances, B skips). The sunrise starts 2 s after the talk, never before the storm has cleared, crossfades the palette over 6 s, holds 3 s of silence, and then the epilogue music starts. The sun rises just right of the party. The mast's crossbar was replaced with a platform, radar, and stays, because it read as a cross with the sun behind it.
- Ghana: the quay at Tema for 9 s (the "SANKOFA — TEMA" name board readable, cranes at either edge, the party coming down the gangway), then the cooperative, where the party walks up the laterite road over 11 s while the lines fade in; then the epilogue lines, the stats, and the cores. It's daylight, so props' lamps don't light the scene, and the quay takes a cooler sky light (warm light shaded its pale concrete green). Text fades in by stepping through palette colors, not alpha.
- June left on the quay gets her own epilogue line, and the stats screen says she stayed at the Port.
- Game overs: "No one made it" over the empty wagon at a checkpoint (tailgate up, barrier down, rain); "The Sankofa sailed without you" over the wagon on the shoulder of I-95 at dawn, hazards blinking, two horns far off. Missing the ship on the road uses the same screen. The text types in over the empty road in the lower third.
- The economy simulator now samples the Port from the Port bot's own crossings, keyed by Heat, Papers on arrival, Mensah's part, and whether an android arrives in low power. Careful parties arrive in good repair but often with one android nearly flat. Heat counts whole levels there, as it does in the Port's simulation.
- Mensah's part: her friends at the gate wave the party through the arch, but not under ALERT (the terminal locks down). It no longer makes most dock workers sympathizers. With the dock-worker boost and the ALERT bypass it made the Port nearly certain, and 35–45% of careful runs carry it.
- At the arch, a player with Papers can still take the breathing scan instead (A shows Papers, X takes the scan), saving the Papers for someone who breathes worse. The Port bot does this when the Papers won't cover everyone behind it, like a sensible player.
- Recyclers holding the berth watch toward where the party was last seen, their gaze sweeping. Facing the apron, they never saw a party coming off the waterline path behind them.
- Port and economy tuning (bands §17.2, §17.3): trespassing at the Port +11/s; the terminal turns out 3 + 1 per Heat level Recyclers at an ALERT; the arch's breathing scan starts 12 points wary (so two missed breaths fail it), +10 per Heat level; androids lose 12 Battery a leg (was 10). The Port band's party arrives with a leg's Battery spent and its Integrity intact, as careful parties do.
- Results. The Port band (100 attempts each) is in PROGRESS.md and qa/FINAL_REPORT.md. Economy, 2,000 runs each: competent 58.9% reach Ghana, skilled and greedy 69.3%, random 3.1%; competent median slack 2 days; every seed survives leg 1.
- Stop band retune after the heavier Battery drain: a spoofed charging session reads +10.7/s while watched (was +11). Depot cautious two-player exposure had crept to 31% (band 10–30%); now 17% solo and 24% two-player, with every other stop band still inside.
