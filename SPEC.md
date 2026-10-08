# SPEC.md — FACEPLANT

Status: **v1.1 — the contract.** When code and this file disagree, this file
wins until the human approves a change. Section numbers are referenced from
`CLAUDE.md` and `PLAN.md`; do not renumber without updating both.

---

## 0. Amendments to v1.0

v1.1 = v1.0 plus the ten design upgrades in `docs/UPGRADES.md` and the
corrections below. **Everything in this section is a change the implementation
has already made, recorded here so the contract matches the build.** The
original v1.0 wording is kept alongside each entry so the reasoning stays
auditable.

### 0.1 Design upgrades (docs/UPGRADES.md)

| # | Change | Touches |
|---|---|---|
| U1 | **COMPOSURE** is a measured resource with a visible bar, draining on every involuntary tell, opening the Maw at zero (THE YAWN) | §3.1, §6.8, §12.4 |
| U2 | **THE OFFERING** — swallowing a hazard on purpose scores and refunds composure; holding the Maw open costs composure | §8.2 |
| U3 | **THE PROCESSION** — consecutive saves raise a multiplier made of *light* | §12.4 |
| U4 | **THE LONG TAPE** — endless mode with a local best | §11 |
| U5 | **Blink is terrain** — an eyelid is a pit when open and a one-way bridge when shut | §6.3 |
| U6 | **Moths** — fly at the brightest flame; an open Maw blows them away | §8.2 |
| U7 | **Named Wicks and the Ossuary** — every Wick has a name; the lost are recorded permanently with their last words | §12.5 |
| U8 | **Auto-highlight clip** — 6 s cut around the biggest composure crash, replacing the full-attempt clip | §16 |
| U9 | **Rites** — candles buy four small permanent effects | §9.2 |
| U10 | **Play first, camera later** — the first level needs no permission prompt | §12.5 |

### 0.2 Corrections found during implementation

1. **The cheeks are rails, not walkable terrain.** §6.3 listed `cheekL`/`cheekR`
   as "walkable only where not too steep". Measured face-on they are 70–78°,
   so nothing can stand on them and reversing their winding only trades
   "outward and down" for "inward and up". They are now **rails**: they capture
   whatever touches them and carry it to the jaw.
2. **The nose is a rail too.** §6.3 called it a slide, which it is — but
   face-on the bridge is 90°, so a one-way surface cannot catch anything on it.
   A rail is the mechanic that makes the fiction work.
3. **`jaw` is a new terrain contour.** v1.0 had no bottom edge to the face, so
   the lower face was an open hole. The jaw is the walkable shelf beneath the
   Maw.
4. **All audio is synthesised; `public/audio/` does not exist.** §14 specified
   CC0 files. Synthesising in Web Audio removes the licence-audit surface,
   removes ~1 MB, removes any possibility of a runtime fetch, and lets the Wick
   squeaks be pitched per Wick. §19's `public/audio/*` entry is withdrawn.
5. **Levels are generated from source, not hand-authored JSON.**
   `scripts/make-levels.ts` and `src/game/routes.ts` own the shared geometry.
   The Daily Tape generator originally duplicated those numbers and every daily
   was unplayable as a result; the solvability test caught it.
6. **Runtime network guard added** (`src/privacy.ts`), strengthening invariant
   1 from "we write no requests" to "no request can leave". Prompted by a
   dormant telemetry endpoint inside `@mediapipe/tasks-vision`. Documented in
   README.md under Privacy, and enforced by `npm run check:privacy`.
7. **UI screens live in `src/ui/screens.ts`**, not the eleven separate files in
   §19. One module keeps the voice consistent and the helpers shared.
8. **`src/game/routes.ts`** and **`src/physics/hazards.ts`** are new; §19's
   `src/physics/{crawler,drip,dark}.ts` are one file.
9. **AC-1's 25 MB target is not met: `dist/` is 29.3 MB.** The entire overage is
   MediaPipe's two wasm builds. A given browser fetches exactly one 13 MB
   build, only on enabling the camera, gzipped to about 5 MB; Assist mode
   fetches neither. `FACEPLANT_SIMD_ONLY=1` drops the no-SIMD fallback and
   brings `dist/` to about 16 MB, at the cost of older browsers. Recorded, not
   silently accepted.
10. **AC-4's fixtures are synthetic, not recorded.** See
    `fixtures/faces/README.md` for exactly what that does and does not prove.
    Replacing them with real recordings is drop-in.

### 0.3 Tuning changes (also in PLAN.md's tuning log)

| Key | v1.0 | v1.1 | Why |
|---|---|---|---|
| `wick.maxGapFh` | 0.06 | **0.14** | 0.06 FH is under two body widths; a Wick could not step from a ruin onto a face at all, so "your face bridges the ruins" (§8.3) was physically impossible |
| `wick.maxStepDownFh` | 0.15 | **0.22** | same reason, for vertical steps |
| `wick.maxWalkSlopeDeg` | 50 | **60** | the corners of a mouth measure ~55°; at 50 a Wick stepped onto the lip and slid straight back off, making the mouth route uncrossable |
| `render.effects.recDot` | not in `reducedEffectsDisables` | **added** | it blinks at 1 Hz, so `check:flash` correctly refused to let it be undeclared |

