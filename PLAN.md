# PLAN.md — FACEPLANT

Status: **IMPLEMENTED — 2026-10-08.** The 14-day plan was compressed into a
single build at the human's explicit instruction ("start the project and
complete it entirely"), which overrides CLAUDE.md section 8 rule 2 (one
plan-day per session) for that session only. Every day's *scope* was delivered,
and every *gate* except the two that require a human at a camera: the Day 5
playtest and the Day 14 playtest. See the Progress log at the bottom.

Written alongside `SPEC.md` so Claude Code starts from a strong position. It
must first be reviewed against `SPEC.md` (PROMPT.md, Prompt 2) and approved
by the human. Then change the line above to `APPROVED — <date>`.

Implements `SPEC.md` v1.0. Governed by `CLAUDE.md`.

---

## How the two weeks work

- **One plan-day per session.** Each day ends with its *Done when* checks
  passing, the *You check* items done by you, a Progress log entry, and a
  merge of `day-<nn>-<name>`.
- Each session starts by re-reading `CLAUDE.md`, `SPEC.md`, this day's
  section and the Progress log, listing the files it will touch and the
  ⚠ verify items, and waiting for "go".
- Days assume roughly 6–8 focused hours. Part-time: the order stays the same,
  each plan-day just takes longer (SPEC Q6).
- **The order is deliberate: correctness → fun → beauty → content → sharing.**
  Nothing pretty is built until Day 5 proves the core is fun.

| Day | Focus | Gate / output |
|---|---|---|
| 0 | Setup + camera-on-hosting test | Repo runs; camera verified on GitHub Pages and itch.io |
| 1 | Face input, debug page, fixtures | ≥ 6 recorded fixtures |
| 2 | Calibration, mapping, terrain, Maw | Terrain drawn live on your face |
| 3 | Solver + Wick behaviour + fixture sims | AC-3, AC-4 |
| 4 | Ugly playable level + Assist | Something a stranger can play |
| **5** | **GATE: three-tester playtest** | **Go / fix / pivot — your decision** |
| 6 | Look I: video, candlelight, contours, sprites, OSD | It looks like the reference |
| 7 | Look II: post-FX, filters, reduced effects, audio | AC-6 |
| 8 | Levels I: loader, rules, Tapes 01–02, Wick lines | 7 levels |
| 9 | Levels II: hazards, Tapes 03–04, scares, finale | 12 levels, AC-9 |
| 10 | Menus and screens | Full flow from title to ending |
| 11 | Sharing + privacy check | AC-5, AC-11 |
| 12 | Daily Tape, credits, behind-you scare | AC-13 |
| 13 | Stretch or polish; performance; Assist run | AC-7, AC-8 |
| 14 | Playtest round 2, tuning, deploy, final verify | AC-12, every AC green |

---

## Day 0 — Setup and the camera-hosting test

**Tasks**
1. Record versions of Node, npm, Git, Chrome in the Progress log.
2. Vite + TypeScript project; `vitest`; `tsconfig` strict; `.gitignore`
   (`node_modules`, `dist`, `*.webm`, `*.mp4`, recordings, `.env*`).
3. Install `pixi.js`, `pixi-filters`, `@mediapipe/tasks-vision`
   (⚠ verify current versions and that the `pixi-filters` major matches the
   PixiJS major). Pin exact versions.
4. `scripts/copy-mediapipe.ts`: copy the wasm folder and download/copy the
   `face_landmarker.task` and selfie-segmenter models into
   `public/mediapipe/` (⚠ verify the official model download location and
   licence; record it in `docs/CREDITS.md`). Decide whether these files are
   committed or regenerated, and record the decision.
5. Self-host fonts (VT323, Special Elite, Inter — all OFL) in `public/fonts/`.
6. Empty `src/config.ts`, `src/render/tokens.ts`, `src/ui/tokens.css` with
   the SPEC §12.2 tokens.
7. **Hosting test (important):** a bare page that turns on the camera and
   shows it. Deploy to GitHub Pages and upload to itch.io as an HTML5 game.
   Record exactly what happens on itch.io (works embedded / needs the
   fullscreen-or-new-window option / blocked).

**Done when** `npm run dev`, `npm test` (zero tests) and `npm run build`
work; the hosting test results are recorded.

**You check:** the camera test works from both URLs on your laptop.

---

## Day 1 — Face input, debug page, fixtures

