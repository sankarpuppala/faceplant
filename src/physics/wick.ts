/**
 * Wick behaviour (SPEC sections 6.4-6.6, 8.1).
 *
 * The design rule that governs every branch in here is decision D5: **a death
 * must feel like something the player's face did.** So Wicks are timid. They
 * refuse ledges they cannot survive, they turn at walls, they back away from an
 * open mouth. If a Wick dies, it is because the terrain moved under it, or
 * because the player opened the Maw, or laughed, or flinched - never because
 * the Wick walked off a cliff it could see.
 */

import { config } from '../config.ts';
import type { Segment } from '../terrain/build.ts';
import { canWalkOn, downhillTangent, segmentUpwardSpeed } from '../terrain/walkable.ts';
import { clamp, type Rng } from './vec.ts';
import {
  advanceAlong,
  attach,
  detach,
  findContinuation,
  findRail,
  makeBody,
  placeOnSegment,
  stepAirborne,
  stepAttached,
  surfaceBelow,
  type Body,
  type SegmentIndex,
} from './solver.ts';

export type WickState = 'falling' | 'walking' | 'sliding' | 'railing' | 'flung' | 'saved' | 'lost';

export type LostCause = 'maw' | 'void' | 'drip' | 'dark' | 'crawler' | 'moth';

export interface Wick {
  id: number;
  /** U7 - every Wick has a name, so that losing one is a story rather than a number. */
  name: string;
  /** U7 - earned title for a Wick that has survived before. */
  title: string | null;
  body: Body;
  state: WickState;
  /** Walking direction along the surface tangent: +1 toward b, -1 toward a. */
  dir: 1 | -1;
  /** False once the flame is out; an unlit Wick no longer gives light. */
  lit: boolean;
  cause: LostCause | null;
  /** Loses grip until this timestamp (quake, SPEC section 6.6). */
  stumbleUntilMs: number;
  /** Continuous ms spent outside the safe radius (the Dark, SPEC section 8.2). */
  darkMs: number;
  /** Sliding speed along the current surface, FH per second. */
  slideSpeed: number;
  /** ms since spawn; drives the walk bob and the spawn line. */
  ageMs: number;
  /** The last thing it said, kept for the Ossuary (U7). */
  lastWords: string | null;
  /** Set while the Wick is actively fleeing an open Maw, for the render tint. */
  fleeing: boolean;
}

let nextWickId = 1;

export function resetWickIds(): void {
  nextWickId = 1;
}

export function makeWick(x: number, y: number, name: string, title: string | null, dir: 1 | -1 = 1): Wick {
  return {
    id: nextWickId++,
    name,
    title,
    body: makeBody(x, y, config.wick.radiusFh),
    state: 'falling',
    dir,
    lit: true,
    cause: null,
    stumbleUntilMs: 0,
    darkMs: 0,
    slideSpeed: 0,
    ageMs: 0,
    lastWords: null,
    fleeing: false,
  };
}

export interface WickTunables {
  maxStepDownFh: number;
  maxGapFh: number;
}

export interface WickContext {
  index: SegmentIndex;
  dtS: number;
  nowMs: number;
  /** Centre of the swallow polygon, or null while the Maw is shut. */
  mawCentre: { x: number; y: number } | null;
  /** Face-centre speed this step, for the quake check. */
  faceSpeedFhPerS: number;
  tunables: WickTunables;
  rng: Rng;
}

export interface WickStepResult {
  landed: boolean;
  flicked: boolean;
  stumbled: boolean;
  startedRail: boolean;
  turnedAtEdge: boolean;
}

const EMPTY_RESULT: WickStepResult = {
  landed: false,
  flicked: false,
  stumbled: false,
  startedRail: false,
  turnedAtEdge: false,
};

/**
 * One physics step for one Wick. Returns what notable thing happened, so the
 * audio and line systems can react without reading the Wick's internals.
 */
