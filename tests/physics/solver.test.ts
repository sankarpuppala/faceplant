/**
 * AC-3 — the solver.
 *
 * These are the tests the whole game rests on. Each one encodes a property that
 * must hold for face terrain to be playable rather than infuriating:
 * one-way landing, pass-through from below, riding a moving surface, catching a
 * surface that moved half a face height in a single step, sliding past the
 * slope limit, turning timidly at an edge, the flick impulse clamp, and the
 * quake stumble.
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import type { Segment } from '../../src/terrain/build.ts';
import {
  advanceAlong,
  attach,
  findContinuation,
  findLanding,
  makeBody,
  SegmentIndex,
  stepAirborne,
  stepAttached,
  sweptHit,
} from '../../src/physics/solver.ts';
import { makeWick, stepWick } from '../../src/physics/wick.ts';
import { Rng } from '../../src/physics/vec.ts';
import { canWalkOn } from '../../src/terrain/walkable.ts';

/** Builds one segment, optionally with a different previous pose (a moving one). */
function seg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  opts: { prev?: [number, number, number, number]; oneWay?: boolean; id?: string; kind?: Segment['kind'] } = {},
): Segment {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  const p = opts.prev ?? [ax, ay, bx, by];
  const maxCos = Math.cos((config.terrain.maxWalkableAngleDeg * Math.PI) / 180);
  const ny = -dx / len;
  return {
    id: opts.id ?? 'seg:0',
    ax,
    ay,
    bx,
    by,
    pax: p[0],
    pay: p[1],
    pbx: p[2],
    pby: p[3],
    nx: dy / len,
    ny,
    len,
    walkable: -ny >= maxCos,
    oneWay: opts.oneWay ?? true,
    kind: opts.kind ?? 'face',
    contour: null,
  };
}

const STEP_S = 1 / config.physics.stepHz;

describe('swept one-way test', () => {
  it('lands a body falling onto a flat surface', () => {
    const ground = seg(-1, 0, 1, 0);
    const body = makeBody(0, -0.2, 0.035);
    body.px = 0;
    body.py = -0.2;
    body.x = 0;
    body.y = 0.05; // crossed the surface during the step

    const hit = sweptHit(body, ground, 1);
    expect(hit).not.toBeNull();
    expect(hit?.t).toBeCloseTo(0.5, 2);
    expect(hit?.timeFraction).toBeGreaterThan(0);
    expect(hit?.timeFraction).toBeLessThanOrEqual(1);
  });

  it('passes through the same surface from below (decision D3)', () => {
    const ground = seg(-1, 0, 1, 0);
    const body = makeBody(0, 0.2, 0.035);
    body.px = 0;
    body.py = 0.2;
    body.x = 0;
    body.y = -0.05; // rising through it

    expect(sweptHit(body, ground, 1)).toBeNull();
  });

  it('does not land a body that is still clear of the surface', () => {
    const ground = seg(-1, 0, 1, 0);
    const body = makeBody(0, -0.5, 0.035);
    body.px = 0;
    body.py = -0.5;
    body.x = 0;
    body.y = -0.4;

    expect(sweptHit(body, ground, 1)).toBeNull();
  });

  it('lets a body sail past the end of a segment rather than catching on air', () => {
    const ground = seg(-1, 0, -0.5, 0);
    const body = makeBody(0.5, -0.1, 0.035);
    body.px = 0.5;
    body.py = -0.1;
    body.x = 0.5;
    body.y = 0.1;

    expect(sweptHit(body, ground, 1)).toBeNull();
  });

  it('catches a surface that moved 0.5 FH in one step', () => {
    // The brow starts well below the body and ends above it. Compared only
    // against the end pose this would look like the body is already inside the
    // surface; compared against both poses it is a clean landing.
    const ground = seg(-1, -0.3, 1, -0.3, { prev: [-1, 0.2, 1, 0.2] });
    const body = makeBody(0, 0, 0.035);
    body.px = 0;
    body.py = 0;
    body.x = 0;
    body.y = 0;

    const hit = sweptHit(body, ground, 1);
    expect(hit).not.toBeNull();
  });

  it('catches a surface that moved 0.9 FH in one step', () => {
    const ground = seg(-1, -0.45, 1, -0.45, { prev: [-1, 0.45, 1, 0.45] });
    const body = makeBody(0, 0, 0.035);
    body.px = 0;
    body.py = 0;
    body.x = 0;
    body.y = 0;

    expect(sweptHit(body, ground, 1)).not.toBeNull();
  });

  it('treats a wall as solid from both sides', () => {
    const wall = seg(0, -1, 0, 1, { oneWay: false });
    const body = makeBody(-0.1, 0, 0.035);
    body.px = -0.1;
    body.y = 0;
    body.x = 0.05;

    const fromOneSide = sweptHit(body, wall, 1);
    const fromOther = sweptHit(body, wall, -1);
    expect(fromOneSide !== null || fromOther !== null).toBe(true);
  });
});