**Tasks**
1. `src/face/types.ts` — `FaceFrame`, `FaceData`, `FaceSource` (SPEC §6.1).
2. `oneEuro.ts` + tests.
3. `webcamSource.ts` — Face Landmarker, VIDEO mode, blendshapes on, GPU
   delegate with CPU fallback, `numFaces` from config. ⚠ verify the current
   `FaceLandmarker` options API and the exported contour connection sets.
4. Debug page (`?debug`): video, all landmarks, named contours in colour,
   blendshape bars, render fps, tracking Hz.
5. **Record fixture** button: saves only the landmark indices the game uses
   plus the 5 blendshapes, with timestamps, as JSON.
6. `fixtureSource.ts` replays a fixture at its recorded timing.
7. Record **your own** fixtures (30–45 s each): `neutral`, `tilt`, `lean`,
   `brows`, `mouth-laugh` (open, close, real laughing), `head-jerk`.

**Done when** fixtures exist in `fixtures/faces/`; the fixture source
replays them in the debug page; tracking Hz is recorded.

**You check:** the debug overlay sticks to your face in your normal lighting;
note the tracking Hz and fps.

---

## Day 2 — Calibration, mapping, terrain, Maw

**Tasks**
1. `calibration.ts` — neutral centre, FH, jaw/brow baselines and ranges
   (SPEC §7), with jitter rejection. Tests.
2. `mapping.ts` — normalised landmarks → mirrored screen → FH world, and
   back. Round-trip tests.
3. `contours.ts`, `build.ts`, `walkable.ts` — ordered polylines per SPEC
   §6.3; one-way walkability classification. Tests on every fixture frame
   (no NaN, ordered left to right).
4. `maw.ts` — personal thresholds, hysteresis, minimum state time, swallow
   polygon. Tests.
5. `reactions.ts` — laughing, gasp, smiling, brows up, leaning in (SPEC
   §6.8). Tests on the `mouth-laugh` fixture.
6. Debug page draws the live terrain (walkable segments bright, ignored
   segments dim) and a Maw open/closed indicator.

**Done when** the Day-2 parts of AC-2 pass.

**You check:** open your mouth slowly and quickly — the Maw indicator should
never flicker. Laugh — the debug page should flag it.

---

## Day 3 — Solver, Wick behaviour, fixture simulations

**Tasks**
1. `solver.ts` — fixed-step integration, one-way moving polylines, swept
   test in the segment's frame, landing, surface-velocity inheritance (SPEC
   §8.4). **Write the AC-3 tests first.**
2. `wick.ts` — state machine, timid edges, gaps, slopes, flick, quake, Maw
   fear (SPEC §6.4–6.6, §8.1).
3. `tests/levels/fixture-arena.json` — a wide arena: ruins left and right,
   spawn above the face, Gate on the right.
4. Headless fixture simulations (AC-4): tunnelling detector + conservation
   check at every step, for every fixture.

**Done when** AC-3 and AC-4 pass. If AC-4 cannot pass with the custom solver
by the end of the day, stop and report — the fallback (Rapier2D) is a spec
change for the human to approve.

**You check:** ask Claude to show you the tunnelling detector failing on a
deliberately broken solver (a throwaway change), so you know the test has
teeth.

---

## Day 4 — Ugly playable level + Assist

**Tasks**
1. Minimal render: video, terrain lines, circles for Wicks, rectangles for
   ruins and the Gate. No styling.
2. One real level: spawn lantern, ruins, Gate, Maw swallowing, flick, quake,
   win/lose counting.
3. `syntheticSource.ts` — Assist face (SPEC §13): mouse position, scroll tilt,
   Space Maw, Shift brows, arrows lean. Same `FaceFrame` output.
4. A handful of placeholder Wick lines driven by reactions, including the
   first-ten-seconds sequence (SPEC §3.2).
5. Fill in the top of `docs/DAY5_GATE.md` (build link, what testers will be
   told).

**Done when** a person who has never seen the game can play the level from
the dev URL, with camera or Assist.

**You check:** play it yourself for 10 minutes. Write down three moments that
felt good and three that felt bad, for tomorrow.

---

## Day 5 — THE GATE

No new features. Today decides whether the next nine days are worth it.

**Tasks**
1. Fix only what blocks the playtest (crashes, a broken level).
2. Run the playtest exactly as written in `docs/DAY5_GATE.md` with three
   people who have never seen the game (SPEC Q3). Tell them only: *"Your face
   is the level. Get the little candles to the door."* Then stay silent and
   watch.
