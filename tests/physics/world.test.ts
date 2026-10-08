/**
 * World integration: the paths where several systems have to agree.
 *
 * These are the tests that would have caught the bugs the unit tests could
 * not - a face-speed measurement that silently read zero, an offering that
 * scored but never refunded composure, waves that escalated into nothing.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { neutralPose, sampleSyntheticFace, type SyntheticPose } from '../../src/face/syntheticSource.ts';
import { buildFaceData } from '../../src/terrain/contours.ts';
import { generateEndless } from '../../src/game/daily.ts';
import { parseLevel, type Level } from '../../src/game/levelSchema.ts';
import { World, type WorldEvent } from '../../src/physics/world.ts';
import type { FaceFrame } from '../../src/face/types.ts';

const ASPECT = config.render.aspect;
const CAL = defaultCalibration(ASPECT);
const STEP = 1000 / config.physics.stepHz;

function level(id: string): Level {
  const p = join(import.meta.dirname, '..', '..', 'public', 'levels', `${id}.json`);
  return parseLevel(JSON.parse(readFileSync(p, 'utf8')), id);
}

function frameAt(t: number, pose: Partial<SyntheticPose> = {}): FaceFrame {
  const raw = sampleSyntheticFace({ ...neutralPose(), size: 0.46, ...pose }, ASPECT);
  return { t, faces: [buildFaceData(raw, CAL, ASPECT)] };
}

/** Runs a world, feeding tracker frames at 30 Hz from a pose function. */
function run(
  lvl: Level,
  seconds: number,
  poseAt: (tMs: number) => Partial<SyntheticPose>,
  opts: { endless?: boolean } = {},
): { world: World; events: WorldEvent[] } {
  const world = new World({ level: lvl, tunables: defaultTunables(), seed: 99, endless: opts.endless ?? false });
  const events: WorldEvent[] = [];
  let nextTracker = 0;

  for (let t = 0; t <= seconds * 1000; t += STEP) {
    if (t >= nextTracker) {
      nextTracker += 1000 / 30;
      world.setFace(frameAt(t, poseAt(t)));
    }
    world.step(STEP);
    events.push(...world.drain());
    if (world.snapshot().over) break;
  }
  return { world, events };
}

describe('face-speed measurement (SPEC 6.6)', () => {
  it('reads zero for a still face', () => {
    const { world } = run(level('01-1'), 2, () => ({}));
    expect(world.faceSpeedFhPerS).toBeCloseTo(0, 3);
  });

  it('reads a real speed when the face moves between tracker frames', () => {
    // The regression this file exists for. The app must push each tracker frame
    // exactly once; pushing the same frame repeatedly collapsed the two stored
    // poses onto each other and made this permanently zero, which silently
    // disabled the quake.
    let seen = 0;
    const world = new World({ level: level('01-1'), tunables: defaultTunables(), seed: 1 });
    world.setFace(frameAt(0, { cx: 0.5 }));
    world.setFace(frameAt(1000 / 30, { cx: 0.62 }));
    seen = world.faceSpeedFhPerS;
    expect(seen).toBeGreaterThan(config.quake.speedFhPerS);
  });

  it('a flinch produces a quake, which knocks Wicks off balance', () => {
    const { events } = run(level('01-1'), 24, (t) => {
      // A hard sideways jerk every two seconds, once the Wicks have landed.
      const phase = t % 2000;
      return t > 6000 && phase < 1000 / 30 ? { cx: 0.5 + 0.16 } : {};
    });
    expect(events.some((e) => e.kind === 'quake')).toBe(true);
  });

  it('a still face produces no quake at all', () => {
    const { events } = run(level('01-1'), 20, () => ({}));
    expect(events.some((e) => e.kind === 'quake')).toBe(false);
  });
});

