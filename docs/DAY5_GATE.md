# DAY5_GATE.md — the go / fix / pivot decision

**Status: NOT RUN. Nobody has played this build.**

PLAN.md puts this gate before any art, audio or content work, so that nine days
are not spent decorating a mechanic that turns out not to be fun. **That order
was not honoured** — the whole game was built in one pass at the human's
instruction, so this gate is now being run on a finished game rather than on an
ugly prototype.

That changes what the gate is for, and it is worth being clear about it:

- It no longer protects the remaining work. That work is done.
- It still decides whether the **core mechanic** is worth shipping, promoting
  and building on, and it is still the only way to find out.
- The sunk cost is now a reason to run it *more* carefully, not less. If three
  strangers do not enjoy this, a polished build does not make it enjoyable.

Fill this in by hand. AC-10 is not met until the decision at the bottom is
signed.

---

## Before they arrive

- [ ] `npm install && npm run setup && npm run build && npm run preview`
- [ ] **Play it yourself first**, for ten minutes, and write down three things
      that felt good and three that felt bad. If it is broken, fix that before
      spending a tester on it.
- [ ] Have the build on a URL they can open themselves, with a working camera.
- [ ] Decide the room: normal indoor light, their face lit from the front. Note
      the lighting, because tracking quality depends on it.

**Build under test**

| | |
|---|---|
| URL / commit | |
| Date | |
| Room and lighting | |
| Camera | |

## The three testers

They must not have seen the game before. Do not explain it.

| | Who (first name is enough) | Plays games? | Wears glasses? | Date |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

## The protocol

Tell them **exactly this, and nothing else**:

> *"Your face is the level. Get the little candles to the door."*

Then **stay silent and watch**. Do not help. Do not explain the Maw. Do not
tell them to hold still. Every question you answer is a question the game
failed to answer, and that is the data.

Watch for, and write down:

- the moment they understand their mouth matters, and how they found out;
- the first time they laugh, and what caused it;
- whether they notice the composure bar without being told;
- anything they say out loud;
- the exact moment they get bored or frustrated.

Let them play until they stop on their own, or ten minutes, whichever is first.

---

## Tester 1

**What they did in the first 30 seconds**

**When did they realise their mouth was dangerous? How?**

**Did they laugh? When, and at what?**

**Did they mention the composure bar unprompted?**

**What did they say out loud?**

**Where did they get stuck, bored or annoyed?**

**How long did they play before stopping?**

**One sentence: what did they think the game was about?**

## Tester 2

**What they did in the first 30 seconds**

**When did they realise their mouth was dangerous? How?**

**Did they laugh? When, and at what?**

**Did they mention the composure bar unprompted?**

**What did they say out loud?**

**Where did they get stuck, bored or annoyed?**

**How long did they play before stopping?**

**One sentence: what did they think the game was about?**

## Tester 3

**What they did in the first 30 seconds**

**When did they realise their mouth was dangerous? How?**

**Did they laugh? When, and at what?**

**Did they mention the composure bar unprompted?**

**What did they say out loud?**

**Where did they get stuck, bored or annoyed?**

**How long did they play before stopping?**

**One sentence: what did they think the game was about?**

---

## Did the hook work?

SPEC §3.1 claims the defining moment is: *the player cracks up, their mouth
opens, and the Wicks they were protecting fall in.* Everything else is
decoration around that sentence.

| Question | Tester 1 | Tester 2 | Tester 3 |
|---|---|---|---|
| Did they laugh at all? | | | |
| Did laughing cost them Wicks? | | | |
| Did they **notice** that it did? | | | |
| Did they try to suppress a laugh? | | | |
| Did they ask to play again? | | | |

**"Did they try to suppress a laugh" is the single most important row in this
document.** If nobody did, the hook is not working, and no amount of filters,
lines or levels will fix that — it would mean the involuntary-reaction loop is
not actually closing, and the game needs a different core.

## Things that only a camera can reveal

| Question | Answer |
|---|---|
| Could they see their own face, or was it too dark? | |
| Did tracking hold up in that room's lighting? | |
| Did anyone with glasses have trouble? | |
| Did the terrain feel attached to their face, or did it lag or jitter? | |
| Did anyone feel motion sick? | |
| Render fps and tracking Hz observed (`/debug.html`) | |

## What they never discovered

List the systems no tester found on their own. Anything here is either badly
taught or not worth keeping.

- [ ] the eyebrow flick
- [ ] the nose slide
- [ ] leaning to widen a bridge
- [ ] tilting to steer
- [ ] swallowing a Crawler on purpose (the Offering)
- [ ] blinking as a bridge
- [ ] the Procession brightening the world
- [ ] the Ossuary
- [ ] Rites

---

## Fix list

From observation only. Each item must fit inside one day. Ordered by impact.

| # | What to change | Why (which observation) | Size |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |

## Decision

Pick one. This is the human's call, not Claude's.

- [ ] **Continue.** The hook worked. Proceed to tuning, then launch.
- [ ] **Fix and re-test.** Spend at most one day on the fix list, then re-test
      with one new person who has not seen it.
- [ ] **Pivot.** The mechanic is not fun. Decide what to keep — the engine, the
      look, the privacy work and the tooling are all reusable.

**Reason for the decision**

**Signed:**  ____________________   **Date:**  ____________
