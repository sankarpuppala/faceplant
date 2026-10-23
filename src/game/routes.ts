/**
 * Route geometry, shared by the story levels, the Daily Tape and the Long Tape.
 *
 * SPEC section 8.3: **"Your face bridges the ruins."** A route is a pair of ruin
 * ledges either side of the face at a height where some part of the face
 * reaches across. The hole between their inner ends is the level.
 *
 * Measured from the live terrain (neutral pose, default calibration) by
 * `src/debug.ts`:
 *
 *   forehead   x -0.34 .. 0.34   y -0.44 apex, -0.30 ends   walkable, 0-32 deg
 *   brows      x +-0.08 .. 0.30  y -0.19 .. -0.15           walkable ledges
 *   lipUpper   x -0.16 .. 0.16   y  0.20 .. 0.26            the bridge; GONE when the Maw opens
 *   jaw        x -0.16 .. 0.16   y  0.40 .. 0.50 chin       walkable shelf under the Maw
 *   nose       x  0.00           y -0.13 .. 0.14            a rail aimed at the mouth
 *   cheeks     x +-0.16 .. 0.33  y -0.22 .. 0.40            rails down the sides
 *
 * Keeping these numbers in one module is what stops the generated levels
 * drifting away from the hand-authored ones - the bug that made every Daily
 * Tape unplayable while the story levels were fine.
 */

import type { GateSpec, Polyline, SpawnSpec } from './levelSchema.ts';

export type RouteName = 'forehead' | 'mouth' | 'chin';

export interface Route {
  /** Height of both ruin ledges, world FH. */
  y: number;
  /** How close to the face centre each ledge reaches. */
  inner: number;
  /** One line for the level hint, in the Wicks' voice. */
  blurb: string;
}

export const ROUTES: Record<RouteName, Route> = {
  forehead: {
    y: -0.36,
    inner: 0.42,
    blurb: 'your forehead is the bridge. hold still.',
  },
  mouth: {
    y: 0.24,
    inner: 0.22,
    blurb: 'your closed mouth is the bridge. do not open it.',
  },
  chin: {
    y: 0.46,
    inner: 0.24,
    blurb: 'across the chin, under the mouth.',
  },
};

export const ROUTE_NAMES: readonly RouteName[] = ['forehead', 'mouth', 'chin'];

/** Outer edge of the ledges. Inside the visible region for a 16:9 screen. */
export const OUTER = 1.72;
export const GATE_W = 0.22;
export const GATE_H = 0.3;

export function ledges(route: Route): [Polyline, Polyline] {
  return [
    { points: [[-OUTER, route.y], [-route.inner, route.y]] },
    { points: [[route.inner, route.y], [OUTER, route.y]] },
  ];
}

/** Wicks drop out of the lantern onto the start ledge (SPEC section 2). */
export function spawnFor(route: Route, fromLeft: boolean, count: number, intervalMs: number): SpawnSpec {
  return {
    x: fromLeft ? -OUTER + 0.3 : OUTER - 0.3,
    y: route.y - 0.26,
    count,
    intervalMs,
    dir: fromLeft ? 1 : -1,
  };
}

/** The Gate stands at the outer end of the far ledge. */
export function gateFor(route: Route, fromLeft: boolean): GateSpec {
  return {
    x: fromLeft ? OUTER - GATE_W - 0.08 : -OUTER + 0.08,
    y: route.y - GATE_H,
    w: GATE_W,
    h: GATE_H,
  };
}

/** A straight ruin, the only shape any level needs. */
export function ruin(x1: number, y1: number, x2: number, y2: number): Polyline {
  return { points: [[x1, y1], [x2, y2]] };
}

/** The highest an overhead drip emitter can sit and still be on screen. */
export const CEILING_Y = -1.14;
