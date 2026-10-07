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
