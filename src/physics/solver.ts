/**
 * The solver (SPEC section 8.4, decision D2, AC-3).
 *
 * Why not a general engine: the terrain here is a set of one-way polylines that
 * *move*, and whose motion must be inherited by whatever is standing on them.
 * A face can shift half a face height between two physics steps when someone
 * flinches. General engines handle deforming kinematic geometry awkwardly, so
 * this is the one piece worth writing by hand.
 *
 * Two regimes, and the split is what makes the thing robust:
 *
 *   AIRBORNE bodies are integrated and then **swept**: for each segment we
 *   compare the body's signed distance to that segment's *previous* pose at the
 *   start of the step with its distance to the *current* pose at the end. A
 *   sign change means the body crossed the surface during the step, no matter
 *   how fast either of them moved. This is why a brow travelling 0.5 FH in one
 *   step still catches a Wick instead of teleporting past it.
 *
 *   GROUNDED bodies are not integrated at all. They are *attached*: position is
 *   derived each step from the segment's current pose and a stored parameter
 *   along it. A body that is attached cannot tunnel by construction, and it
 *   rides a moving face exactly rather than approximately.
 */

import { config } from '../config.ts';
import type { Segment } from '../terrain/build.ts';
import { canWalkOn, downhillTangent, segmentVelocityAt } from '../terrain/walkable.ts';
import { clamp, rawParam } from './vec.ts';

export interface Body {
  /** Centre, world FH. */
  x: number;
  y: number;
  /** Position at the start of the step; the swept test needs it. */
  px: number;
  py: number;
  /** Velocity, FH per second. Meaningless while attached. */
  vx: number;
  vy: number;
  r: number;
  /** Segment id this body is attached to, or null while airborne. */
  groundId: string | null;
  /** Parameter along the attached segment, 0..1. */
  groundT: number;
  /** Cannot re-attach before this timestamp. Stops a flick re-landing instantly. */
  airborneUntilMs: number;
  /** Rail (nose) the body is riding, or null. */
  railId: string | null;
  railT: number;
}

export function makeBody(x: number, y: number, r: number): Body {
  return {
    x,
    y,
    px: x,
    py: y,
    vx: 0,
    vy: 0,
    r,
    groundId: null,
    groundT: 0,
    airborneUntilMs: 0,
    railId: null,
    railT: 0,
  };
}

/** Segment lookup by id, rebuilt once per step. */
export class SegmentIndex {
  private readonly map = new Map<string, Segment>();

  readonly segments: readonly Segment[];

  constructor(segments: readonly Segment[]) {
    this.segments = segments;
    for (const s of segments) this.map.set(s.id, s);
  }

  get(id: string | null): Segment | undefined {
    return id === null ? undefined : this.map.get(id);
  }
}

export interface Landing {
  seg: Segment;
  /** Fraction of the step at which contact happened, 0..1. */
  timeFraction: number;
  /** Parameter along the segment at contact, 0..1. */
  t: number;
}

/**
 * The swept one-way test for a single segment.
 *
 * `side` is +1 to catch a body falling onto the normal face of the segment and
 * -1 to catch one rising into its back. One-way surfaces only test +1, which is
 * decision D3: a Wick that ends up inside a face can always get out.
 */