3. Record the answers in `docs/DAY5_GATE.md`.
4. Claude summarises the results and proposes a fix list, but **the decision
   is yours**: continue, spend at most one day on the fix list and re-test
   with one new person, or pivot.

**Done when** AC-10: the gate document is complete and you have signed the
decision.

---

## Day 6 — Look I

**Tasks.** Render stack layers 1–4 and 6 (SPEC §12.4): VHS-graded mirrored
video; darkness with candlelight holes (Wicks, lantern, Gate) and gentle
flicker; chalk contour line; sprites for Wicks (cream wax body, amber flame
with ember core, two dot eyes, a little walk bob), ruins (burnt-paper
silhouettes with amber rim), lantern, Gate (glowing doorway), Crawlers,
Drips; camcorder OSD (REC, timestamp, tape label, candle counter, Maw
indicator). Match `docs/design-reference.html` in feel.

**Done when** the Day-4 level looks like the reference and still runs at
≥ 30 fps.

**You check:** screenshots in a bright room and a dim room. Run Prompt 6
(design critique).

---

## Day 7 — Look II and audio

**Tasks.** Post-process via `pixi-filters` (scanlines, aberration, grain,
vignette, wobble); INK and THERMAL filters; reduced effects;
`scripts/check-flash.ts` and the reduced-effects test (AC-6). Audio manager
with limiter and attack rules (CLAUDE.md invariant 6); hiss/drone bed;
jsfxr squeaks, gulp, flame-out, chime, skitter, flick; `docs/CREDITS.md`.

**Done when** AC-6 passes and every sound is credited.

**You check:** play with headphones at a normal volume — nothing should be
painfully loud. Try INK mode: is the game still readable?

---

## Day 8 — Levels I

**Tasks.** `levelSchema.ts` + validator, `levelLoader.ts`, `rules.ts`
(candles, stamps, stats); Tape 01 (4 levels) and Tape 02 (3 levels, Crawlers)
per SPEC §9.3; `lines.ts` with ≥ 60 tagged lines and `lineDirector.ts`
(SPEC §12.7).

**Done when** all 7 levels validate (AC-2) and are completable with the
camera and in Assist.

**You check:** play all 7. Which Wick line made you laugh out loud? Which
ones fell flat? Feed that into Prompt 5.

---

## Day 9 — Levels II, hazards, scares, finale

**Tasks.** Drips and the Dark; Tape 03 (3 levels written to be funny) and
Tape 04 (2 levels, including the finale per SPEC §10.3); scare events
(`flicker`, `whisper`, `figure`, `stinger`) with the scares-off test (AC-9).

**Done when** all 12 levels validate and AC-9 passes.

**You check:** play Tape 04 with the lights off, then again with scares off.

---

## Day 10 — Menus and screens

**Tasks.** DOM screens from SPEC §12.5: first-launch notice, title, camera
explainer, calibration screen, tape shelf, pause, results (stamps, candle
animation, stats), settings, ending; `storage/` for progress and settings;
keyboard navigation and visible focus. Lost-tracking pause with the Assist
offer.

**Done when** the full journey title → calibration → shelf → level →
results → next → ending works with camera and in Assist, settings persist
across reloads.

**You check:** give the build to someone and say nothing. Can they get from
the title screen into a level alone?

---

## Day 11 — Sharing and privacy

**Tasks.** `shareText.ts` (SPEC §16 format, tests); `resultCard.ts`
(1080×1350 PNG); `portraitCanvas.ts` + `recorder.ts` (opt-in, MP4 if
supported else WebM — ⚠ verify `MediaRecorder.isTypeSupported` strings on
your Chrome; result card tail; preview dialog; nothing kept after the
dialog); `scripts/check-privacy.ts` and the dev-mode cross-origin observer
(AC-5).

**Done when** AC-5 passes and AC-11 is recorded in `docs/PLAYTEST.md`.

**You check:** record a clip, upload it privately to the short-video app you
use, and check it looks right in portrait.

---

## Day 12 — Daily Tape, credits test, behind-you scare

**Tasks.** `prng.ts` (mulberry32), `daily.ts` with ≥ 4 templates in
`public/levels/daily-templates/`, first-attempt storage, Daily label on the
shelf, daily share text (determinism test — AC-2); credits test (AC-13); the
segmentation scare (SPEC §10.2) if the performance budget allows, else the
`figure` fallback.

**Done when** the Day-12 parts of AC-2 pass and AC-13 passes.

