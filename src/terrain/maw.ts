/**
 * The Maw (SPEC section 6.4) and its hysteresis.
 *
 * Three mechanisms keep it from flickering, and all three matter:
 *   1. thresholds come from the player's own calibrated jaw range (decision D6);
 *   2. open and close use *different* thresholds, so a jaw hovering at the
 *      boundary cannot oscillate;
 *   3. a candidate state must hold for `minStateMs` before it is adopted.
 *
 * Flicker here is not cosmetic: one spurious frame of "open" deletes the upper
 * lip bridge and drops whoever was standing on it into the mouth.
 */

import { config } from '../config.ts';
import type { ContourMap, Vec2 } from '../face/types.ts';

export interface MawState {
  open: boolean;
  /** How far through the personal jaw range the jaw currently is, 0..1. */
  openness: number;
  /** ms the current state has been held. */
  heldMs: number;
  /** True on the step the Maw became open. */
  justOpened: boolean;
  justClosed: boolean;
}

export class MawDetector {
  private open = false;
  private candidate: boolean | null = null;
  private candidateMs = 0;
  private heldMs = 0;

  /**
   * @param normalisedJawOpen jawOpen already mapped into the personal 0..1
   *   range by `normaliseBlend` - never the raw blendshape.
   * @param forcedOpen U1 - THE YAWN opens the Maw regardless of the real jaw.
   */
  update(normalisedJawOpen: number, dtMs: number, forcedOpen = false): MawState {
    const wasOpen = this.open;

    if (forcedOpen) {
      this.open = true;
      this.candidate = null;
      this.candidateMs = 0;
      this.heldMs = wasOpen ? this.heldMs + dtMs : 0;
      return {
        open: true,
        openness: Math.max(normalisedJawOpen, config.maw.openFraction),
        heldMs: this.heldMs,
        justOpened: !wasOpen,
        justClosed: false,
      };
    }

    const wantOpen = this.open
      ? normalisedJawOpen >= config.maw.closeFraction
      : normalisedJawOpen > config.maw.openFraction;

    if (wantOpen === this.open) {
      this.candidate = null;
      this.candidateMs = 0;
      this.heldMs += dtMs;
    } else if (this.candidate === wantOpen) {
      this.candidateMs += dtMs;
      if (this.candidateMs >= config.maw.minStateMs) {
        this.open = wantOpen;
        this.candidate = null;
        this.candidateMs = 0;
        this.heldMs = 0;
      } else {
        this.heldMs += dtMs;
      }
    } else {
      this.candidate = wantOpen;
      this.candidateMs = dtMs;
      this.heldMs += dtMs;
    }

    return {
      open: this.open,
      openness: normalisedJawOpen,
      heldMs: this.heldMs,
      justOpened: this.open && !wasOpen,
      justClosed: !this.open && wasOpen,
    };
  }

  get isOpen(): boolean {
    return this.open;
  }

  reset(): void {
    this.open = false;
    this.candidate = null;
    this.candidateMs = 0;
    this.heldMs = 0;
  }
}

/**
 * The swallow sensor: the polygon between the inner lips. A Wick whose centre
 * enters it is swallowed. Built from the inner-lip contours so it tracks the
 * real mouth opening rather than a circle around the mouth centre.
 */
export function swallowPolygon(points: ContourMap): Vec2[] {
  const upper = points.lipInnerUpper;
  const lower = points.lipInnerLower;
  if (upper.length < 2 || lower.length < 2) return [];
  // Upper left-to-right, then lower right-to-left, closing the ring.
  return [...upper.map((p) => ({ x: p.x, y: p.y })), ...[...lower].reverse().map((p) => ({ x: p.x, y: p.y }))];
}

/** Standard even-odd crossing test. */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a === undefined || b === undefined) continue;
    const straddles = a.y > p.y !== b.y > p.y;
    if (!straddles) continue;
    const xAtP = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (p.x < xAtP) inside = !inside;
  }
  return inside;
}

/** Centroid of the swallow polygon; the anchor for Maw fear and the moth draft. */
export function polygonCentre(poly: readonly Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

/** Rough area of the Maw opening, in FH squared. Drives the moth draft strength. */
export function polygonArea(poly: readonly Vec2[]): number {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const p = poly[i];
    const q = poly[j];
    if (p === undefined || q === undefined) continue;
    a += q.x * p.y - p.x * q.y;
  }
  return Math.abs(a) / 2;
}
