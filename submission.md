# Rangoli Rush: Devpost submission text

**Competition:** Meta VR Start Developer Competition 2026 (deadline Nov 18, 2026, 12:00 PM PST)
**Track:** Gaming
**Division:** New Experience

## Project name
Rangoli Rush

## Tagline (≤140 characters)
Pinch glowing powder, brush petals and light up a rangoli on your real table: a seated, hands-only mixed-reality puzzle.

(120 characters)

## Links
- Play on Meta Quest (Quest Browser): https://hassaanraja282-lgtm.github.io/rangoli-rush/
- Try in a desktop browser (IWSDK emulator): https://hassaanraja282-lgtm.github.io/rangoli-rush/emulator/
- Source code: https://github.com/hassaanraja282-lgtm/rangoli-rush
- Demo video: demo.mp4 (75 s, 1920x1080 H.264 + AAC; gameplay captured in the IWSDK emulator and labelled as such; soundtrack is the game's own procedural sound re-synthesised, no licensed music). Upload to YouTube/Vimeo and paste the link here.

## Description (~400 words)

**Inspiration**
In India, homes greet guests with rangoli: patterns of coloured powder drawn on the floor at Diwali, weddings and the start of a new season. It's tactile, social and short. You pinch powder between thumb and finger and let it trickle into a petal. That pinch is the most natural gesture on Quest hand tracking, so we asked what rangoli would feel like if your living-room table became the courtyard floor.

**What it is**
Rangoli Rush is a seated, hands-only mixed-reality puzzle. A chalk-outlined rangoli appears on a slate tile in front of you, tilted like a drafting table, with brass bowls of powder at your sides. Pinch inside a bowl to scoop powder, keep pinching and brush over the petal that needs that colour, or flick your wrist to throw powder across the board. Matching fills burst with particles and temple-bell chimes. Quick fills build a combo, and its notes climb a Bhupali pentatonic scale. A 30-second tutorial teaches pinch, brush and flick inside the first minute, then three levels ramp from two to five powders. A **Daily Rangoli**, generated from the date, gives everyone the same new pattern each day and keeps a local streak, which is your reason to come back tomorrow.

**How we built it**
The game runs in the browser with WebXR, built on the **Immersive Web SDK** (IWSDK 1.1, three.js) as a single ECS system. It requests an `immersive-ar` session, so on Quest the rangoli sits on your real table under passthrough. Without passthrough, a procedural dusk courtyard with string lights and diyas appears instead. Pinch is detected from raw hand-joint poses with hysteresis. Flicks are judged from the hand's fastest velocity in the ~150 ms before the fingers open, projected onto the board plane, so a throw still counts as the hand slows, and head gaze plus pinch selects bowls and buttons at a distance. The HUD lazily follows your head yaw so it stays in your comfortable field of view, and the whole layout fits within a 2-foot radius of a seated player. Every mesh, texture and sound is procedural: segments are generated from ring definitions, powder is a pooled GPU particle system, and the music and sound effects are synthesized live with WebAudio. Nothing downloads at start, so cold start stays fast. We tested end to end in IWER, the IWSDK WebXR emulator, driving emulated Quest 3 hands.

**What's next**
More pattern families (kolam dot-grids, mandana, alpana), a festival calendar, a shared "family rangoli" where two people fill one pattern together in co-presence, spatial anchors that remember your table, and a relaxed no-timer mode. Then a Horizon Store PWA release.

## Hand interactions
- **Poke** menu buttons with your index finger, or **look and pinch** from anywhere.
- **Pinch inside a bowl** to scoop powder. A glowing pinch of powder sits between your fingers.
- **Look at a bowl and pinch in the air** to pull powder to your hand from a distance (gaze-assisted, so you never stretch).
- **Hold the pinch and brush** just above a segment to sprinkle powder. It fills in about 0.4 s when the colour matches, and flashes red with a soft thud when it doesn't.
- **Flick:** release the pinch with a quick motion toward the board to throw powder where you aim.
- **Release slowly** to drop powder.
- Everything works with hands alone, seated, within about 0.6 m of your head. Controllers (trigger = pinch) are optional.
- Accessibility: forgiving hit areas, shape glyphs for colour-blind players, and no standing or turning.

## Built with
WebXR · Immersive Web SDK (IWSDK) · three.js · TypeScript · Vite · WebAudio · IWER (emulator testing) · GitHub Pages

## Target launch date
Q1 2027: public web release, then a Meta Horizon Store PWA listing.

## Special-award notes
- **Best First Five Minutes:** zero downloads at start. The tutorial teaches pinch → brush → flick in about 30 seconds and flows straight into Level 1, and the first full rangoli is finished within about three minutes.
- **Best Reason to Come Back:** the Daily Rangoli is a new seeded pattern every day, with a local streak counter and a countdown to tomorrow's pattern.
