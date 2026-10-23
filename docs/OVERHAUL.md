# FACEPLANT — Horror Overhaul Brief

The single source of truth for the overhaul. Claude Code: read this whole file
before writing code, then build in the order of §9. Where this file and
`SPEC.md` disagree, this file wins; update `SPEC.md` to match as you go.

**Goal:** a short, polished, genuinely frightening webcam horror game. The
first version's face tracking, a coherent dark UI that improves on
`docs/design-reference.html`, a clear flow with no dead ends, and sound you
feel in your stomach.

**Unchanged rules (CLAUDE.md §5):** camera stays on device; no runtime network
except same-origin; ≤ 3 flashes/s, no large red full-screen flashes; master
limiter, −6 dBFS peak, ≥ 30 ms attack; "Scares off" honoured everywhere;
every level completable in Assist; Wicks are candle creatures; assets CC0/OFL
and listed in `docs/CREDITS.md`. Scary ≠ loud. Fear comes from **silence,
anticipation, low frequency, wrongness and timing**, not volume or flashing.

---

## 1. What to take from real horror games

| Game | Take this | Apply it to |
|---|---|---|
| **P.T.** | One looping space that gets subtly *wrong*; the radio voice; the figure who is closer every time you look back | Between-level transitions: the same tape-shelf room, slightly more wrong after each loss (candle gone, a scratch on the spine, a tape you never owned) |
| **Iron Lung** | Almost no UI; dread from blindness and one instrument | In-game HUD: only the REC timestamp, Wick count and Maw lips; everything else goes |
| **Fears to Fathom / Puppet Combo** | Found-footage VHS: tape rewind on retry, timestamp that jumps, "SP" tracking noise | Retry = audible tape rewind + scrub; level start = tape insert + tracking settle |
| **Signalis** | Clean, strict, desaturated menus with one accent colour; diegetic numbering | Menus: strict grid, mono labels, one amber accent, red reserved for the Maw and death |
| **Mouthwashing** | Crude-but-precise lo-fi visuals; sudden cut to black, then a held still image | Loss: hard cut to silence before the reveal |
| **FNAF** | Jumpscare = silence → lunge filling the frame → scream; then a static aftermath screen | The Watcher loss beat (§5) |
| **Visage / Amnesia** | Low drones, breathing, wood creaks, sound placed *behind* you (stereo far left/right) | Ambient bed (§6) |
| **The Mortuary Assistant** | Possession glitches: UI briefly shows things it shouldn't | Composure < 30 %: OSD text corrupts for a frame ("REC" → "SEE"), a Wick count that's one too many |
| **Inscryption** | The menu *is* a place and a character who watches you | Title screen: a dark room, a candle, the face in the dark behind it |
| **Little Nightmares** | Big, slow, grotesque silhouettes over small fragile heroes | The Watcher's scale versus the tiny Wicks |

