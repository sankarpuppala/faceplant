/**
 * AC-2 — the face pipeline: filter, landmark sets, calibration, reactions.
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { alphaFor, Ema, LandmarkSmoother, OneEuroFilter } from '../../src/face/oneEuro.ts';
import {
  buildCalibration,
  CalibrationCollector,
  defaultCalibration,
  measureFaceCentreUV,
  measureFaceHeightUV,
  normaliseInRange,
} from '../../src/face/calibration.ts';
import {
  BROW_UPPER_SUBJECT_LEFT,
  BROW_UPPER_SUBJECT_RIGHT,
  CHIN,
  FACE_MESH_POINTS,
  FACE_OVAL,
  FACE_OVAL_CHIN_INDEX,
  FOREHEAD,
  JAW,
  LIP_INNER_LOWER,
  LIP_INNER_UPPER,
  LIP_OUTER_LOWER,
  LIP_OUTER_UPPER,
  NOSE_BRIDGE,
  TOP_OF_FOREHEAD,
  USED_INDICES,
} from '../../src/face/landmarks.ts';
import { ReactionDetector } from '../../src/face/reactions.ts';
import { neutralPose, sampleSyntheticFace } from '../../src/face/syntheticSource.ts';
import type { RawFace } from '../../src/face/types.ts';

describe('One Euro filter (SPEC 6.2)', () => {
  it('alpha rises with the cutoff frequency', () => {
    const slow = alphaFor(1, 1 / 60);
    const fast = alphaFor(20, 1 / 60);
    expect(slow).toBeGreaterThan(0);
    expect(slow).toBeLessThan(1);
    expect(fast).toBeGreaterThan(slow);
  });

  it('passes the first sample through unchanged', () => {
    const f = new OneEuroFilter(config.face.oneEuro);
    expect(f.filter(7.5, 1 / 60)).toBeCloseTo(7.5, 10);
  });

  it('converges on a constant signal', () => {
    const f = new OneEuroFilter(config.face.oneEuro);
    f.filter(0, 1 / 60);
    let v = 0;
    for (let i = 0; i < 400; i++) v = f.filter(5, 1 / 60);
    expect(v).toBeCloseTo(5, 3);
  });

  it('suppresses jitter far more than it delays real movement', () => {
    // The point of the filter, as one assertion: the same filter must be
    // sleepy for noise and awake for motion, or face terrain either shimmers
    // or lags.
    const jitter = new OneEuroFilter(config.face.oneEuro);
    jitter.filter(0, 1 / 60);
    let jitterMax = 0;
    for (let i = 0; i < 200; i++) {
      // +-0.5 of noise around zero.
      const out = jitter.filter(i % 2 === 0 ? 0.5 : -0.5, 1 / 60);
      if (i > 20) jitterMax = Math.max(jitterMax, Math.abs(out));
    }

    const ramp = new OneEuroFilter(config.face.oneEuro);
    ramp.filter(0, 1 / 60);
    let rampOut = 0;
    for (let i = 1; i <= 60; i++) rampOut = ramp.filter(i * 0.5, 1 / 60);

    // Noise of amplitude 0.5 is crushed to a fraction of itself...
    expect(jitterMax).toBeLessThan(0.25);
    // ...while a real ramp to 30 arrives nearly in full.
    expect(rampOut).toBeGreaterThan(26);
  });

  it('survives a NaN without poisoning its state', () => {
    const f = new OneEuroFilter(config.face.oneEuro);
    f.filter(1, 1 / 60);
    const afterNaN = f.filter(Number.NaN, 1 / 60);
    expect(Number.isFinite(afterNaN)).toBe(true);
    expect(Number.isFinite(f.filter(2, 1 / 60))).toBe(true);
  });

  it('smooths a whole landmark array in place without reallocating', () => {
    const s = new LandmarkSmoother();
    const out: { x: number; y: number }[] = [];
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: i, y: -i }));
    s.smooth(pts, 0, out);
    const firstRef = out[0];
    s.smooth(pts, 16, out);
    expect(out).toHaveLength(10);
    // Same object identity: the array is reused, not rebuilt each frame.
    expect(out[0]).toBe(firstRef);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('Ema converges and ignores NaN', () => {
    const e = new Ema(0.5);
    expect(e.filter(1)).toBe(1);
    expect(Number.isFinite(e.filter(Number.NaN))).toBe(true);
    let v = 0;
    for (let i = 0; i < 50; i++) v = e.filter(3);
    expect(v).toBeCloseTo(3, 5);
  });
});

describe('landmark index sets (verified against @mediapipe/tasks-vision 1.1.0)', () => {
  const chains = {
    FOREHEAD,
    JAW,
    BROW_UPPER_SUBJECT_LEFT,
    BROW_UPPER_SUBJECT_RIGHT,
    NOSE_BRIDGE,
    LIP_OUTER_UPPER,
    LIP_OUTER_LOWER,
    LIP_INNER_UPPER,
    LIP_INNER_LOWER,
  };

  it('every index is inside the model range', () => {
    for (const i of USED_INDICES) {
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(FACE_MESH_POINTS);
    }
  });

  it('no chain repeats an index', () => {
    for (const [name, chain] of Object.entries(chains)) {
      expect(new Set(chain).size, `${name} has a duplicate index`).toBe(chain.length);
    }
  });

  it('the face oval is a closed ring with the chin where we say it is', () => {
    expect(FACE_OVAL).toHaveLength(36);
    expect(new Set(FACE_OVAL).size).toBe(36);
    expect(FACE_OVAL[0]).toBe(TOP_OF_FOREHEAD);
    expect(FACE_OVAL[FACE_OVAL_CHIN_INDEX]).toBe(CHIN);
  });

  it('USED_INDICES is sorted, unique, and covers every chain', () => {
    expect([...USED_INDICES]).toEqual([...USED_INDICES].sort((a, b) => a - b));
    expect(new Set(USED_INDICES).size).toBe(USED_INDICES.length);
    const used = new Set(USED_INDICES);
    for (const [name, chain] of Object.entries(chains)) {
      for (const i of chain) expect(used.has(i), `${name} index ${i} missing from USED_INDICES`).toBe(true);
    }
  });

  it('the inner lips are inside the outer lips, so the swallow sensor is smaller than the mouth', () => {
    const face = sampleSyntheticFace(neutralPose(), config.render.aspect);
    const span = (chain: readonly number[]): number => {
      const xs = chain.map((i) => face.landmarks[i]?.x ?? 0);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(span(LIP_INNER_UPPER)).toBeLessThan(span(LIP_OUTER_UPPER));
  });
});

describe('calibration (SPEC 7)', () => {
  const aspect = config.render.aspect;

  function faceAt(cx: number, cy: number, size: number, jaw = 0, at = aspect): RawFace {
    return sampleSyntheticFace({ ...neutralPose(), cx, cy, size, jawOpen: jaw }, at);
  }

  it('measures face height in isotropic UV, so a wide frame does not squash it', () => {
    // This is the entire reason UV space exists: normalised image coordinates
    // are per-axis, so the same head in a 16:9 and a 4:3 frame would otherwise
    // calibrate to two different face heights and every level would fit one of
    // them and not the other.
    const h16x9 = measureFaceHeightUV(faceAt(0.5, 0.5, 0.42, 0, 16 / 9), 16 / 9);
    const h4x3 = measureFaceHeightUV(faceAt(0.5, 0.5, 0.42, 0, 4 / 3), 4 / 3);
    expect(h16x9).toBeCloseTo(h4x3, 9);
  });

  it('scales face height linearly with the face', () => {
    // Landmark 10 sits a little inside the crown, on a real head and on ours,
    // so face height is a fixed fraction of the drawn size rather than equal to
    // it. What has to hold is that the relationship is exactly linear - that is
    // what makes FH a stable unit as the player leans.
    const small = measureFaceHeightUV(faceAt(0.5, 0.5, 0.3), aspect);
    const large = measureFaceHeightUV(faceAt(0.5, 0.5, 0.6), aspect);
    expect(large / small).toBeCloseTo(2, 6);
    expect(small).toBeGreaterThan(0.2);
  });

  it('finds the centre between forehead and chin, and it moves with the face', () => {
    // Landmark 10 is not the crown of the head, so the midpoint of the
    // forehead/chin pair sits slightly below the frame centre - on a real head
    // as much as on ours. What matters is that it tracks the face exactly.
    const c = measureFaceCentreUV(faceAt(0.5, 0.5, 0.42), aspect);
    expect(c.y).toBeCloseTo(0.5, 1);

    const moved = measureFaceCentreUV(faceAt(0.5, 0.62, 0.42), aspect);
    expect(moved.y - c.y).toBeCloseTo(0.12, 6);
  });

  it('accepts a still hold', () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 60; i++) c.add(faceAt(0.5 + Math.sin(i) * 0.0004, 0.5, 0.42), aspect);
    const n = c.resolveNeutral();
    expect(n.ok).toBe(true);
    expect(n.jitterFh).toBeLessThan(config.calibration.maxJitterFh);
  });

  it('rejects a hold that wandered (SPEC 7 step 1)', () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 60; i++) c.add(faceAt(0.5 + i * 0.002, 0.5, 0.42), aspect);
    const n = c.resolveNeutral();
    expect(n.ok).toBe(false);
    expect(n.jitterFh).toBeGreaterThan(config.calibration.maxJitterFh);
  });

  it('rejects an empty hold instead of dividing by zero', () => {
    const n = new CalibrationCollector().resolveNeutral();
    expect(n.ok).toBe(false);
    expect(n.fhUV).toBe(0);
  });

  it('peakBlend takes the maximum, meanBlend the average', () => {
    const c = new CalibrationCollector();
    c.add(faceAt(0.5, 0.5, 0.42, 0.1), aspect);
    c.add(faceAt(0.5, 0.5, 0.42, 0.9), aspect);
    expect(c.peakBlend().jawOpen).toBeCloseTo(0.9, 6);
    expect(c.meanBlend().jawOpen).toBeCloseTo(0.5, 6);
  });

  it('floors every range, so a shy calibration cannot make the Maw hair-trigger (decision D6)', () => {
    const c = new CalibrationCollector();
    for (let i = 0; i < 30; i++) c.add(faceAt(0.5, 0.5, 0.42, 0.02), aspect);
    const neutral = c.resolveNeutral();

    const cal = buildCalibration({
      neutral,
      // The player barely opened their mouth, barely moved their brows.
      widePeak: { jawOpen: 0.04, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 },
      browPeak: { jawOpen: 0, smile: 0, browUp: 0.06, blinkL: 0, blinkR: 0 },
      blinkPeak: { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0.1, blinkR: 0.1 },
      aspect,
    });

    expect(cal.jaw.wide - cal.jaw.base).toBeGreaterThanOrEqual(config.calibration.minJawRange - 1e-9);
    expect(cal.brow.high - cal.brow.base).toBeGreaterThanOrEqual(config.calibration.minBrowRange - 1e-9);
    expect(cal.blink.shut - cal.blink.base).toBeGreaterThanOrEqual(config.calibration.minBlinkRange - 1e-9);
  });

  it('normaliseInRange clamps and handles a zero span', () => {
    expect(normaliseInRange(0.5, 0, 1)).toBeCloseTo(0.5, 6);
    expect(normaliseInRange(-5, 0, 1)).toBe(0);
    expect(normaliseInRange(5, 0, 1)).toBe(1);
    expect(normaliseInRange(0.5, 0.5, 0.5)).toBe(0);
  });

  it('the default calibration is usable with no camera at all', () => {
    const cal = defaultCalibration();
    expect(cal.fhUV).toBeGreaterThan(0);
    expect(cal.jaw.wide).toBeGreaterThan(cal.jaw.base);
    expect(cal.blink.shut).toBeGreaterThan(cal.blink.base);
  });
});

describe('reactions (SPEC 6.8)', () => {
  const blend = (jaw: number, smile = 0, brow = 0): Parameters<ReactionDetector['update']>[0] => ({
    jawOpen: jaw,
    smile,
    browUp: brow,
    blinkL: 0,
    blinkR: 0,
  });

  it('detects a real laugh: a smile with the jaw bouncing in the 2-8 Hz band', () => {
    const d = new ReactionDetector();
    let laughed = false;
    // 5 Hz jaw oscillation sampled at 60 Hz, held for well over the sustain.
    for (let i = 0; i < 180; i++) {
      const t = i * (1000 / 60);
      const jaw = 0.4 + Math.sin((t / 1000) * 5 * Math.PI * 2) * 0.3;
      const r = d.update(blend(jaw, 0.8), 1, 0, t, config.quake.speedFhPerS);
      if (r.laughing) laughed = true;
    }
    expect(laughed).toBe(true);
  });

  it('does not call a wide-open silent mouth a laugh', () => {
    const d = new ReactionDetector();
    let laughed = false;
    for (let i = 0; i < 180; i++) {
      const t = i * (1000 / 60);
      const r = d.update(blend(0.9, 0.9), 1, 0, t, config.quake.speedFhPerS);
      if (r.laughing) laughed = true;
    }
    // Smiling hard with the mouth held open is not laughing: no oscillation.
    expect(laughed).toBe(false);
  });

  it('does not call a jaw wobble without a smile a laugh', () => {
    const d = new ReactionDetector();
    let laughed = false;
    for (let i = 0; i < 180; i++) {
      const t = i * (1000 / 60);
      const jaw = 0.4 + Math.sin((t / 1000) * 5 * Math.PI * 2) * 0.3;
      const r = d.update(blend(jaw, 0), 1, 0, t, config.quake.speedFhPerS);
      if (r.laughing) laughed = true;
    }
    expect(laughed).toBe(false);
  });

  it('detects a gasp as a fast jaw rise', () => {
    const d = new ReactionDetector();
    d.update(blend(0), 1, 0, 0, config.quake.speedFhPerS);
    d.update(blend(0.05), 1, 0, 40, config.quake.speedFhPerS);
    const r = d.update(blend(0.75), 1, 0, 90, config.quake.speedFhPerS);
    expect(r.gasp).toBe(true);
  });

  it('does not call a slow mouth-opening a gasp', () => {
    const d = new ReactionDetector();
    let gasped = false;
    for (let i = 0; i <= 60; i++) {
      const t = i * 50;
      const r = d.update(blend(i / 60), 1, 0, t, config.quake.speedFhPerS);
      if (r.gasp) gasped = true;
    }
    expect(gasped).toBe(false);
  });

  it('flags leaning in and brows up from the thresholds', () => {
    const d = new ReactionDetector();
    const r = d.update(blend(0, 0, 0.9), 1.3, 0, 0, config.quake.speedFhPerS);
    expect(r.browsUp).toBe(true);
    expect(r.leaningIn).toBe(true);
  });

  it('flags a flinch only past the quake threshold', () => {
    const d = new ReactionDetector();
    expect(d.update(blend(0), 1, 0.1, 0, config.quake.speedFhPerS).flinching).toBe(false);
    expect(d.update(blend(0), 1, 99, 16, config.quake.speedFhPerS).flinching).toBe(true);
  });
});
