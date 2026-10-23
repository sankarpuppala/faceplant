/**
 * AC-8 — every level is completable without a camera (CLAUDE.md invariant 7).
 *
 * SPEC asks for this to be *recorded* in PLAYTEST.md by a human playing in
 * Assist mode. That still matters and is still logged, but a human run proves
 * one level once. This test proves all fourteen on every commit, by driving the
 * real `SyntheticFaceSource` - the same source Assist mode uses - through the
 * real world with a scripted "player".
 *
 * The bot is deliberately *dumb*: it holds the face still, keeps its mouth
 * shut, and leans in a little. It does not aim, time anything, or react. If a
 * level cannot be finished by a player who merely sits there calmly, that is a
 * level-design bug, and this is where it surfaces.
 *
 * Two bots run, because "completable" and "survivable" are different claims:
 *   - `calm`   holds a neutral face. Levels must be winnable this way.
 *   - `cracks` laughs on a timer, so the composure drain, THE YAWN and the
 *     Maw-opens-and-eats-them path all execute under test.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { ReactionDetector } from '../../src/face/reactions.ts';
import { SyntheticFaceSource, type SyntheticDriver, type SyntheticPose } from '../../src/face/syntheticSource.ts';
import { generateDaily, generateEndless } from '../../src/game/daily.ts';
import { ALL_LEVEL_IDS } from '../../src/game/levelLoader.ts';
import { parseLevel, type Level } from '../../src/game/levelSchema.ts';
import { buildResult } from '../../src/game/rules.ts';
import { World } from '../../src/physics/world.ts';

const LEVEL_DIR = join(import.meta.dirname, '..', '..', 'public', 'levels');

function loadLevelFile(id: string): Level {
  return parseLevel(JSON.parse(readFileSync(join(LEVEL_DIR, `${id}.json`), 'utf8')), id);
}

/**
 * Holds a calm, still face and leans in slightly. The minimum viable player.
 *
 * `jawOpen` is a callback so the same bot can be driven open-loop (always
 * shut) or closed-loop by a policy that reads the world - see `mawPolicy`.
 */
function makeCalmBot(jawOpen: () => number = () => 0): SyntheticDriver {
  return {
  update(pose: SyntheticPose, tMs: number): void {
    const tS = tMs / 1000;
    pose.cx = 0.5;
    pose.cy = 0.5;
    pose.tilt = 0;
    pose.jawOpen = jawOpen();
    pose.smile = 0;
    pose.browUp = 0;
    // Lean in a little, which widens every bridge (SPEC 6.7). A real player
    // does this instinctively once they see a Wick refuse a gap.
    pose.size = 0.46 + Math.sin(tS * 0.25) * 0.012;
    // Blink like a person, so the eyelid bridge logic runs.
    const phase = (tS % 4.3) / 4.3;
    const b = phase < 0.05 ? Math.sin((phase / 0.05) * Math.PI) : 0;
    pose.blinkL = b;
    pose.blinkR = b;
  },
  };
}

const calmBot = makeCalmBot();

/** Loses composure on a timer: laughs, gasps and flinches. */
const crackingBot: SyntheticDriver = {
  update(pose: SyntheticPose, tMs: number): void {
    const tS = tMs / 1000;
    pose.size = 0.46;
    pose.cx = 0.5;
    pose.cy = 0.5;
    pose.tilt = 0;
    pose.browUp = 0;
    pose.blinkL = 0;
    pose.blinkR = 0;
    pose.smile = 0;
    pose.jawOpen = 0;

    const cycle = tS % 12;
    if (cycle > 4 && cycle < 8) {
      // A real laugh: broad smile, jaw bouncing in the 2-8 Hz band.
      pose.smile = 0.85;
      pose.jawOpen = 0.4 + Math.sin(tS * 5 * Math.PI * 2) * 0.3;
    } else if (cycle > 9 && cycle < 9.4) {
      // A flinch, which quakes the terrain.
      pose.cx = 0.5 + 0.12;
      pose.jawOpen = 0.8;
    }
  },
};

/**
 * A closed-loop player: one rule, applied to what is actually on screen.
 *
 * `calmBot` cannot be the whole story. Assist mode has a Maw key, and some
 * levels - 02-2 "Supper" most explicitly - *teach* that the mouth is the
 * counter to a Crawler. A bot that refuses to press Space is not testing
 * whether the level is completable; it is testing whether it can be completed
 * by doing nothing, which is a different and much weaker claim.
 *
 * So this is the minimum competent player: holds still, and opens the Maw when
 * a Crawler is over the mouth and no Wick is close enough to be taken with it.
 * No aiming, no reflexes, no knowledge of the future.
 */
function mawPolicy(world: World): boolean {
  const crawlerOverMouth = world.crawlers.some(
    (c) => c.alive && Math.abs(c.body.x) < 0.12 && c.body.y > -0.1 && c.body.y < 0.5,
  );
  if (!crawlerOverMouth) return false;
  const wickInDanger = world.wicks.some(
    (w) => w.state !== 'saved' && w.state !== 'lost' && Math.abs(w.body.x) < 0.24 && w.body.y > -0.1 && w.body.y < 0.5,
  );
  return !wickInDanger;
}

