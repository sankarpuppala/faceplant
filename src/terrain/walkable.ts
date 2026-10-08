/**
 * Walkability and slope classification (SPEC sections 6.3, 8.1).
 *
 * Two thresholds, deliberately different:
 *   - `maxWalkableAngleDeg` (80 deg) decides whether the solver treats a segment
 *     as ground at all. Steeper than that and it is scenery.
 *   - `maxWalkSlopeDeg` (50 deg) decides whether a Wick standing on ground can
 *     *walk* or only slide.
 *
 * The band between the two is what makes a face feel like terrain: the brow
 * ridge and the sides of the forehead are standable but not climbable, so Wicks
 * accumulate in the hollows exactly where a player expects them to.
 */

import { config } from '../config.ts';
import type { Segment } from './build.ts';

const MAX_WALK_SLOPE_COS = Math.cos((config.wick.maxWalkSlopeDeg * Math.PI) / 180);

/** Slope of a segment in degrees from horizontal, 0..90. */
export function slopeDeg(seg: Segment): number {
  return (Math.acos(Math.min(1, Math.abs(seg.ny))) * 180) / Math.PI;
}

/** True if a body standing on this segment can walk rather than slide. */
export function canWalkOn(seg: Segment): boolean {
  return seg.walkable && -seg.ny >= MAX_WALK_SLOPE_COS;
}

/** Downhill unit tangent: which way gravity drags a sliding body. */
export function downhillTangent(seg: Segment): { x: number; y: number } {
  const dx = (seg.bx - seg.ax) / seg.len;
  const dy = (seg.by - seg.ay) / seg.len;
  // Of the two tangents, the downhill one is the one with positive y.
  return dy >= 0 ? { x: dx, y: dy } : { x: -dx, y: -dy };
}

/** Velocity of a point on a moving segment, in FH per second. */
export function segmentVelocityAt(seg: Segment, t: number, dtS: number): { x: number; y: number } {
  if (dtS <= 0) return { x: 0, y: 0 };
  const curX = seg.ax + (seg.bx - seg.ax) * t;
  const curY = seg.ay + (seg.by - seg.ay) * t;
  const prevX = seg.pax + (seg.pbx - seg.pax) * t;
  const prevY = seg.pay + (seg.pby - seg.pay) * t;
  return { x: (curX - prevX) / dtS, y: (curY - prevY) / dtS };
}

/** Upward speed of a segment, used by the eyebrow flick (SPEC section 6.5). */
export function segmentUpwardSpeed(seg: Segment, t: number, dtS: number): number {
  const v = segmentVelocityAt(seg, t, dtS);
  return -v.y;
}

export interface WalkabilityStats {
  total: number;
  walkable: number;
  standable: number;
  rails: number;
  nan: number;
}

/** Used by the debug page and by the fixture tests to assert no NaN ever appears. */
export function classify(segments: readonly Segment[]): WalkabilityStats {
  const stats: WalkabilityStats = { total: segments.length, walkable: 0, standable: 0, rails: 0, nan: 0 };
  for (const s of segments) {
    if (
      !Number.isFinite(s.ax) ||
      !Number.isFinite(s.ay) ||
      !Number.isFinite(s.bx) ||
      !Number.isFinite(s.by) ||
      !Number.isFinite(s.nx) ||
      !Number.isFinite(s.ny) ||
      !Number.isFinite(s.len)
    ) {
      stats.nan++;
      continue;
    }
    if (s.kind === 'rail') stats.rails++;
    if (s.walkable) stats.walkable++;
    if (canWalkOn(s)) stats.standable++;
  }
  return stats;
}
