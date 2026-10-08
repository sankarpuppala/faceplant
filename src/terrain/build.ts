/**
 * Terrain assembly: contours and static geometry into the segment list the
 * solver consumes (SPEC sections 6.3, 8.3, 8.4).
 *
 * A segment carries both its current and its previous endpoints. That pair is
 * the whole trick behind the swept test: the solver can evaluate a Wick's
 * position in the segment's own moving frame and so catch a brow that travelled
 * half a face height in one step (SPEC AC-3).
 */

import { config } from '../config.ts';
import type { ContourMap, ContourName, Vec2 } from '../face/types.ts';

export type SegmentKind = 'face' | 'ruin' | 'wall' | 'rail';

export interface Segment {
  /**
   * Stable identity across rebuilds. Terrain is rebuilt from scratch every
   * step, so a grounded body cannot hold a pointer; it holds this id and the
   * solver looks the segment up again (see `SegmentIndex`).
   */
  id: string;
  /** Current endpoints, world FH. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Endpoints one physics step ago. Equal to the current ones for static geometry. */
  pax: number;
  pay: number;
  pbx: number;
  pby: number;
  /** Unit up-normal of the current segment: (dy, -dx) normalised. */
  nx: number;
  ny: number;
  /** Length, world FH. */
  len: number;
  /** Shallow enough to stand on (SPEC section 6.3). */
  walkable: boolean;
  /** True for one-way surfaces: landed on from above, passed through from below. */
  oneWay: boolean;
  kind: SegmentKind;
  /** Which face contour this came from, for Wick lines and lighting. */
  contour: ContourName | null;
}

const MAX_WALKABLE_COS = Math.cos((config.terrain.maxWalkableAngleDeg * Math.PI) / 180);

function makeSegment(
  id: string,
  a: Vec2,
  b: Vec2,
  pa: Vec2,
  pb: Vec2,
  kind: SegmentKind,
  contour: ContourName | null,
  oneWay: boolean,
): Segment | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len < config.terrain.minSegmentLengthFh) return null;

  // y points down, so the "up" normal of a left-to-right segment is (dy, -dx).
  const nx = dy / len;
  const ny = -dx / len;

  return {
    id,
    ax: a.x,
    ay: a.y,
    bx: b.x,
    by: b.y,
    pax: pa.x,
    pay: pa.y,
    pbx: pb.x,
    pby: pb.y,
    nx,
    ny,
    len,
    // -ny is how much of the normal points up. 1 = flat ground, 0 = a cliff.
    // A rail is never a floor, whatever its geometry says: it captures bodies
    // and carries them, and nothing may try to stand on it.
    walkable: kind === 'rail' ? false : -ny >= MAX_WALKABLE_COS,
    oneWay,
    kind,
    contour,
  };
}

/** Which contours are terrain, and which are rails rather than floors. */
const FLOOR_CONTOURS: readonly ContourName[] = ['forehead', 'browL', 'browR', 'jaw', 'lipLower'];

/**
 * The upper lip is a bridge across the mouth - but only while the Maw is shut
 * (SPEC section 6.4). It is added separately so opening the mouth can remove it.
 */
export const BRIDGE_CONTOUR: ContourName = 'lipUpper';

/** U5 - the eyelids, terrain only while the eye is shut. */
export const LID_CONTOURS: readonly ContourName[] = ['eyeLidL', 'eyeLidR'];

/**
 * Rails are the parts of a face that are too steep to stand on face-on, but
 * that the fiction says carry you: the nose is a slide, and so are the sides of
 * the head. A rail captures whatever touches it and delivers it to the bottom
 * end (see `solver.findRail`), which is what makes "tilt your head to steer
 * them" the core verb: tilt until they slide off the forehead, and the cheek
 * takes them down to the jaw.
 */
export const RAIL_CONTOURS: readonly ContourName[] = ['nose', 'cheekL', 'cheekR'];

export interface TerrainInput {
  current: ContourMap;
  /** The contours one step ago; the swept test needs them. */
  previous: ContourMap;
  /** False while the Maw is open, which removes the upper-lip bridge. */
  bridgeIntact: boolean;
  /** U5 - per-eye: true while the lid is shut and therefore walkable. */
  lidLShut: boolean;
  lidRShut: boolean;
}

