/**
 * `npm run soak` - plays the whole game headlessly, for a long time, with
 * four different kinds of player, and reports anything that looks like a bug
 * rather than a design choice.
 *
 * This is not a replacement for the test suite and it is not run by `verify`:
 * it takes a couple of minutes and it is a *search*, not an assertion. It
 * exists because the unit and fixture tests all hold the face still or move
 * it gently, and three real bugs were hiding in the space between those and
 * an actual person with a webcam:
 *
 *   - Wicks pacing a dead end under the chin for an entire level, scoring
 *     nothing and dying of nothing (now signposted, `trapped` in config).
 *   - The quake event firing once per stumbling Wick per physics step -
 *     thirteen times a second of screen shake (now throttled).
 *   - Moths killing nothing at all, ever, because the config speed was being
 *     applied as an acceleration and then damped away.
 *
 * None of those fail a test. They just quietly ruin the game.
 *
 * Checks, on every run:
 *   - conservation: saved + lost + alive === spawned, and nothing goes backwards
 *   - no NaN or runaway position anywhere, ever
 *   - no Wick stranded when the clock runs out
 *   - score and candles never negative or impossible
 *   - the run actually ends
 */
import { config, defaultTunables } from '../src/config.ts';
import { defaultCalibration } from '../src/face/calibration.ts';
import { ReactionDetector } from '../src/face/reactions.ts';
import { SyntheticFaceSource, type SyntheticDriver, type SyntheticPose } from '../src/face/syntheticSource.ts';
import { generateDaily, generateEndless } from '../src/game/daily.ts';
import { ALL_LEVEL_IDS } from '../src/game/levelLoader.ts';
import { parseLevel, type Level } from '../src/game/levelSchema.ts';
import { buildResult } from '../src/game/rules.ts';
import { World } from '../src/physics/world.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LEVEL_DIR = join(process.cwd(), 'public', 'levels');
function loadLevel(id: string): Level {
  return parseLevel(JSON.parse(readFileSync(join(LEVEL_DIR, `${id}.json`), 'utf8')), id);
}

const problems: string[] = [];
const note = (s: string): void => {
  problems.push(s);
};

/** Four very different players, so the game is exercised, not just sampled. */
type Style = 'statue' | 'competent' | 'laugher' | 'thrasher';

function driverFor(style: Style, jaw: () => number): SyntheticDriver {
  return {
    update(pose: SyntheticPose, tMs: number): void {
      const tS = tMs / 1000;
      pose.cx = 0.5;
      pose.cy = 0.5;
      pose.tilt = 0;
      pose.smile = 0;
      pose.browUp = 0;
      pose.size = 0.46;
      pose.jawOpen = jaw();
      const phase = (tS % 4.3) / 4.3;
      const b = phase < 0.05 ? Math.sin((phase / 0.05) * Math.PI) : 0;
      pose.blinkL = b;
      pose.blinkR = b;

      if (style === 'statue') return;
      if (style === 'competent') {
        pose.size = 0.46 + Math.sin(tS * 0.25) * 0.012;
        return;
      }
      if (style === 'laugher') {
        const cyc = tS % 9;
        if (cyc > 3 && cyc < 6.5) {
          pose.smile = 0.9;
          pose.jawOpen = 0.45 + Math.sin(tS * 5 * Math.PI * 2) * 0.3;
        }
        return;
      }
      // thrasher: whips the head about, leans in and out, brows flying.
      pose.cx = 0.5 + Math.sin(tS * 1.7) * 0.18;
      pose.cy = 0.5 + Math.cos(tS * 1.1) * 0.12;
      pose.tilt = Math.sin(tS * 0.9) * 0.3;
      pose.size = 0.44 + Math.sin(tS * 0.7) * 0.06;
      pose.browUp = (Math.sin(tS * 3.3) + 1) / 2;
      pose.jawOpen = Math.max(jaw(), (Math.sin(tS * 2.1) + 1) / 2 > 0.75 ? 0.9 : 0);
    },
  };
}

const cal = defaultCalibration(config.render.aspect);