### 0.4 Open questions still open

- **Q1** name and tagline — kept as FACEPLANT / *Don't open your mouth.*
- **Q2** repo and itch names — `config.share.canonicalUrl` is a placeholder
  (`https://faceplant.game`) and must be set before launch.
- **Q3** Day-5 testers — nobody has played it; see `docs/PLAYTEST.md`.
- **Q5** launch date — `config.daily.epochDate` is set to 2026-10-07 and must
  be changed to the real launch date before release, or day numbers will be
  wrong.

---

## 1. Goal

Ship, within two weeks, a free browser game in which the player's own webcam
face is the terrain that tiny creatures walk on — styled as found-footage
analog horror, played as comedy — and built so that every play session can
become a shareable clip.

---

## 2. Pitch and pillars

**Pitch.** *Your face is their world. Don't open your mouth.*

Tiny candle-headed creatures — **Wicks** — emerge from a lantern door, drop
onto your forehead, and try to reach a glowing gate. Your nose is a slide.
Your eyebrows are ledges that can fling them. Your mouth is **the Maw**: open
it and any Wick above it falls in. You only see your own face by the light of
the candles they carry.

**Pillars** (every feature must serve at least one; cut anything that serves
none):
1. **Your body is the controller you can't fully control.** Involuntary
   reactions matter.
2. **Readable in two seconds.** A muted, silent 2-second clip must explain the
   game.
3. **Creepy-cute.** Unsettling atmosphere, harmless outcome. Laughs and gasps,
   never cruelty.
4. **Every session is content.** Sharing is built in, flattering, and safe.

---

## 3. The hook — why people play

Novelty gets the first click. These five mechanisms are what keep people
playing and make them share. They are design requirements, not marketing.

### 3.1 The game wins when you lose your composure
Opening your mouth wakes the Maw. And the game is deliberately written to
make you **laugh** (Wicks are absurd, deadpan and judgemental about your
face) and, in later tapes, to **startle** you (a gasp opens your mouth too).
Flinching your head causes a **quake** that knocks Wicks off balance. The
adversary is your own reactions. This produces the defining moment: *the
player cracks up, their mouth opens, and the Wicks they were protecting fall
in.* That moment is funny to do, funnier to watch, and it is the clip.

### 3.2 The first ten seconds
Insert face → your face appears in near-darkness → a single Wick drops onto
your forehead, its flame lighting your skin → it whispers *"…warm."* → most
players laugh → their mouth opens → the tutorial Maw is harmless, and the
Wick says *"do not wake the maw."* The whole premise is taught without a
single instruction screen.