function pushContour(out: Segment[], name: ContourName, input: TerrainInput, kind: SegmentKind): void {
  const cur = input.current[name];
  const prev = input.previous[name];
  for (let i = 0; i + 1 < cur.length; i++) {
    const a = cur[i];
    const b = cur[i + 1];
    if (a === undefined || b === undefined) continue;
    // If the previous frame has a different point count (tracking blipped),
    // treat the segment as static for this step rather than inventing motion.
    const pa = prev.length === cur.length ? (prev[i] ?? a) : a;
    const pb = prev.length === cur.length ? (prev[i + 1] ?? b) : b;
    const seg = makeSegment(`${name}:${i}`, a, b, pa, pb, kind, name, true);
    if (seg !== null) out.push(seg);
  }
}

/** Builds every face segment for one step. */
export function buildFaceTerrain(input: TerrainInput): Segment[] {
  const out: Segment[] = [];
  for (const name of FLOOR_CONTOURS) pushContour(out, name, input, 'face');
  if (input.bridgeIntact) pushContour(out, BRIDGE_CONTOUR, input, 'face');
  if (input.lidLShut) pushContour(out, 'eyeLidL', input, 'face');
  if (input.lidRShut) pushContour(out, 'eyeLidR', input, 'face');
  for (const name of RAIL_CONTOURS) pushContour(out, name, input, 'rail');
  return out;
}

/** Static level geometry: ruins are one-way ledges, walls are solid both ways. */
export function buildStaticTerrain(
  ruins: readonly { points: readonly (readonly [number, number])[] }[],
  walls: readonly { points: readonly (readonly [number, number])[] }[],
): Segment[] {
  const out: Segment[] = [];
  const add = (
    shapes: readonly { points: readonly (readonly [number, number])[] }[],
    kind: SegmentKind,
    oneWay: boolean,
  ): void => {
    for (let s = 0; s < shapes.length; s++) {
      const shape = shapes[s];
      if (shape === undefined) continue;
      for (let i = 0; i + 1 < shape.points.length; i++) {
        const pa = shape.points[i];
        const pb = shape.points[i + 1];
        if (pa === undefined || pb === undefined) continue;
        const a = { x: pa[0], y: pa[1] };
        const b = { x: pb[0], y: pb[1] };
        const seg = makeSegment(`${kind}:${s}:${i}`, a, b, a, b, kind, null, oneWay);
        if (seg !== null) out.push(seg);
      }
    }
  };
  add(ruins, 'ruin', true);
  add(walls, 'wall', false);
  return out;
}

/** Deep-copies a contour map, for keeping the previous frame. */
export function cloneContours(src: ContourMap): ContourMap {
  const out = {} as ContourMap;
  for (const key of Object.keys(src) as ContourName[]) {
    out[key] = src[key].map((p) => ({ x: p.x, y: p.y }));
  }
  return out;
}

/**
 * Linear interpolation between two contour maps. Tracking runs at 20-30 Hz and
 * physics at 120 Hz, so without this the terrain would jump once per tracker
 * frame and the Wicks would read it as the ground stuttering (SPEC section 6.2).
 */
export function lerpContours(a: ContourMap, b: ContourMap, t: number, out: ContourMap): ContourMap {
  for (const key of Object.keys(a) as ContourName[]) {
    const pa = a[key];
    const pb = b[key];
    const dst = out[key];
    if (pa.length !== pb.length) {
      // Point counts differ: snap to the newer frame instead of mixing shapes.
      dst.length = 0;
      for (const p of pb) dst.push({ x: p.x, y: p.y });
      continue;
    }
    dst.length = pa.length;
    for (let i = 0; i < pa.length; i++) {
      const u = pa[i];
      const v = pb[i];
      if (u === undefined || v === undefined) continue;
      const slot = dst[i];
      const x = u.x + (v.x - u.x) * t;
      const y = u.y + (v.y - u.y) * t;
      if (slot === undefined) dst[i] = { x, y };
      else {
        slot.x = x;
        slot.y = y;
      }
    }
  }
  return out;
}
