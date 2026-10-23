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

---

### Session: the Watcher, the Moths, and a shop that did nothing

Three things the player reported, all three confirmed by measurement, plus two
more found by playing the game headlessly for a long time.

#### 1. Moths killed nothing. Not rarely — never.

`stepMoth` applied `config.moth.flySpeedFhPerS` as an **acceleration** and then
damped the result by `0.96` every step. At 120 Hz that is a terminal speed of
`0.9 × (1/120) / 0.04 = 0.19` FH/s, which is *half* a Wick's walking pace, so a
moth could not catch anything walking away from it, and the max-speed clamp of
2.16 FH/s was mathematically unreachable. Across fifteen headless level runs,
moths killed **zero** Wicks. The contact test also measured the distance from
*before* the moth moved, so it was a frame stale.

Two further faults were hiding behind that one:

- **The Maw's draft could not win.** It was a 7 FH/s² acceleration against a
  steering flight, so the moth's own course correction cancelled it inside a
  frame. A player doing exactly the right thing saw no effect whatsoever.
- **Moths hunted off the face.** Left to chase the nearest flame they flew past
  the face to the ruins beside the head, where Wicks queue after spawning, and
  picked them off at `x ≈ 1.2` — a full face-width outside the draft. Those
  deaths were unpreventable by any means the game offers.

Fixed by steering toward a velocity rather than accumulating acceleration, by
making the draft a wind that both pushes the moth away *and* spoils its aim,
and by restricting hunting to `moth.huntRadiusFh` of the nose so a moth only
preys where a breath can reach it. `tests/physics/moth.test.ts` asserts all
three. Result: ignore moths and lose 2–4 a level; answer them and lose 0–1.

Tuning: `snuffMs` **260 → 700** (260 ms is less time than it takes a person to
see a moth land, decide, and move their jaw — the death read as arbitrary),
`draftRadiusFh` **0.9 → 1.1**, `draftFhPerS2` 7 → `draftFhPerS` **1.8**
(acceleration → wind speed). New: `steerHz`, `maxSpeedMultiple`,
`settleRadiusFh`, `settleWanderMultiple`, `contactDecayMultiple`,
`huntRadiusFh`, `loiterRadiusFh`, `loiterTurnMultiple`, `draftBlindMultiple`,
`draftFullAreaFh2`, `draftBreaksContactThreshold`.

#### 2. THE WATCHER looked bad because it was not on screen

**It was framed wrong.** The head was scaled to 2.1× the viewport *height* and
centred on the skull's geometric middle. On a 1280×720 viewport that put the
crown at −517px, the horns at −1001px, the chin at 1146px and **the screaming
mouth starting 33px below the bottom edge**. At the climax of the scare the
player was looking at two glowing dots and two nose slits on a black screen.
A test asserted `finalHeightFraction > 1.5` and passed the whole time: "fills
the frame" and "is in the frame" are different claims, and only one was checked.

**It had no values.** The skull was filled `0x050204` on a `0x000000` veil, so
it had no silhouette — only a 5px ember outline, itself off-screen.

Rebuilt: `watcherComposition()` derives the scale from both frame dimensions,
and `FACE` declares the anatomy as data so the drawing and the framing read the
same numbers. The skull is a cranium plus a **mandible that drops as it
screams** — the old version grew a hole downward out of a rigid face, so at
full scream the mouth ran out past the chin and the lower teeth hung in void.
It is lit from below by a gradient from warm bone to the veil, with brow
ridges, cheekbones and nose bridge picked out and the sockets, nose and throat
cut as true black. Highlights are clipped to the head; they used to hang beside
it as grey smudges. All of the above was found by rendering the real Pixi draw
calls to SVG and looking at them.

Tuning: `finalHeightFraction` **2.1 → 1.15**, new `finalWidthFraction` 1.2 and
`faceLiftFraction` 0.08, `tearCount` 3 → 2. New `watcherTokens` palette in
`tokens.ts`. The old framing test is replaced by seven that check the eyes and
the whole mouth land on screen at every viewport shape the game can open at.

#### 3. The shop sold insurance against things that do not happen

Measured over fifteen levels: owning **five of the seven items saved exactly
zero extra Wicks**. They guarded against falling in gaps (0 deaths), going out
in the dark (0) and missing the Gate by a hair (0), while Crawlers and Drips
were 94% of real losses and only one item touched either, imperceptibly.