export function stepWick(w: Wick, ctx: WickContext): WickStepResult {
  if (w.state === 'saved' || w.state === 'lost') return EMPTY_RESULT;

  const result: WickStepResult = { ...EMPTY_RESULT };
  w.ageMs += ctx.dtS * 1000;

  // --- Quake (SPEC 6.6): a flinch shakes everyone off balance. -------------
  if (ctx.faceSpeedFhPerS > config.quake.speedFhPerS && w.stumbleUntilMs < ctx.nowMs) {
    w.stumbleUntilMs = ctx.nowMs + config.quake.stumbleMs;
    result.stumbled = true;
    if (w.body.groundId !== null) {
      const push = (ctx.rng.next() * 2 - 1) * config.quake.lateralImpulseFhPerS;
      detach(w.body, ctx.nowMs);
      w.body.vx += push;
      w.body.vy -= config.quake.lateralImpulseFhPerS * 0.5;
      w.state = 'falling';
    }
  }

  // --- Rails: the nose carries whoever touches it (see solver.findRail). ---
  if (w.state === 'railing') {
    const rail = ctx.index.get(w.body.railId);
    if (rail === undefined) {
      w.state = 'falling';
      w.body.railId = null;
    } else {
      return stepRail(w, rail, ctx, result);
    }
  }

  const ground = ctx.index.get(w.body.groundId);

  if (ground === undefined) {
    // --- Airborne ---------------------------------------------------------
    if (w.state !== 'flung') w.state = 'falling';

    const railHit = findRail(w.body, ctx.index);
    if (railHit !== null && ctx.nowMs >= w.body.airborneUntilMs) {
      w.body.railId = railHit.seg.id;
      w.body.railT = railHit.t;
      w.state = 'railing';
      w.slideSpeed = Math.max(0, w.body.vy);
      result.startedRail = true;
      return result;
    }

    const landing = stepAirborne(w.body, ctx.index, ctx.dtS, ctx.nowMs);
    if (landing !== null) {
      result.landed = true;
      w.state = canWalkOn(landing.seg) ? 'walking' : 'sliding';
      w.slideSpeed = 0;
      // Face the way it was already travelling, so a landing does not look like a reset.
      w.dir = w.body.vx >= 0 ? 1 : -1;
    }
    return result;
  }

  // --- Attached ------------------------------------------------------------
  const surf = stepAttached(w.body, ground, ctx.dtS);

  // Eyebrow flick (SPEC 6.5): a brow travelling up fast launches its passengers.
  if (ground.contour === 'browL' || ground.contour === 'browR') {
    const up = segmentUpwardSpeed(ground, w.body.groundT, ctx.dtS);
    if (up > config.flick.minBrowSpeedFhPerS) {
      const impulse = Math.min(up * config.flick.gain, config.flick.maxImpulseFhPerS);
      detach(w.body, ctx.nowMs, config.flick.airborneMs);
      w.body.vx = surf.x;
      w.body.vy = -impulse;
      w.state = 'flung';
      result.flicked = true;
      return result;
    }
  }

  if (ctx.nowMs < w.stumbleUntilMs) {
    // Stumbling: still attached, but not making progress.
    return result;
  }

  // Too steep to walk: slide downhill, gathering speed.
  if (!canWalkOn(ground)) {
    w.state = 'sliding';
    const tan = downhillTangent(ground);
    w.slideSpeed = Math.min(
      config.wick.maxFallSpeedFhPerS,
      w.slideSpeed + config.physics.gravityFhPerS2 * Math.abs(tan.y) * ctx.dtS,
    );
    const towardB = (ground.bx - ground.ax) * tan.x + (ground.by - ground.ay) * tan.y >= 0;
    w.dir = towardB ? 1 : -1;
    return moveAlong(w, ground, w.slideSpeed * w.dir, ctx, result);
  }

  w.state = 'walking';
  w.slideSpeed = 0;

  // Maw fear (SPEC 6.4): turn away from an open mouth - but a slope or a quake
  // can still deliver you into it, which is what keeps the Maw fair.
  w.fleeing = false;
  let speed = config.wick.walkSpeedFhPerS;
  if (ctx.mawCentre !== null) {
    const d = Math.hypot(w.body.x - ctx.mawCentre.x, w.body.y - ctx.mawCentre.y);
    if (d < config.wick.mawFearRadiusFh) {
      const awayIsB = ground.bx - ground.ax > 0 === w.body.x - ctx.mawCentre.x > 0;
      w.dir = awayIsB ? 1 : -1;
      speed *= config.wick.fleeSpeedMultiple;
      w.fleeing = true;
    }
  }

  return moveAlong(w, ground, speed * w.dir, ctx, result);
}

