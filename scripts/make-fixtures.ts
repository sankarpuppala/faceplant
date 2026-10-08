/**
 * Generates the six fixtures in `fixtures/faces/`.
 *
 * **These are synthetic, and they say so in their own `origin` field.**
 *
 * SPEC section 18 AC-4 and CLAUDE.md invariant 8 call for fixtures recorded from
 * the developer's own face (landmarks only, never an image). Those cannot be
 * produced without sitting at the camera, so this script drives the canonical
 * Assist face through the same six motions and records the result in exactly
 * the same format. What that buys is real:
 *
 *   - the terrain builder, the Maw hysteresis, the solver and the conservation
 *     checks all run against a moving face for their full length;
 *   - the motions are *deliberately harsher* than a real head (the head-jerk
 *     fixture moves the face 0.9 FH between two tracker frames), so the swept
 *     test is tested harder than a person could test it;
 *   - `fixtures/faces/README.md` records the gap, and re-recording from a real
 *     face is a drop-in replacement: same filenames, same schema, same tests.
 *
 * Run with `npm run make:fixtures`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.ts';
import { newFixtureFile, packFixtureFrame, validateFixture } from '../src/face/fixtureSource.ts';
import { neutralPose, sampleSyntheticFace, type SyntheticPose } from '../src/face/syntheticSource.ts';
import { Rng } from '../src/physics/vec.ts';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '..', 'fixtures', 'faces');

/** Tracker rate the fixtures are recorded at, matching a real 30 Hz webcam. */
const HZ = 30;
const DURATION_S = 32;

type Motion = (pose: SyntheticPose, tS: number, rng: Rng) => void;

/** Everything a real tracker does even when the subject is "still". */
function breathe(pose: SyntheticPose, tS: number, rng: Rng): void {
  pose.cx = 0.5 + Math.sin(tS * 0.21) * 0.004 + (rng.next() - 0.5) * 0.0012;
  pose.cy = 0.5 + Math.sin(tS * 0.17 + 1) * 0.005 + (rng.next() - 0.5) * 0.0012;
  pose.size = 0.42 + Math.sin(tS * 0.3) * 0.004;
  // Everyone blinks. Roughly every four seconds.
  const blinkPhase = (tS % 4.1) / 4.1;
  const b = blinkPhase < 0.05 ? Math.sin((blinkPhase / 0.05) * Math.PI) : 0;
  pose.blinkL = b;
  pose.blinkR = b;
}

const MOTIONS: { name: string; note: string; motion: Motion }[] = [
  {
    name: 'neutral',
    note: 'Sitting still. Only breathing, micro-drift and natural blinks.',
    motion: (p, t, rng) => breathe(p, t, rng),
  },
  {
    name: 'tilt',
    note: 'Rolling the head left and right, which re-slopes every surface.',
    motion: (p, t, rng) => {
      breathe(p, t, rng);
      p.tilt = Math.sin(t * 0.55) * 0.42;
    },
  },
  {
    name: 'lean',
    note: 'Leaning in and back, which scales the whole world up and down.',
    motion: (p, t, rng) => {
      breathe(p, t, rng);
      p.size = 0.42 + Math.sin(t * 0.4) * 0.14;
    },
  },
  {
    name: 'brows',
    note: 'Repeated eyebrow raises, fast enough to trigger the flick.',
    motion: (p, t, rng) => {
      breathe(p, t, rng);
      // Snap up, ease down - the shape a real surprised brow makes.
      const phase = (t % 1.6) / 1.6;
      p.browUp = phase < 0.12 ? phase / 0.12 : Math.max(0, 1 - (phase - 0.12) / 0.5);
    },
  },
  {
    name: 'mouth-laugh',
    note: 'Slow open and close, then real laughing: a smile with the jaw bouncing at about 5 Hz.',
    motion: (p, t, rng) => {
      breathe(p, t, rng);
      if (t < 10) {
        // Slow deliberate open and close, for the Maw hysteresis tests.
        p.jawOpen = Math.max(0, Math.sin(t * 0.5)) * 0.95;
      } else if (t < 14) {
        p.jawOpen = 0;
      } else {
        // A laugh: broad smile plus jaw oscillation in the 2-8 Hz band.
        p.smile = 0.8;
        p.jawOpen = 0.35 + Math.sin(t * 5 * Math.PI * 2) * 0.28;
      }
    },
  },
  {
    name: 'head-jerk',
    note:
      'Violent flinches. Each jerk moves the face about 0.9 FH between two tracker frames, ' +
      'which is far harder than a real head and is the point: it is the swept test’s worst case.',
    motion: (p, t, rng) => {
      breathe(p, t, rng);
      // A jerk every 2.4 s: one frame of large displacement, then a settle.
      const phase = t % 2.4;
      if (phase < 1 / HZ) {
        p.cx = 0.5 + (rng.next() < 0.5 ? -0.17 : 0.17);
        p.cy = 0.5 + (rng.next() - 0.5) * 0.2;
        p.tilt = (rng.next() - 0.5) * 0.7;
      } else if (phase < 0.45) {
        const k = 1 - (phase - 1 / HZ) / 0.42;
        p.cx = 0.5 + Math.sin(phase * 48) * 0.03 * k;
        p.cy = 0.5 + Math.cos(phase * 41) * 0.03 * k;
        p.tilt = Math.sin(phase * 33) * 0.25 * k;
      }
      // A gasp rides along with the flinch, because in play it always does.
      if (phase < 0.2) p.jawOpen = Math.min(1, phase / 0.08);
      else p.jawOpen = Math.max(0, 0.9 - (phase - 0.2) * 2.4);
    },
  },
];

mkdirSync(OUT, { recursive: true });

const frameCount = Math.round(DURATION_S * HZ);
let total = 0;

for (const [i, spec] of MOTIONS.entries()) {
  const file = newFixtureFile(spec.name, 'synthetic', spec.note);
  const rng = new Rng(1000 + i * 977);
  const pose = neutralPose();

  for (let f = 0; f < frameCount; f++) {
    const tS = f / HZ;
    // Reset the per-frame expression channels so a motion only sets what it means to.
    pose.jawOpen = 0;
    pose.smile = 0;
    pose.browUp = 0;
    pose.tilt = 0;
    spec.motion(pose, tS, rng);
    file.frames.push(packFixtureFrame(Math.round(tS * 1000), sampleSyntheticFace(pose, config.render.aspect)));
  }

  validateFixture(file);
  writeFileSync(join(OUT, `${spec.name}.json`), JSON.stringify(file), 'utf8');
  total++;
  process.stdout.write(`${spec.name.padEnd(13)} ${file.frames.length} frames, ${DURATION_S}s\n`);
}

process.stdout.write(`\nWrote ${total} fixtures to ${OUT}\n`);
process.stdout.write('origin: "synthetic" — see fixtures/faces/README.md\n');