### 3.3 You are being watched (and judged)
Wicks react to your face in real time: smiling (*"it is smiling. why is it
smiling."*), raising eyebrows (*"the cliffs moved!"*), leaning in (*"it comes
closer…"*), opening your mouth (*"THE MAW STIRS"*), laughing (*"it is
laughing. we are not safe."*). Being commented on by tiny creatures standing
on your face is the main source of comedy.

### 3.4 Every run is a reaction video — and a flattering one
Raw webcam footage is unflattering and people won't share it. FACEPLANT never
shows it raw: the default VHS candlelight look makes any face in any room look
cinematic, and **INK** mode replaces your face with glowing contour lines for
anyone who wants to share or stream without showing their face. The result
screen offers a portrait clip (for Shorts, Reels and TikTok) and a result
card, both carrying the game's name.

### 3.5 A daily ritual and a social mode
- **Daily Tape:** one new level per day, identical for everyone; your first
  attempt is the one that counts; a copyable result line like
  `🕯🕯🕯🕯🕯🕯👄🕯🕯 saved 8/9 · the maw woke 2×`.
- **Two Faces** (stretch, §11.3): two players in one frame; some gaps can
  only be bridged cheek-to-cheek. Couples and friends pressing their faces
  together to save tiny candles is the second kind of shareable moment.

### 3.6 Honest novelty statement
Face-*controlled* games exist (face as joystick), "try not to laugh"
smile-detection apps exist, and biofeedback horror exists. As far as the
developer's search found, using the face itself as physical terrain — where
expressions reshape the level — has not been done. Do not claim more than
this in store copy or presentations.

---

## 4. Fiction and tone

You have found an unlabelled tape. When it plays, it plays *you*.

The Wicks are a tiny, devout, nervous people who believe the Face is a
mountain that dreams. They carry their flames across it to reach the Gate.
The Maw is its hunger; the Dark is what's left when flames go out. Their lore
is written on ruins around the level in deadpan warnings: *IT SMILES BEFORE
IT EATS. · WALK SOFTLY ON THE NOSE. · WE TRUST THE FACE.*

Tone: **creepy-cute, deadpan, never gory.** Swallowed Wicks produce a small
gulp, a puff of smoke, and an unlit candle on the counter — never blood, never
screaming in pain. Scares are atmospheric and brief.

---

## 5. Scope

### 5.1 MVP (must ship in two weeks)
- Webcam face terrain with calibration; Assist mode (no camera).
- Wicks, Gate, spawn lantern; Maw; eyebrow flick; quake.
- Hazards: Crawlers, Drips, the Dark.
- **12 levels** across 4 tapes (§9.3) including the finale.
- Daily Tape (procedural from templates).
- Visual identity: candlelight darkness, three filters (VHS, INK, THERMAL),
  camcorder OSD, all screens in §12.5.
- Wick reaction lines (§3.3), ≥ 60 lines.
- Audio (§14).
- Share: copy text, result card PNG, opt-in portrait clip.
- Settings: scares, effects, filter, hide-my-face, controls, recalibrate,
  recording, volume.
- Deployed to GitHub Pages and itch.io.

### 5.2 Stretch (only if MVP is complete and polished)
- Two Faces tape (3 levels).
- 4 extra levels; the "something behind you" segmentation scare (§10.2) if
  not completed in MVP.
- Mobile browser support beyond best-effort.

### 5.3 Out of scope
Accounts, servers, online leaderboards, multiplayer over the network,
monetisation, ads, analytics, level editor, native apps, voice/microphone
input, localisation.

---

## 6. Core mechanics — from face to world

### 6.1 Face input
`FaceSource` (`src/face/types.ts`) produces `FaceFrame`s:
```ts
interface FaceFrame {
  t: number;                       // ms, monotonic
  faces: FaceData[];               // 0..2
}
interface FaceData {
  points: Record<ContourName, Vec2[]>;   // world FH coordinates, mirrored (selfie view)
  blend: { jawOpen: number; smile: number; browUp: number; blinkL: number; blinkR: number };
  center: Vec2;                    // FH, relative to calibrated neutral centre
  scale: number;                   // current face height / calibrated FH
}
```
Implementations: `WebcamFaceSource` (MediaPipe Face Landmarker, VIDEO mode,
blendshapes on, GPU delegate with CPU fallback), `SyntheticFaceSource`
(Assist mode, §13), `FixtureFaceSource` (tests, replays
`fixtures/faces/*.json`).

### 6.2 Smoothing
Every landmark coordinate passes through a One Euro filter
(`config.face.oneEuro`: `minCutoff`, `beta`, `dCutoff`). Blendshapes pass
through an exponential moving average. Physics interpolates terrain between
tracker frames.

### 6.3 Terrain
From MediaPipe's documented landmark connection sets (⚠ verify the exported
constants in the installed `@mediapipe/tasks-vision`), build ordered
polylines:

| Contour | Source | Role |
|---|---|---|
| `forehead` | Face-oval points above the eyebrow line | Dome; main walking surface |
| `browL`, `browR` | Upper eyebrow contours | Ledges; flick launchers (§6.5) |
| `nose` | Bridge from between the brows to the tip, then tip to base | Slide |
| `lipUpper` | Outer upper lip | Bridge across the mouth when closed |
| `lipLower` | Outer lower lip | Ledge below the Maw |
| `cheekL`, `cheekR` | Face-oval sides between brow line and jaw | Walkable only where not too steep |

**All terrain is one-way:** Wicks land on it from above and pass through it
from below. A segment is walkable only if its upward normal is within
`config.terrain.maxWalkableAngleDeg` (default 80°) of straight up; steeper
segments are ignored by the solver. Eyes are holes (no terrain).

### 6.4 The Maw
- Open/close uses `blend.jawOpen` with **personal thresholds** from
  calibration (§7): open when `jawOpen > base + 0.45 × (wide − base)`, close
  when `< base + 0.30 × (wide − base)`, and only after the state has held for
  `config.maw.minStateMs` (80 ms). Hysteresis prevents flicker.
- While open: `lipUpper` is removed from terrain; the polygon between inner
  lips becomes a **swallow sensor**. A Wick or Crawler whose centre enters it
  is swallowed (gulp, smoke puff).
- Wicks within `config.wick.mawFearRadiusFh` (0.4) of an open Maw turn away —
  but slopes and quakes can still deliver them in. This keeps it fair.

### 6.5 Eyebrow flick
If a Wick is grounded on `browL`/`browR` and that brow's upward velocity
exceeds `config.flick.minBrowSpeedFhPerS` (1.2), the Wick receives an upward
impulse proportional to brow velocity × `config.flick.gain`, clamped to
`config.flick.maxImpulseFhPerS`.

### 6.6 Quake
If face-centre speed exceeds `config.quake.speedFhPerS` (2.5), grounded Wicks
lose grip for `config.quake.stumbleMs` (300) and receive a small random
lateral impulse. (Flinching at a scare causes this.)

### 6.7 Lean and tilt
Leaning towards the camera scales the terrain (wider bridges); tilting the
head re-slopes it. These need no special code — they fall out of using live
landmark positions — but must be taught in Tape 01.

### 6.8 Reactions (for Wick lines and stats, not physics)
`laughing`: smile > 0.5 and jawOpen oscillating at 2–8 Hz for ≥ 600 ms.
`gasp`: jawOpen rising by > 0.35 within 150 ms. `smiling`, `browsUp`,
`leaningIn` (scale > 1.15). Each feeds the line director (§12.7) and the
results stats.

