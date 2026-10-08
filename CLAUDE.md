# CLAUDE.md — FACEPLANT

Persistent project memory. Read this in full at the start of every session,
then `SPEC.md` (the contract) and the **Progress log** at the bottom of
`PLAN.md` (where the last session stopped). The files are the memory — do not
rely on earlier conversations.

---

## 1. What this project is

FACEPLANT is a browser game. The player's webcam face **is the level**: tiny
candle-headed creatures called **Wicks** walk on the player's forehead, slide
down their nose, and get flung by their eyebrows. The player's open mouth is
**the Maw** — Wicks that fall in are swallowed. The game is styled as
found-footage analog horror (cursed camcorder tape, candlelight), but plays as
comedy.

The core hook (`SPEC.md` §3): **the game wins when you lose your composure.**
Laughing, gasping and flinching are involuntary — and each one physically
changes the level. The game is written to make you laugh and to startle you,
and both open your mouth.

It must be built in **two weeks** (`PLAN.md`), with a hard go/no-go gate at
the end of **Day 5**: if the face-terrain physics does not feel good by then,
we stop and decide with the human before building anything else.

---

## 2. Hard constraints

- **Zero budget.** Free and open-source only. Static site — no backend, no
  database, no accounts, no leaderboard server. Hosted on itch.io and/or
  GitHub Pages.
- **Browser only.** Desktop Chrome/Edge is the primary target; Firefox and
  mobile browsers are best-effort (`SPEC.md` §15).
- **Development on Windows.** Every script runs on Windows (Node scripts,
  never bash-only). Use `path.join`, never hard-coded `/` paths in scripts.
- **Two weeks.** Anything not in the plan for the current day is out of scope
  unless the human approves it. When in doubt, cut scope, not quality of feel.

---

## 3. Repository layout

```
faceplant/
├── CLAUDE.md  SPEC.md  PLAN.md  README.md
├── index.html  package.json  vite.config.ts  tsconfig.json  vitest.config.ts
├── public/
│   ├── mediapipe/        # wasm + .task/.tflite models, copied by scripts/copy-mediapipe.ts — NEVER a CDN
│   ├── fonts/            # self-hosted woff2 (VT323, Special Elite, Inter) — NEVER Google Fonts CDN
│   ├── audio/            # CC0 sounds only; every file listed in docs/CREDITS.md
│   └── levels/           # level JSON (SPEC §9)
├── src/
│   ├── main.ts
│   ├── config.ts         # every tunable number lives here (SPEC §17)
│   ├── face/             # FaceSource interface + webcam tracker, synthetic face, fixture replay, filters, calibration
│   ├── terrain/          # landmark contours → one-way polylines, Maw detection, coordinate mapping
│   ├── physics/          # custom solver, Wick behaviour, hazards
│   ├── game/             # level loader + schema, rules, daily tape, scares, Wick lines
│   ├── render/           # PixiJS stage, lighting, VHS post-process, sprites, OSD
│   ├── ui/               # DOM overlay screens (title, shelf, calibration, settings, results)
│   ├── share/            # clip recorder, result card, share text
│   ├── audio/            # sound manager
│   └── storage/          # progress + settings in localStorage
├── tests/                # vitest: unit + headless fixture simulations
├── fixtures/faces/       # recorded landmark streams (developer's own face, landmarks only)
├── scripts/              # copy-mediapipe.ts, check-privacy.ts, check-flash.ts, record-fixture helpers
└── docs/                 # design-reference.html, CREDITS.md, PLAYTEST.md, DAY5_GATE.md
```

The full output-file list is in `SPEC.md` §19.

---

## 4. Commands

```powershell
npm install
npm run setup:mediapipe     # copies wasm + models from node_modules into public/mediapipe
npm run dev                 # Vite dev server (https not needed on localhost)
npm test                    # vitest: unit + fixture simulations
npm run check:privacy       # scans the built bundle for external URLs / network calls
npm run check:flash         # verifies every flicker/flash effect is ≤ 3 flashes per second
npm run build               # static build into dist/
npm run preview             # serve dist/ locally
npm run package:itch        # zips dist/ for itch.io upload
```

If a command turns out to be wrong for the installed versions, fix it here
and in `SPEC.md` in the same change.

---

## 5. Invariants — NEVER violate these

1. **The camera never leaves the device.** Video frames, landmarks,
   blendshapes and segmentation masks are processed in the browser and are
   never sent anywhere. The game makes **no network requests at runtime except
   same-origin static assets.** MediaPipe wasm, models and fonts are
   self-hosted. `npm run check:privacy` enforces this on the built bundle.