describe('findLanding', () => {
  it('picks the earliest crossing when two surfaces are in the way', () => {
    const high = seg(-1, -0.1, 1, -0.1, { id: 'high' });
    const low = seg(-1, 0.2, 1, 0.2, { id: 'low' });
    const index = new SegmentIndex([low, high]);

    const body = makeBody(0, -0.3, 0.035);
    body.px = 0;
    body.py = -0.3;
    body.x = 0;
    body.y = 0.4;

    const hit = findLanding(body, index, 1000);
    expect(hit?.seg.id).toBe('high');
  });

  it('respects the airborne lockout after a flick', () => {
    const ground = seg(-1, 0, 1, 0);
    const index = new SegmentIndex([ground]);
    const body = makeBody(0, -0.2, 0.035);
    body.px = 0;
    body.py = -0.2;
    body.x = 0;
    body.y = 0.05;
    body.airborneUntilMs = 500;

    expect(findLanding(body, index, 100)).toBeNull();
    expect(findLanding(body, index, 600)).not.toBeNull();
  });

  it('ignores segments too steep to be ground', () => {
    const cliff = seg(0, -1, 0.05, 1);
    expect(cliff.walkable).toBe(false);
    const index = new SegmentIndex([cliff]);

    const body = makeBody(0, -0.5, 0.035);
    body.px = 0;
    body.py = -0.5;
    body.x = 0.02;
    body.y = 0.5;

    expect(findLanding(body, index, 1000)).toBeNull();
  });
});

describe('attachment', () => {
  it('rides a moving segment, inheriting its velocity', () => {
    // The surface travels right at a known speed; an attached body must move
    // with it exactly. This is "they ride your face" (SPEC section 8.1).
    const speed = 0.8; // FH/s
    const dx = speed * STEP_S;
    const ground = seg(-1 + dx, 0, 1 + dx, 0, { prev: [-1, 0, 1, 0] });

    const body = makeBody(0, 0, 0.035);
    attach(body, ground, 0.5, STEP_S);
    const surf = stepAttached(body, ground, STEP_S);

    expect(surf.x).toBeCloseTo(speed, 5);
    expect(body.vx).toBeCloseTo(speed, 5);
    // Position is derived from the segment, so it tracks it exactly.
    expect(body.x).toBeCloseTo(dx, 6);
    expect(body.y).toBeCloseTo(-body.r, 6);
  });

  it('keeps a body exactly one radius off the surface', () => {
    const ground = seg(-1, 0.3, 1, 0.3);
    const body = makeBody(0, 0, 0.04);
    attach(body, ground, 0.25, STEP_S);
    expect(body.y).toBeCloseTo(0.3 - 0.04, 6);
    expect(body.x).toBeCloseTo(-0.5, 6);
  });

  it('cannot tunnel while attached, however fast the surface moves', () => {
    const body = makeBody(0, 0, 0.035);
    let ground = seg(-1, 0, 1, 0);
    attach(body, ground, 0.5, STEP_S);

    for (let i = 0; i < 200; i++) {
      const y = Math.sin(i * 0.7) * 1.2; // violent vertical thrashing
      const prevY = Math.sin((i - 1) * 0.7) * 1.2;
      ground = seg(-1, y, 1, y, { prev: [-1, prevY, 1, prevY] });
      stepAttached(body, ground, STEP_S);
      expect(body.y).toBeCloseTo(y - body.r, 6);
      expect(Number.isFinite(body.x)).toBe(true);
    }
  });
});