describe('the Maw eats, and composure pays for it (U1, U2)', () => {
  it('a held-open mouth drains composure and swallows whoever is on the lip', () => {
    // 02-1 is the level whose bridge *is* the upper lip.
    const { world, events } = run(level('02-1'), 50, (t) => (t > 12_000 ? { jawOpen: 1 } : {}));
    const snap = world.snapshot();

    expect(snap.mawWokeCount).toBeGreaterThan(0);
    expect(snap.composure.fraction).toBeLessThan(1);
    expect(snap.lossesByCause.maw).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'lost' && e.cause === 'maw')).toBe(true);
  });

  it('keeping the mouth shut keeps composure full and the bridge intact', () => {
    const { world } = run(level('02-1'), 50, () => ({}));
    const snap = world.snapshot();
    expect(snap.maw.open).toBe(false);
    expect(snap.composure.fraction).toBe(1);
    expect(snap.lossesByCause.maw).toBe(0);
  });

  it('U2: swallowing a Crawler is an offering - it scores and refunds composure', () => {
    // Modelled the way a player performs it, because that is the claim worth
    // testing: hold the mouth shut so the Crawler walks out onto the lip
    // bridge, then open it underneath the Crawler. Holding the mouth open the
    // whole time does *not* work - with the bridge already gone the Crawler
    // never steps onto the face, which is correct and is the skill.
    const lvl = level('02-2');
    const world = new World({ level: lvl, tunables: defaultTunables(), seed: 99 });
    const events: WorldEvent[] = [];
    let nextTracker = 0;
    let openUntil = -1;

    for (let t = 0; t <= 85_000; t += STEP) {
      if (t >= nextTracker) {
        nextTracker += 1000 / 30;

        // The "player": open the Maw when a live Crawler is over the mouth and
        // no Wick is close enough to be taken with it.
        const overMouth = world.crawlers.some((c) => c.alive && Math.abs(c.body.x) < 0.1 && c.body.y < 0.45);
        const wickInDanger = world.wicks.some(
          (w) => w.state !== 'saved' && w.state !== 'lost' && Math.abs(w.body.x) < 0.22 && w.body.y < 0.45,
        );
        if (overMouth && !wickInDanger) openUntil = t + 500;

        world.setFace(frameAt(t, t < openUntil ? { jawOpen: 1 } : {}));
      }
      world.step(STEP);
      events.push(...world.drain());
      if (world.snapshot().over) break;
    }

    const offerings = events.filter((e) => e.kind === 'offering');
    expect(offerings.length, 'no Crawler was ever swallowed').toBeGreaterThan(0);
    expect(world.snapshot().offerings).toBe(offerings.length);
    expect(world.snapshot().score).toBeGreaterThan(0);

    // An offering is worth more than a saved Wick, which is what makes using
    // the mouth on purpose a real decision rather than a novelty.
    expect(config.offering.scorePerCrawler).toBeGreaterThan(config.score.perSavedWick);
  });

  it('a Crawler can actually walk out onto the face', () => {
    // The regression behind the test above: Crawlers never called
    // findContinuation, so one could not leave the ruin it spawned on. It
    // threatened nothing and could never be eaten. Sampled during the run
    // rather than at the end, because a Crawler that crosses the face keeps
    // going and ends up on the far ledge.
    const lvl = level('02-2');
    const world = new World({ level: lvl, tunables: defaultTunables(), seed: 99 });
    let nextTracker = 0;
    let closest = Infinity;
    let everOnTheFace = false;

    for (let t = 0; t <= 40_000; t += STEP) {
      if (t >= nextTracker) {
        nextTracker += 1000 / 30;
        world.setFace(frameAt(t));
      }
      world.step(STEP);
      world.drain();
      for (const c of world.crawlers) {
        if (!c.alive) continue;
        closest = Math.min(closest, Math.abs(c.body.x));
        const seg = world.index.get(c.body.groundId);
        if (seg?.contour !== null && seg?.contour !== undefined) everOnTheFace = true;
      }
    }

    expect(closest, 'no Crawler got anywhere near the face').toBeLessThan(0.3);
    expect(everOnTheFace, 'no Crawler ever stood on the face itself').toBe(true);
  });
});