---

## 7. Calibration and world units

**FH (face height)** = distance between the top-of-forehead and chin
landmarks in the neutral pose at calibration, in pixels. All world
coordinates are in FH relative to the **neutral face centre**, x right,
y down. Levels are authored in FH, so every player's face fits every level.

Calibration (≈ 20 s, re-runnable from Settings):
1. "Sit where you'll play. Look at the candle." Hold still 2 s → neutral
   centre, FH, `jawOpen` and brow baselines. Rejected if movement exceeds
   `config.calibration.maxJitterFh`.
2. "Open wide — say *aah*." → `wide` jawOpen.
3. "Raise your eyebrows." → brow range.
4. A 10-second practice: one Wick walks across your forehead.

The viewport shows the world region that fits the screen at the calibrated
scale; level geometry outside the visible region is a level-design error
caught by the level validator.

---

## 8. Wicks and hazards

### 8.1 Wick behaviour (state machine)
States: `falling → walking ↔ sliding → flung → saved | lost(cause)`.
- Circle radius `config.wick.radiusFh` (0.035).
- Walk speed `config.wick.walkSpeedFhPerS` (0.35) along the surface tangent;
  inherit the surface's velocity at the contact point (they ride your face).
- **Timid:** turn around at walls, and at edges where the drop exceeds
  `config.wick.maxStepDownFh` (0.15). Step across gaps ≤
  `config.wick.maxGapFh` (0.06) with height difference ≤
  `config.wick.maxStepUpFh` (0.10). Deaths should feel like *your* fault.
- Slide (no walking) on slopes steeper than `config.wick.maxWalkSlopeDeg` (50).
- Lost causes: `maw`, `void` (fell below the world), `drip`, `dark`,
  `crawler`. Saved: entered the Gate.
- Each Wick's flame lights a radius of `config.light.wickRadiusFh` (0.35).

### 8.2 Hazards
| Hazard | Behaviour | Counter |
|---|---|---|
| **Crawler** | Walks along terrain toward the nearest Wick; touching it extinguishes the Wick | Swallow it (it must cross the open Maw), or flick it off a brow |
| **Drip** | Wax drops from fixed emitters at intervals; extinguishes a Wick on contact; blocked by terrain | Tilt so a brow or the nose shelters Wicks |
| **The Dark** | A shrinking safe radius around the level's light anchors; a Wick outside it for > 1 s goes out | Move Wicks quickly; lean to carry them |

### 8.3 Static world
Levels add **ruins** (one-way stone ledges), **walls** (solid both ways),
the **spawn lantern** (Wicks emerge at an interval) and the **Gate** (glowing
doorway). Your face bridges the ruins.

### 8.4 Solver (decision D2)
Custom 2D solver: Wicks, Crawlers and Drips are circles; terrain is one-way
**moving** polylines; static geometry is fixed polylines. Fixed step
`config.physics.stepHz` (120). **Swept test** per segment: evaluate the
circle centre's signed distance to the segment line at the previous and
current step *in the segment's own (moving) frame*; a sign change within the
segment's extent while moving downward relative to it is a landing. On
landing: snap to the surface, mark grounded, inherit surface velocity.
Rapier2D is the fallback only if fixture tests (AC-4) cannot be passed.

---

## 9. Levels

### 9.1 Format (`public/levels/*.json`)
```json
{
  "id": "02-3", "tape": 2, "index": 3,
  "label": "THE MAW · 3", "title": "Supper",
  "timeLimitS": 75,
  "spawn": { "x": -1.4, "y": -1.1, "count": 9, "intervalMs": 1800, "dir": 1 },
  "gate":  { "x": 1.5, "y": 0.9, "w": 0.18, "h": 0.28 },
  "ruins": [ { "points": [[-1.7,-0.9],[-1.0,-0.9]] } ],
  "walls": [ { "points": [[1.2,0.3],[1.2,1.2]] } ],
  "hazards": [ { "type": "crawler", "x": 1.4, "y": -0.8, "atMs": 12000 } ],
  "dark": { "startRadiusFh": 3.0, "shrinkFhPerS": 0.0 },
  "scares": [ { "type": "flicker", "atMs": 30000 } ],
  "lines": [ { "atMs": 2000, "text": "supper time." } ],
  "candles": { "3": 8, "2": 6, "1": 3 }
}
```
Validated against a schema (`src/game/levelSchema.ts`): all coordinates inside
the visible region for a 16:9 screen at default calibration; Gate reachable in
Assist mode (checked manually, AC-8).

### 9.2 Candles (stars)
1–3 candles per level from the Wicks saved (`candles` thresholds). Candles
unlock filters: THERMAL at 12 candles; INK is always available.

### 9.3 Tapes (MVP: 12 levels)
| Tape | Label | Levels | Teaches |
|---|---|---|---|
| 01 | KEEP STILL | 4 | Holding still; the nose slide; tilting between brows; leaning to bridge a gap |
| 02 | THE MAW | 3 | Closed mouth as a bridge; swallowing Crawlers; timing the Maw with Wicks nearby |
| 03 | DON'T LAUGH | 3 | Levels written to be funny (a conga line, a Wick who tells a joke mid-crossing, a dance) with tight timing |
| 04 | DREAD | 2 | The Dark and Drips under flicker; the finale (§10.3) |

