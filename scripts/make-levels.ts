/**
 * Writes the 12 story levels to `public/levels/`.
 *
 * Levels live in source rather than hand-edited JSON so the shared geometry
 * stays consistent across all twelve and every one is validated at authoring
 * time by the same code the game uses. Re-run with `npm run make:levels`.
 *
 * ## The geometry, and why it is what it is
 *
 * SPEC section 8.3 has the whole design in one line: **"Your face bridges the
 * ruins."** The ruins are a road with a hole in it, and the player's face is
 * the only thing spanning that hole. So each level is a *route*: a pair of ruin
 * ledges either side of the face, at a height where some part of the face
 * reaches across.
 *
 * Measured from the live terrain (neutral pose, default calibration):
 *
 *   forehead   x -0.34 .. 0.34   y -0.44 apex, -0.30 ends   walkable, 0-32 deg
 *   brows      x +-0.08 .. 0.30  y -0.19 .. -0.15           walkable ledges
 *   lipUpper   x -0.16 .. 0.16   y  0.20 .. 0.26            the bridge; GONE when the Maw opens
 *   jaw        x -0.16 .. 0.16   y  0.40 .. 0.50 chin       walkable shelf under the Maw
 *   nose       x  0.00           y -0.13 .. 0.14            a rail, aimed at the mouth
 *   cheeks     x +-0.16 .. 0.33  y -0.22 .. 0.40            rails down the sides
 *
 * Three routes follow from that, and each puts a different part of the face
 * under the player's control:
 *
 *   FOREHEAD  ledges at y -0.36, inner ends at x -+0.42. Safe-ish; tilting or
 *             leaning widens the gap past what a Wick will risk.
 *   MOUTH     ledges at y  0.24, inner ends at x -+0.22. The bridge is the
 *             upper lip, so opening your mouth deletes the road mid-crossing.
 *   CHIN      ledges at y  0.46, inner ends at x -+0.24. Crosses the jaw,
 *             under the Maw - safe from the mouth, but the nose rail drops
 *             anything that lands high on the face right beside the crossing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HazardSpec, Level, Polyline, ScareSpec, ScriptedLine } from '../src/game/levelSchema.ts';
import { validateLevel } from '../src/game/levelSchema.ts';
import { CEILING_Y, gateFor, ledges, ROUTES, spawnFor, type RouteName } from '../src/game/routes.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'public', 'levels');

function seg(x1: number, y1: number, x2: number, y2: number): Polyline {
  return { points: [[x1, y1], [x2, y2]] };
}

interface Spec {
  id: string;
  tape: number;
  index: number;
  title: string;
  timeLimitS: number;
  /** Which part of the face the Wicks have to cross. */
  route: RouteName;
  /** true: lantern on the left, Gate on the right. */
  fromLeft: boolean;
  count: number;
  intervalMs: number;
  /** Extra geometry beyond the route's two ledges. */
  ruins?: Polyline[];
  walls?: Polyline[];
  hazards?: HazardSpec[];
  dark?: Level['dark'];
  scares?: ScareSpec[];
  lines?: ScriptedLine[];
  candles?: Level['candles'];
  teachesBlink?: boolean;
  hint: string;
}

function build(s: Spec): Level {
  const route = ROUTES[s.route];

  const level: Level = {
    id: s.id,
    tape: s.tape,
    index: s.index,
    label: `T${String(s.tape).padStart(2, '0')}/${s.index}`,
    title: s.title,
    timeLimitS: s.timeLimitS,
    spawn: spawnFor(route, s.fromLeft, s.count, s.intervalMs),
    gate: gateFor(route, s.fromLeft),
    ruins: [...ledges(route), ...(s.ruins ?? [])],
    walls: s.walls ?? [],
    hazards: s.hazards ?? [],
    dark: s.dark ?? { startRadiusFh: 99, shrinkFhPerS: 0 },
    scares: s.scares ?? [],
    lines: s.lines ?? [],
    candles: s.candles ?? { 3: s.count, 2: Math.max(1, s.count - 2), 1: Math.max(1, Math.ceil(s.count / 2)) },
    mode: 'story',
    hint: s.hint,
  };
  if (s.teachesBlink === true) level.teachesBlink = true;

  validateLevel(level, s.id);
  return level;
}

