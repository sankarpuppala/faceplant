/**
 * Moths, and the Maw as their counter (U6).
 *
 * This file exists because of a bug that survived the whole build: `stepMoth`
 * applied `flySpeedFhPerS` as an *acceleration* and then damped the result by
 * 0.96 on every one of 120 steps per second, which pins the moth's terminal
 * speed at 0.19 FH/s - roughly half a Wick's walking pace. Moths could not
 * catch anything, so across fifteen headless level runs they killed exactly
 * zero Wicks, and nothing in the suite noticed. Two further faults hid behind
 * it: the Maw's draft was far too weak to overpower the moth's own steering,
 * and moths preferred the Wicks queued on the stone ruins beside the head,
 * where the draft cannot reach and the player therefore has no counter at all.
 *
 * So these tests assert the three claims the hazard rests on:
 *   1. a moth actually travels at the speed config says it does;
 *   2. an ignored moth puts a flame out;
 *   3. an open Maw stops it.
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { makeMoth, stepMoth } from '../../src/physics/hazards.ts';
import { makeWick, type Wick } from '../../src/physics/wick.ts';
import { Rng } from '../../src/physics/vec.ts';

const FACE = { x: 0, y: 0 };
const dtS = 1 / config.physics.stepHz;

/** A lit Wick standing still at a point, in play as far as a moth cares. */
function standingWick(x: number, y: number): Wick {
  const w = makeWick(x, y, 'Tallow', null);
  w.state = 'walking';
  w.lit = true;
  return w;
}

describe('a moth flies at the speed config claims', () => {
  it('reaches its configured cruising speed, not a damped fraction of it', () => {
    // Starts well off frame, so the whole flight in is a straight cruise at a
    // flame standing on the face.
    const m = makeMoth(-3, 0, new Rng(1));
    const w = standingWick(0, 0);

    let peak = 0;
    for (let i = 0; i < config.physics.stepHz * 3; i++) {
      stepMoth(m, [w], FACE, null, 0, dtS);
      peak = Math.max(peak, Math.hypot(m.body.vx, m.body.vy));
    }

    // The wander term is added to the flight velocity, so the instantaneous
    // speed oscillates around the cruise figure rather than sitting on it.
    expect(peak).toBeGreaterThan(config.moth.flySpeedFhPerS * 0.8);
    expect(peak).toBeLessThanOrEqual(config.moth.flySpeedFhPerS * config.moth.maxSpeedMultiple);
    // The regression this file was written for: terminal speed used to be
    // 0.19 FH/s, which is slower than the thing it is chasing.
    expect(peak).toBeGreaterThan(config.wick.walkSpeedFhPerS * 2);
  });

  it('closes the distance to a flame rather than falling behind', () => {
    const m = makeMoth(-0.7, 0, new Rng(2));
    const w = standingWick(0, 0);
    const before = Math.hypot(w.body.x - m.body.x, w.body.y - m.body.y);
    for (let i = 0; i < config.physics.stepHz; i++) stepMoth(m, [w], FACE, null, 0, dtS);
    const after = Math.hypot(w.body.x - m.body.x, w.body.y - m.body.y);
    expect(after).toBeLessThan(before);
  });
});

describe('an ignored moth puts the flame out', () => {
  it('snuffs a Wick it is left alone with', () => {
    const m = makeMoth(-0.6, 0, new Rng(3));
    const w = standingWick(0, 0);
    let snuffed: number | null = null;
    // Five seconds is generous: crossing 0.6 FH at 0.9 FH/s plus snuffMs of
    // held contact should take well under two.
    for (let i = 0; i < config.physics.stepHz * 5 && snuffed === null; i++) {
      snuffed = stepMoth(m, [w], FACE, null, 0, dtS).snuffedWickId;
    }
    expect(snuffed).toBe(w.id);
  });

  it('holds contact long enough to matter despite its own wander', () => {
    // The wobble is wider than the contact circle, so without the close-range
    // settle the moth shakes itself out of range and resets its own timer.
    const m = makeMoth(-0.3, 0, new Rng(4));
    const w = standingWick(0, 0);
    let peak = 0;
    for (let i = 0; i < config.physics.stepHz * 3; i++) {
      const r = stepMoth(m, [w], FACE, null, 0, dtS);
      peak = Math.max(peak, m.contactMs);
      if (r.snuffedWickId !== null) break;
    }
    expect(peak).toBeGreaterThanOrEqual(config.moth.snuffMs);
  });
});