Stretch: 4 more levels; Tape 05 TWO FACES (3 levels).

---

## 10. Scares and the finale

### 10.1 Scare events (all suppressed when Scares are off)
- `flicker`: candlelight dips for ≤ 1 s, at ≤ 3 flashes/second.
- `whisper`: a low line of text appears at the frame edge (*"it can see us"*).
- `figure`: a dark silhouette appears at the edge of the frame for ≤ 1.5 s.
- `stinger`: a short sound sting with ≥ 30 ms attack, under the limiter.

### 10.2 "Something behind you" (MVP if time allows, else stretch)
During a scripted scare window only, MediaPipe's selfie segmenter separates
you from your room, and a silhouette is composited **behind you, in your own
room** for ≤ 1.2 s. Segmentation runs only inside that window to protect
performance. If segmentation is too slow on the dev laptop (< 20 fps during
the window), fall back to `figure`.

### 10.3 Finale — "THE FACE LOOKS BACK"
Midway through the last level, the terrain contours stop matching your face
for 2 seconds: they smile and wink on their own (landmarks are modified
before terrain building; your video does not change). The Wicks whisper
*"that is not the face."* Then control returns, the Dark shrinks faster, and
you must get the remaining Wicks home. Ending card: *"thank you for keeping
still."* With Scares off, the finale plays without the independent-face
moment.

---

## 11. Modes

### 11.1 Story
Tapes 01–04 unlock in order; levels within a tape unlock in order.

### 11.2 Daily Tape
Unlocks after Tape 01. Day number = days since `config.daily.epochDate`
(Q5). A level is generated from one of ≥ 4 templates using a seeded PRNG
(mulberry32, seeded from the day number): template choice, spawn count,
Gate position, hazard mix, timing. Same day → byte-identical level JSON.
The first completed attempt is stored and is the one shown in the share
text; replays are allowed but marked "practice".

### 11.3 Two Faces (stretch)
`numFaces = 2`. Each face produces its own terrain and Maw. Levels place
ruins so some gaps can only be bridged when the two faces touch. Calibration
runs per face.

---

## 12. Visual identity and interface

### 12.1 Concept: "the tape plays you"
A cursed camcorder recording in a dark room. Your face exists only where
candlelight touches it. Everything is warm amber against near-black, with the
crisp white text of a camcorder on-screen display. The ruins look like burnt
paper silhouettes with amber rim light. Quiet, cinematic, a little funny.

### 12.2 Tokens (`src/render/tokens.ts` and `src/ui/tokens.css`)
| Token | Value | Use |
|---|---|---|
| `void` | `#07060A` | Darkness, backgrounds |
| `ink` | `#15121B` | Panels, ruins fill |
| `dusk` | `#2B2236` | Raised panels, shadows with colour |
| `bone` | `#EDE6D6` | OSD and UI text |
| `boneDim` | `#9E968A` | Secondary text |
| `candle` | `#FFB547` | Flames, light, primary accent, candle icons |
| `ember` | `#FF6A2B` | Flame cores, highlights |
| `rec` | `#E0322B` | REC dot, the Maw indicator only |
| `mold` | `#5F6E4C` | Crawlers |
| `chalk` | `#FFB547` at 35 % | Face contour line |

UI text must meet 4.5:1 contrast against its background (bone on void is
well above this; check `boneDim` uses).

### 12.3 Type (self-hosted, OFL)
- **VT323** — camcorder OSD, timestamps, counters, the tagline.
- **Special Elite** — tape labels, the title, lore on ruins, Wick lines.
- **Inter** — settings, notices and any text longer than two lines.

### 12.4 Render stack (bottom to top)
1. **Video**: mirrored webcam frame graded by the active filter — VHS
   (default: 70 % desaturated, warm tint, crushed blacks), THERMAL (luminance
   mapped to a thermal palette), INK (no video; black).
2. **Darkness**: `void` at 0.86 alpha with soft radial light holes at each
   lit Wick, the spawn lantern and the Gate. Flame flicker is low-amplitude
   noise at ≤ 2 Hz (off in reduced effects).
3. **Contours**: the face terrain as a thin `chalk` line (opacity 0.6 in
   Assist mode; in INK mode, all face contours glow `candle` and this *is*
   the face).
4. **World**: ruins, walls, lantern, Gate, Wicks, Crawlers, Drips.
5. **Post-process** (PixiJS filters, ⚠ verify `pixi-filters` version for the
   installed PixiJS): scanlines, 1–2 px chromatic aberration, grain, slight
   vignette, occasional tracking wobble. Reduced effects keeps only grain and
   vignette.
6. **OSD**: `● REC` (dot blinks at 1 Hz), elapsed timestamp, tape label
   in camcorder shorthand (`T02/3`), `SP`, decorative battery; bottom-left candle counter
   (lit/unlit icons); bottom-right Maw indicator (lips icon, glows `rec` while
   open — helps players learn their own mouth).