const SPECS: Spec[] = [
  // ---- TAPE 01 — KEEP STILL ------------------------------------------------
  {
    id: '01-1',
    tape: 1,
    index: 1,
    title: 'Warm',
    timeLimitS: 60,
    route: 'forehead',
    fromLeft: true,
    count: 3,
    intervalMs: 5000,
    // SPEC 3.2 - the first ten seconds. One Wick at a time, no hazards, and the
    // Maw nowhere near the route.
    lines: [
      { atMs: 1400, text: '…warm.' },
      { atMs: 6000, text: 'do not wake the maw.' },
      { atMs: 15_000, text: 'the forehead is a field. we walk it.' },
      { atMs: 30_000, text: 'hold still and this is easy. that is the trick.' },
    ],
    candles: { 3: 3, 2: 2, 1: 1 },
    hint: 'hold still. your forehead is the bridge.',
  },
  {
    id: '01-2',
    tape: 1,
    index: 2,
    title: 'Good Slide',
    timeLimitS: 75,
    route: 'chin',
    fromLeft: true,
    count: 5,
    intervalMs: 3200,
    // Crossing the jaw, right under the nose rail, so anything that lands high
    // on the face slides down and arrives beside the crossing.
    ruins: [seg(-0.55, -0.62, 0.55, -0.62)],
    lines: [
      { atMs: 2000, text: 'big nose. good slide.' },
      { atMs: 14_000, text: 'the slide ends near the hunger. mind that.' },
      { atMs: 34_000, text: 'walk softly on the chin.' },
    ],
    hint: 'the nose is a slide, and it points at your mouth.',
  },
  {
    id: '01-3',
    tape: 1,
    index: 3,
    title: 'The Cliffs Moved',
    timeLimitS: 80,
    route: 'forehead',
    fromLeft: false,
    count: 6,
    intervalMs: 2800,
    // Ruins resting at brow height, so raising your eyebrows flings whoever is
    // standing there.
    ruins: [seg(-0.34, -0.2, -0.05, -0.2), seg(0.05, -0.2, 0.34, -0.2)],
    lines: [
      { atMs: 2000, text: 'the cliffs are the ledges. the ledges are your brows.' },
      { atMs: 16_000, text: 'raise them and we fly. we would rather not fly.' },
      { atMs: 40_000, text: 'the cliffs moved!' },
    ],
    hint: 'your eyebrows are ledges. raising them throws them.',
  },
  {
    id: '01-4',
    tape: 1,
    index: 4,
    title: 'Closer',
    timeLimitS: 85,
    route: 'forehead',
    fromLeft: true,
    count: 7,
    intervalMs: 2600,
    hazards: [{ type: 'crawler', x: 1.2, y: -0.36, atMs: 24_000 }],
    lines: [
      { atMs: 2000, text: 'it comes closer…' },
      { atMs: 12_000, text: 'lean in, mountain. be larger.' },
      { atMs: 26_000, text: 'something else lives here.' },
    ],
    hint: 'lean in. a bigger face makes wider bridges.',
  },

  // ---- TAPE 02 — THE MAW ---------------------------------------------------
  {
    id: '02-1',
    tape: 2,
    index: 1,
    title: 'The Lip',
    timeLimitS: 80,
    route: 'mouth',
    fromLeft: true,
    count: 7,
    intervalMs: 2600,
    // The whole crossing is the upper lip. Open your mouth and the road is gone.
    lines: [
      { atMs: 2000, text: 'the lip is a bridge and a promise.' },
      { atMs: 11_000, text: 'keep it shut. keep it shut. keep it shut.' },
      { atMs: 40_000, text: 'we are walking on the lid of the hunger.' },
    ],
    hint: 'your closed mouth is the bridge. do not open it.',
  },
  {
    id: '02-2',
    tape: 2,
    index: 2,
    title: 'Supper',
    timeLimitS: 85,
    // U2 - the Offering, taught properly, and it has to be the MOUTH route.
    // On the chin route a Crawler walks the jaw, which sits *below* the swallow
    // polygon even with the mouth wide open, so it could never be eaten - the
    // level taught a lesson that was geometrically impossible to perform.
    // Here the Crawlers cross the upper lip, so opening the Maw as one passes
    // drops it straight in. The cost is that any Wick on the bridge goes too,
    // which is exactly the timing decision the level is about.
    route: 'mouth',
    fromLeft: false,
    count: 8,
    intervalMs: 2400,
    hazards: [
      { type: 'crawler', x: -1.3, y: 0.24, atMs: 9000 },
      { type: 'crawler', x: 1.3, y: 0.24, atMs: 26_000 },
      { type: 'crawler', x: -1.3, y: 0.24, atMs: 48_000 },
    ],
    lines: [
      { atMs: 1800, text: 'supper time. not ours.' },
      { atMs: 10_000, text: 'feed it to the maw. use the mouth. the MOUTH.' },
      { atMs: 30_000, text: 'so the mouth can be a friend. noted. uneasily.' },
    ],
    hint: 'swallow the crawlers on purpose. your mouth is a weapon too.',
  },
  {
    id: '02-3',
    tape: 2,
    index: 3,
    title: 'Timing',
    timeLimitS: 90,
    route: 'mouth',
    fromLeft: true,
    count: 9,
    intervalMs: 2000,
    // The squeeze: moths want the mouth open, the crossing wants it shut.
    hazards: [
      { type: 'moth', x: -0.9, y: CEILING_Y, atMs: 14_000 },
      { type: 'crawler', x: 1.3, y: 0.24, atMs: 28_000 },
      { type: 'moth', x: 0.9, y: CEILING_Y, atMs: 46_000 },
    ],
    lines: [
      { atMs: 2000, text: 'a moth. it wants my head.' },
      { atMs: 16_000, text: 'blow it away! open the maw and BLOW!' },
      { atMs: 20_000, text: 'but we are standing on the lip. think, mountain.' },
    ],
    hint: 'open it for the moth, shut it for the wicks. good luck.',
  },

  // ---- TAPE 03 — DON'T LAUGH ----------------------------------------------
  {
    id: '03-1',
    tape: 3,
    index: 1,
    title: 'The Conga Line',
    timeLimitS: 75,
    route: 'forehead',
    fromLeft: true,
    count: 11,
    intervalMs: 1100,
    // Fast spawns, so the Procession climbs and the screen visibly brightens (U3).
    lines: [
      { atMs: 1500, text: 'form a line. a dignified line.' },
      { atMs: 9000, text: 'this is not a dignified line.' },
      { atMs: 18_000, text: 'do not laugh at the queue. the queue can hear you.' },
      { atMs: 32_000, text: 'the queue is now a religion.' },
      { atMs: 48_000, text: 'the queue has elected a leader. it is barnaby.' },
    ],
    candles: { 3: 10, 2: 7, 1: 4 },
    hint: 'eleven of them, fast. the procession brightens as they get through.',
  },
  {
    id: '03-2',
    tape: 3,
    index: 2,
    title: 'A Joke, Mid-Crossing',
    timeLimitS: 85,
    route: 'mouth',
    fromLeft: false,
    count: 8,
    intervalMs: 2600,
    // The joke lands while someone is standing on the lip bridge. Laughing
    // drains composure (U1) *and* opens the mouth, which removes the bridge.
    hazards: [{ type: 'crawler', x: -1.3, y: 0.24, atMs: 40_000 }],
    lines: [
      { atMs: 3000, text: 'while i cross, a joke. to steady us.' },
      { atMs: 10_000, text: 'why did the pilgrim cross the lip.' },
      { atMs: 15_000, text: 'because the lip was there. that is the joke.' },
      { atMs: 19_000, text: 'do not laugh. i am standing on the joke.' },
      { atMs: 36_000, text: 'nobody is laughing. good. nobody is laughing?' },
      { atMs: 58_000, text: 'i have more jokes. that is the threat.' },
    ],
    hint: "they will tell you a joke while standing on your lip. don't.",
  },
  {
    id: '03-3',
    tape: 3,
    index: 3,
    title: 'The Dance',
    timeLimitS: 90,
    route: 'chin',
    fromLeft: true,
    count: 10,
    intervalMs: 1900,
    hazards: [
      { type: 'moth', x: 1.1, y: CEILING_Y, atMs: 15_000 },
      { type: 'crawler', x: -1.3, y: 0.46, atMs: 30_000 },
      { type: 'moth', x: -1.1, y: CEILING_Y, atMs: 46_000 },
      { type: 'crawler', x: 1.3, y: 0.46, atMs: 62_000 },
    ],
    lines: [
      { atMs: 2000, text: 'the festival of standing extremely still.' },
      { atMs: 20_000, text: 'the dance is: do not move. we are excellent dancers.' },
      { atMs: 42_000, text: 'you are a terrible dancer.' },
      { atMs: 64_000, text: 'the festival is going badly. keep dancing.' },
    ],
    candles: { 3: 9, 2: 6, 1: 3 },
    hint: 'two moths, two crawlers, and a festival of standing still.',
  },

  // ---- TAPE 04 — DREAD ----------------------------------------------------
  {
    id: '04-1',
    tape: 4,
    index: 1,
    title: 'Lights Out',
    timeLimitS: 90,
    route: 'forehead',
    fromLeft: false,
    count: 9,
    intervalMs: 2400,
    hazards: [
      { type: 'drip', x: -0.3, y: CEILING_Y, atMs: 6000, intervalMs: 2400 },
      { type: 'drip', x: 0.3, y: CEILING_Y, atMs: 9000, intervalMs: 2700 },
      { type: 'drip', x: 0, y: CEILING_Y, atMs: 30_000, intervalMs: 3100 },
    ],
    dark: { startRadiusFh: 2.5, shrinkFhPerS: 0.009 },
    scares: [
      { type: 'flicker', atMs: 22_000 },
      { type: 'whisper', atMs: 40_000 },
      { type: 'flicker', atMs: 58_000 },
    ],
    lines: [
      { atMs: 2000, text: 'the dark was here first.' },
      { atMs: 25_000, text: 'closer, everyone. closer to the flames.' },
      { atMs: 50_000, text: 'the wax falls. a brow is a roof.' },
    ],
    candles: { 3: 8, 2: 5, 1: 3 },
    hint: 'the dark closes in, and wax falls. tilt: a brow makes a roof.',
  },
  {
    id: '04-2',
    tape: 4,
    index: 2,
    title: 'The Face Looks Back',
    timeLimitS: 95,
    route: 'mouth',
    fromLeft: true,
    count: 12,
    intervalMs: 1900,
    // The finale (SPEC 10.3). Midway the contours smile and wink on their own,
    // which on the mouth route moves the bridge out from under them. With
    // scares off the ScareDirector drops the event and the level plays straight.
    hazards: [
      { type: 'crawler', x: 1.3, y: 0.24, atMs: 13_000 },
      { type: 'drip', x: 0, y: CEILING_Y, atMs: 22_000, intervalMs: 3000 },
      { type: 'moth', x: -1.2, y: CEILING_Y, atMs: 32_000 },
      { type: 'crawler', x: -1.3, y: 0.24, atMs: 60_000 },
    ],
    dark: { startRadiusFh: 2.8, shrinkFhPerS: 0.013 },
    scares: [
      { type: 'whisper', atMs: 15_000 },
      { type: 'faceLooksBack', atMs: 45_000 },
      { type: 'behindYou', atMs: 68_000 },
      { type: 'flicker', atMs: 82_000 },
    ],
    lines: [
      { atMs: 2000, text: 'the last tape. it knows it is the last tape.' },
      { atMs: 47_000, text: 'that is not the face.' },
      { atMs: 51_000, text: 'do not tell it we noticed.' },
      { atMs: 74_000, text: 'the dark is faster now. run.' },
    ],
    // A calm Assist player gets three home (see tests/levels/solvable.test.ts),
    // so one candle has to be reachable at three. The finale is meant to be the
    // hardest tape, not an unwinnable one.
    candles: { 3: 9, 2: 6, 1: 3 },
    hint: 'midway through, your face stops being yours for two seconds.',
  },
];

mkdirSync(OUT, { recursive: true });

for (const spec of SPECS) {
  const level = build(spec);
  writeFileSync(join(OUT, `${level.id}.json`), `${JSON.stringify(level, null, 2)}\n`, 'utf8');
}

process.stdout.write(`Wrote ${SPECS.length} levels to ${OUT}\n`);
for (const s of SPECS) {
  process.stdout.write(`  ${s.id.padEnd(5)} ${s.route.padEnd(9)} ${String(s.count).padStart(2)} wicks  ${s.title}\n`);
}