2. **No analytics, ads, trackers, crash reporters or third-party embeds.**
3. **Recording only on explicit action.** The clip recorder runs only after the
   player has opted in from Settings or the results screen, clips are
   previewed before saving, and saving is a local download. Never store video
   or images in localStorage or IndexedDB — only progress and settings.
4. **Photosensitivity.** No effect may flash more than 3 times in any one
   second (WCAG 2.3.1). Large red full-screen flashes are forbidden. "Reduce
   effects" disables flicker, chromatic aberration, tracking wobble and screen
   shake everywhere. `npm run check:flash` enforces the configured rates.
5. **Scares are opt-out and honoured everywhere.** With "Scares off", no
   scare event, sudden loud sound or sudden image may fire — including in the
   Daily Tape and the finale. A first-launch notice states: 13+, contains
   startling moments and flashing-light-safe effects, camera stays on device.
6. **Audio safety.** Master output passes through a limiter; no sound exceeds
   −6 dBFS peak; scare sounds have a 30 ms minimum attack (no instantaneous
   spikes).
7. **Every level is completable without a camera** using Assist controls
   (`SPEC.md` §13). Never design a level that only face input can finish.
8. **Fixtures are the developer's own face, landmarks only.** Never commit
   images, video, or anyone else's face data. Fixtures contain only the
   landmark indices and blendshapes the game uses.
9. **Wicks are never human.** They are candle creatures. Nothing human —
   and nothing resembling a child — is ever swallowed, hurt or scared.
10. **Third-party assets are CC0 or OFL** (fonts) unless the human approves
    otherwise, and every one is listed in `docs/CREDITS.md`.

---

## 6. Conventions

- TypeScript `strict`. No `any` without a comment. Vite + vitest.
- **All tunable numbers live in `src/config.ts`**, grouped by system, each
  with a unit in its name or comment (`wickWalkSpeedFhPerS`,
  `mawOpenThreshold`). No magic numbers in game code.
- **World units are FH — "face heights"** — measured at calibration
  (`SPEC.md` §7). Levels are authored in FH relative to the neutral face
  centre, so every player's face fits every level.
- The game consumes faces only through the `FaceSource` interface
  (`src/face/types.ts`). Webcam tracker, synthetic Assist face and fixture
  replay all implement it. Game code never imports MediaPipe directly.
- Physics runs at a fixed timestep (`config.physics.stepHz`) independent of
  render and tracking rates; terrain is interpolated between tracker frames.
- Rendering: PixiJS for the game stage; menus and settings are a DOM overlay
  (HTML/CSS) so they stay crisp and accessible.
- All colours, fonts, sizes and durations come from `src/render/tokens.ts`
  and `src/ui/tokens.css`, which must match `SPEC.md` §12. No raw hex values
  elsewhere.
- Copy (Wick lines, UI text, tape labels) lives in `src/game/lines.ts` and
  `src/ui/copy.ts`, never inline.

---

## 7. Tests

- Pure logic is unit-tested: filters, terrain building, Maw hysteresis,
  calibration maths, level schema, daily seed, share text, the solver.
- **Fixture simulations are the most important tests**: recorded face
  streams are replayed through the real terrain + physics headlessly for
  their full length, asserting zero tunnelling and conservation of Wicks
  (`SPEC.md` §18 AC-4).
- Never weaken, skip or delete a test to make it pass. If the test encodes the
  wrong behaviour, that is a spec problem (§8 rule 3).
- **Game feel cannot be unit-tested.** Tests prove the game is correct; only
  the human playing it proves it is fun. Never claim a level is "fun",
  "balanced" or "feels good" — say what you changed and ask the human to play.

---

## 8. Spec-driven discipline

1. No implementation before the plan is approved.
2. **One day of the plan per session, one approval per day.** Stop at the end
   of the day's scope for review. Never start the next day's work.
3. **Fix the spec, not the code.** If behaviour doesn't match intent, decide
   whether `SPEC.md` is ambiguous or wrong; if so, propose the exact wording,
   wait for approval, then implement.
4. **Respect the Day 5 gate.** Do not start Day 6 work until the human has
   filled in `docs/DAY5_GATE.md` and approved.
5. **Tuning changes are recorded.** When a `config.ts` value changes after
   playtesting, record old → new and the reason in the Progress log.
6. **Flag scope creep** and any new dependency before adding it.
7. **Ask** about anything touching privacy, safety, scares, or the camera.

---

## 9. Git

- Branch per day: `day-<nn>-<short-name>`. Merge to `main` after approval.
- Commit messages name the `PLAN.md` day and `SPEC.md` section.
- Never commit `node_modules`, `dist/`, recordings, screenshots of real
  people, or `.env` files. Check `git status` before every commit.
- Never push automatically, never force-push, never rewrite `main`.