7. **DOM overlay** for menus and dialogs.

### 12.5 Screens
| Screen | Content |
|---|---|
| First-launch notice | 13+, startling moments, flashing-light-safe, "the camera never leaves this device". Buttons: *Continue* / *Continue with scares off* |
| Title | Black with soft CRT glow. **FACEPLANT** in Special Elite, wide letter-spacing, faint jitter (off in reduced effects). Tagline *Don't open your mouth.* in VT323. Primary *▶ INSERT FACE*; secondary *Play without camera*. Footer: *The camera never leaves this device.* |
| Camera explainer | One sentence on what the camera is used for and that nothing is uploaded, then the browser prompt |
| Calibration | §7, with a single candle as the focus point |
| Tape shelf | VHS spines standing on a shelf, video-store style; each spine has a handwritten-style sticker (Special Elite) and its candles; the selected tape is pulled forward and glows; the Daily Tape has a red sticker `daily #017` |
| In-game | §12.4 |
| Pause | VHS `PAUSE ‖` freeze with a slight horizontal tear; Resume, Restart, Settings, Shelf |
| Results | Freeze-frame with VHS pause distortion; a stamp — *KEPT STILL* (none swallowed), *THE MAW AWOKE* (≥ 1 swallowed), *LIGHTS OUT* (none saved); candles lighting one by one; stats (saved x/y, the Maw woke n×, laughs n); *Next*, *Retry*, *Save clip* (if recording), *Save card*, *Copy result* |
| Settings | Scares on/off; Effects full/reduced; Filter VHS/INK/THERMAL; Hide my face (forces INK); Controls Face/Assist; Recalibrate; Clip recording off/on; Volume |
| Ending | Black. *thank you for keeping still.* Credits. |

`docs/design-reference.html` shows the intended look of the title, shelf,
in-game HUD and results; match its feel, not its pixels.

### 12.6 Copy voice
Wicks: lowercase whispers, deadpan, devout, a little judgemental.
OSD: camcorder caps. UI: plain and short. Never cruel, never gory.

Examples — spawn: *"…warm."* · nose: *"big nose. good slide."* · smiling:
*"it is smiling. why is it smiling."* · brows: *"the cliffs moved!"* · lean:
*"it comes closer…"* · Maw opens: *"THE MAW STIRS"* · laughing: *"it is
laughing. we are not safe."* · swallowed: *"brother kevin is gone."* ·
saved: *"we made it. we did not trust it."* · idle: *"do not blink. or do. we
do not know what blinking does."*

### 12.7 Line director
At most one line on screen at a time; minimum 2.5 s between lines;
reaction lines (§6.8) take priority over scripted level lines; no line
repeats within a level; ≥ 60 lines in `src/game/lines.ts`, tagged by trigger.

---

## 13. Accessibility and Assist

- **Assist controls** (`SyntheticFaceSource`): a drawn face that follows the
  mouse; scroll wheel tilts; **Space** opens the Maw; **Shift** raises the
  brows; arrow keys lean in/out. It produces the same `FaceFrame` as the
  webcam. Every level must be completable this way (invariant 7, AC-8).
- Automatic fallback: if tracking is lost for > 2 s, the game pauses and
  offers Assist.
- Hide my face (INK), Scares off, Reduced effects, subtitles are inherent
  (all Wick speech is text), UI text resizes with browser zoom, all menus are
  keyboard-navigable with visible focus.

---

## 14. Audio

Bed: low tape hiss and a slow drone (CC0). Wicks: tiny pitched babble
squeaks generated with jsfxr (no voice acting). Gulp, flame-out hiss, Gate
chime, Crawler skitter, flick *boing*, results candle-lighting tones, scare
stingers. Web Audio with a master limiter (invariant 6). Every file listed in
`docs/CREDITS.md`.

---

## 15. Platform and stack

- **Target:** desktop Chrome and Edge (primary); Firefox best-effort; mobile
  Chrome/Safari best-effort (portrait layout not required for MVP play).
- **Stack:** Vite, TypeScript, PixiJS v8 + `pixi-filters`,
  `@mediapipe/tasks-vision` (Face Landmarker with blendshapes; Image
  Segmenter for §10.2), custom physics, Web Audio, vitest. No React.
- **Assets self-hosted:** MediaPipe wasm and models copied into
  `public/mediapipe/` by `scripts/copy-mediapipe.ts`; fonts as woff2 in
  `public/fonts/`.
- **Performance:** ≥ 30 fps render and ≥ 20 Hz tracking on the dev laptop
  (AC-7). Camera requested at 1280×720; low-power mode uses 640×480 and
  reduced effects.
- **Hosting:** GitHub Pages (primary, camera works on a top-level page) and
  itch.io (⚠ verify on Day 1 whether the embedded iframe permits camera; if
  not, use itch's "open in new window/fullscreen" launch or link to GitHub
  Pages).

---

## 16. Share system