export function sweptHit(body: Body, seg: Segment, side: 1 | -1): Landing | null {
  // Previous pose normal. Recomputed rather than stored because a tracker blip
  // can change a segment's direction between steps.
  const pdx = seg.pbx - seg.pax;
  const pdy = seg.pby - seg.pay;
  const plen = Math.hypot(pdx, pdy);
  if (plen <= 1e-9) return null;
  const pnx = (pdy / plen) * side;
  const pny = (-pdx / plen) * side;

  const nx = seg.nx * side;
  const ny = seg.ny * side;

  // Signed distance from each surface, minus the radius: 0 is touching.
  const prevGap = (body.px - seg.pax) * pnx + (body.py - seg.pay) * pny - body.r;
  const curGap = (body.x - seg.ax) * nx + (body.y - seg.ay) * ny - body.r;

  // Must start clear of the surface and end at or behind it.
  if (!(prevGap > 0 && curGap <= 0)) return null;

  const denom = prevGap - curGap;
  const s = denom <= 1e-12 ? 0 : clamp(prevGap / denom, 0, 1);

  // Where both the body and the segment were at the moment of contact. Doing
  // this properly - rather than using the end-of-step pose - is what makes the
  // test correct for a segment that is itself moving fast.
  const bx = body.px + (body.x - body.px) * s;
  const by = body.py + (body.y - body.py) * s;
  const cax = seg.pax + (seg.ax - seg.pax) * s;
  const cay = seg.pay + (seg.ay - seg.pay) * s;
  const cbx = seg.pbx + (seg.bx - seg.pbx) * s;
  const cby = seg.pby + (seg.by - seg.pby) * s;

  const raw = rawParam(bx, by, cax, cay, cbx, cby);

  // Off the end of the segment: only a hit if the body actually overlaps the
  // endpoint cap, otherwise it legitimately sailed past the edge.
  if (raw < 0 || raw > 1) {
    const t = clamp(raw, 0, 1);
    const ex = cax + (cbx - cax) * t;
    const ey = cay + (cby - cay) * t;
    if (Math.hypot(bx - ex, by - ey) > body.r * 1.02) return null;
    return { seg, timeFraction: s, t };
  }

  return { seg, timeFraction: s, t: raw };
}

/** The earliest landing among all segments, or null. */
export function findLanding(body: Body, index: SegmentIndex, nowMs: number): Landing | null {
  if (nowMs < body.airborneUntilMs) return null;

  let best: Landing | null = null;
  for (const seg of index.segments) {
    if (seg.kind === 'rail') continue;
    if (!seg.walkable && seg.oneWay) continue;

    let hit = sweptHit(body, seg, 1);
    // Walls are solid both ways (SPEC section 8.3).
    if (hit === null && !seg.oneWay) hit = sweptHit(body, seg, -1);
    if (hit === null) continue;

    if (best === null || hit.timeFraction < best.timeFraction) best = hit;
  }
  return best;
}

/** Attaches a body to a segment at a parameter, resolving position and velocity. */
export function attach(body: Body, seg: Segment, t: number, dtS: number): void {
  body.groundId = seg.id;
  body.groundT = clamp(t, 0, 1);
  body.railId = null;
  placeOnSegment(body, seg);

  const surf = segmentVelocityAt(seg, body.groundT, dtS);
  const relVx = body.vx - surf.x;
  const relVy = body.vy - surf.y;

  // Kill the inward normal component (with a little restitution) and shave the
  // tangential one, so landing reads as a small thud rather than a skid.
  const vn = relVx * seg.nx + relVy * seg.ny;
  const tx = (seg.bx - seg.ax) / seg.len;
  const ty = (seg.by - seg.ay) / seg.len;
  const vt = relVx * tx + relVy * ty;

  const bounce = -vn * config.physics.landingRestitution;
  const kept = vt * config.physics.groundFriction;

  body.vx = surf.x + seg.nx * bounce + tx * kept;
  body.vy = surf.y + seg.ny * bounce + ty * kept;
}

/** Puts the body exactly one radius off the segment surface at its stored parameter. */
export function placeOnSegment(body: Body, seg: Segment): void {
  const cx = seg.ax + (seg.bx - seg.ax) * body.groundT;
  const cy = seg.ay + (seg.by - seg.ay) * body.groundT;
  body.x = cx + seg.nx * body.r;
  body.y = cy + seg.ny * body.r;
}

export function detach(body: Body, nowMs: number, airborneMs = 0): void {
  body.groundId = null;
  body.railId = null;
  body.airborneUntilMs = nowMs + airborneMs;
}

/**
 * Integrates one airborne step and resolves the first surface crossed.
 * Returns the landing, so callers can react (sound, Wick state, flame-out).
 */
