# FACEPLANT

**Your face is their world. Don't open your mouth.**

Tiny candle-headed creatures — **Wicks** — walk out of a lantern, cross your
forehead, slide down your nose and try to reach a glowing Gate. Your eyebrows
are ledges that fling them. Your closed mouth is the bridge. Your open mouth is
**the Maw**.

The game wins when you lose your composure. It is written to make you laugh,
and laughing opens your mouth.

A browser game. No servers, no accounts, no uploads. The camera never leaves
your device.

---

## Play it

```powershell
npm install
npm run setup        # fonts + MediaPipe wasm and model, all self-hosted
npm run dev          # http://localhost:5173
```

You can play **immediately, without a camera** — the first level runs on
mouse and keyboard, and the camera is offered afterwards.

| Assist control | Does |
|---|---|
| Mouse | moves your face |
| `Space` | opens the Maw |
| `Shift` | raises your brows |
| `B` | blinks (an eyelid is a bridge) |
| `L` | smiles (costs composure) |
| `↑` `↓` | lean in and out |
| `←` `→` / wheel | tilt |
| `P` / `Esc` | pause |

`/debug.html` shows landmarks, named contours, the walkable/rail split,
blendshape bars, fps and tracking rate, and records fixtures.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm test` | 248 unit tests, fixture simulations and level solvability runs |
| `npm run typecheck` | `tsc --noEmit`, strict |
| `npm run build` | static build into `dist/` |
| `npm run preview` | serve `dist/` |
| `npm run verify` | typecheck + test + build + privacy + flash safety |
| `npm run check:privacy` | scans the built bundle for anything that could leave the device |
| `npm run check:flash` | proves no effect exceeds 3 flashes/second |
| `npm run make:levels` | regenerates the 12 story levels |
| `npm run make:fixtures` | regenerates the test fixtures |
| `npm run package:itch` | zips `dist/` for itch.io |

## What's in it

- **12 story levels** across 4 tapes, plus a **Daily Tape** (one level a day,
  identical for everyone) and **The Long Tape** (endless, escalating).
- **Three looks**: VHS candlelight, INK (contour lines only — play without
  showing your face), THERMAL.
- **Sharing**: a copyable result line, a 1080×1350 result card, and an opt-in
  portrait clip cut around the moment you cracked.
- **The Ossuary**: every Wick that died, by name, with its last words.

## How it works

The interesting part is that the terrain *is* a face, and a face moves.

- **`FaceSource`** (`src/face/types.ts`) is the only way the game learns about
  faces. Three implementations satisfy it — the webcam tracker, the synthetic
  Assist face, and fixture replay — so the game never imports MediaPipe outside
  `src/face/webcamSource.ts`, and every test can drive the real systems.
- **FH, face heights**, are the world unit. Calibration measures your
  forehead-to-chin distance once, and every coordinate is expressed relative to
  it, so one set of levels fits every face, camera and seating distance.
- **Terrain is one-way and it moves.** Landmarks become ordered polylines:
  the forehead is a dome you walk on, the brows are ledges, the jaw is a shelf,
  the lips are a bridge that vanishes when you open your mouth, and the nose and
  cheeks are *rails* that carry whoever touches them downhill.
- **The solver** (`src/physics/solver.ts`) splits into two regimes, and that is
  what makes it robust. Airborne bodies are **swept**: each is tested against
  each segment's previous *and* current pose, so a brow that travels half a face
  height in one step still catches a Wick instead of teleporting past it.
  Grounded bodies are not integrated at all — they are *attached*, their
  position derived from the segment, so they ride a moving face exactly and
  cannot tunnel by construction.
- **Composure** (`src/game/composure.ts`) is the hook as a system: a meter that
  every involuntary tell drains, and that opens your mouth for you when it hits
  zero.

### Documents

| File | What it is |
|---|---|
| `SPEC.md` | the contract. Code loses to this file. |
| `PLAN.md` | the build plan, with the progress and tuning logs |
| `CLAUDE.md` | project memory and the ten invariants |
| `docs/UPGRADES.md` | the ten design changes made to v1.0, and why |
| `docs/CREDITS.md` | every asset and licence |
| `docs/PLAYTEST.md` | what has and has not been played by a human |
| `docs/design-reference.html` | the intended look |

## Privacy

This is the part worth reading twice, because you cannot verify it by playing.

1. **Nothing leaves the device.** Video, landmarks and blendshapes are
   processed in the browser and never sent anywhere.
2. **It is enforced, not promised.** `src/privacy.ts` wraps `fetch`,
   `XMLHttpRequest`, `sendBeacon`, `WebSocket` and `EventSource` and refuses
   anything that is not same-origin, and it is installed before the game is
   even loaded. This exists because `@mediapipe/tasks-vision` ships a dormant
   telemetry client pointed at a Google logging endpoint; it is opt-in and the
   game never enables it, but a privacy guarantee should not depend on a third
   party's default settings.
3. **No CDN.** The wasm runtime, the face model and all four fonts are served
   from the game's own origin.
4. **No analytics, ads, trackers or crash reporters.**
5. **The microphone is never requested.** `getUserMedia` is called in exactly
   one place, with `audio: false`, and a test enforces both.
6. **Recording is off by default**, previewed before saving, saved as a local
   download, and held only in memory. Only settings and progress are ever
   persisted.

`npm run check:privacy` checks all of this against the built bundle and fails
if the runtime guard is missing.

## Accessibility and safety

- **Every level is completable without a camera.** Not a claim — a test drives
  the Assist face through all 12 story levels, six Daily Tapes and the Long
  Tape on every run.
- **No effect flashes more than 3 times a second** (WCAG 2.3.1). Each one
  declares a budget in `src/config.ts` and `npm run check:flash` enforces it.
- **Scares are opt-out and honoured everywhere**, including the finale. A test
  replays every level's script with scares off and asserts nothing fires.
- **Reduce effects** disables flicker, chromatic aberration, wobble, shake and
  scanlines, and is switched on automatically if your system asks for reduced
  motion.
- All output passes a −6 dBFS limiter; scare sounds have a 30 ms minimum
  attack.
- All Wick speech is text, menus are keyboard-navigable with visible focus, and
  UI text scales with browser zoom.

## Status

The engine, all content, all systems and all checks are complete and green:
248 tests, a clean strict typecheck, a passing build, and both safety checks.

**Nobody has played it yet.** Game feel cannot be unit-tested — the tests prove
it is correct, not that it is fun. `docs/PLAYTEST.md` records exactly what has
and has not been verified by a human at a camera, and that is the next step.

## Licence

Code: MIT. Third-party assets and their licences: `docs/CREDITS.md`.
