/**
 * Reaction detection (SPEC section 6.8).
 *
 * In SPEC v1.0 these only picked Wick lines. Since U1 they also drive the
 * COMPOSURE bar, so they are now load-bearing: a false positive costs the
 * player the run. Each detector therefore needs real evidence over time rather
 * than a single-frame threshold.
 */

import type { Blendshapes } from './types.ts';

export interface Reactions {
  /** Smiling broadly and the jaw bouncing - the real tell for a laugh. */
  laughing: boolean;
  /** The jaw snapping open fast, as at a scare. */
  gasp: boolean;
  smiling: boolean;
  browsUp: boolean;
  leaningIn: boolean;
  /** Head moving fast enough to shake the terrain (SPEC 6.6). */
  flinching: boolean;
  /** Measured jaw oscillation rate, Hz. Exposed for the debug page. */
  jawWobbleHz: number;
}

export function noReactions(): Reactions {
  return {
    laughing: false,
    gasp: false,
    smiling: false,
    browsUp: false,
    leaningIn: false,
    flinching: false,
    jawWobbleHz: 0,
  };
}

interface Sample {
  t: number;
  jaw: number;
}

const WINDOW_MS = 1200;
const LAUGH_SUSTAIN_MS = 600;
const LAUGH_SMILE_MIN = 0.5;
const LAUGH_MIN_HZ = 2;
const LAUGH_MAX_HZ = 8;
/** Jaw must swing at least this much for a crossing to count as a real bounce. */
const LAUGH_MIN_SWING = 0.12;
const GASP_WINDOW_MS = 150;
const GASP_RISE = 0.35;
const LEAN_SCALE = 1.15;

export class ReactionDetector {
  private readonly samples: Sample[] = [];
  private laughingSinceMs = -1;
  private out = noReactions();

  /**
   * @param blend normalised blendshapes (personal 0..1 range), not raw ones.
   * @param scale face scale from `FaceData`, for lean detection.
   * @param faceSpeedFhPerS face-centre speed, for the flinch flag.
   */
  update(blend: Blendshapes, scale: number, faceSpeedFhPerS: number, tMs: number, quakeSpeedFhPerS: number): Reactions {
    this.samples.push({ t: tMs, jaw: blend.jawOpen });
    while (this.samples.length > 0) {
      const first = this.samples[0];
      if (first === undefined || tMs - first.t <= WINDOW_MS) break;
      this.samples.shift();
    }

    const wobbleHz = this.jawWobbleHz(tMs);
    const smiling = blend.smile > 0.35;
    const laughNow = blend.smile > LAUGH_SMILE_MIN && wobbleHz >= LAUGH_MIN_HZ && wobbleHz <= LAUGH_MAX_HZ;

    if (laughNow) {
      if (this.laughingSinceMs < 0) this.laughingSinceMs = tMs;
    } else {
      this.laughingSinceMs = -1;
    }

    this.out = {
      laughing: this.laughingSinceMs >= 0 && tMs - this.laughingSinceMs >= LAUGH_SUSTAIN_MS,
      gasp: this.detectGasp(tMs),
      smiling,
      browsUp: blend.browUp > 0.45,
      leaningIn: scale > LEAN_SCALE,
      flinching: faceSpeedFhPerS > quakeSpeedFhPerS,
      jawWobbleHz: wobbleHz,
    };
    return this.out;
  }

  get current(): Reactions {
    return this.out;
  }

  reset(): void {
    this.samples.length = 0;
    this.laughingSinceMs = -1;
    this.out = noReactions();
  }

  /**
   * Oscillation rate from mean crossings. Counting crossings of the window mean
   * (rather than of a fixed level) means it works whether the player laughs
   * with their mouth mostly open or mostly shut.
   */
  private jawWobbleHz(tMs: number): number {
    if (this.samples.length < 4) return 0;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (const s of this.samples) {
      sum += s.jaw;
      if (s.jaw < min) min = s.jaw;
      if (s.jaw > max) max = s.jaw;
    }
    if (max - min < LAUGH_MIN_SWING) return 0;

    const mean = sum / this.samples.length;
    let crossings = 0;
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      if (a === undefined || b === undefined) continue;
      if (a.jaw < mean !== b.jaw < mean) crossings++;
    }

    const first = this.samples[0];
    if (first === undefined) return 0;
    const spanS = (tMs - first.t) / 1000;
    if (spanS <= 0.05) return 0;
    // Two crossings make one full cycle.
    return crossings / 2 / spanS;
  }

  private detectGasp(tMs: number): boolean {
    const latest = this.samples[this.samples.length - 1];
    if (latest === undefined) return false;
    for (let i = this.samples.length - 2; i >= 0; i--) {
      const s = this.samples[i];
      if (s === undefined) continue;
      if (tMs - s.t > GASP_WINDOW_MS) break;
      if (latest.jaw - s.jaw >= GASP_RISE) return true;
    }
    return false;
  }
}