/** Runs a whole level headlessly and returns the result. */
function play(
  level: Level,
  driver: SyntheticDriver | 'competent',
  endless = false,
  maxSeconds = 0,
): ReturnType<typeof buildResult> {
  const aspect = config.render.aspect;
  const cal = defaultCalibration(aspect);
  const world = new World({ level, tunables: defaultTunables(), seed: 4242, endless });

  // The competent player needs to see the world, so its driver is built here,
  // closing over the world and a short "key held" window.
  let openUntilMs = -1;
  let nowMs = 0;
  const actual: SyntheticDriver =
    driver === 'competent'
      ? makeCalmBot(() => {
          if (mawPolicy(world)) openUntilMs = nowMs + 400;
          return nowMs < openUntilMs ? 1 : 0;
        })
      : driver;

  const source = new SyntheticFaceSource(actual, aspect, cal);
  const reactions = new ReactionDetector();

  const stepMs = 1000 / config.physics.stepHz;
  // Tracker frames arrive at 30 Hz, not every physics step - the interpolation
  // path has to be exercised, not bypassed.
  const trackerIntervalMs = 1000 / 30;
  const limitMs = (maxSeconds > 0 ? maxSeconds : level.timeLimitS + 2) * 1000;

  let nextTrackerAtMs = 0;

  for (let t = 0; t <= limitMs; t += stepMs) {
    if (t >= nextTrackerAtMs) {
      nextTrackerAtMs += trackerIntervalMs;
      nowMs = t;
      const frame = source.tick(t);
      const face = frame.faces[0];
      if (face !== undefined) {
        world.setFace(frame);
        reactions.update(face.blend, face.scale, world.faceSpeedFhPerS, t, config.quake.speedFhPerS);
        world.setReactions(reactions.current);
      }
    }
    world.step(stepMs);
    world.drain();
    if (world.snapshot().over) break;
  }

  return buildResult(level, world.snapshot(), world.finalScore());
}

describe('AC-8 story levels are completable in Assist mode', () => {
  const ids = [...ALL_LEVEL_IDS];

  it('ships exactly the levels the tapes declare', () => {
    const onDisk = readdirSync(LEVEL_DIR)
      .filter((n) => n.endsWith('.json'))
      .map((n) => n.replace(/\.json$/, ''))
      .sort();
    expect(onDisk).toEqual([...ids].sort());
    expect(ids).toHaveLength(15);
  });

  for (const id of ids) {
    it(`${id} can be finished with Assist controls alone`, () => {
      const level = loadLevelFile(id);
      // The minimum competent player: still face, and uses the Maw key when a
      // Crawler is over the mouth. Nothing else - no aiming, no timing skill.
      const result = play(level, 'competent');

      // Every Wick must be resolved - none left stranded when time ran out.
      expect(result.saved + result.lost, `${id}: ${result.spawned - result.saved - result.lost} Wicks stranded`).toBe(
        result.spawned,
      );
      // The level must be winnable, not merely survivable.
      expect(result.saved, `${id}: saved nothing`).toBeGreaterThan(0);
      expect(result.candles, `${id}: earned no candles`).toBeGreaterThanOrEqual(1);
      expect(result.spawned).toBe(level.spawn.count);
    });
  }

  it('a player who only sits still still wins the levels that teach stillness', () => {
    // Tape 01 is about holding still, so a passive player must be able to
    // finish it without ever touching a key.
    for (const id of ['01-1', '01-2', '01-3', '01-4']) {
      const r = play(loadLevelFile(id), calmBot);
      expect(r.candles, `${id} needs more than stillness`).toBeGreaterThanOrEqual(1);
    }
  });

  it('02-2 "Supper" makes the Offering worth performing', () => {
    // The level's lesson (U2) is that the mouth can be used *on* a Crawler.
    //
    // This used to assert that a passive player saved fewer Wicks - that the
    // Maw was required for survival. That stopped being true once a Crawler
    // could only take one flame each: a passive player now loses the same one
    // or two either way. What the level has to prove is narrower and more
    // honest - that the Offering is actually performable here, and that doing
    // it pays. Both were briefly broken when a sated Crawler stopped walking
    // before it ever reached the mouth.
    const level = loadLevelFile('02-2');
    const passive = play(level, calmBot);
    const competent = play(level, 'competent');

    expect(competent.offerings, 'the Offering is not performable on 02-2').toBeGreaterThan(0);
    expect(passive.offerings).toBe(0);
    expect(competent.score).toBeGreaterThan(passive.score);
  });

  it('a calm player three-candles the opening level', () => {
    // 01-1 is the tutorial. If a still face cannot get all three home, the
    // first ten seconds (SPEC 3.2) do not work.
    const result = play(loadLevelFile('01-1'), calmBot);
    expect(result.saved).toBe(3);
    expect(result.candles).toBe(3);
    expect(result.lossesByCause.maw).toBe(0);
  });

  it('losing composure costs you Wicks on the mouth route', () => {
    // U1 and U2 in one assertion: on a level whose bridge *is* the upper lip,
    // a player who laughs must do measurably worse than one who does not.
    const level = loadLevelFile('02-1');
    const calm = play(level, calmBot);
    const cracked = play(level, crackingBot);

    expect(cracked.composureLeft).toBeLessThan(calm.composureLeft);
    expect(cracked.saved).toBeLessThan(calm.saved);
    expect(cracked.lossesByCause.maw).toBeGreaterThan(0);
  });
});

describe('AC-8 generated levels are completable', () => {
  for (const day of [0, 1, 2, 3, 17, 365]) {
    it(`daily #${day} can be finished by a calm player`, () => {
      const level = generateDaily(day);
      const result = play(level, 'competent');
      expect(result.saved, `daily ${day} saved nothing`).toBeGreaterThan(0);
      expect(result.saved + result.lost).toBe(result.spawned);
    });
  }

  it('the Long Tape runs, escalates and ends', () => {
    const level = generateEndless();
    const result = play(level, crackingBot, true, 180);
    // A cracking player must eventually run out of Wicks (U4's lose condition).
    expect(result.lost).toBeGreaterThan(0);
    expect(result.wave).toBeGreaterThan(0);
    expect(result.score).toBeGreaterThan(0);
  });
});