/** Walks or slides along the current surface, handling edges timidly. */
function moveAlong(w: Wick, ground: Segment, signedSpeed: number, ctx: WickContext, result: WickStepResult): WickStepResult {
  const moved = advanceAlong(w.body, ground, signedSpeed, ctx.dtS);
  if (moved.kind === 'ok') return result;

  const cont = findContinuation(
    ctx.index,
    ground,
    moved.pastEnd,
    ctx.tunables.maxGapFh,
    config.wick.maxStepUpFh,
    ctx.tunables.maxStepDownFh,
  );

  if (cont !== null) {
    attach(w.body, cont.seg, cont.t, ctx.dtS);
    // Keep heading the same way in world terms, not in segment terms: the next
    // segment may be wound the other way round.
    const headingRight = signedSpeed > 0 ? ground.bx >= ground.ax : ground.ax > ground.bx;
    const segPointsRight = cont.seg.bx >= cont.seg.ax;
    w.dir = headingRight === segPointsRight ? 1 : -1;
    return result;
  }

  // Nothing to step onto. Is this a step down, or a cliff?
  const ex = moved.pastEnd === 'b' ? ground.bx : ground.ax;
  const ey = moved.pastEnd === 'b' ? ground.by : ground.ay;
  const below = surfaceBelow(ctx.index, ex, ey + 1e-4, ctx.tunables.maxStepDownFh);

  if (below !== null) {
    attach(w.body, below.seg, below.t, ctx.dtS);
    return result;
  }

  if (w.state === 'sliding') {
    // A sliding Wick has no choice: it leaves the edge at speed.
    detach(w.body, ctx.nowMs);
    const tan = downhillTangent(ground);
    w.body.vx = tan.x * w.slideSpeed;
    w.body.vy = Math.max(0, tan.y * w.slideSpeed);
    w.state = 'falling';
    return result;
  }

  // Timid: turn around (decision D5).
  w.dir = w.dir === 1 ? -1 : 1;
  w.body.groundT = clamp(w.body.groundT, 0.02, 0.98);
  placeOnSegment(w.body, ground);
  result.turnedAtEdge = true;
  return result;
}

/** Riding the nose. Released at the lower end, pointed at whatever is beneath. */
function stepRail(w: Wick, rail: Segment, ctx: WickContext, result: WickStepResult): WickStepResult {
  const tan = downhillTangent(rail);
  w.slideSpeed = Math.min(
    config.wick.maxFallSpeedFhPerS,
    w.slideSpeed + config.physics.gravityFhPerS2 * Math.abs(tan.y) * ctx.dtS,
  );

  const towardB = (rail.bx - rail.ax) * tan.x + (rail.by - rail.ay) * tan.y >= 0;
  const step = (w.slideSpeed * ctx.dtS) / Math.max(1e-9, rail.len);
  w.body.railT += towardB ? step : -step;

  if (w.body.railT >= 1 || w.body.railT <= 0) {
    // Off the end: hand over to the airborne path, carrying the slide speed.
    w.body.railId = null;
    w.state = 'falling';
    detach(w.body, ctx.nowMs);
    w.body.vx = tan.x * w.slideSpeed;
    w.body.vy = Math.max(0, tan.y * w.slideSpeed);
    return result;
  }

  w.body.px = w.body.x;
  w.body.py = w.body.y;
  const t = clamp(w.body.railT, 0, 1);
  w.body.x = rail.ax + (rail.bx - rail.ax) * t;
  w.body.y = rail.ay + (rail.by - rail.ay) * t;
  w.body.vx = tan.x * w.slideSpeed;
  w.body.vy = tan.y * w.slideSpeed;
  return result;
}