- **Copy result** (text):
  ```
  FACEPLANT · TAPE 02-3
  🕯🕯🕯🕯🕯🕯🕯👄🕯
  saved 8/9 · the maw woke 2×
  <canonical url>
  ```
  Daily: `FACEPLANT · DAILY #017`. One emoji per Wick in spawn order: 🕯 saved,
  👄 swallowed, 💨 any other loss.
- **Result card** (PNG, 1080×1350): the freeze-frame in the active filter
  (INK if Hide my face), the stamp, stats, title and URL. Local download.
- **Clip** (opt-in, off by default): records the whole attempt (levels are ≤
  90 s) from a 720×1280 **portrait** canvas that crops the stage around the
  face, with OSD re-laid for portrait, plus game audio (never the microphone).
  The last 2 s show the result card. Format: MP4 (H.264 + AAC) when
  `MediaRecorder.isTypeSupported` allows it (Chrome 120+), otherwise WebM.
  Preview → *Save* (download) or *Discard*. Nothing is stored after the
  dialog closes.

---

## 17. Configuration (`src/config.ts`)

All defaults below are starting values for tuning; changes after
playtesting are recorded in the Progress log (CLAUDE.md §8 rule 5).

```ts
face:       { cameraWidth: 1280, cameraHeight: 720, oneEuro: { minCutoff: 1.2, beta: 0.02, dCutoff: 1.0 },
              blendEmaAlpha: 0.5, lostTrackingPauseMs: 2000 }
calibration:{ holdMs: 2000, maxJitterFh: 0.03 }
terrain:    { maxWalkableAngleDeg: 80 }
maw:        { openFraction: 0.45, closeFraction: 0.30, minStateMs: 80 }
wick:       { radiusFh: 0.035, walkSpeedFhPerS: 0.35, maxStepDownFh: 0.15, maxGapFh: 0.06,
              maxStepUpFh: 0.10, maxWalkSlopeDeg: 50, mawFearRadiusFh: 0.4 }
flick:      { minBrowSpeedFhPerS: 1.2, gain: 1.6, maxImpulseFhPerS: 3.0 }
quake:      { speedFhPerS: 2.5, stumbleMs: 300, lateralImpulseFhPerS: 0.3 }
physics:    { stepHz: 120, gravityFhPerS2: 4.0 }
light:      { wickRadiusFh: 0.35, darknessAlpha: 0.86, flickerHz: 2 }
dark:       { graceMs: 1000 }
lines:      { minGapMs: 2500 }
render:     { effects: { scanlines: {maxFlashHz: 0}, aberration: {maxFlashHz: 0}, wobble: {maxFlashHz: 1},
              flicker: {maxFlashHz: 3}, recDot: {maxFlashHz: 1} } }
audio:      { limiterCeilingDbfs: -6, scareMinAttackMs: 30 }
clip:       { width: 720, height: 1280, fps: 30, maxSeconds: 95, resultTailMs: 2000 }
daily:      { epochDate: "YYYY-MM-DD" /* Q5 */, templates: 4 }
```

---

## 18. Acceptance criteria (pass/fail)

- **AC-1 Build.** `npm run build` succeeds; `npm run preview` serves a game
  that reaches the title screen; total `dist/` size is recorded (target
  < 25 MB).
- **AC-2 Unit tests.** `npm test` passes, covering: One Euro filter; contour
  extraction yields ordered polylines with no NaN on every frame of every
  fixture; walkability classification; Maw hysteresis (no state change for
  oscillation inside the band; thresholds derived from calibration);
  calibration maths; coordinate mapping round-trip; every level file
  validates; Daily Tape determinism (same day → identical JSON, different day
  → different); share-text format; every config value has a unit in its name
  or comment.
- **AC-3 Solver.** Unit tests: one-way landing; pass-through from below;
  riding a moving segment; the swept test catches a segment moving 0.5 FH in
  one step; sliding above the slope limit; timid edge turn; flick impulse
  clamp; quake stumble.
- **AC-4 Fixture simulations.** For every fixture in `fixtures/faces/`
  (≥ 5: neutral, tilt, lean, brows, mouth/laugh, head-jerk), a headless run of
  `tests/levels/fixture-arena.json` with 20 Wicks for the fixture's full
  length produces **zero tunnelling events** and `saved + lost + alive ==
  spawned` at every step.
- **AC-5 Privacy.** `npm run check:privacy` passes: the built bundle contains
  no absolute `http(s)` URLs except an allowlist (the canonical game URL in
  share text), and no `fetch`/`XMLHttpRequest`/`WebSocket`/`sendBeacon`/
  `EventSource` call with a non-relative URL. In dev mode a
  `PerformanceObserver` logs any cross-origin resource as an error.
- **AC-6 Flash safety.** `npm run check:flash` passes: every effect declares
  `maxFlashHz` ≤ 3, and a unit test shows reduced effects disables flicker,
  aberration, wobble and shake.
- **AC-7 Performance recorded.** Render fps and tracking Hz measured on the
  dev laptop (VHS filter, 20 Wicks) and recorded in the Progress log;
  ≥ 30 fps and ≥ 20 Hz, or low-power defaults are changed via a spec change.