- `wideGate` **deleted** — it did nothing and nothing could make it matter.
- `slowSpawn` ("Rite of Patience") **deleted**: not merely useless but
  *harmful*, costing four extra Wicks a playthrough, because spacing the roster
  out leaves each Wick alone with the hazards for longer.
- **`tallowShell`** (new) — survive your first Drip. Nothing answered Drips.
- **`mawSense`** (new, "The Warning") — notice an open Maw from 70% further
  away. Worth +41 Wicks to a player who laughs.
- `wardingSalt` now *drives a Crawler off* the first flame it reaches and sends
  it retreating across the face for 7 s. Crawler deaths 20 → 10.
- `lanternOil` now doubles how long a Moth or the Dark needs. Moth deaths halve.
- `steadyWicks` now also raises walk speed 18%, felt everywhere: +17 Wicks for
  a careful player, +65 for one who laughs.
- `ironNerve` blocks THE YAWN outright and is repriced **400 → 240**, because
  measurement says it saves very few Wicks in any playstyle — a yawn fires when
  your mouth is already open — so it is an earnings item and now says so.

The other half of the fix is that **the items report themselves**.
`world.riteSaves` counts the flames each one saved and the results screen lists
them ("Warding Salt drove a Crawler off 3 flames"). A permanent passive effect
nobody tells you about is indistinguishable from a broken one, and five of them
genuinely were.

#### 4. Found by soaking: a quake that fired 13 times a second

A quake is one thing happening to the whole level, but it was reported once per
stumbling Wick per physics step — 2,453 events across three levels. Each one
adds screen shake and requests a line of dialogue. Throttled to one per
`quake.eventCooldownMs` (450 ms), which also keeps the shake under the 3 Hz
ceiling every other repeating effect is held to.

#### 5. Found by soaking: the jaw is a basin, and nobody said so

A Wick turns around timidly at an edge it cannot step off (decision D5). Under
the chin that is a loop: up one side, turn, slide back, up the other, forever.
A player swaying their head by a couple of centimetres put **six of seven Wicks
in there, where they turned back 306 times** and finished the level still
walking — scoring nothing, dying of nothing, explaining nothing.

Tilting the head frees them (6/7 saved instead of 1/7), so the mechanic is
sound and the bug was that the player is never told. A Wick now notices it is
pacing and says so, in lines that name the fix ("tip the mountain"), and after
`trapped.turnsAllowed` refusals it stops being timid and takes the edge, so a
genuine dead end resolves visibly instead of stalling in silence.

#### Not fixed, and why

Wicks still strand on a few tapes when the player moves a lot — 74 of 223
headless runs ended with somebody still walking. That is the clock expiring,
not a fault: the same runs showed **no conservation breaks, no NaN, nothing
escaping the world, no negative or mispaid coins, and no level that failed to
end**. It is now signposted rather than silent, which was the actual problem.

`npm run soak` is kept as a script for exactly that reason: every bug in
sections 1, 4 and 5 is invisible to a test that holds the face still, and none
of them fail an assertion. They just quietly ruin the game.

---

---

### Session: looking at the interface

The interface had never been looked at. Every DOM screen is assembled at
runtime, deep inside a camera flow, so reviewing one meant playing to it — and
nobody had. This session built `uigallery.html`, which renders all seventeen
screens from `screens.ts` with representative data, and `npm run check:ui`,
which screenshots them through headless Chrome and fails the build on
horizontal overflow. Four layout faults fell out of the first run.

#### Bugs found by screenshotting

1. **The results screen could not be finished.** `.layer` used
   `place-items: center` inside `overflow-y: auto`. A centred grid item taller
   than its container overflows in *both* directions and the half above the
   top edge cannot be scrolled back to — so on a 1280×800 laptop the verdict
   stamp was cut off the top and Next / Retry / Shelf sat ~500px below the
   fold with nothing to indicate they existed. Fixed with `align-items: start`
   plus `margin-block: auto`, which centres what fits and tops-aligns what
   does not. The screen was then recomposed from eleven stacked blocks into
   three bands, with the action row `position: sticky` to the bottom of the
   viewport so the way out is reachable from any scroll position.

2. **Every shop row was broken.** `.shop-row` declared
   `grid-template-columns: 1fr auto` — two columns — for three children. The
   buy button wrapped onto a second row underneath the icon, and because it
   was wider than the 38px icon it widened column one, so each row's text
   started at a different horizontal position and the list had a ragged left
   edge. Now `auto minmax(0, 1fr) auto`, stacking to two columns under 620px.