export function stepAirborne(body: Body, index: SegmentIndex, dtS: number, nowMs: number): Landing | null {
  body.px = body.x;
  body.py = body.y;

  body.vy += config.physics.gravityFhPerS2 * dtS;
  if (body.vy > config.wick.maxFallSpeedFhPerS) body.vy = config.wick.maxFallSpeedFhPerS;

  body.x += body.vx * dtS;
  body.y += body.vy * dtS;

  const landing = findLanding(body, index, nowMs);
  if (landing !== null) attach(body, landing.seg, landing.t, dtS);
  return landing;
}

/**
 * Keeps an attached body on its segment as that segment moves, and reports the
 * surface velocity so the body inherits the face's motion (SPEC section 8.1 -
 * "they ride your face").
 */
export function stepAttached(body: Body, seg: Segment, dtS: number): { x: number; y: number } {
  body.px = body.x;
  body.py = body.y;
  placeOnSegment(body, seg);
  const surf = segmentVelocityAt(seg, body.groundT, dtS);
  body.vx = surf.x;
  body.vy = surf.y;
  return surf;
}

/**
 * Advances an attached body along its surface. `signedSpeed` is positive toward
 * the segment's b end. Returns how the move ended, so the caller can decide
 * whether to continue onto a neighbour, step down, or turn around - which is
 * where the Wicks get their timidity (decision D5).
 */
export type AdvanceResult = { kind: 'ok' } | { kind: 'ranOff'; pastEnd: 'a' | 'b'; overshootFh: number };

export function advanceAlong(body: Body, seg: Segment, signedSpeed: number, dtS: number): AdvanceResult {
  if (seg.len <= 1e-9) return { kind: 'ok' };
  const dt = (signedSpeed * dtS) / seg.len;
  const next = body.groundT + dt;

  if (next > 1) {
    body.groundT = 1;
    placeOnSegment(body, seg);
    return { kind: 'ranOff', pastEnd: 'b', overshootFh: (next - 1) * seg.len };
  }
  if (next < 0) {
    body.groundT = 0;
    placeOnSegment(body, seg);
    return { kind: 'ranOff', pastEnd: 'a', overshootFh: -next * seg.len };
  }

  body.groundT = next;
  placeOnSegment(body, seg);
  return { kind: 'ok' };
}

/** Sliding speed along a segment: the component of gravity down its tangent. */
export function slideAccel(seg: Segment): number {
  const tan = downhillTangent(seg);
  return config.physics.gravityFhPerS2 * tan.y;
}

/** True if a body on this segment should slide rather than walk. */
export function mustSlide(seg: Segment): boolean {
  return !canWalkOn(seg);
}

export interface Continuation {
  seg: Segment;
  t: number;
  /** Height the body had to drop to reach it, positive = downward. */
  dropFh: number;
}

/**
 * Finds the segment a body can continue onto when it runs off an edge.
 *
 * Accepts a neighbour whose nearest endpoint is within `maxGapFh` and whose
 * height difference is within the step limits. If nothing qualifies, the Wick
 * turns around - the single most important feel decision in the game, because
 * it means a death is something the *player's face* did (decision D5).
 *
 * "Ahead" is the *horizontal* direction of travel, with only an epsilon of
 * slack. Two earlier versions were both wrong in instructive ways:
 *
 *   - a slack of half the gap limit was wider than a single jaw segment, so a
 *     Wick crossing the chin could latch back onto the segment it had just left
 *     and oscillate there for the whole level;
 *   - testing against the full tangent instead rejected legitimate steps *up*,
 *     because the tangent at a mouth corner points down while the ledge the
 *     Wick needs to reach is up and to the side.
 *
 * Horizontal is the right axis: gravity already governs the vertical, and the
 * only thing this test has to prevent is walking backwards. A walkable segment
 * is at most 80 degrees, so its horizontal tangent is never degenerate.
 */