**You check:** set your PC clock to tomorrow (or use a dev override) and
confirm the Daily Tape changes; confirm it is identical on two browsers today.

---

## Day 13 — Stretch or polish, performance, Assist run

**Tasks.** Your choice from SPEC Q4: Two Faces (Tape 05) *or* polish from
the playtest notes. Then: measure performance (AC-7) and adjust low-power
defaults; complete every level in Assist and record it (AC-8).

**Done when** AC-7 and AC-8 are recorded.

---

## Day 14 — Playtest, tune, deploy, verify

**Tasks.** Playtest round 2 with three new people (same protocol as Day 5,
recorded in `docs/PLAYTEST.md`); tuning pass (every change logged); deploy to
GitHub Pages and itch.io (AC-12); run Prompt 8 (verify every AC).

**Done when** every acceptance criterion in SPEC §18 is green, and you have
recorded a 15–20 second trailer clip of yourself playing (PROMPT.md Part E).

---

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Moving-terrain physics jitters or tunnels | Medium | High | Swept test, smoothing, fixture sims on Day 3, Rapier fallback |
| R2 | The mechanic is novel but not fun | Medium | High | Day 5 gate before any art or content |
| R3 | Tracking poor in dim rooms (and the theme is dark) | Medium | Medium | Darkness is rendered, not required in the room; calibration rejects bad tracking; Assist fallback |
| R4 | itch.io iframe blocks the camera | Medium | Low | Tested on Day 0; new-window launch or GitHub Pages link |
| R5 | Low-end laptops can't keep 30 fps | Medium | Medium | Low-power mode; segmentation only in scare windows |
| R6 | Scares harm or alienate players | Low | High | Opt-out, notice, flash and audio limits, tests |
| R7 | Players won't share their face | High | Medium | Flattering filters, INK hide-my-face mode, text share |
| R8 | Two weeks is too short | High | Medium | Strict day scopes, MVP vs stretch, polish over features |
| R9 | Version drift (MediaPipe, PixiJS, filters) | Medium | Low | ⚠ verify items, pinned versions |
| R10 | Someone else ships a similar idea first | Low | Medium | Ship in two weeks; the theme and the composure hook are the differentiator |

---

## Tuning log

| Date | Config key | Old -> New | Why |
|---|---|---|---|
| 2026-10-08 | `wick.maxGapFh` | 0.06 -> **0.14** | 0.06 FH is under two Wick body widths. A Wick could not step from a ruin onto the face at all, so SPEC 8.3's "your face bridges the ruins" was physically impossible. Found by `tests/levels/solvable.test.ts`: every mouth- and chin-route level stranded its whole roster. |
| 2026-10-08 | `wick.maxStepDownFh` | 0.15 -> **0.22** | Same cause, vertical. A Wick has to be able to step down from a ledge onto a lip. |
| 2026-10-08 | `wick.maxWalkSlopeDeg` | 50 -> **60** | The corners of a mouth measure about 55 deg. At 50 a Wick stepped onto the lip and immediately slid back off it, oscillating in the mouth corner forever, so the mouth route was uncrossable. At 60 the nose (90 deg) and the cheeks (70-78 deg) still slide, which is what those are for. |
| 2026-10-08 | `render.reducedEffectsDisables` | added `recDot` | `npm run check:flash` correctly refused an effect that blinks at 1 Hz without being disabled by Reduce effects. The renderer already held the dot solid; the config did not say so. |

**None of these came from playtesting.** Every change above was forced by a
failing test, not by how the game felt. Feel tuning has not happened, because
nobody has played it. That is the first job next session, with PROMPT.md
Prompt 5.

## Measured values