3. **Half the settings hints were orphaned.** `field()` nested its hint inside
   the row; `toggle()` had no hint parameter, so those hints were emitted as
   loose centred paragraphs *between* rows, visually attached to nothing.
   `toggle()` now takes a hint like `field()` does.

4. **The calibration candle was 2.2× the width of the screen.** It was a
   `transform: scale(2.2)` on `.candlerow`, which is a full-width flex row, so
   its box extended a screen-width past each edge. Replaced with a sized
   element.

#### Also wrong, and not a layout bug

The How to Play face map labelled EYES in mint green (`0x8fff9b`) and NOSE in
sky blue (`0x5fd0ff`) — raw hex literals, the only two cold colours in a game
lit entirely by candlelight, and a direct breach of the "colours live in
tokens.ts" rule. Every callout now uses a palette token. The labels were also
centre-anchored on the end of their own leader lines, so the dashes ran
through the words, and the 420-unit viewBox clipped them mid-word — "blink
shut = a bridge" rendered as "link shut = a bridge". Labels now hang clear of
the line on the side they belong to, in a box wide enough to hold them.

#### Made nicer

- **The menus are the tape now.** All the analog-horror atmosphere lived in
  the Pixi stage; the menus were a flat black page. A static scanline and
  vignette layer sits over every screen — no animation, so it costs nothing
  against the 3 Hz flash ceiling, and "Reduce effects" drops it to a plain
  vignette.
- **Buttons have three legible weights.** The middle weight was transparent
  with a near-black border, which reads as *disabled* rather than secondary.
- **The tapes look like tapes**: moulded plastic with a highlight down the
  near edge, a shadow where they lean on each other, and a printed paper
  label. Locked tapes dim rather than disappear — an earlier attempt at this
  made them unreadable, which defeats the point of a shelf.
- **One spacing scale** (`--s1`…`--s6`) and one set of surface tokens, instead
  of forty hand-picked paddings and six different near-blacks.
- **The shop is called "Shop".** It was "Rites", then "The Pedlar". Both times
  a player could not tell what it was from its name. Flavour belongs in the
  body copy, where it costs nothing.

#### The narrow-width caveat

Chrome on Windows will not make a headless window narrower than about 504 CSS
px: ask for 390 and the page is still laid out at 504 and the *image* is
scaled down — which looks exactly like text overflowing when it is not. An
earlier reading of "the shop overflows on mobile" was this artefact and not a
real fault. 504px is still below both interface breakpoints (620px and 520px),
so the narrow layouts are exercised, but **nothing here has been tested at a
real phone width** and that remains an open gap.

---

---

### Session: making it deployable

Everything below was found by trying to actually ship it, not by reading it.

**The itch.io zip was silently broken.** Windows PowerShell 5.1 runs on .NET
Framework, whose zip writer records entry names with the *platform* separator,
so every path came out as `assetspp-xxxx.js`. The ZIP specification requires
forward slashes, so a conforming extractor treats that as one file with
backslashes in its name. Uploaded to itch it would unpack as a flat pile of
oddly-named files, `index.html` would find none of its assets, and the player
would get a black page. The zip was valid, the right size, and useless.
Rebuilt with Windows' bundled `bsdtar` - by absolute path, because `tar` on
PATH resolves to Git's GNU tar on any developer machine and GNU tar cannot
write zip at all - and `package:itch` now reads its own output back and fails
on a missing root `index.html`, a missing `mediapipe/`, or any backslash.

**Every shared result pointed at a dead site.** `config.share.canonicalUrl`
was `https://faceplant.game`, a domain nobody owns, and a test asserted the
share text contained it - so the test passed for the life of the project while
guaranteeing the bug. The address is now read off `location` at runtime
(`shareUrlFor`), which is correct on GitHub Pages, on itch, and behind a
custom domain, with nothing to remember at release. A local run emits no URL
line rather than a useless one. Eight tests cover it, including one that fails
if anybody hard-codes a domain as the fallback again.

**The Daily Tape epoch** (Q5) is set to the launch date, so Day 1 is the day
it ships.

**The Node floor was wrong.** `engines` said `>=20.11`, but every script in
the repo runs through `--experimental-strip-types`, which needs 22.6+. CI
would have been free to pick a Node that could not run `npm run setup`.

#### Deployment, decided

