/** Small 2D helpers. All lengths are in FH, all speeds in FH per second. */

export interface V2 {
  x: number;
  y: number;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function degToRad(d: number): number {
  return (d * Math.PI) / 180;
}

/**
 * Closest point on segment ab to p, as a parameter in [0,1]. Returns 0 for a
 * degenerate segment so callers never divide by zero.
 */
export function closestParam(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
}

/** Same, but unclamped - the swept test needs to know it fell off the end. */
export function rawParam(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return 0;
  return ((px - ax) * dx + (py - ay) * dy) / lenSq;
}

export function pointAt(ax: number, ay: number, bx: number, by: number, t: number): V2 {
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

/** A deterministic pseudo-random source, so simulations replay identically. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** mulberry32. */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(lo: number, hi: number): number {
    return lo + this.next() * (hi - lo);
  }

  int(loInclusive: number, hiExclusive: number): number {
    return loInclusive + Math.floor(this.next() * (hiExclusive - loInclusive));
  }

  pick<T>(items: readonly T[]): T {
    const i = this.int(0, items.length);
    const v = items[i] ?? items[0];
    if (v === undefined) throw new Error('Rng.pick on an empty array');
    return v;
  }
}
