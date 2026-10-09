/**
 * Hazards (SPEC section 8.2, plus U6).
 *
 * Each one is countered by a *different* part of the face, which is the point:
 *   - Crawler: swallow it, or flick it off a brow.
 *   - Drip:    tilt so a brow or the nose shelters whoever is below.
 *   - Dark:    move, and lean in to carry the light.
 *   - Moth:    hold your mouth open and blow it away (U6) - which is also the
 *              most dangerous thing you can do. That squeeze is the whole
 *              reason Moths exist.
 */

import { config } from '../config.ts';
import { canWalkOn, downhillTangent } from '../terrain/walkable.ts';
import {
  advanceAlong,
  attach,
  detach,
  findContinuation,
  makeBody,
  placeOnSegment,
  stepAirborne,
  stepAttached,
  type Body,
  type SegmentIndex,
} from './solver.ts';
import { clamp, type Rng } from './vec.ts';
import type { Wick } from './wick.ts';

// ---------------------------------------------------------------- Crawler ---

export interface Crawler {
  id: number;
  body: Body;
  dir: 1 | -1;
  targetWickId: number | null;
  retargetAtMs: number;
  alive: boolean;
  /**
   * Continuous contact with the Wick it is touching, ms, and which one. A
   * Crawler used to extinguish a flame the instant the circles overlapped,
   * which gave the player no window at all to swallow or flick it away - so a
   * death by Crawler read as arbitrary rather than earned.
   */
  touchingWickId: number | null;
  touchMs: number;
  /**
   * It has had its flame and will not take another.
   *
   * Killing the Crawler outright after its kill was the obvious move and it
   * was wrong: a Crawler meets its first Wick on the *approach ledge*, so it
   * died before ever crossing the mouth - which made the Offering (U2)
   * unperformable on 02-2, the level that teaches it. Sated instead: harmless,
   * still walking, and still very much swallowable.
   */
  sated: boolean;
  /**
   * Where a sated Crawler heads for. Hunting the nearest Wick after being
   * sated sent it back toward the lantern - where new Wicks keep appearing -
   * so it loitered at the spawn point for the rest of the level and never
   * crossed the mouth, which quietly broke the Offering. A sated Crawler
   * leaves instead, across the face, where it can still be swallowed.
   */
  leaveToX: number;
}

let nextHazardId = 1;

export function resetHazardIds(): void {
  nextHazardId = 1;
}

export function makeCrawler(x: number, y: number): Crawler {
  return {
    id: nextHazardId++,
    body: makeBody(x, y, config.crawler.radiusFh),
    dir: 1,
    targetWickId: null,
    retargetAtMs: 0,
    alive: true,
    touchingWickId: null,
    touchMs: 0,
    sated: false,
    leaveToX: 0,
  };
}