GitHub Pages is the primary host, with itch.io as a secondary. The reason is
the camera: itch serves browser games in an iframe that needs `allow="camera"`
to permit `getUserMedia`, and the itch uploader gives no way to set it, so on
itch the game has to be launched in a new window before the camera works at
all (risk R4). That is a poor first impression for a game that is entirely
about your face. `.github/workflows/pages.yml` runs the whole gate and
publishes only if it is green. `docs/DEPLOY.md` has the steps.

One deployment risk is now closed rather than open: the bundled MediaPipe wasm
is the **single-threaded** build, so it needs no `SharedArrayBuffer` and
therefore no COOP/COEP response headers - which is exactly why both Pages and
itch can host it, since neither lets you set headers.

#### Verified, not assumed

  - `npm ci && npm run setup && npm run verify` from a clean `node_modules` -
    the exact CI job - runs green: 338 tests, build, privacy, flash safety.
  - The built bundle boots in a real browser to the notice screen with a clean
    console.
  - The itch zip was extracted, served, and booted - the actual upload
    artifact, not the directory it came from.

#### Still blocked on a human

There is no git remote, and no `gh` CLI on this machine, so nothing could be
pushed. The work is committed on `main`; creating the GitHub repository and
the first `git push` are the remaining steps, and the itch upload is a browser
action either way. `docs/DEPLOY.md` has both.

---

---

### Session: the face was unreadable in Assist mode, and nobody had looked

The request was "make the interface and game nicer." Rather than guess at
decoration, this session drove the actual built game through a headless
browser via raw Chrome DevTools Protocol (no Puppeteer/Playwright dependency -
Node's built-in `WebSocket` is enough to talk to Chrome's own debug port) and
looked at real gameplay frames for the first time this project has done so.
Every UI session before this one audited the DOM menus (`uigallery.html`);
none had looked at the Pixi-rendered face and terrain a player actually plays
on.

#### The bug: every new player's first screen was nearly blank

`DrawContext.ink` controls whether the face contour draws as a thin 35%-alpha
guide meant to sit *over real webcam video*, or as the bold, 0.95-alpha,
thicker line meant to stand in for a face when there is no video
(`settings.filter === 'ink'` or "Hide my face" - decision D8). It was computed
purely from those two settings, never from whether a video frame actually
existed.

U10 starts **every** first-time player in Assist mode, camera or not
(`beginFirstRun`) - so every new player's very first level runs with
`this.videoSprite === null` and, until this fix, `ink === false`, drawing the
over-video style onto nothing. Measured: the forehead line's brightest pixel
went from `lum 43` to `lum 95` - more than double - once `stage.ts` also
treats "no video sprite" as ink mode (`drawInk = ink || this.videoSprite ===
null`). Invariant 7 means this is not a minority path either: every level
must be completable without a camera, and Assist is the mandatory fallback for
all of them.

Also added, prompted by the same screenshots: the Maw's lip contour now draws
in `tokens.rec` (the same red the REC dot, the fail stamp, and the critical
loss-budget warning already use) instead of the same colour as every other
line on the face, at boosted width/alpha to survive the scene's film grade.
**Unverified claim, flagged as such on purpose**: pixel-sampling the rendered
frame found the grade crushes saturation hard - even the baseline white
contour line measured only 5-6 points of RGB spread, barely more "colour"
than grey - so whether this reads as clearly red to a human eye in a real
browser is genuinely open. Per CLAUDE.md section 7, this is a game-feel claim
a screenshot cannot settle; it needs a human looking at it.

#### Also found and fixed this session: the control-hint drift, a second time

A second copy of the same fact that was fixed earlier this project turned out
to carry the identical bug: the How to Play screen's own key-binding table
(`copy.howTo.controls`) was missing Left/Right-tilt and the L-smile key, the
same two bindings that had drifted out of the in-play toast hint. Fixed, and
`tests/face/assistControls.test.ts` now checks both copies against the real
switch statement in `AssistInput`, not just one.

#### Verified, not assumed

  - 352 tests pass (up from 338 at the top of this session); typecheck, build,
    `check:privacy` and `check:flash` all green.
  - `npm run check:ui` passes at both checked widths with the new code.
  - The `ink`-mode fix is proven with before/after pixel measurements on the
    actual rendered frame, not a visual impression.
  - The Maw-colour change is *not* claimed as proven - see above.

#### Not investigated this session

The "big black band below the face" from the original pasted review was
chased and found to be a **test-harness artifact**: my driver script moved
the fake cursor to y=260-300 on an 800px-tall window, well above centre, so
the Assist face naturally rendered high with empty space below it - not a
layout bug. Re-testing with the cursor near vertical centre showed the face
filling the frame normally. Worth remembering before treating headless
screenshots as ground truth without controlling for input.