- **AC-8 Assist completeness.** `docs/PLAYTEST.md` records every MVP level
  completed in Assist mode, with date.
- **AC-9 Scares off.** A test runs every level's scripted events (including
  the finale) with scares off and asserts no scare event fires.
- **AC-10 Day 5 gate.** `docs/DAY5_GATE.md` is filled in and the decision is
  signed by the human.
- **AC-11 Share.** On desktop Chrome: copy text matches §16; the result card
  downloads at 1080×1350; with recording on, a clip plays back in the browser
  and ends with the result card. Recorded in `docs/PLAYTEST.md`.
- **AC-12 Deploy.** Playable with camera from the GitHub Pages URL; itch.io
  camera behaviour verified and recorded.
- **AC-13 Credits.** A test checks every file in `public/audio` and
  `public/fonts` appears in `docs/CREDITS.md` with a licence.

---

## 19. Output files

```
CLAUDE.md SPEC.md PLAN.md README.md .gitignore
index.html package.json vite.config.ts tsconfig.json vitest.config.ts
public/mediapipe/          (copied by script; gitignored or committed — decide Day 0, record it)
public/fonts/{VT323,SpecialElite,Inter}.woff2
public/audio/*.ogg|.mp3    (CC0)
public/levels/{01-1..01-4,02-1..02-3,03-1..03-3,04-1,04-2}.json
public/levels/daily-templates/{t1..t4}.json
src/main.ts src/config.ts
src/face/{types,webcamSource,syntheticSource,fixtureSource,oneEuro,calibration,reactions,segmenter}.ts
src/terrain/{contours,build,walkable,maw,mapping}.ts
src/physics/{solver,wick,crawler,drip,dark,world}.ts
src/game/{levelSchema,levelLoader,rules,daily,prng,scares,lines,lineDirector,progress}.ts
src/render/{tokens,stage,video,lighting,contours,sprites,postfx,osd}.ts
src/ui/{tokens.css,copy.ts,notice.ts,title.ts,cameraExplainer.ts,calibrationScreen.ts,shelf.ts,pause.ts,results.ts,settings.ts,ending.ts}
src/share/{recorder,portraitCanvas,resultCard,shareText}.ts
src/audio/sound.ts
src/storage/{settings,progress}.ts
tests/**/*.test.ts  tests/levels/fixture-arena.json
fixtures/faces/{neutral,tilt,lean,brows,mouth-laugh,head-jerk}.json
scripts/{copy-mediapipe,check-privacy,check-flash,record-fixture-notes}.ts
docs/{design-reference.html,CREDITS.md,PLAYTEST.md,DAY5_GATE.md}
```

A dev-only page (`/debug.html` or a `?debug` flag) shows landmarks,
contours, blendshape bars, fps and tracking Hz, and has a **Record fixture**
button that saves the stream (landmarks used + blendshapes only) as JSON.

---

## 20. Decisions log

| # | Decision | Rationale |
|---|---|---|
| D1 | Static browser game, no backend | Zero cost, instant play from a link, simplest privacy story |
| D2 | Custom solver for one-way moving polylines; Rapier2D only as fallback | Deforming terrain with surface velocity is exactly the case general engines handle awkwardly |
| D3 | All terrain one-way | Wicks can never get trapped inside a face |
| D4 | FH units with calibration | Every face, camera and distance fits every level |
| D5 | Timid Wicks (turn at edges) | Losses feel caused by your face, not by dumb AI |
| D6 | Personal Maw thresholds | Mouths and cameras differ; fixed thresholds would feel unfair |
| D7 | Candlelight darkness reveals the face | Atmosphere, flattering in any lighting, and loss of Wicks visibly darkens the world |
| D8 | INK filter doubles as "Hide my face" | Lets people stream and share without showing their face |
| D9 | Clip recording opt-in, local only, portrait | Privacy; and portrait is what short-video platforms want |
| D10 | Scares opt-out and honoured everywhere | Horror must never be forced; accessibility |
| D11 | No leaderboard; share text and card instead | No server; Wordle proved text sharing is enough |
| D12 | Daily first attempt counts | Makes the daily result meaningful to compare |
| D13 | Wicks are candle creatures, never human | Swallowing is comedy only if nobody is a person |
| D14 | DOM menus over a PixiJS stage | Crisp, accessible menus with less code |
| D15 | Desktop Chrome first | Best MediaPipe GPU support and MP4 recording |
| D16 | Day 5 go/no-go gate | Two weeks cannot absorb a mechanic that isn't fun; decide early |

---

## 21. Open questions for the human

- **Q1** Confirm the name FACEPLANT and the tagline *Don't open your mouth.*
- **Q2** GitHub repository name and itch.io page name (for the canonical URL
  in share text).
- **Q3 (before Day 5)** Who are the three Day-5 testers? They must not have
  seen the game before.
- **Q4 (before Day 13)** If time allows: Two Faces, or more polish?
- **Q5 (before Day 12)** Launch date, used as the Daily Tape epoch.
- **Q6 (before Day 0)** Are you working ~6–8 hours a day? If part-time, the
  14 plan-days become about four calendar weeks — the plan still works, just
  slower.