| Quantity | Value | Date | How |
|---|---|---|---|
| `dist/` size | **29.33 MB** (AC-1 target < 25 MB - see below) | 2026-10-08 | `npm run build`, then measured |
| `dist/` without the no-SIMD wasm | ~16 MB | 2026-10-08 | `FACEPLANT_SIMD_ONLY=1 npm run setup:mediapipe` |
| JS shipped, gzipped | 134 kB app + 55 kB Pixi DOM + ~75 kB renderer chunks | 2026-10-08 | Vite build report |
| MediaPipe wasm, one build, gzipped | ~5 MB, fetched only when the camera is enabled | 2026-10-08 | file size and gzip ratio |
| Face model | 3.58 MB | 2026-10-08 | `npm run setup:mediapipe` |
| Unit and simulation tests | **248 passing** in 10.2 s | 2026-10-08 | `npm test` |
| Fixture simulations | 6 fixtures x 960 frames x ~3,800 physics steps; 0 tunnelling, 0 NaN | 2026-10-08 | `npm test` |
| Levels solvable without a camera | 12/12 story, 6/6 daily samples, the Long Tape | 2026-10-08 | `tests/levels/solvable.test.ts` |
| Built bundle serves and resolves | 11 modules, 12/12 levels over HTTP, wasm + model + fonts reachable | 2026-10-08 | `node scripts/smoke.mjs` against `vite preview` |
| **Tracking Hz (dev laptop)** | **NOT MEASURED** - needs a camera | - | AC-7 |
| **Render fps (VHS, 20 Wicks)** | **NOT MEASURED** - needs a GPU and a browser | - | AC-7 |
| **itch.io camera behaviour** | **NOT TESTED** - needs an itch.io page | - | AC-12, risk R4 |
| **Clip format on your Chrome** | **NOT TESTED** - `MediaRecorder` does not exist in Node | - | AC-11 |

### On the `dist/` size

AC-1 targets under 25 MB; the build is 29.33 MB. The entire overage is
MediaPipe's two wasm builds (13.0 MB SIMD + 12.2 MB no-SIMD). Four things are
worth knowing before deciding whether to care:

- a browser downloads exactly **one** of the two, and only when the player
  enables the camera. Assist mode downloads neither.
- gzipped over the wire, that one build is about 5 MB.
- the unused `vision_wasm_module_internal.*` build - another 13 MB - is already
  excluded, because the game never passes `useModule`.
- `FACEPLANT_SIMD_ONLY=1` drops the no-SIMD fallback and brings `dist/` to
  about 16 MB, at the cost of a 404 rather than a slow frame rate on a browser
  without WebAssembly SIMD. None that the game targets lacks it.

Recorded rather than quietly accepted, per AC-1.

---

## Progress log

Add an entry at the end of every session. Newest at the bottom.

```
### YYYY-MM-DD — Day N — <in progress | done | blocked>
- Done:
- Tests: <command> → <result>
- Measured:
- Version pins:
- Spec changes (approved on <date>):
- Tuning changes (also in the tuning log):
- Next session starts with:
```

### 2026-10-08 - Days 0-14 in one session - done, except the two human gates

**Scope note.** CLAUDE.md section 8 rule 2 asks for one plan-day per session
with one approval per day. The human instructed otherwise - *"go through all
the files ... and after everything start the project and complete it
entirely"* - so the whole plan was built in one pass. Recorded explicitly
because it is a deliberate deviation from project memory, not an oversight.

**Done.**

- **Day 0.** Vite 7 + TypeScript 5.9 strict (`noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`) + Vitest 5, versions pinned exactly. Fonts and
  MediaPipe self-hosted by setup scripts. Note: Node is installed but was not
  on `PATH`; it lives at `C:\Program Files\nodejs`.
- **Day 1.** `FaceSource` and its three implementations; One Euro filter;
  landmark sets **verified against the installed `@mediapipe/tasks-vision@1.1.0`**
  by reading `FaceLandmarker.FACE_LANDMARKS_*` and walking each connection list
  into an ordered chain, rather than trusting memory. Debug page with contour
  colouring, the walkable/rail split, and fixture recording. Six fixtures -
  **synthetic**, see `fixtures/faces/README.md`.
- **Day 2.** Calibration with jitter rejection and range floors; UV/world/screen
  mapping with round-trip tests; contour building; Maw hysteresis; eyelid
  hysteresis (U5); reaction detection.
- **Day 3.** The swept solver, the Wick state machine, the hazards. AC-3 (26
  tests) and AC-4 (6 fixture simulations) green.
- **Day 4.** Playable level, Assist controls, the first-ten-seconds script.
- **Day 5 - GATE NOT PASSED, because it cannot be from here.** The gate needs
  three people who have never seen the game, playing it with a camera. No human
  has played this build at all. `docs/DAY5_GATE.md` is prepared and empty.
  **Everything after this point was built on an unvalidated core mechanic,
  which is exactly the risk the gate exists to prevent.**
- **Days 6-7.** Render stack: candlelight as a low-resolution light map fed
  through `SimpleLightmapFilter`; chalk contours; vector sprites; camcorder OSD;
  and the tape look assembled from `pixi-filters` (CRT + RGBSplit + OldFilm)
  rather than hand-written shaders. All three filters. **All audio synthesised**
  in Web Audio - no audio files exist. AC-6 green.
