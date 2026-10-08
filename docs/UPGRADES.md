# UPGRADES.md — what changed, and why

Written before implementation. Amends `SPEC.md` v1.0 → **v1.1**. Every item
here serves at least one pillar (SPEC §2) and none of them breaks a CLAUDE.md
invariant.

## The diagnosis

SPEC v1.0 has an excellent hook and a weak **loop**.

The hook — *"the game wins when you lose your composure"* (§3.1) — is written
as **flavour**, not as a system. Nothing in §6–§8 measures composure, nothing
displays it, nothing escalates against it. A player who holds a straight face
simply… wins, quietly. The one thing the game is *about* is the one thing it
never puts on screen.

And the loop ends. Twelve levels, three candles each, then a Daily Tape. There
is no reason for attempt #2 at a level you three-candled, and no score that is
always *almost* better. Novelty gets the first click (§3.6 says so honestly);
nothing in v1.0 earns the fifth.

The ten changes below fix exactly that: make the hook a mechanic, make the
mouth a *choice*, and give the player a number they cannot leave alone.

---

## U1 — COMPOSURE is a real system (the important one)

A bar, visible, top-centre, 0–100. Named **COMPOSURE**.

- It **drains** on every involuntary tell, weighted: laughing ≫ gasp > smile >
  brow-flash > head-flinch. (The reaction detectors in §6.8 already exist —
  they were only feeding Wick lines. Now they cost you something.)
- It **refills** slowly while your face is still and your mouth is shut.
- At **zero** it triggers **THE YAWN**: the Maw opens on its own for 1.2 s,
  whatever your actual jaw is doing. You are not punished for your mouth. You
  are punished for *cracking*.

That last sentence is the whole game, and v1.0 had no way to say it.

**The inversion that makes it great:** the game spends composure *at* you. The
line director (§12.7) reads the bar and escalates — the lower your composure,
the funnier and more personal the Wicks get. Hold a perfect face and they stay
reverent and creepy. Start to go, and they *pile on*. The game is hunting your
face, and it gets better at it the closer you are to losing.

Serves pillars 1 and 2: the hook is now legible in a two-second muted clip,
because the bar is visibly draining.

## U2 — THE OFFERING: your mouth is a weapon as well as a trap

v1.0 mentions swallowing a Crawler as a counter (§8.2) and leaves it there.
Make it the central decision:

- Swallowing a **Crawler** or a **Moth** is an **Offering**: +score, a burst of
  light, and the Wicks cheer (*"it ate for us."*).
- But every frame the Maw is open, nearby Wicks panic **and composure drains
  faster**.

Now the mouth costs something to use and something to not use. One mechanic,
two directions, permanent tension. This is the difference between a gag and a
game.

## U3 — PROCESSION (a combo that you can see)

Consecutive saves with no loss build a multiplier, ×1 → ×8. The multiplier is
not a number in a corner — it is **light**: each step up brightens the lantern,
the Gate and the candle radius, so a high Procession literally reveals more of
your face. Break it and the world dims back down.

A combo you can *see* in a muted clip. Serves pillars 2 and 4.

## U4 — THE LONG TAPE (endless) + a local best

The retention fix. Escalating waves, procedural hazard mixes, no end, one
persistent local best score. Score = saved × procession × composure bonus.
Runs land around 90 s — exactly "one more go" length.

Story mode teaches; the Long Tape is what people actually keep opening.

## U5 — BLINK is terrain

v1.0: *"Eyes are holes (no terrain)."* That throws away the second-most
involuntary thing a face does.

Eyelids now **close into one-way bridges**. The eye is a pit when open and a
crossing when shut. Levels can require you to *hold your eyes open* to keep a
pit open, or to blink on cue to let a Wick across. You cannot not blink — which
is the entire point of the game applied to a new muscle.

## U6 — MOTHS

An aerial hazard that flies toward the **brightest flame** and snuffs it.
Counter: the draft from a **wide-open Maw** blows moths away. So the moths push
you toward opening your mouth, and the Maw punishes you for it. Another
dual-use squeeze, reusing U2's machinery.

## U7 — NAMED WICKS and THE OSSUARY

v1.0 already has the instinct (*"brother kevin is gone."*) without the system.

Every Wick gets a name. Lost Wicks are written permanently into a local
**Ossuary** — name, cause, and the last thing they said. Saved Wicks come back
in later runs with earned titles (*"kevin, twice-blessed"*, *"agnes, who has
seen the maw"*).

Attachment makes the loss funny instead of arithmetic, and a growing list of
dead candles with their last words is a screenshot people post without being
asked. Collection is retention.

## U8 — AUTO-HIGHLIGHT clip

v1.0 records the whole attempt (§16). Nobody watches 90 seconds.

Keep a rolling buffer instead and auto-cut the **6 seconds around your biggest
composure crash** — the exact moment you cracked. One tap, portrait, done.
Still opt-in, still local, still previewed, still never stored (invariant 3).

The clip is now *the moment* rather than *the session*. Serves pillar 4 harder
than anything else in this document.

## U9 — RITES (small, local meta-progression)

Candles buy four permanent **Rites**: steadier wicks, slower spawn, a wider
gate, one second chance per run. Gives the candle economy somewhere to go
beyond unlocking one filter, and gives a failed run a consolation that
compounds.

## U10 — Play first, camera later

v1.0's title screen offers *Play without camera* as the quiet secondary. Invert
the funnel: the first level is playable **instantly** in Assist with no
permission prompt at all, and the camera is offered afterwards as an upgrade
(*"it plays better when it plays you"*).

Nobody grants a camera to a game they have not played. This one change
probably matters more for reach than the other nine combined.

---

## What I did not add, and why

- **Online leaderboards** — SPEC §5.3 rules out servers, and the invariants
  rule out network calls. The Long Tape's local best plus shareable text is the
  zero-budget equivalent, and it keeps the privacy story absolute.
- **More hazard types** beyond Moths — the squeeze between Maw-as-weapon and
  Maw-as-trap is already the deep part. More hazard nouns would add noise, not
  depth.
- **Two Faces** (§11.3) — stayed a stretch goal. It needs a second person in
  the room, which is a hard dependency for a first session.

## Invariant check

| Invariant | Status |
|---|---|
| 1 camera never leaves device | unchanged; U8 keeps the buffer in memory only |
| 2 no analytics | unchanged |
| 3 recording opt-in, never stored | U8 is still opt-in, previewed, in-memory |
| 4 photosensitivity ≤ 3 flash/s | U3's light changes are ramps, not flashes; declared in config |
| 5 scares opt-out | U1's escalation is *comedy*, not scares; honours the flag |
| 6 audio limiter | unchanged |
| 7 completable without camera | U5 (blink) is bound to a key in Assist; solvability is tested |
| 8 fixtures are landmarks only | see `fixtures/faces/README.md` — ours are synthetic |
| 9 Wicks never human | unchanged; U7's names are candle names |
| 10 assets CC0/OFL | strengthened — all audio is now synthesised, zero audio files |
