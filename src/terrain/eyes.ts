/**
 * U5 - BLINK IS TERRAIN.
 *
 * SPEC v1.0 said "eyes are holes (no terrain)", which threw away the second
 * most involuntary thing a face does. Here each eye is a pit while it is open
 * and a one-way bridge while it is shut, so a level can ask a player to hold
 * their eyes open - or to blink on cue - and neither is fully under their
 * control. That is the whole game applied to a different muscle.
 *
 * Same hysteresis discipline as the Maw: a lid that flickered would drop
 * whoever was crossing it.
 */

import { config } from '../config.ts';
import type { ContourMap, Vec2 } from '../face/types.ts';

export interface LidState {
  shut: boolean;
  /** How shut the lid is, 0..1 in the player's own calibrated blink range. */
  closedness: number;
  justShut: boolean;
  justOpened: boolean;
}

class LidDetector {
  private shut = false;
  private candidate: boolean | null = null;
  private candidateMs = 0;

  update(normalisedBlink: number, dtMs: number): LidState {
    const wasShut = this.shut;
    const wantShut = this.shut
      ? normalisedBlink >= config.eyes.openFraction
      : normalisedBlink > config.eyes.closeFraction;

    if (wantShut === this.shut) {
      this.candidate = null;
      this.candidateMs = 0;
    } else if (this.candidate === wantShut) {
      this.candidateMs += dtMs;
      if (this.candidateMs >= config.eyes.minStateMs) {
        this.shut = wantShut;
        this.candidate = null;
        this.candidateMs = 0;
      }
    } else {
      this.candidate = wantShut;
      this.candidateMs = dtMs;
    }

    return {
      shut: this.shut,
      closedness: normalisedBlink,
      justShut: this.shut && !wasShut,
      justOpened: !this.shut && wasShut,
    };
  }

  reset(): void {
    this.shut = false;
    this.candidate = null;
    this.candidateMs = 0;
  }
}

export class EyeDetector {
  private readonly left = new LidDetector();
  private readonly right = new LidDetector();

  update(blinkL: number, blinkR: number, dtMs: number): { left: LidState; right: LidState } {
    return { left: this.left.update(blinkL, dtMs), right: this.right.update(blinkR, dtMs) };
  }

  reset(): void {
    this.left.reset();
    this.right.reset();
  }
}

/**
 * The pit polygon for an open eye: upper lid over lower lid. A Wick inside it
 * is in the socket and will fall through, because neither chain is terrain
 * while the eye is open.
 */
export function eyePolygon(points: ContourMap, side: 'L' | 'R'): Vec2[] {
  const upper = side === 'L' ? points.eyeLidL : points.eyeLidR;
  const lower = side === 'L' ? points.eyeRingL : points.eyeRingR;
  if (upper.length < 2 || lower.length < 2) return [];
  return [...upper.map((p) => ({ x: p.x, y: p.y })), ...[...lower].reverse().map((p) => ({ x: p.x, y: p.y }))];
}