describe('walking along a surface', () => {
  it('reports running off the far end', () => {
    const ground = seg(0, 0, 0.1, 0);
    const body = makeBody(0, 0, 0.035);
    attach(body, ground, 0.95, STEP_S);
    const r = advanceAlong(body, ground, 1, 0.2);
    expect(r.kind).toBe('ranOff');
    if (r.kind === 'ranOff') expect(r.pastEnd).toBe('b');
  });

  it('reports running off the near end', () => {
    const ground = seg(0, 0, 0.1, 0);
    const body = makeBody(0, 0, 0.035);
    attach(body, ground, 0.05, STEP_S);
    const r = advanceAlong(body, ground, -1, 0.2);
    expect(r.kind).toBe('ranOff');
    if (r.kind === 'ranOff') expect(r.pastEnd).toBe('a');
  });

  it('slides rather than walks past the slope limit', () => {
    const shallow = seg(0, 0, 1, 0.3); // about 17 degrees
    const steep = seg(0, 0, 1, 2.5); // about 68 degrees
    expect(canWalkOn(shallow)).toBe(true);
    expect(canWalkOn(steep)).toBe(false);
  });
});

describe('findContinuation (timid edges, decision D5)', () => {
  const tun = { maxGap: config.wick.maxGapFh, up: config.wick.maxStepUpFh, down: config.wick.maxStepDownFh };

  it('steps across a gap inside the limit', () => {
    const from = seg(0, 0, 0.5, 0, { id: 'a' });
    const to = seg(0.53, 0, 1, 0, { id: 'b' });
    const cont = findContinuation(new SegmentIndex([from, to]), from, 'b', tun.maxGap, tun.up, tun.down);
    expect(cont?.seg.id).toBe('b');
  });

  it('refuses a gap wider than the limit', () => {
    const from = seg(0, 0, 0.5, 0, { id: 'a' });
    const to = seg(0.5 + tun.maxGap * 3, 0, 1, 0, { id: 'b' });
    const cont = findContinuation(new SegmentIndex([from, to]), from, 'b', tun.maxGap, tun.up, tun.down);
    expect(cont).toBeNull();
  });

  it('refuses a drop deeper than the step limit', () => {
    const from = seg(0, 0, 0.5, 0, { id: 'a' });
    const to = seg(0.52, tun.down * 4, 1, tun.down * 4, { id: 'b' });
    const cont = findContinuation(new SegmentIndex([from, to]), from, 'b', tun.maxGap, tun.up, tun.down);
    expect(cont).toBeNull();
  });

  it('refuses a step up higher than the limit', () => {
    const from = seg(0, 0, 0.5, 0, { id: 'a' });
    const to = seg(0.52, -tun.up * 4, 1, -tun.up * 4, { id: 'b' });
    const cont = findContinuation(new SegmentIndex([from, to]), from, 'b', tun.maxGap, tun.up, tun.down);
    expect(cont).toBeNull();
  });
});

