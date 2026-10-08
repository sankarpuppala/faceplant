# PROMPT.md — driving Claude Code through FACEPLANT

This file is for **you**. Keep it outside the repository. It is the exact
sequence of prompts to paste into Claude Code, in order, with what to do after
each one. Paste one at a time.

Files that go **into the repository**: `CLAUDE.md`, `SPEC.md`, `PLAN.md`, and
the `docs/` folder (`design-reference.html`, `DAY5_GATE.md`, `PLAYTEST.md`).

---

## Part A — Before the first prompt (30 minutes)

### A1. Install (all free)
Git for Windows · Node.js current LTS · Google Chrome · Claude Code.
A webcam (your laptop's is fine). Good lighting from the front helps tracking.

### A2. Create the repository
```powershell
mkdir faceplant
cd faceplant
git init
```
Copy in `CLAUDE.md`, `SPEC.md`, `PLAN.md` and the `docs/` folder.

### A3. Answer what only you can answer
In `SPEC.md` §21 fill in at least **Q1** (name and tagline), **Q2** (repo and
itch.io page names) and **Q6** (how many hours a day you have). Commit:
```powershell
git add .
git commit -m "Add spec, reference plan, project memory and design reference"
```

### A4. Model and effort
Use `/model` to see what your plan offers.

| Work | Model | Effort |
|---|---|---|
| Prompts 1–2, Days 2–3 (terrain, solver), Day 9 (finale), Prompt 8 | Strongest available (e.g. Fable 5.1 or Opus 5.5 if your plan includes them) | High |
| Days 6–7 (rendering, shaders, audio) | Strongest available | High |
| Days 0, 1, 4, 8, 10–14 | Sonnet 5.5 is fine | Medium–High |
| Prompt 5 (feel tuning) | Sonnet 5.5 — fast iterations matter more here | Medium |

Model names and availability change — use what `/model` lists.

### A5. Session hygiene
- **One plan-day per session.** New session or `/clear` each day; the files
  carry the memory.
- Use **Plan Mode** (`Shift+Tab`) for Prompts 1–2 and the first half of each
  day's prompt.
- Read diffs (`/diff`) before approving. If you can't explain a change, ask
  for an explanation first.
- **Play the game every day.** Claude cannot play it. You are the only one
  who can tell whether it is fun.

---

## Part B — Prompt sequence

### Prompt 1 — Interrogate the spec (Plan Mode, no code)

```
Read CLAUDE.md and SPEC.md in full, and open docs/design-reference.html to
understand the intended look. Do not write code or modify files yet.

You are the contractor; I am the designer. Find the problems in the contract
before we plan. Produce a numbered list grouped as:
(a) ambiguities where two engineers would build different things;
(b) contradictions between sections, or between SPEC.md and CLAUDE.md;
(c) acceptance criteria in §18 that are not mechanically pass/fail;
(d) anything that is unrealistic for a two-week, zero-budget, browser-only
    build — and what you would cut first;
(e) game-design risks: places where the mechanics in §6–§8 could feel
    unfair, unreadable or boring, and anything that weakens the hook in §3;
(f) safety, privacy or accessibility gaps (camera, scares, flashing, audio);
(g) version-sensitive assumptions (MediaPipe API and landmark sets, PixiJS
    and pixi-filters compatibility, MediaRecorder formats) to verify before
    the day that uses them.

For each item: quote the SPEC text, explain the problem in one or two
sentences, propose replacement wording, and where the decision is mine, give
2–3 options with a recommendation. Rank by how badly each would hurt the
project if left alone.
```

**Then:** apply the changes you agree with to `SPEC.md` (or tell Claude
exactly which to apply). Commit: `Spec v1.1 after review`.

---

### Prompt 2 — Review and finalise the plan (Plan Mode, high effort)

```
Read CLAUDE.md, SPEC.md and PLAN.md. PLAN.md is a reference draft, not
approved. Review it critically against SPEC.md as it stands now:

1. Map every acceptance criterion in SPEC §18 and every file in SPEC §19 to a
   specific day. List anything orphaned.
2. Check each day's scope is achievable in one ~6–8 hour session with you
   writing the code. Move or cut work where it isn't, preserving the order
   correctness → fun → beauty → content → sharing.
3. Check the Day 5 gate happens before any art, audio or content work.
4. Mark every version-sensitive item that isn't already marked ⚠ verify.
5. Add missing risks.
6. Check that each "You check" item lets a non-expert catch that day's most
   likely mistake.

Rewrite PLAN.md with your improvements, keeping its structure, and change
nothing else. Summarise every change and why. Write no implementation code.
Wait for my approval.
```

**Then:** read the whole new `PLAN.md`. Mark it `APPROVED — <date>` and commit.

---

### Prompt 3 — Commit skill (once)

```
Create a project-scoped skill called git-commit for this repository. It
should run git status and git diff --staged as context; refuse to commit if
staged files include node_modules, dist, video files (.webm, .mp4),
images of people, or .env files; write a commit message naming the PLAN.md
day and the SPEC.md section(s); then commit. Git commands only. Never push,
never amend, never force.
```

---

### Prompt 4 — Start a plan-day (every day, 0 to 14)

New session each day. Replace `<N>` and `<name>`, then add the day's note from
Part C.

```
New session. Read CLAUDE.md, SPEC.md, and PLAN.md — the Day <N> section and
the Progress log.

We are doing Day <N> only: <name>. Create the branch day-<N>-<name>.

Step 1 (plan mode, now): list every file you will create or modify, the
SPEC section each implements, the build order, the tests that prove each
part, and every ⚠ verify item you will check first and how. Stop and wait for
my "go".

Step 2 (after my go): one file, or one file plus its test, at a time. Run
tests after each and give me a short diff summary. If the spec is ambiguous
or wrong, stop and propose a spec change instead of coding around it.

Step 3: run every "Done when" check for Day <N> and show me the real command
output. Tell me exactly what to play or look at for the "You check" items.
Add a Progress log entry to PLAN.md (versions, measurements, spec changes,
tuning changes), then stop. Do not start Day <N+1>.
```

---

### Prompt 5 — Feel-tuning session (use as often as you like after Day 4)

Play for 10–15 minutes first and write notes as you go. Then:

```
I just played <level(s)> for <minutes>. My notes:
<paste notes — what felt good, what felt bad, where Wicks died unfairly,
when I laughed, when I got bored, anything that felt laggy or floaty>

Propose tuning changes to src/config.ts only — no new features and no code
outside config unless something is clearly a bug (if so, say so separately).
For each proposal give: the config key, old value, new value, which of my
notes it addresses, and what I should feel differently. Keep it to the 5
changes most likely to help. Apply them only after I approve, then add them
to the PLAN.md tuning log.
```

---

### Prompt 6 — Design critique (after Days 6, 7 and 10)

Take screenshots in a bright and a dim room, with each filter, and drag them
into Claude Code:

```
These are screenshots of FACEPLANT. Critique them against SPEC §12 (concept,
tokens, type, render stack, screens, copy voice) and against the feel of
docs/design-reference.html. For each screen: what already feels like a
cursed tape lit by candles; what feels generic, cluttered or cheap; any
readability or contrast problem; anything that would look bad as a 2-second
clip on a phone. Name the element and the specific change. Rank your top 10
changes by impact on how attractive a short clip would look. Change nothing
until I pick.
```

---

### Prompt 7 — Day 5 gate summary

After the playtest, with `docs/DAY5_GATE.md` filled in:

```
Read docs/DAY5_GATE.md. Summarise what the three testers' behaviour tells
us, separating what we observed from what we are guessing. Then give me:
(1) a fix list ordered by impact, each item sized to fit in at most one day
total; (2) your honest recommendation — continue, fix-and-retest, or pivot —
with the reason; (3) what would have to be true for the hook in SPEC §3.1 to
be working, and whether we saw it. The decision is mine; do not change any
code.
```

---

### Prompt 8 — Verify everything (Day 14, or any time)

```
Run the full verification. For every acceptance criterion in SPEC §18, run
the command(s) that prove it, or point to the exact entry in
docs/PLAYTEST.md / docs/DAY5_GATE.md / the Progress log for criteria that
are recorded manually. Produce a table: criterion, evidence (command output
lines or document line), pass/fail. Every row must come from this session.
For failures, don't fix anything — say whether it is a bug or a spec problem
and wait for me.
```

---

### Prompt 9 — When something breaks: fix the spec, not the code

```
<paste the failing output, or describe what you saw while playing>

Before changing code: is this a gap or ambiguity in SPEC.md, or a plain bug
against an unambiguous spec? If the spec is at fault, quote it, propose the
new wording, and wait for my approval. After approval, update SPEC.md, fix
the code, re-run the affected tests and show me the output.
```

---

### Prompt 10 — Close the loop (optional, for your portfolio or professor)

```
Write docs/design-decisions.md explaining the major decisions in this
project from SPEC §20, PLAN.md's Progress and tuning logs and the git
history: why one-way terrain, why FH units and calibration, how the swept
test prevents tunnelling, why the Maw uses personal thresholds with
hysteresis, how privacy is guaranteed, and how the Day 5 and Day 14
playtests changed the game. Where code and spec disagree, say so. Then
write docs/interview-questions.md: ten questions I should be able to answer
without looking anything up. No answers.
```

---

## Part C — Notes to append to Prompt 4

- **Day 0:** "Do the camera hosting test before anything else, and record
  exactly what itch.io does."
- **Day 1:** "Before writing webcamSource.ts, show me the installed
  @mediapipe/tasks-vision API for FaceLandmarker options and the exported
  contour connection sets. Fixtures must contain only the landmarks we use
  and the five blendshapes — no images."
- **Day 2:** "Write the Maw hysteresis tests before maw.ts, using the
  mouth-laugh fixture."
- **Day 3:** "Write the AC-3 solver tests first and show them failing. Then
  demonstrate on a throwaway change that the tunnelling detector catches a
  broken swept test."
- **Day 4:** "Ugly is correct today: circles, lines and rectangles. No art,
  no shaders. Make the first-ten-seconds sequence from SPEC §3.2 work."
- **Day 5:** "No new features. Help me prepare the gate, then use Prompt 7."
- **Day 6:** "Open docs/design-reference.html first and match its feel.
  Check fps after each layer you add."
- **Day 7:** "Write check-flash first. Keep every sound under the limiter."
- **Day 8:** "Write lines in the voice of SPEC §12.6. Give me 80 so I can cut
  the 20 weakest."
- **Day 9:** "Write the scares-off test before any scare event."
- **Day 10:** "Menus are DOM, not Pixi. Use the tokens. Keyboard-navigable."
- **Day 11:** "Write check-privacy before the recorder. The recorder must
  never capture the microphone."
- **Day 12:** "Daily determinism test first."
- **Day 13:** "Measure before optimising, and record the numbers."
- **Day 14:** "Use Prompt 8 at the end."

---

## Part D — Quick fixes

- **Session too long or confused:** "Write a Progress log entry describing
  exactly where we are and what's next, then stop." Start fresh with
  Prompt 4.
- **Claude wants to load MediaPipe or fonts from a CDN, add analytics, or
  record the microphone:** "That violates CLAUDE.md invariant <n>. Keep it
  local."
- **Claude says a level "feels good" or is "balanced":** "You can't play
  it. Tell me what you changed and what I should test."
- **Claude starts on tomorrow's work:** "Stop. That's Day <N+1>. Revert it
  and add it to the plan instead."
- **You don't understand a diff:** "Explain this as if I'll be examined on
  it: what it does, why this way, what breaks without it."

---

## Part E — Launch (Day 14 and after)

You want this to spread, so the launch is part of the project:

1. **Record the trailer yourself:** 15–20 seconds, portrait, using the
   built-in clip. The first 2 seconds must show a Wick landing on your face.
   Ideally capture a real moment where you crack up and the Maw eats them.
2. **Post the clip, not a description.** Short-video platforms, Reddit
   communities that welcome browser games, and itch.io's new-releases feed.
   Caption with the tagline and the link.
3. **Send it to streamers who play short weird web games.** A face game is
   made for facecam streams. One sentence and the link; no attachments.
4. **Watch the Daily Tape share lines.** If people paste them, the ritual is
   working.
5. Be honest about what you can't control: most games don't spread no matter
   how good they are. What you can do is make the 2-second clip
   unmistakable, make sharing one tap, and ship.
