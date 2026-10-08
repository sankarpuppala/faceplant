# PLAYTEST.md

What has and has not been verified by a human being at a camera.

> **Nobody has played this build.** Not once, not by anybody. Everything below
> marked NOT VERIFIED is genuinely unverified — the tests prove the game is
> correct, and only a person can prove it is fun. Do not read a green test
> suite as a playtest.

---

## Automated, and what that is worth

These run on every `npm test`. They are strong evidence about *correctness* and
no evidence at all about *feel*.

| Claim | How it is checked | Status |
|---|---|---|
| No tunnelling, ever | 6 fixtures × 960 frames × ~3,800 physics steps each, through the real terrain and the real solver | ✅ green |
| Wicks are conserved | `saved + lost + alive == spawned` asserted at **every** physics step | ✅ green |
| No NaN anywhere | landmarks, contours, segments and bodies checked every step | ✅ green |
| Every level is completable without a camera (AC-8) | a scripted calm "player" drives the real `SyntheticFaceSource` through all 12 story levels, 6 Daily Tapes and the Long Tape | ✅ green |
| Losing composure actually costs you | the cracking bot saves fewer Wicks than the calm bot on the mouth route, and loses some to the Maw | ✅ green |
| The Maw never flickers | 400 frames of oscillation inside the hysteresis band produce **zero** state changes | ✅ green |
| Scares off means silent (AC-9) | every level's full script replayed with scares off; the finale too | ✅ green |
| No effect exceeds 3 flashes/s (AC-6) | `npm run check:flash` | ✅ green |
| Nothing can leave the device (AC-5) | `npm run check:privacy` + the runtime guard + a 12-case URL test | ✅ green |
| The build serves and resolves | `node scripts/smoke.mjs` against `vite preview` | ✅ green |

### What the bots cannot tell us

The solvability bot holds a perfectly still face. A real player cannot. So
these automated runs say *"this level is winnable by someone who sits
perfectly still"* — which is necessary, and nowhere near sufficient. In
particular they say nothing about whether the Wicks are **readable**, whether
tilting your head feels **responsive or seasick**, whether the candlelight is
too dark to see your own face in a normally lit room, or whether any of it is
funny.

---

## Human playtests

### AC-10 — The Day 5 gate

**NOT RUN.** `docs/DAY5_GATE.md` is prepared and empty. The gate requires three
people who have never seen the game, with the protocol in that file.

This matters more than anything else in this document. PLAN.md's whole
structure puts the gate before any art, audio or content work, specifically so
that nine days are not spent decorating a mechanic that isn't fun. **That order
was not honoured** — the full build exists on an unvalidated core. If the gate
goes badly, a large amount of this work is sunk, and the gate should still be
run honestly rather than skipped to protect it.

### AC-8 — Assist mode, every level, by hand

**NOT VERIFIED BY A HUMAN.** Automated equivalent is green (see above). Record
here, with dates, once each level has been finished by hand with the keyboard.

| Level | Finished in Assist by hand | Date | Notes |
|---|---|---|---|
| 01-1 Warm | ☐ | | |
| 01-2 Good Slide | ☐ | | |
| 01-3 The Cliffs Moved | ☐ | | |
| 01-4 Closer | ☐ | | |
| 02-1 The Lip | ☐ | | |
| 02-2 Supper | ☐ | | |
| 02-3 Timing | ☐ | | |
| 03-1 The Conga Line | ☐ | | |
| 03-2 A Joke, Mid-Crossing | ☐ | | |
| 03-3 The Dance | ☐ | | |
| 04-1 Lights Out | ☐ | | |
| 04-2 The Face Looks Back | ☐ | | |
| Daily Tape | ☐ | | |
| The Long Tape | ☐ | | |

### AC-7 — Performance

**NOT MEASURED.** Needs a browser with a GPU and a webcam.

| Quantity | Target | Measured | Date |
|---|---|---|---|
| Render fps (VHS, 20 Wicks) | ≥ 30 | | |
| Tracking Hz | ≥ 20 | | |
| Render fps (low-power mode) | ≥ 30 | | |

`window.faceplant.fps` and `window.faceplant.trackingHz` are exposed in the
console for this, and `/debug.html` shows both live.

### AC-11 — Sharing

**NOT TESTED.** `MediaRecorder` does not exist in Node, so the recorder's
format probe returns null in tests. On a real Chrome it should pick MP4.

| Check | Status | Date | Notes |
|---|---|---|---|
| Copy result matches SPEC §16 | ✅ unit-tested | 2026-10-08 | exact five-line shape asserted |
| Result card downloads at 1080×1350 | ☐ | | needs a browser |
| Clip records, previews and plays back | ☐ | | needs a browser |
| Clip format produced | ☐ | | expected `video/mp4;codecs=avc1…` on Chrome 120+ |
| Clip looks right in a portrait feed | ☐ | | upload one privately and look at it |

### AC-12 — Deploy

**NOT DONE.**

| Check | Status | Date | Notes |
|---|---|---|---|
| Playable with a camera from GitHub Pages | ☐ | | |
| itch.io camera behaviour | ☐ | | risk R4: the embed iframe probably needs the new-window launch |

---

## When you do play it, watch for these

Written down in advance so the first session is not wasted on vague
impressions. These are the specific things most likely to be wrong, because
they are the things no test could check.

1. **Can you see your own face?** The darkness is `darknessAlpha` 0.86 with a
   0.35 FH light radius per Wick. In a dim room with one Wick on screen this may
   be genuinely too dark to read. If so, that is `config.light.darknessAlpha`.
2. **Does the gap refusal read as timidity or as a bug?** A Wick that turns
   around at a ledge must look like it *decided* to. If it reads as stuck,
   `maxGapFh` and the turn animation are the levers.
3. **Is the mouth route legible?** You cannot see your own mouth. The Maw
   indicator in the OSD is the only feedback. Watch whether you learn your own
   jaw threshold within one level.
4. **Does tilting feel like steering or like lag?** The One Euro filter
   (`minCutoffHz` 1.2, `beta` 0.02) is the first thing to try.
5. **Does the composure bar read, or is it noise?** It is the one thing a
   stranger watching a muted clip should understand instantly.
6. **Does the Procession brightening land?** It is meant to be felt rather than
   noticed. If nobody notices the world getting brighter,
   `lightBonusFhPerStep` is too small.
7. **Is any of it funny?** Write down the exact line that got a laugh and the
   exact line that fell flat. There are 100 of them; cut the weak ones.
8. **Does the finale work?** Two seconds of your face smiling on its own, with
   scares on, in a dark room.