describe('an open Maw is the counter (U6)', () => {
  const WIDE = config.moth.draftFullAreaFh2 * 2;

  it('keeps a moth off a flame for as long as it is held open', () => {
    const m = makeMoth(-0.6, 0, new Rng(5));
    const w = standingWick(0, 0);
    // The mouth is open right where the Wick is standing - the player is
    // breathing on the thing attacking it.
    let snuffed: number | null = null;
    for (let i = 0; i < config.physics.stepHz * 8 && snuffed === null; i++) {
      snuffed = stepMoth(m, [w], FACE, { x: 0, y: 0 }, WIDE, dtS).snuffedWickId;
    }
    expect(snuffed).toBeNull();
  });

  it('pushes the moth away from the mouth rather than merely slowing it', () => {
    const m = makeMoth(-0.4, 0, new Rng(6));
    const w = standingWick(0, 0);
    const before = Math.hypot(m.body.x, m.body.y);
    for (let i = 0; i < config.physics.stepHz; i++) {
      stepMoth(m, [w], FACE, { x: 0, y: 0 }, WIDE, dtS);
    }
    const after = Math.hypot(m.body.x, m.body.y);
    expect(after).toBeGreaterThan(before);
  });

  it('a half-open mouth is not enough, so the player has to commit', () => {
    const m = makeMoth(-0.5, 0, new Rng(7));
    const w = standingWick(0, 0);
    let snuffed: number | null = null;
    const barely = config.moth.draftFullAreaFh2 * 0.15;
    for (let i = 0; i < config.physics.stepHz * 6 && snuffed === null; i++) {
      snuffed = stepMoth(m, [w], FACE, { x: 0, y: 0 }, barely, dtS).snuffedWickId;
    }
    expect(snuffed).toBe(w.id);
  });
});

describe('moths only prey where the player can answer', () => {
  it('ignores a Wick out on the ruins, beyond the Maw\u2019s reach', () => {
    // x = 1.2 is where Wicks queue after spawning. Moths used to fly straight
    // out there and pick them off, which the player could do nothing about.
    const onTheRuins = standingWick(1.2, 0.25);
    const m = makeMoth(1.15, 0.25, new Rng(8));
    let snuffed: number | null = null;
    for (let i = 0; i < config.physics.stepHz * 5 && snuffed === null; i++) {
      snuffed = stepMoth(m, [onTheRuins], FACE, null, 0, dtS).snuffedWickId;
    }
    expect(snuffed).toBeNull();
    expect(m.targetWickId).toBeNull();
  });

  it('every flame it will hunt is inside the draft\u2019s reach', () => {
    // The invariant that makes the hazard fair: the furthest a moth will go to
    // feed has to be somewhere a breath can still reach it. The Maw sits about
    // a quarter of a face-height below the nose.
    const mawOffsetFh = 0.25;
    expect(config.moth.huntRadiusFh + mawOffsetFh).toBeLessThanOrEqual(config.moth.draftRadiusFh);
  });

  it('circles the face when there is nothing lit to hunt', () => {
    const m = makeMoth(-2.5, -1.5, new Rng(9));
    for (let i = 0; i < config.physics.stepHz * 4; i++) stepMoth(m, [], FACE, null, 0, dtS);
    // It should have come back to the face, not drifted off frame.
    expect(Math.hypot(m.body.x, m.body.y)).toBeLessThan(config.moth.loiterRadiusFh + 0.4);
  });
});
