# Manual test checklist

For the developer, before a release (spec §17.7). Play each line solo with a controller, solo on the keyboard, and with two players (two controllers, then one controller plus the keyboard's arrow layout) unless it says otherwise. Note anything that looks off-style or reads poorly, as well as anything broken.

## Start to finish

- [ ] Cold start: the title appears within a few seconds; "Press any button" responds to a controller button, a key, and a mouse click.
- [ ] The title's logo glitches every few seconds; a drone's cyan searchlight crosses the street now and then; the wagon's exhaust drifts in the cold.
- [ ] New run with no save: straight to Join. With a save: "Your saved run will be lost" asks first; "Keep the saved run" goes back.
- [ ] Join: left/right picks Wren, Brick, or Vesper; the two players can't pick the same one; player 2 joins with Start (or Backspace on the keyboard); unlocked perks show; "Skip tutorial" appears only after the tutorial has been completed once.
- [ ] Intro: seven lines over Boston in the snow, about 50 s; holding A hurries it; B or Start skips.
- [ ] Night one: each step completes the moment you do it (walk, Blend, the shelf then the locker during the smoke break, plug in and Blend, Chat with two players, back to the car when the drone comes). Trigger an ALERT on purpose: "That's how it goes wrong. Try again." and it picks up from the last step you finished.
- [ ] The first camp, then the map: either player moves the cursor; the sailing clock is white, amber at 2 days of slack, red at 0.
- [ ] A full run to the Port: drives with road events, every stop type, a Station, both checkpoints (pass one, get busted at one), camp each night.
- [ ] The Port: the dawn clock; the yard's trucks and the crane; the arch (A shows Papers, X takes the scan); the waterline path after an ALERT; Recyclers holding the berth keep the gangway up until they're down; the horn and the 60 s gangway timer; carrying a shut-down unit aboard.
- [ ] The voyage: Mensah's line, the conversation for exactly who made it aboard, the storm clearing, the sunrise crossfading to warm color, three seconds of silence before the music.
- [ ] Ghana: the quay at Tema, the cooperative, the epilogue lines for who made it and who didn't, the stats, the memory cores (spend some; owned perks dim).
- [ ] Both game overs: lose every android (the empty wagon at a checkpoint), and miss the ship (the wagon on I-95 at dawn). Cores are awarded once; the save is cleared.
- [ ] Continue after quitting at the map, and after quitting at a camp (a Station camp reopens at the Station).

## Every stop type

- [ ] Depot, diner, gas station, each layout variant, in each region's weather (snow, sleet, clear cold; rain, drizzle, smog; fog, drizzle, clear; heavy rain, storm, humid).
- [ ] Station: the keeper's conversation, the panel, the trades, resting; a compromised Station (take the bag and go).
- [ ] Checkpoint bust: raise the barrier from the booth and get back in the car.
- [ ] HUD at every stop: player panels (P1 left, P2 right), AI rows, the eye, ALERT and SEARCHING banners, prompts with the right glyphs, pickups floating up.

## Controllers and input

- [ ] Unplug player 1's controller mid-stop: the game pauses with "Reconnect controller for Player 1"; plugging it back in resumes; with two players, player 2 can press Start to continue alone.
- [ ] Player 2 drops out (hold Back for 2 s) mid-stop, then rejoins with Start.
- [ ] Switch between a controller and the keyboard as player 1: the glyphs follow the last device used.
- [ ] Glyph style setting: Auto, Xbox, PlayStation all show the right button names everywhere (prompts, the hack sequence, the pause menu's controls page).
- [ ] Rumble on hits, scans, exposure, and suspicion ticks; off when the setting is off.

## Window and display

- [ ] Resize the window across sizes and aspect ratios: the picture stays crisp (whole-number scaling, no blur), letterboxed, never stretched.
- [ ] Fullscreen from the pause menu, from settings, and with the browser's own key; leaving fullscreen restores the window.
- [ ] Switch tabs mid-stop: the game pauses; coming back, it stays paused until you resume.
- [ ] Pan slowly in any stop: no shimmering on static edges.

## Settings (pause menu and title)

- [ ] Master, music, and sound volume (each step audible; 0 is silent).
- [ ] Screen shake off: hits and the horn don't shake the camera.
- [ ] Rumble off.
- [ ] Reduce flashing: lightning doesn't flash the screen.
- [ ] Large text: every screen still fits (map, camp panel, Station panel, checkpoint, core screen, epilogue).
- [ ] Tips off: no first-time tips; on: each tip shows once, ever.
- [ ] Dither off and on.
- [ ] Settings persist after a reload.

## Debug (with `?debug=1`)

- [ ] F1 overlay (FPS, draw calls, lights, tick time, cones, awareness over heads, Suspicion, patrol clock, day and slack, the run seed); F2 resources; F3 skip ahead; F4 ALERT; F5 Integrity to 10; F6 weather; F7 pixel snapping; F8 palette view; F9 a day forward.