Search on YouTube for a minute of each for reference ("P.T. full playthrough
hallway", "Iron Lung gameplay no commentary", "Signalis menu UI", "FNAF
jumpscare compilation", "Fears to Fathom VHS"). Never copy their assets,
names or logos. Take the technique only.

---

## 2. Visual direction: improve on the design reference

Keep from `docs/design-reference.html`: the camcorder OSD, amber-on-void, the
candle motif and the tape shelf. Push it further toward **found tape in a dead
person's house**. It should feel less cosy and more damp and wrong.

### 2.1 Palette (update `tokens.css` / `tokens.ts` and SPEC §12.2)
| Token | Value | Use |
|---|---|---|
| `void` | `#050407` | Everything |
| `ink` | `#0E0C11` | Panels (barely lifted) |
| `rot` | `#1B1714` | Raised panels: warm, dirty, not purple |
| `bone` | `#E6DFCF` | Text |
| `boneDim` | `#8C8578` | Secondary text (check 4.5:1) |
| `candle` | `#F2A93B` | The ONE accent: primary button, flames, focus |
| `ember` | `#C4521F` | Flame core, hover |
| `blood` | `#8E1B17` | Loss stamp, Maw indicator. Dark, never a full-screen red flash |
| `rec` | `#D8302A` | REC dot only |
| `static` | `#B9C2C9` at 8 % | Grain/noise overlays |

### 2.2 Type
- **Display/title:** *IM Fell English SC* (OFL), engraved and old, like a
  label on a grave. Replaces Special Elite for the wordmark and stamps.
- **OSD/data:** *VT323* (OFL), unchanged.
- **Body/settings:** *Inter* (OFL), 16 px minimum.
- Self-host all three as woff2 in `public/fonts/` and add them to CREDITS.

### 2.3 Surfaces and texture
- Every full screen sits inside the **CRT frame**: 4 % vignette, scanlines at
  6 % opacity, animated grain. Reduce effects keeps grain and vignette only.
- Panels: no rounded "card" look. Use 1 px `bone` 12 % borders, square corners,
  and a slight paper/dust texture. Generate the noise with canvas, or use a CC0
  texture from ambientCG or Poly Haven, converted to a small webp.
- Use a **hand-written strip of masking tape** for labels (tape names,
  stamps), drawn with CSS clip-path. No external image needed.

### 2.4 Button system (one system, used everywhere)
| Kind | Look | Size |
|---|---|---|
| Primary | `candle` fill, `void` text, VT323 uppercase, faint flicker on hover (≤ 2 Hz) | 56 px tall, min 220 px wide |
| Secondary | transparent, 1 px `bone` 40 % border, `bone` text | 56 px tall, same width as the primary in the same row |
| Tertiary | text link with underline-on-hover | 44 px hit area |
- Buttons in a row have equal widths, 16 px gap, centred, and the row is a
  sticky footer of the screen so it is never off-screen or overlapping text.
- Keyboard: arrows/Tab move focus, Enter confirms, Esc = back. Focus ring is
  2 px `candle` with a 2 px offset.
- Selection sound on focus (soft tape click) and confirm sound (heavy
  mechanical clunk). See §6.

---

## 3. The flow (every screen, every exit)

```
[First launch notice] ─► [Title] ─┬─► [Camera permission] ─► [Calibration] ─┐
                                  ├─► Play without camera (Assist) ─────────┤
                                  ├─► Settings ◄─► back                     │
                                  └─► Quit-to-black (credits)               ▼
                                                                    [Tape shelf]
                                         ┌──────────────────────────────┤
                                         ▼                              │
                      [Tape insert: 2 s label + tracking settle]        │
                                         ▼                              │
                                   [Level play] ── Esc ─► [Pause] ─┬─ Resume
                                    │        │                     ├─ Restart (rewind)
                                    │        │                     ├─ Settings
                                    │        │                     └─ Main menu
                                    ▼        ▼
                                  WIN      LOSS ─► [Watcher sequence §5] ─┐
                                    │                                    ▼
                                    └──────────────────────► [Results]
                                                    ├─ Next tape / Try again (primary)
                                                    ├─ Tape shelf
                                                    └─ Main menu
            After the last tape: [Finale] ─► [Ending card] ─► Main menu
```

Rules:
- **No screen without an exit.** Every screen has Main menu reachable in ≤ 2
  inputs, and Esc always works.
- **Loading or tracking lost:** an in-frame "TRACKING…" OSD message with a
  Pause button. Never a blank screen.
- **Retry is instant:** a 0.8 s rewind effect and sound, then the level
  restarts. No re-calibration, no menu.

### 3.1 Screen contents (cut everything else)
- **Notice:** 13+, startling moments, flashing-light-safe, camera stays on
  device. Toggle: Scares on/off. One button: Continue.
- **Title:** wordmark, tagline "Don't open your mouth.", buttons: *Insert face*
  (primary), *Play without camera*, *Settings*. Behind them: the dark room, one
  candle, and the face in the dark whose eyes open after 20 s idle.
- **Shelf:** a row of tape spines with the number, name and candles earned.
  Locked tapes are black spines. The selected spine slides out. Buttons:
  *Play*, *Back*. Keep the shop only if it is one small panel here; otherwise
  cut it.
- **Calibration:** "Hold still. Look at the candle." A ring fills, then
  "Open your mouth.", then done. No paragraphs.
- **HUD:** top-left `● REC 00:01:12`, top-right `T02/3`, bottom-left Wick
  icons (lit/out), bottom-right Maw lips. Composure is shown by the
  **image**, not a bar: vignette closes in, the grain thickens and the drone
  rises.
- **Results:** stamp (*TAPE SAVED* / *TAPE LOST*), one line, the Wick row,
  score, and the button row. **Delete the share text box, Copy result, Save
  card and the clip hint from this screen.** Clip recording, if it stays,
  lives only in Settings.
- **Pause:** Resume, Restart, Settings, Main menu.
- **Settings:** Volume (master/music/sfx), Scares on/off, Reduce effects,
  Camera filter, Clip recording (opt-in), Back. One column, labels left and
  controls right, hints under their own row.

---

## 4. Tone

Rewrite `src/game/lines.ts` and `src/ui/copy.ts`: short, quiet, wrong. No
jokes, no exclamation marks. Wicks whisper in lowercase:
*"it's warm here."*, *"don't breathe."*, *"something under the chin."*,
*"it saw me."*. Loss lines: *"you let it in."*, *"the tape remembers."* The
Watcher never speaks in text. It is only sound and image.

---

## 5. The Watcher (loss sequence), beat by beat

Total about 6 s. With **Scares off**: skip beats 3–5 entirely. Fade to black
with a soft low tone and go to Results.

| t | Picture | Sound |
|---|---|---|
| 0.0–1.2 s | Last Wick snuffs. Candlelight dies one source at a time. The video desaturates to grey | Ambient bed ducks −18 dB over 1 s; a single heartbeat, then a second one slower |
| 1.2–2.6 s | **Something is behind you.** A tall dark shape fades in at the frame edge, low contrast, almost missable. Its eyes catch light once (slow 1 s glow, not a flash). Tape tracking wobble increases | Breathing close in the right channel; a long wood creak; filtered whispers in reverse |
| 2.6–3.1 s | Hard cut to **total silence and black** for 0.5 s. OSD shows only `● REC` | **Silence.** Nothing. This is the scare. |
| 3.1–4.4 s | **The lunge.** The face fills the frame in ~250 ms (scale from 0.4 to 1.25, ease-out with overshoot). Black eye sockets with pin-light pupils, jaw unhinged far too wide, teeth uneven, skin like wet paper. Chromatic tear and 2–3 Hz jaw judder (motion only, no luminance flash). Brightness change < 20 %/frame | 30 ms attack: layered scream (human-ish scream pitched down 3–5 st + animal shriek pitched up + distorted reversed scream tail), a sub boom (40 Hz), a metallic scrape, all into the limiter at −6 dBFS peak |
| 4.4–6.0 s | Freeze-frame the face, then the tape eats itself: horizontal tear, roll and drop to blue/black "NO SIGNAL" | Tape stop and pitch-down wind-down, then hiss, then silence |
| 6.0 s | Results | A low piano note, one hit |

Picture design notes:
- Draw the Watcher procedurally or as layered SVG/canvas (it already exists in
  `src/render/watcher.ts`; redesign its features using the notes above). Its
  silhouette must read in 100 ms: tall, too-thin neck, head tilted 20° and
  eyes slightly misaligned.
- Variation: 5 faces stay, but each loss also randomises the tilt, the mouth
  width and the arrival side, so the scare never becomes predictable.
- *Optional, needs the human's approval (SPEC §10.2 "Something behind you"):*
  composite the silhouette behind the player in their own camera image using
  MediaPipe selfie segmentation, run only during beat 2, on device, and fall
  back to the frame-edge figure if it drops below 20 fps. This is the
  scariest option available, so ask before building it.

---

## 6. Sound

### 6.1 Mixing structure (`src/audio/`)
`ambient bus` + `music bus` + `sfx bus` + `scare bus` → master compressor →
**brick-wall limiter at −6 dBFS** → output. Scare bus is muted with Scares off.
Every file is normalised to −14 LUFS before import. A ducking helper lets a
scare pull the other buses down.

### 6.2 What to get (CC0 only)
Where to look:
- **Freesound.org** with the licence filter set to *Creative Commons 0* (check
  every file's licence badge).
- **OpenGameArt.org** with the licence filter set to CC0.
- **Kenney.nl** audio packs (all CC0): UI clicks, impacts.

Not allowed without the human's approval: Sonniss GDC bundles (royalty-free,
not CC0), Pixabay (own licence), BBC Sound Effects (non-commercial), Zapsplat
(attribution/account). Anything from YouTube is never allowed.

| Sound | Freesound search | Use |
|---|---|---|
| Dark drone bed (looping) | `dark drone ambient loop` | Level ambience |
| Room tone + distant wind | `room tone night`, `wind house interior` | Under everything |
| Wood creak | `wood creak floor` | Random, panned far L/R |
| Breathing close | `breathing heavy close` | Watcher beat 2 |
| Whispers | `whisper unintelligible`, `whispering voices` | Reverse + filter |
| Heartbeat | `heartbeat slow` | Composure < 40 %, loss beat 1 |
| Scream (layer A) | `female scream horror`, `scream` | Pitched down 3–5 st |
| Shriek (layer B) | `pig squeal`, `animal shriek` | Pitched up, short |
| Sub boom | `sub drop impact`, `boom low` | Lunge hit |
| Metal scrape | `metal scrape screech` | Lunge, layered |
| Tape stop / rewind | `tape stop`, `cassette rewind` | Loss end, retry |
| VHS insert / eject | `vhs insert`, `cassette insert` | Level start |
| Tape hiss | `tape hiss loop` | Under OSD |
| Candle snuff | `candle blow out`, `match extinguish` | Wick lost |
| Wet swallow | `gulp swallow` | Wick swallowed by the Maw |
| Music box (detuned) | `music box` (or keep the synthesised one, detuned ±30 cents) | Title |
| Low piano note | `piano low note` | Results |
| UI click / clunk | Kenney *Interface Sounds* / *Impact Sounds* | Buttons |

Convert to mono 48 kHz Opus `.ogg` (loops) or `.webm`, with an `.mp3`
fallback for Safari, each ≤ 300 kB. Put them in `public/audio/<group>/`. Every
file gets a line in `docs/CREDITS.md`: name, author, URL, licence.

### 6.3 Behaviour
- **Title:** detuned music box over the drone. Every third loop one note is
  wrong. A creak plays at a random 20–40 s interval.
- **In level:** drone + room tone. As composure drops: drone filter opens,
  heartbeat fades in below 40 %, whispers below 25 %, the room tone
  disappears below 15 %. The silence warns the player that something is
  coming.
- **Events:** Maw opens = wet low groan (quiet). Wick swallowed = gulp + a
  muffled extinguish. Wick saved = a soft bell, warm but sad.
- **Fake-outs:** at most once per level, a creak plus a breath with nothing
  following. This keeps the player tense; no picture appears with it.
- Synthesised layers in `sound.ts` stay as glue (risers, sub swells). Real
  recordings carry the identity.

---

## 7. Face tracking: return to the first version

Fact: `git diff 5715a98 HEAD -- src/face src/terrain` is **empty**. The
tracker never changed. Do not retune it. The regression is in what surrounds
it.

1. Add a debug overlay (`?debug=1`): tracker Hz, render fps, frame time,
   detect time, landmark-to-contour offset.
2. Measure HEAD against `5715a98` (`git worktree add ../fp-v1 5715a98`) with
   the same camera and lighting.
3. `git bisect` over the 13 commits using tracker Hz and alignment. Name the
   commit that broke it.
4. Likely suspects, in order: the main loop in `app.ts` (detection waiting on
   render, or called per render frame); `render/watcher.ts` and
   `ui/backdrop.ts` running while hidden; postfx filter cost; `stage.ts`
   mirroring, aspect or lift changes moving terrain off the face;
   `physics/world.ts` changes making contact feel wrong.
5. Fix it: drive detection with `requestVideoFrameCallback`, decoupled from
   render. Stop the backdrop/Watcher loops when not visible. Cap postfx. The
   tracker must hold ≥ 25 Hz on integrated graphics. Mapping must match v1.
6. Regression test: fixture replay produces terrain within ε of v1.

---

## 8. Delete

- Share text box, Copy result, Save card, clip hint (results screen) and the
  code that only they use (`share/shareText.ts`, `share/resultCard.ts` if
  orphaned; keep tests consistent and remove ones for deleted code).
- The OSD bottom-left saved bar and "80 s" counter if duplicated by the HUD.
- Any "how to play" paragraph longer than 3 lines. Replace it with the
  diagram plus one sentence.
- Ossuary and Shop screens unless they fit on the shelf as one small panel.
- Unused tokens, icons and copy strings after the rewrite.

---

## 9. Build order (commit after each, run the checks listed)

| # | Step | Check before committing |
|---|---|---|
| 1 | Face tracking (§7) | debug overlay ≥ 25 Hz, fixture test against v1, `npm test` |
| 2 | Tokens, fonts, button system (§2) | `check:ui` + **look at every screenshot** |
| 3 | Flow and screens (§3), deletions (§8) | Walk the whole graph: every screen reaches Main menu |
| 4 | Copy rewrite (§4) | Read it all aloud once; no jokes left |
| 5 | Sound import + buses + behaviour (§6) | `tests/audio/*` (peak, attack), CREDITS complete |
| 6 | Watcher sequence (§5) | `check:flash`, Scares-off test, screenshots of each beat |
| 7 | Full pass | `npm test`, `check:privacy`, `check:flash`, `soak`, `check:ui`, `build` all green |

Done when §9.7 is green and the human has played: a win, a loss with sound
on, a loss with Scares off, and one Assist level. Tests do not prove fear or
feel; ask the human.