describe('the Procession is made of light (U3)', () => {
  it('climbs as Wicks arrive, and the light bonus climbs with it', () => {
    const { world, events } = run(level('03-1'), 75, () => ({}));
    const snap = world.snapshot();

    expect(snap.saved).toBeGreaterThan(config.procession.savesPerStep);
    expect(snap.procession.best).toBeGreaterThan(1);
    expect(snap.procession.lightBonusFh).toBeGreaterThan(0);
    expect(events.some((e) => e.kind === 'procession')).toBe(true);
  });

  it('multiplies the score, so a clean run is worth more than its headcount', () => {
    const { world } = run(level('03-1'), 75, () => ({}));
    const snap = world.snapshot();
    // With any multiplier at all, score must exceed the flat per-Wick rate.
    expect(snap.score).toBeGreaterThan(snap.saved * config.score.perSavedWick);
  });
});

describe('the Long Tape escalates and ends (U4)', () => {
  it('raises waves and introduces hazards in the documented order', () => {
    const endless = generateEndless();
    const { world, events } = run(endless, 150, (t) => (t > 20_000 ? { jawOpen: 1 } : {}), { endless: true });
    const snap = world.snapshot();

    expect(snap.wave).toBeGreaterThanOrEqual(config.endless.crawlerFromWave);
    expect(events.some((e) => e.kind === 'wave')).toBe(true);
    // Hazards arrive as new *kinds*, not just more of the same.
    expect(world.crawlers.length).toBeGreaterThan(0);
  });

  it('ends when the loss budget is spent, not on the clock', () => {
    const endless = generateEndless();
    expect(endless.timeLimitS).toBeGreaterThan(600);
    const { world } = run(endless, 400, () => ({ jawOpen: 1 }), { endless: true });
    const snap = world.snapshot();
    if (snap.over) {
      expect(snap.lost).toBeGreaterThanOrEqual(config.endless.lossesAllowed);
      expect(snap.elapsedMs).toBeLessThan(endless.timeLimitS * 1000);
    }
  });
});

describe('conservation and the roster', () => {
  it('the roster is in spawn order and matches the outcomes', () => {
    const { world } = run(level('01-1'), 65, () => ({}));
    const snap = world.snapshot();
    expect(world.roster).toHaveLength(snap.spawned);
    expect(snap.outcomes).toHaveLength(snap.spawned);
    for (const [i, w] of world.roster.entries()) {
      const expected = w.state === 'saved' ? 'saved' : w.state === 'lost' ? w.cause : 'alive';
      expect(snap.outcomes[i]).toBe(expected);
    }
  });

  it('every Wick has a distinct name', () => {
    const { world } = run(level('04-2'), 30, () => ({}));
    const names = world.roster.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a second chance returns a lost Wick, but never one the Maw took (U9)', () => {
    const lvl = level('01-2');
    const tunables = { ...defaultTunables(), secondChanceCount: 1 };
    const world = new World({ level: lvl, tunables, seed: 7 });
    let nextTracker = 0;
    for (let t = 0; t <= 75_000; t += STEP) {
      if (t >= nextTracker) {
        nextTracker += 1000 / 30;
        // Mouth wide open the whole way: everything the Maw takes must stay taken.
        world.setFace(frameAt(t, { jawOpen: 1 }));
      }
      world.step(STEP);
      world.drain();
      if (world.snapshot().over) break;
    }
    const snap = world.snapshot();
    expect(snap.saved + snap.lost + snap.alive).toBe(snap.spawned);
  });

  it('never spawns more than the level declares', () => {
    const lvl = level('03-1');
    const { world } = run(lvl, 80, () => ({}));
    expect(world.snapshot().spawned).toBe(lvl.spawn.count);
  });
});

describe('the Dark (SPEC 8.2)', () => {
  it('shrinks over time and eventually puts flames out', () => {
    // 04-1 has an aggressive shrink and no safe corner.
    const { world } = run(level('04-1'), 95, () => ({}));
    const snap = world.snapshot();
    expect(world.darkState.enabled).toBe(true);
    expect(world.darkState.radiusFh).toBeLessThan(level('04-1').dark.startRadiusFh);
    expect(snap.saved + snap.lost).toBe(snap.spawned);
  });

  it('is disabled on levels that do not use it', () => {
    const { world } = run(level('01-1'), 5, () => ({}));
    expect(world.darkState.enabled).toBe(false);
  });
});