function run(label: string, level: Level, style: Style, seed: number, endless: boolean, maxS: number): void {
  const world = new World({ level, tunables: defaultTunables(), seed, endless });
  let openUntil = -1;
  let nowMs = 0;

  const source = new SyntheticFaceSource(
    driverFor(style, () => {
      if (style === 'competent' || style === 'thrasher') {
        const hazardOverMouth =
          world.crawlers.some((c) => c.alive && Math.abs(c.body.x) < 0.12 && c.body.y > -0.1 && c.body.y < 0.5) ||
          world.moths.some(
            (m) =>
              m.alive &&
              // Held contact, not mere presence: a bot that gasps at every
              // moth in sight holds the Maw open for most of the level, which
              // breaks the lip bridge and strands whoever is crossing it.
              (m.contactMs > 0 ||
                world.wicks.some(
                  (w) =>
                    w.state !== 'saved' &&
                    w.state !== 'lost' &&
                    w.lit &&
                    Math.hypot(w.body.x - m.body.x, w.body.y - m.body.y) < 0.18,
                )),
          );
        const risky = world.wicks.some(
          (w) =>
            w.state !== 'saved' && w.state !== 'lost' && Math.abs(w.body.x) < 0.24 && w.body.y > -0.1 && w.body.y < 0.5,
        );
        if (hazardOverMouth && !risky) openUntil = nowMs + 400;
      }
      return nowMs < openUntil ? 1 : 0;
    }),
    config.render.aspect,
    cal,
  );

  const reactions = new ReactionDetector();
  const stepMs = 1000 / config.physics.stepHz;
  let next = 0;
  let prevSaved = 0;
  let prevLost = 0;
  let prevScore = 0;
  let ended = false;
  let noted = false;

  for (let t = 0; t <= maxS * 1000; t += stepMs) {
    if (t >= next) {
      next += 1000 / 30;
      nowMs = t;
      const f = source.tick(t);
      const face = f.faces[0];
      if (face !== undefined) {
        world.setFace(f);
        reactions.update(face.blend, face.scale, world.faceSpeedFhPerS, t, config.quake.speedFhPerS);
        world.setReactions(reactions.current);
      }
    }
    world.step(stepMs);
    world.drain();
    const s = world.snapshot();

    if (!noted) {
      if (s.saved + s.lost + s.alive !== s.spawned) {
        note(`${label}: conservation broken (${s.saved}+${s.lost}+${s.alive} != ${s.spawned})`);
        noted = true;
      } else if (s.saved < prevSaved) {
        note(`${label}: saved went backwards`);
        noted = true;
      } else if (s.lost < prevLost) {
        note(`${label}: lost went backwards`);
        noted = true;
      } else if (s.score < prevScore - 1e-6) {
        note(`${label}: score went backwards`);
        noted = true;
      } else if (!Number.isFinite(s.score)) {
        note(`${label}: score is ${s.score}`);
        noted = true;
      }
      for (const w of world.wicks) {
        if (!Number.isFinite(w.body.x) || !Number.isFinite(w.body.y)) {
          note(`${label}: a Wick reached NaN`);
          noted = true;
          break;
        }
        if (Math.abs(w.body.x) > 50 || Math.abs(w.body.y) > 50) {
          note(`${label}: a Wick escaped to ${w.body.x.toFixed(0)},${w.body.y.toFixed(0)}`);
          noted = true;
          break;
        }
      }
      for (const m of world.moths) {
        if (!Number.isFinite(m.body.x) || Math.abs(m.body.x) > 50) {
          note(`${label}: a moth reached ${m.body.x}`);
          noted = true;
          break;
        }
      }
      for (const c of world.crawlers) {
        if (!Number.isFinite(c.body.x)) {
          note(`${label}: a crawler reached NaN`);
          noted = true;
          break;
        }
      }
    }

    prevSaved = s.saved;
    prevLost = s.lost;
    prevScore = s.score;
    if (s.over) {
      ended = true;
      break;
    }
  }

  const s = world.snapshot();
  if (!ended && !endless) note(`${label}: never ended within ${maxS}s (limit ${level.timeLimitS}s)`);
  if (!endless && ended && s.alive > 0) note(`${label}: ${s.alive} Wick(s) stranded at the end`);

  const res = buildResult(level, s, world.finalScore());
  if (res.score < 0) note(`${label}: negative score ${res.score}`);
  if (res.candles < 0 || res.candles > 3) note(`${label}: ${res.candles} candles`);
}

const styles: Style[] = ['statue', 'competent', 'laugher', 'thrasher'];
let runs = 0;

console.log('story tapes, four playstyles, three seeds...');
for (const id of ALL_LEVEL_IDS) {
  const level = loadLevel(id);
  for (const style of styles) {
    for (const seed of [1, 11, 4242]) {
      run(`${id}/${style}/s${seed}`, level, style, seed, false, level.timeLimitS + 3);
      runs++;
    }
  }
}

console.log('daily tapes, 40 consecutive days...');
for (let day = 0; day < 40; day++) {
  const level = generateDaily(day);
  run(`daily-${day}`, level, day % 2 === 0 ? 'competent' : 'laugher', day, false, level.timeLimitS + 3);
  runs++;
}

// The Long Tape is one level; the seed varies the run inside it.
console.log('the Long Tape, ten minutes a go...');
for (const seed of [1, 7, 99]) {
  run(`endless-s${seed}`, generateEndless(), 'competent', seed, true, 600);
  runs++;
}

console.log(`\n${runs} runs complete.`);
if (problems.length === 0) {
  console.log('No conservation breaks, no NaN, no strandings.');
} else {
  const counted = new Map<string, number>();
  for (const p of problems) counted.set(p, (counted.get(p) ?? 0) + 1);
  console.log(`${problems.length} problem(s), ${counted.size} distinct:`);
  for (const [p, n] of [...counted].slice(0, 50)) console.log(`  x${n}  ${p}`);
}
