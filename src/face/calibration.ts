/**
 * Calibration and the FH world unit (SPEC section 7).
 *
 * Landmarks arrive in normalised image coordinates, which are *not* isotropic:
 * one unit of x spans the frame width and one unit of y spans its height, so a
 * circle is an ellipse there. Everything upstream of this file therefore works
 * in "UV" space, where u = x * aspect and v = y. In UV a distance means the
 * same thing in both directions, which is what the physics needs.
 *
 * FH is then one scalar: the neutral forehead-to-chin distance in UV. Dividing
 * by it makes the world independent of resolution, of how far back the player
 * sits, and of the size of their head. That is decision D4.
 */

import { config } from '../config.ts';
import type { Blendshapes, RawFace, Vec2 } from './types.ts';
import { CHIN, TOP_OF_FOREHEAD } from './landmarks.ts';

export interface Calibration {
  /** Neutral face centre in UV space. */
  centerUV: Vec2;
  /** Neutral forehead-to-chin distance in UV space. One FH. */
  fhUV: number;
  /** Frame aspect (width / height) the calibration was taken at. */
  aspect: number;
  /** Personal blendshape baselines and ranges (decision D6). */
  jaw: { base: number; wide: number };
  brow: { base: number; high: number };
  blink: { base: number; shut: number };
  smileBase: number;
}

export function defaultCalibration(aspect = config.render.aspect): Calibration {
  return {
    centerUV: { x: 0.5 * aspect, y: 0.5 },
    fhUV: 0.42,
    aspect,
    jaw: { base: 0.02, wide: 0.02 + config.calibration.minJawRange },
    brow: { base: 0.05, high: 0.05 + config.calibration.minBrowRange },
    blink: { base: 0.05, shut: 0.05 + config.calibration.minBlinkRange },
    smileBase: 0.05,
  };
}

/** Normalised image point to isotropic UV. Not mirrored - `mapping.ts` does that. */
export function toUV(p: Vec2, aspect: number): Vec2 {
  return { x: p.x * aspect, y: p.y };
}

