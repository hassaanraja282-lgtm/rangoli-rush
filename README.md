# Rangoli Rush

**A seated, hands-only mixed-reality rangoli puzzle for Meta Quest.**
Pinch coloured powder from brass bowls, brush it onto glowing petals and light up a rangoli right on your table. Built with WebXR and the [Immersive Web SDK (IWSDK)](https://iwsdk.dev).

- **Play on Quest:** open **https://hassaanraja282-lgtm.github.io/rangoli-rush/** in Meta Quest Browser and tap **Enter Mixed Reality**.
- **Try it on a desktop:** **https://hassaanraja282-lgtm.github.io/rangoli-rush/emulator/** runs the same game inside IWER, the IWSDK WebXR emulator (Meta Quest 3, hand tracking). You can also click **Play in browser** on the main page to play with a mouse.
- Built for the **Meta VR Start Developer Competition 2026**, Gaming track, New Experience division.

## What it is

Rangoli is the Indian folk art of drawing patterns on the floor with coloured powder, made at doorways for Diwali, weddings and new beginnings. Rangoli Rush turns it into a short, calm puzzle-against-the-clock you play sitting down:

1. A chalk-outlined rangoli appears on a slate tile in front of you, tilted toward you like a drafting table.
2. Brass bowls of powder (haldi yellow, marigold, kumkum, peacock, indigo, leaf, chalk) sit at your sides.
3. Each petal, leaf, band and dot shows a faint tint and a shape symbol for the powder it needs. Fill every segment before the timer runs out.
4. Fill segments in quick succession to build a **combo** (x2…x5). Each fill rings a bell, and the notes climb a Bhupali pentatonic scale as your combo grows.

**Content:** a 30-second tutorial, three handcrafted levels (Marigold Morning, Peacock Courtyard, Diwali Lotus) and a **Daily Rangoli**. The daily pattern is generated from the calendar date, so everyone gets the same pattern that day, and finishing it extends a local streak counter.

**Session length:** about 1 minute per level and 3–6 minutes for a full sitting. Nothing is downloaded at start: every model, texture and sound is generated in code.

## Controls (hands only, no controller needed)

| Action | Hand gesture |
| --- | --- |
| Press a menu button | **Poke** it with your index finger, *or* **look at it and pinch** anywhere |
| Scoop powder | **Pinch** (thumb + index) inside a bowl |
| Scoop from a distance | **Look at a bowl and pinch** anywhere in the air (gaze-assisted pick) |
| Paint | **Keep pinching** and brush your fingers just above a segment of the matching colour |
| Throw powder | **Flick**: release the pinch with a quick motion toward the board. The powder flies to wherever you aimed |
| Drop powder | Release the pinch slowly |
| Recenter | Use the Quest system recenter. The play space re-anchors in front of you |

Controllers also work (trigger = pinch), and on a desktop the mouse works (click a bowl, then drag over the board), but nothing in the game requires them.

### Hand-interaction design notes

- **Pinch detection** reads the raw WebXR hand joints (`thumb-tip` ↔ `index-finger-tip`) with hysteresis: it starts at 2.2 cm and ends at 4 cm, so a pinch doesn't flicker while you brush.
- **Forgiving hit areas.** Each segment accepts powder anywhere inside its angular sector of the ring, not only inside the drawn petal outline, and powder registers from up to 5.5 cm above the board.
- **Seated, within a 2-foot radius.** The whole play space is placed relative to your head when the session starts: board centre about 0.4 m below and 0.37 m ahead of your eyes, bowls within about 0.3 m to the sides. Nothing requires standing, leaning or turning.
- **FoV-aware layout.** The board, bowls and HUD all sit within the comfortable lower-central field of view. The HUD and hints lazily follow your head yaw only when you look more than ~24° away, so text never leaves view and never swims.
- **Gaze + pinch** works as an accessibility shortcut for reaching bowls and buttons. Gaze only highlights; a pinch is always the trigger.
- **Colour-blind support:** every powder has a shape glyph (● ▲ ◆ ■ ★ 💧 ✚) on its bowl and on every unfilled segment.
- **Mixed reality first.** The game asks for an `immersive-ar` session, so on Quest the rangoli sits on your real table under passthrough. When the session is opaque (or on a desktop), a cozy dusk courtyard appears instead: sandstone tiles, arches, string lights and flickering diyas.

## How to run locally

Requirements: Node.js ≥ 20.19 (or 22.12+).

```bash
npm install
npm run dev          # IWSDK dev server with the IWER emulator (opens a managed browser)
# or: npx vite       # plain Vite dev server on https://localhost:8081
npm run typecheck
npm run build        # production build to dist/
node scripts/build-all.mjs   # dist/ (headset build) + dist/emulator/ (desktop emulator build)
```

To test on a Quest, open the dev server's network URL in Quest Browser on the same Wi-Fi, or use the GitHub Pages link above.

**Using the emulator (IWER):** click **Enter Mixed Reality**. In the emulator toolbar, switch input to **hands**. Then move a hand and use the pinch control (or the keyboard/mouse controls described in the [IWSDK testing guide](https://iwsdk.dev/guides/02-testing-experience.html)).

## How it's built

- **IWSDK 1.1** (`@iwsdk/core`, three.js r185 / super-three) with an ECS `System` (`src/game/game.ts`) that runs the state machine, input, scoring and layout.
- `src/game/input.ts` reads hand joints, controllers and the mouse each frame, and turns them into pinch / poke / flick-velocity signals plus a head-gaze ray.
- `src/game/board.ts` builds rangoli segments procedurally from ring definitions (petal / leaf / band / dot / star centre) and does polar hit-testing.
- `src/game/patterns.ts` holds the levels and the seeded `dailyPattern(date)` generator (mulberry32 PRNG).
- `src/game/particles.ts` is a pooled GPU point-sprite system for powder puffs, flick trails, sparkles and the grains that settle on the board.
- `src/game/audio.ts` synthesizes every sound live with WebAudio: tanpura-style drone, temple-bell chimes in the Bhupali pentatonic, powder hiss, whoosh, error thud and fanfare. No audio files are used.
- `src/game/courtyard.ts` is the procedural fallback environment.
- Progress (tutorial, stars, streak) is stored only in `localStorage`. There are no accounts, no network calls and no third-party services.

## Assets & licences

All art and audio are original and generated procedurally at runtime. No third-party models, textures, fonts or sound files ship with the game. In the emulator build, IWER's synthetic room and the WebXR input-profile hand/controller models are provided by Meta's open-source tooling.

Code: MIT (see `LICENSE`).