export function stepCrawler(
  c: Crawler,
  wicks: readonly Wick[],
  index: SegmentIndex,
  dtS: number,
  nowMs: number,
  /** Warding Salt (shop) slows them down. 1 is unmodified. */
  speedMultiple = 1,
): void {
  if (!c.alive) return;

  const ground = index.get(c.body.groundId);
  if (ground === undefined) {
    stepAirborne(c.body, index, dtS, nowMs);
    return;
  }
  stepAttached(c.body, ground, dtS);

  // A sated Crawler stops hunting and walks for the far side, which takes it
  // across the face - and across the Maw - on its way out.
  if (c.sated) {
    const segPointsRight = ground.bx >= ground.ax;
    c.dir = c.leaveToX > c.body.x === segPointsRight ? 1 : -1;
  }

  // Re-target on a timer rather than every step, so it does not jitter between
  // two equidistant Wicks.
  if (!c.sated && nowMs >= c.retargetAtMs) {
    c.retargetAtMs = nowMs + config.crawler.retargetMs;
    let best: Wick | null = null;
    let bestD = Infinity;
    for (const w of wicks) {
      if (w.state === 'saved' || w.state === 'lost' || !w.lit) continue;
      const d = Math.hypot(w.body.x - c.body.x, w.body.y - c.body.y);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    c.targetWickId = best?.id ?? null;
  }

  const target = c.sated ? undefined : wicks.find((w) => w.id === c.targetWickId);
  if (target !== undefined) {
    const towardTarget = target.body.x > c.body.x;
    const segPointsRight = ground.bx >= ground.ax;
    c.dir = towardTarget === segPointsRight ? 1 : -1;
  }

  if (!canWalkOn(ground)) {
    const tan = downhillTangent(ground);
    const towardB = (ground.bx - ground.ax) * tan.x + (ground.by - ground.ay) * tan.y >= 0;
    c.dir = towardB ? 1 : -1;
  }

  const moved = advanceAlong(c.body, ground, config.crawler.walkSpeedFhPerS * speedMultiple * c.dir, dtS);
  if (moved.kind !== 'ranOff') return;

  // Crawlers cross gaps the same way Wicks do - otherwise they can never leave
  // the ruin they start on, so they never reach anybody and can never be
  // swallowed, which makes the Offering (U2) unperformable. They are given a
  // longer reach than a Wick, because a Crawler is the thing that is *not*
  // afraid of your face.
  const cont = findContinuation(
    index,
    ground,
    moved.pastEnd,
    config.wick.maxGapFh * 1.5,
    config.wick.maxStepUpFh * 1.5,
    config.wick.maxStepDownFh * 1.5,
  );

  if (cont !== null) {
    attach(c.body, cont.seg, cont.t, dtS);
    const headingRight = moved.pastEnd === 'b' ? ground.bx >= ground.ax : ground.ax > ground.bx;
    const segPointsRight = cont.seg.bx >= cont.seg.ax;
    c.dir = headingRight === segPointsRight ? 1 : -1;
    return;
  }

  // Nothing to step onto. Unlike a Wick, a Crawler does not turn back - it
  // walks off, which is also how a rising brow flings one.
  detach(c.body, nowMs);
  c.body.vx = (moved.pastEnd === 'b' ? 1 : -1) * config.crawler.walkSpeedFhPerS;
  c.body.vy = 0;
}

// ------------------------------------------------------------------- Drip ---

export interface Drip {
  id: number;
  body: Body;
  alive: boolean;
}

export interface DripEmitter {
  x: number;
  y: number;
  intervalMs: number;
  nextAtMs: number;
}

export function makeDrip(x: number, y: number): Drip {
  const d: Drip = { id: nextHazardId++, body: makeBody(x, y, config.drip.radiusFh), alive: true };
  d.body.vy = config.drip.fallSpeedFhPerS;
  return d;
}

/** Drips are blocked by terrain, which is what makes a brow a useful umbrella. */
export function stepDrip(d: Drip, index: SegmentIndex, dtS: number, nowMs: number): void {
  if (!d.alive) return;
  const landing = stepAirborne(d.body, index, dtS, nowMs);
  if (landing !== null || d.body.y > config.drip.despawnYFh) d.alive = false;
}

// ------------------------------------------------------------------- Moth ---

/** U6 - flies at the brightest flame; an open Maw blows it away. */
export interface Moth {
  id: number;
  body: Body;
  /** Wick it is hunting. */
  targetWickId: number | null;
  /** Continuous contact time with its target, ms. */
  contactMs: number;
  phase: number;
  alive: boolean;
}

export function makeMoth(x: number, y: number, rng: Rng): Moth {
  return {
    id: nextHazardId++,
    body: makeBody(x, y, config.moth.radiusFh),
    targetWickId: null,
    contactMs: 0,
    phase: rng.next() * Math.PI * 2,
    alive: true,
  };
}

export interface MothStepResult {
  snuffedWickId: number | null;
}

export function stepMoth(
  m: Moth,
  wicks: readonly Wick[],
  mawCentre: { x: number; y: number } | null,
  mawArea: number,
  dtS: number,
): MothStepResult {
  const out: MothStepResult = { snuffedWickId: null };
  if (!m.alive) return out;

  // Hunt the brightest lit flame, which in practice is the nearest one.
  let target: Wick | null = null;
  let bestD = Infinity;
  for (const w of wicks) {
    if (w.state === 'saved' || w.state === 'lost' || !w.lit) continue;
    const d = Math.hypot(w.body.x - m.body.x, w.body.y - m.body.y);
    if (d < bestD) {
      bestD = d;
      target = w;
    }
  }
  m.targetWickId = target?.id ?? null;

  m.phase += dtS * config.moth.wanderHz * Math.PI * 2;

  let ax = 0;
  let ay = 0;
  if (target !== null) {
    const dx = target.body.x - m.body.x;
    const dy = target.body.y - m.body.y;
    const len = Math.hypot(dx, dy) || 1;
    ax = (dx / len) * config.moth.flySpeedFhPerS;
    ay = (dy / len) * config.moth.flySpeedFhPerS;
  }

  // Wander, so a moth reads as an insect rather than a missile.
  ax += Math.cos(m.phase) * config.moth.wanderFhPerS;
  ay += Math.sin(m.phase * 1.7) * config.moth.wanderFhPerS;

  // The draft from an open Maw (U6). Strength scales with how wide it is, so a
  // real "haaah" clears the room and a half-open mouth barely helps.
  if (mawCentre !== null) {
    const dx = m.body.x - mawCentre.x;
    const dy = m.body.y - mawCentre.y;
    const d = Math.hypot(dx, dy);
    if (d < config.moth.draftRadiusFh && d > 1e-4) {
      const falloff = 1 - d / config.moth.draftRadiusFh;
      const strength = config.moth.draftFhPerS2 * falloff * clamp(mawArea / 0.02, 0.2, 1.5);
      ax += (dx / d) * strength;
      ay += (dy / d) * strength;
    }
  }

  m.body.px = m.body.x;
  m.body.py = m.body.y;
  m.body.vx += ax * dtS;
  m.body.vy += ay * dtS;

  // Moths fly, so they are damped rather than accelerated by gravity.
  const speed = Math.hypot(m.body.vx, m.body.vy);
  const maxSpeed = config.moth.flySpeedFhPerS * 2.4;
  if (speed > maxSpeed) {
    m.body.vx = (m.body.vx / speed) * maxSpeed;
    m.body.vy = (m.body.vy / speed) * maxSpeed;
  }
  m.body.vx *= 0.96;
  m.body.vy *= 0.96;

  m.body.x += m.body.vx * dtS;
  m.body.y += m.body.vy * dtS;

  if (target !== null && bestD < m.body.r + target.body.r) {
    m.contactMs += dtS * 1000;
    if (m.contactMs >= config.moth.snuffMs) out.snuffedWickId = target.id;
  } else {
    m.contactMs = 0;
  }

  return out;
}

// ------------------------------------------------------------------- Dark ---

export interface DarkState {
  /** Current safe radius around the light anchors, FH. */
  radiusFh: number;
  shrinkFhPerS: number;
  enabled: boolean;
}

export function makeDark(startRadiusFh: number, shrinkFhPerS: number): DarkState {
  return { radiusFh: startRadiusFh, shrinkFhPerS, enabled: shrinkFhPerS > 0 || startRadiusFh < 90 };
}

export function stepDark(d: DarkState, dtS: number): void {
  if (!d.enabled) return;
  d.radiusFh = Math.max(0.35, d.radiusFh - d.shrinkFhPerS * dtS);
}

/**
 * Advances a Wick's time-in-the-dark. Returns true when it goes out.
 * The grace period exists so that passing through a shadow is survivable and
 * only *staying* in one is fatal.
 */
export function stepWickDarkness(
  w: Wick,
  anchors: readonly { x: number; y: number }[],
  dark: DarkState,
  dtS: number,
): boolean {
  if (!dark.enabled || !w.lit || w.state === 'saved' || w.state === 'lost') return false;

  let nearest = Infinity;
  for (const a of anchors) {
    nearest = Math.min(nearest, Math.hypot(w.body.x - a.x, w.body.y - a.y));
  }

  if (nearest <= dark.radiusFh) {
    w.darkMs = 0;
    return false;
  }

  w.darkMs += dtS * 1000;
  return w.darkMs >= config.dark.graceMs;
}

/** Placing a Crawler needs a surface; this finds one near a requested point. */
export function groundNear(index: SegmentIndex, x: number, y: number, body: Body): boolean {
  let best: { id: string; t: number; d: number } | null = null;
  for (const seg of index.segments) {
    if (seg.kind === 'rail' || !canWalkOn(seg)) continue;
    const t = clamp(
      ((x - seg.ax) * (seg.bx - seg.ax) + (y - seg.ay) * (seg.by - seg.ay)) / Math.max(1e-9, seg.len * seg.len),
      0,
      1,
    );
    const cx = seg.ax + (seg.bx - seg.ax) * t;
    const cy = seg.ay + (seg.by - seg.ay) * t;
    const d = Math.hypot(cx - x, cy - y);
    if (best === null || d < best.d) best = { id: seg.id, t, d };
  }
  if (best === null) return false;
  const seg = index.get(best.id);
  if (seg === undefined) return false;
  body.groundId = seg.id;
  body.groundT = best.t;
  placeOnSegment(body, seg);
  return true;
}

/** Used by the world to fling a Crawler off a rising brow, same as a Wick. */
export function flickBody(body: Body, impulseFhPerS: number, nowMs: number): void {
  detach(body, nowMs, config.flick.airborneMs);
  body.vy = -Math.min(impulseFhPerS, config.flick.maxImpulseFhPerS);
}

export { attach as attachBody };