/** Forehead-to-chin distance of a raw face, in UV. Returns 0 if landmarks are missing. */
export function measureFaceHeightUV(face: RawFace, aspect: number): number {
  const top = face.landmarks[TOP_OF_FOREHEAD];
  const chin = face.landmarks[CHIN];
  if (top === undefined || chin === undefined) return 0;
  const a = toUV(top, aspect);
  const b = toUV(chin, aspect);
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Midpoint of forehead and chin, in UV. The face centre. */
export function measureFaceCentreUV(face: RawFace, aspect: number): Vec2 {
  const top = face.landmarks[TOP_OF_FOREHEAD];
  const chin = face.landmarks[CHIN];
  if (top === undefined || chin === undefined) return { x: 0.5 * aspect, y: 0.5 };
  const a = toUV(top, aspect);
  const b = toUV(chin, aspect);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export type CalibrationStepName = 'neutral' | 'wide' | 'brows' | 'blink';

export interface NeutralResult {
  ok: boolean;
  /** Peak face-centre excursion during the hold, in FH. */
  jitterFh: number;
  centerUV: Vec2;
  fhUV: number;
  blend: Blendshapes;
}

/**
 * Collects samples during one calibration step. Separated from the UI so the
 * maths is unit-testable without a camera (SPEC AC-2).
 */
export class CalibrationCollector {
  private readonly centres: Vec2[] = [];
  private readonly heights: number[] = [];
  private readonly blends: Blendshapes[] = [];

  add(face: RawFace, aspect: number): void {
    this.centres.push(measureFaceCentreUV(face, aspect));
    this.heights.push(measureFaceHeightUV(face, aspect));
    this.blends.push({ ...face.blend });
  }

  get sampleCount(): number {
    return this.centres.length;
  }

  clear(): void {
    this.centres.length = 0;
    this.heights.length = 0;
    this.blends.length = 0;
  }

  /** Mean of each blendshape over the collected samples. */
  meanBlend(): Blendshapes {
    const n = this.blends.length;
    const sum: Blendshapes = { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
    if (n === 0) return sum;
    for (const b of this.blends) {
      sum.jawOpen += b.jawOpen;
      sum.smile += b.smile;
      sum.browUp += b.browUp;
      sum.blinkL += b.blinkL;
      sum.blinkR += b.blinkR;
    }
    return {
      jawOpen: sum.jawOpen / n,
      smile: sum.smile / n,
      browUp: sum.browUp / n,
      blinkL: sum.blinkL / n,
      blinkR: sum.blinkR / n,
    };
  }

  /** Highest value each blendshape reached. Used for the "open wide" steps. */
  peakBlend(): Blendshapes {
    const out: Blendshapes = { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
    for (const b of this.blends) {
      out.jawOpen = Math.max(out.jawOpen, b.jawOpen);
      out.smile = Math.max(out.smile, b.smile);
      out.browUp = Math.max(out.browUp, b.browUp);
      out.blinkL = Math.max(out.blinkL, b.blinkL);
      out.blinkR = Math.max(out.blinkR, b.blinkR);
    }
    return out;
  }

  /**
   * Resolves the neutral hold. Fails if the face wandered more than
   * `maxJitterFh`, which is what stops someone calibrating mid-fidget and then
   * finding the whole world drifts.
   */
  resolveNeutral(): NeutralResult {
    const n = this.centres.length;
    const blend = this.meanBlend();
    if (n === 0) {
      return { ok: false, jitterFh: Infinity, centerUV: { x: 0, y: 0 }, fhUV: 0, blend };
    }

    let sx = 0;
    let sy = 0;
    for (const c of this.centres) {
      sx += c.x;
      sy += c.y;
    }
    const centerUV = { x: sx / n, y: sy / n };

    const heights = [...this.heights].sort((a, b) => a - b);
    const fhUV = heights[Math.floor(heights.length / 2)] ?? 0;

    let jitterUV = 0;
    for (const c of this.centres) {
      jitterUV = Math.max(jitterUV, Math.hypot(c.x - centerUV.x, c.y - centerUV.y));
    }
    const jitterFh = fhUV > 0 ? jitterUV / fhUV : Infinity;

    return {
      ok: fhUV > 0 && jitterFh <= config.calibration.maxJitterFh,
      jitterFh,
      centerUV,
      fhUV,
      blend,
    };
  }
}

/**
 * Builds the final calibration, clamping every range to its configured floor.
 * Without those floors a player who barely opens their mouth during step 2
 * ends up with a Maw that triggers on a mumble.
 */
export function buildCalibration(args: {
  neutral: NeutralResult;
  widePeak: Blendshapes;
  browPeak: Blendshapes;
  blinkPeak: Blendshapes;
  aspect: number;
}): Calibration {
  const { neutral, widePeak, browPeak, blinkPeak, aspect } = args;
  const jawBase = neutral.blend.jawOpen;
  const browBase = neutral.blend.browUp;
  const blinkBase = Math.min(neutral.blend.blinkL, neutral.blend.blinkR);

  return {
    centerUV: neutral.centerUV,
    fhUV: neutral.fhUV,
    aspect,
    jaw: {
      base: jawBase,
      wide: Math.max(widePeak.jawOpen, jawBase + config.calibration.minJawRange),
    },
    brow: {
      base: browBase,
      high: Math.max(browPeak.browUp, browBase + config.calibration.minBrowRange),
    },
    blink: {
      base: blinkBase,
      shut: Math.max(Math.max(blinkPeak.blinkL, blinkPeak.blinkR), blinkBase + config.calibration.minBlinkRange),
    },
    smileBase: neutral.blend.smile,
  };
}

/** Where a blendshape sits in its personal range, as a 0..1 fraction. */
export function normaliseInRange(value: number, base: number, peak: number): number {
  const span = peak - base;
  if (span <= 1e-6) return 0;
  return Math.min(1, Math.max(0, (value - base) / span));
}