describe('Wick behaviour', () => {
  const ctxFor = (segments: Segment[], extra: Partial<Parameters<typeof stepWick>[1]> = {}) => ({
    index: new SegmentIndex(segments),
    dtS: STEP_S,
    nowMs: 1000,
    mawCentre: null,
    faceSpeedFhPerS: 0,
    tunables: { maxStepDownFh: config.wick.maxStepDownFh, maxGapFh: config.wick.maxGapFh },
    rng: new Rng(1),
    ...extra,
  });

  it('turns around at a cliff instead of walking off it', () => {
    // A short ledge over nothing. A Wick must never choose to step off.
    const ledge = seg(-0.2, 0, 0.2, 0, { id: 'ledge' });
    const w = makeWick(0, -0.05, 'kevin', null, 1);
    const ctx = ctxFor([ledge]);

    attach(w.body, ledge, 0.5, STEP_S);
    w.state = 'walking';

    let turned = false;
    for (let i = 0; i < 400; i++) {
      const r = stepWick(w, ctx);
      if (r.turnedAtEdge) turned = true;
      // It must stay on the ledge the whole time.
      expect(w.body.x).toBeGreaterThanOrEqual(-0.25);
      expect(w.body.x).toBeLessThanOrEqual(0.25);
    }
    expect(turned).toBe(true);
    expect(w.state).toBe('walking');
  });

  it('is flung by a brow rising faster than the threshold, and the impulse is clamped', () => {
    // A brow moving far faster than the flick threshold; the resulting impulse
    // must still respect maxImpulseFhPerS, so a violent eyebrow cannot launch a
    // Wick off the screen.
    const fast = 40; // FH/s, absurd on purpose
    const dy = -fast * STEP_S;
    const brow: Segment = { ...seg(-0.3, dy, 0.3, dy, { prev: [-0.3, 0, 0.3, 0] }), contour: 'browL', id: 'browL:0' };

    const w = makeWick(0, 0, 'agnes', null, 1);
    attach(w.body, brow, 0.5, STEP_S);
    w.state = 'walking';

    const r = stepWick(w, ctxFor([brow]));
    expect(r.flicked).toBe(true);
    expect(w.state).toBe('flung');
    expect(-w.body.vy).toBeLessThanOrEqual(config.flick.maxImpulseFhPerS + 1e-9);
    expect(-w.body.vy).toBeGreaterThan(0);
  });

  it('does not flick on a brow moving slower than the threshold', () => {
    const slow = config.flick.minBrowSpeedFhPerS * 0.5;
    const dy = -slow * STEP_S;
    const brow: Segment = { ...seg(-0.3, dy, 0.3, dy, { prev: [-0.3, 0, 0.3, 0] }), contour: 'browL', id: 'browL:0' };

    const w = makeWick(0, 0, 'edith', null, 1);
    attach(w.body, brow, 0.5, STEP_S);
    w.state = 'walking';

    expect(stepWick(w, ctxFor([brow])).flicked).toBe(false);
  });

  it('stumbles and loses grip when the face moves faster than the quake threshold', () => {
    const ground = seg(-1, 0, 1, 0, { id: 'g' });
    const w = makeWick(0, 0, 'clive', null, 1);
    attach(w.body, ground, 0.5, STEP_S);
    w.state = 'walking';

    const r = stepWick(w, ctxFor([ground], { faceSpeedFhPerS: config.quake.speedFhPerS * 2 }));
    expect(r.stumbled).toBe(true);
    expect(w.stumbleUntilMs).toBeGreaterThan(1000);
    expect(w.body.groundId).toBeNull();
  });

  it('walks away from an open Maw (SPEC 6.4)', () => {
    const ground = seg(-1, 0, 1, 0, { id: 'g' });
    const w = makeWick(0.2, 0, 'maude', null, -1); // heading toward the mouth
    attach(w.body, ground, 0.6, STEP_S);
    w.state = 'walking';

    const ctx = ctxFor([ground], { mawCentre: { x: 0, y: 0.1 } });
    const startX = w.body.x;

    // It flees while inside the fear radius and stops once it is clear, so the
    // flag has to be sampled during the walk rather than after it.
    let fledAtSomePoint = false;
    for (let i = 0; i < 60; i++) {
      stepWick(w, ctx);
      if (w.fleeing) fledAtSomePoint = true;
    }

    expect(fledAtSomePoint).toBe(true);
    expect(w.body.x).toBeGreaterThan(startX);
    // And it ended up outside the fear radius, which is the point of fleeing.
    expect(Math.hypot(w.body.x - 0, w.body.y - 0.1)).toBeGreaterThan(config.wick.mawFearRadiusFh * 0.9);
  });

  it('falls and lands under gravity without passing through the floor', () => {
    const floor = seg(-2, 1, 2, 1, { id: 'floor' });
    const index = new SegmentIndex([floor]);
    const body = makeBody(0, -1, 0.035);

    let landed = false;
    for (let i = 0; i < 1000 && !landed; i++) {
      if (stepAirborne(body, index, STEP_S, 0) !== null) landed = true;
      expect(body.y).toBeLessThanOrEqual(1.001);
    }
    expect(landed).toBe(true);
    expect(body.y).toBeCloseTo(1 - 0.035, 3);
  });
});