export function findContinuation(
  index: SegmentIndex,
  from: Segment,
  pastEnd: 'a' | 'b',
  maxGapFh: number,
  maxStepUpFh: number,
  maxStepDownFh: number,
): Continuation | null {
  const ex = pastEnd === 'b' ? from.bx : from.ax;
  const ey = pastEnd === 'b' ? from.by : from.ay;

  // Horizontal direction of travel as we leave the edge.
  const sign = pastEnd === 'b' ? 1 : -1;
  const dirX = (from.bx - from.ax) * sign >= 0 ? 1 : -1;

  let best: Continuation | null = null;
  let bestGap = Infinity;

  for (const seg of index.segments) {
    if (seg === from || seg.id === from.id) continue;
    if (seg.kind === 'rail' || !seg.walkable) continue;

    for (const end of [0, 1] as const) {
      const sx = end === 0 ? seg.ax : seg.bx;
      const sy = end === 0 ? seg.ay : seg.by;

      const gap = Math.hypot(sx - ex, sy - ey);
      if (gap > maxGapFh) continue;

      // Strictly in the direction of travel. The epsilon admits the shared
      // endpoint of an adjacent segment, which sits exactly on the edge.
      if ((sx - ex) * dirX < -1e-4) continue;

      // The segment must also *lead somewhere*: it has to extend forward from
      // the endpoint we would land on. Without this, the upper and lower lip -
      // which share their corner landmarks, so the gap between them is zero -
      // hand a Wick back and forth across the same point forever.
      const otherX = end === 0 ? seg.bx : seg.ax;
      if ((otherX - sx) * dirX <= 0) continue;

      const drop = sy - ey;
      if (drop < -maxStepUpFh || drop > maxStepDownFh) continue;

      // Nearest wins, with the flattest step as the tie-break, so a Wick takes
      // the obvious next stone rather than a distant flat one.
      const better = gap < bestGap - 1e-4 || (Math.abs(gap - bestGap) <= 1e-4 && Math.abs(drop) < Math.abs(best?.dropFh ?? Infinity));
      if (better) {
        best = { seg, t: end, dropFh: drop };
        bestGap = gap;
      }
    }
  }

  return best;
}

/**
 * Looks straight down from a point for the nearest surface within `maxDropFh`.
 * Used to decide whether an edge is a step or a cliff.
 */
export function surfaceBelow(index: SegmentIndex, x: number, y: number, maxDropFh: number): { seg: Segment; t: number; dropFh: number } | null {
  let best: { seg: Segment; t: number; dropFh: number } | null = null;

  for (const seg of index.segments) {
    if (seg.kind === 'rail' || !seg.walkable) continue;
    const minX = Math.min(seg.ax, seg.bx);
    const maxX = Math.max(seg.ax, seg.bx);
    if (x < minX || x > maxX) continue;

    const dx = seg.bx - seg.ax;
    if (Math.abs(dx) <= 1e-9) continue;
    const t = (x - seg.ax) / dx;
    if (t < 0 || t > 1) continue;
    const sy = seg.ay + (seg.by - seg.ay) * t;

    const drop = sy - y;
    if (drop <= 0 || drop > maxDropFh) continue;
    if (best === null || drop < best.dropFh) best = { seg, t, dropFh: drop };
  }

  return best;
}

/**
 * Rails (the nose). Face-on, the nose bridge is nearly vertical, so nothing can
 * stand on it - but the fiction says it is a slide, and the fiction is right.
 * A rail captures a body that touches it and carries it to the bottom end,
 * releasing it there. That makes the nose a one-way delivery chute aimed at the
 * mouth, which is exactly the joke.
 */
export function findRail(body: Body, index: SegmentIndex): { seg: Segment; t: number } | null {
  for (const seg of index.segments) {
    if (seg.kind !== 'rail') continue;
    const t = clamp(rawParam(body.x, body.y, seg.ax, seg.ay, seg.bx, seg.by), 0, 1);
    const cx = seg.ax + (seg.bx - seg.ax) * t;
    const cy = seg.ay + (seg.by - seg.ay) * t;
    if (Math.hypot(body.x - cx, body.y - cy) <= body.r * 1.6) return { seg, t };
  }
  return null;
}