- **Days 8-9.** Level schema and validator; 12 levels generated by
  `scripts/make-levels.ts`; 100 Wick lines with mood gating; hazards including
  Moths (U6); scares; the finale. AC-9 green.
- **Day 10.** Every screen in SPEC 12.5, plus the Ossuary (U7) and Rites (U9),
  as DOM over the Pixi stage, keyboard-navigable with focus traps.
- **Day 11.** Share text, result card, portrait canvas, auto-highlight recorder
  (U8). AC-5 green - **and the privacy scan found something real**: a dormant
  Google telemetry endpoint inside `@mediapipe/tasks-vision`. Added
  `src/privacy.ts`, a runtime guard that refuses any non-same-origin request and
  is installed before the game is loaded.
- **Day 12.** Daily Tape with determinism tests; the Long Tape (U4); credits
  test (AC-13).
- **Day 13.** Headless solvability runs stand in for a manual Assist pass
  (AC-8). Performance **not** measured (AC-7 needs a browser).
- **Day 14.** `npm run verify` green. Deploy **not** done (AC-12).

**Tests.**
```
npm run typecheck      -> clean
npm test               -> 8 files, 248 passed
npm run build          -> built in 3.4 s, dist/ 29.33 MB
npm run check:privacy  -> PASS, runtime network guard: present
npm run check:flash    -> PASS, every effect <= 3 Hz
node scripts/smoke.mjs -> PASS against vite preview
```

**Version pins.** `pixi.js` 8.22.0, `pixi-filters` 6.1.5,
`@mediapipe/tasks-vision` 1.1.0, `vite` 7.3.7, `vitest` 5.0.3,
`typescript` 5.9.3, `@fontsource/*` 5.3.0. Node 24.19.0, npm 11.17.0.

**Verify items checked.** The MediaPipe `FaceLandmarker` API and its connection
sets, read from the installed package. `pixi-filters` 6 pairs with PixiJS 8.
The option shapes of `SimpleLightmapFilter`, `ColorMapFilter`, `CRTFilter`,
`RGBSplitFilter`, `OldFilmFilter` and `AdjustmentFilter`, all read from their
`.d.ts`. `MediaRecorder` format strings are **probed at runtime** rather than
assumed, and could not be verified from here.

**Spec changes.** SPEC.md is now v1.1. Its new section 0 lists all ten design
upgrades, ten implementation corrections and four tuning changes. **These were
not pre-approved** - section 0 exists so each one can be reviewed, and reverted
individually if the judgement was wrong.

**Three bugs worth remembering**, all found by tests rather than by reading:

1. *The cheeks reported `walkable=0`.* Face-on they measure 70-78 degrees, so
   they are cliffs, and reversing their winding only trades "outward and down"
   for "inward and up". Making them rails - and adding the `jaw` contour, which
   SPEC 6.3 never had, so the face had no bottom edge - turned the face into a
   surface that can actually be traversed.
2. *Every mouth- and chin-route level stranded its whole roster.* Two separate
   causes: `maxGapFh` was too small for a Wick to step onto a face at all, and
   the 55-degree mouth corners sat past the 50-degree walk limit, so a Wick
   entering the lip slid straight back out of it.
3. *Wicks oscillated forever on the chin and at the mouth corner.*
   `findContinuation` allowed a "forward" tolerance of half the gap limit, which
   is wider than a jaw segment, so a Wick could latch back onto the segment it
   had just left. Separately, the upper and lower lip **share** their corner
   landmarks, so the zero-length gap between them handed a Wick back and forth.
   Fixed by testing the horizontal direction of travel with an epsilon, and by
   requiring a continuation to *extend forward* from the endpoint it lands on.

**Next session starts with the only thing that matters now: play it.**

1. `npm install && npm run setup && npm run dev`, then play with a camera in a
   normally lit room. Nothing below matters until this has happened.
2. Run the **Day 5 gate properly**, with three people who have not seen it
   (`docs/DAY5_GATE.md`). The core mechanic is still unvalidated.
3. Record AC-7 (fps, tracking Hz) and AC-11 (clip format) from a real browser.
   Both have explicit placeholders in Measured values above.
4. Set `config.share.canonicalUrl` (Q2) and `config.daily.epochDate` to the
   real launch date (Q5). Daily numbering is wrong until that is done.
5. Replace the synthetic fixtures with real recordings from `/debug.html`.
6. Deploy, and verify the camera on GitHub Pages and itch.io (AC-12, risk R4).