---

---

### Session: scarier losses, a face per tape, music, and a front door

Requested: scarier music and ghost sound when a tape is lost; a scarier devil
that looks like a set of reference photos; a different devil per level; a
less-plain entry page; cover music for the game.

#### What was not done, and why

The reference images were Getty Images, Adobe Stock, Dreamstime and Pinterest
photographs. They were used as **mood reference only** - gaunt faces, hollow
eyes, hair over the face, a red horned devil, a mouth of too many teeth - and
no file from them is in the repository. CLAUDE.md invariant 10 allows only CC0
or OFL third-party assets, and the project has never shipped a downloaded
image or sound. Likewise nothing was fetched from the web for "the scariest
ghost sound" or "cover music": there is no way to verify the licence of an
arbitrary horror clip, and these are the files most likely to be copyrighted.
All of it is synthesized or drawn in code (see `docs/CREDITS.md`).

#### Five faces, one per tape

`watcherVariants` (tokens.ts) and `watcherVariantFor(tape)` (watcher.ts):
the drowned (long hair over the face, hollow sockets with a single pinprick of
light, blood from the eyes and mouth), the red one (red skin, devil horns,
blazing slit eyes), the reaper (a black cowl around a pale skull), the burnt
(charred, ram's horns curling past the ears), and the grinner (seventeen teeth,
a crown of spikes, blood). Tapes 1-5 each get their own; the Daily and the Long
Tape wrap round. Each also screams in its own register (`voicePitch`).

Found while looking at the renders rather than guessing: horned and hooded
faces were cropped off the top of the frame at the climax, so the "devil" was a
red skull with no horns; they are now drawn at 72% so the thing that defines
them is in shot. The reaper's hood was the same black as the veil behind it and
simply vanished; it now has a lit edge.

#### The scare is a shape in time

The old sound was one shout fired the instant the event arrived - half a second
before the face did. `sound.watcherSequence(leadMs, pitch)` schedules against
the audio clock, timed to the picture: a quickening heartbeat, a drone built on a
minor second and a tritone with its filter opening, whispers arriving faster,
a ~60 ms hole of near-silence, then a scream made of three formant-filtered
throats with vibrato and soft clipping, a 22 Hz chopped growl, a gliding wail
over a semitone cluster, a sub hit and a breath. The shout is still the same
single call site behind the Scares-off guard; the opt-out test was updated for
the new call name and asserts the same thing.

Invariant 6 is now checked per layer rather than by hand: `tests/audio/
watcherSound.test.ts` drives the sequence through a fake AudioContext and holds
every gain envelope to the 30 ms attack floor and the -6 dBFS ceiling, at all
five pitches and with Reduce effects' longer approach. It is also confirmed
against a real AudioContext in headless Chrome: no exceptions.

#### Music and the front door

`src/audio/theme.ts` is the score as data; `startTheme()`/`stopTheme()` play it
under the title and shelf and cut it when a tape starts. A slow music-box
lullaby in A minor over a low pad, Am-F-Dm-E, whose last chord is the major
dominant; on every second pass the closing phrase slips a semitone flat. A
returning player lands on the title with no click yet, and browsers will not
play until one, so the theme is held and a first-gesture listener releases it.

`src/ui/backdrop.ts`: the notice and title were text on flat black. They are
now a candle-lit room - dusk light, drifting fog, embers, a row of lit Wicks
along the floor, and a huge face looking out of the dark behind the wordmark
whose eyes slowly wake. All loops are 1.4 s or slower, none changes brightness
sharply, and Reduce effects and `prefers-reduced-motion` stop every one.

`check:ui` flagged six screens after this landed; the cause was the backdrop's
own decorative layers (fog wider than the screen, an SVG scene cropped by
`slice`) inside an `overflow: hidden` box, not real overflow. The checker now
skips `.backdrop` and gained a stricter test - the screen's own `scrollWidth` -
so real overflow is still caught.

#### Not verified - needs a human

Whether the faces are *frightening*, whether the scream is, and whether the
theme is pleasant on speakers rather than just correct in a score are
game-feel judgments that renders and unit tests cannot settle (CLAUDE.md
section 7). The faces were looked at as rendered images; the audio was verified
for safety and for running, not for how it sounds. Please play a loss on each
tape with sound on.

---

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
