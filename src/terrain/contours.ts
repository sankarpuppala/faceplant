/**
 * Landmarks to named world-space polylines (SPEC section 6.3).
 *
 * Every contour is ordered left-to-right in *world* space after mirroring, so
 * the walkability pass and the Wick edge logic can assume monotonic x without
 * re-sorting each frame.
 */

import type { Calibration } from '../face/calibration.ts';
import { normaliseInRange } from '../face/calibration.ts';
import {
  BROW_UPPER_SUBJECT_LEFT,
  BROW_UPPER_SUBJECT_RIGHT,
  CHEEK_SUBJECT_LEFT,
  CHEEK_SUBJECT_RIGHT,
  CHIN,
  EYE_LOWER_SUBJECT_LEFT,
  EYE_LOWER_SUBJECT_RIGHT,
  EYE_UPPER_SUBJECT_LEFT,
  EYE_UPPER_SUBJECT_RIGHT,
  FOREHEAD,
  JAW,
  LIP_INNER_LOWER,
  LIP_INNER_UPPER,
  LIP_OUTER_LOWER,
  LIP_OUTER_UPPER,
  NOSE_BASE,
  NOSE_BRIDGE,
  TOP_OF_FOREHEAD,
} from '../face/landmarks.ts';
import type { ContourMap, FaceData, RawFace, Vec2 } from '../face/types.ts';
import { emptyContourMap } from '../face/types.ts';
import { imageToWorld } from './mapping.ts';

function chain(face: RawFace, indices: readonly number[], cal: Calibration, aspect: number): Vec2[] {
  const out: Vec2[] = [];
  for (const i of indices) {
    const p = face.landmarks[i];
    if (p === undefined) continue;
    const w = imageToWorld(p, cal, aspect);
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) continue;
    out.push(w);
  }
  return out;
}

/** Orders a polyline left to right, which mirroring may have reversed. */
function leftToRight(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (first !== undefined && last !== undefined && last.x < first.x) points.reverse();
  return points;
}

/**
 * Builds every terrain contour for one tracked face.
 *
 * Note on left/right: MediaPipe's "left" is the subject's left, which after
 * mirroring for the selfie view lands on the *left* of the screen - the same
 * side the player perceives as their left. So subject-left maps to `browL`.
 */
export function buildContours(face: RawFace, cal: Calibration, aspect: number): ContourMap {
  const out = emptyContourMap();

  out.forehead = leftToRight(chain(face, FOREHEAD, cal, aspect));
  out.browL = leftToRight(chain(face, BROW_UPPER_SUBJECT_LEFT, cal, aspect));
  out.browR = leftToRight(chain(face, BROW_UPPER_SUBJECT_RIGHT, cal, aspect));

  // The nose is the one contour that must stay top-to-bottom, not left-to-right:
  // it is a slide, and the Wicks need its real direction of descent.
  out.nose = [...chain(face, NOSE_BRIDGE, cal, aspect), ...chain(face, NOSE_BASE.slice(1), cal, aspect)];

  out.lipUpper = leftToRight(chain(face, LIP_OUTER_UPPER, cal, aspect));
  out.lipLower = leftToRight(chain(face, LIP_OUTER_LOWER, cal, aspect));
  out.lipInnerUpper = leftToRight(chain(face, LIP_INNER_UPPER, cal, aspect));
  out.lipInnerLower = leftToRight(chain(face, LIP_INNER_LOWER, cal, aspect));

  // Cheeks run temple to jaw. Face-on they sit at 70-78 degrees, which is a
  // cliff rather than a floor, so `build.ts` treats them as rails: a Wick that
  // leaves the forehead slides down the side of the face to the jaw. Their
  // winding therefore only has to be consistent, not upward-facing.
  out.cheekL = chain(face, CHEEK_SUBJECT_LEFT, cal, aspect);
  out.cheekR = chain(face, CHEEK_SUBJECT_RIGHT, cal, aspect);

  // The jaw is the face's bottom edge, and the one flat place beneath the Maw.
  out.jaw = leftToRight(chain(face, JAW, cal, aspect));

  // U5: the eyelid is a bridge when shut and a pit when open. We always build
  // both chains; `eyes.ts` decides which one is terrain this frame.
  out.eyeLidL = leftToRight(chain(face, EYE_UPPER_SUBJECT_LEFT, cal, aspect));
  out.eyeLidR = leftToRight(chain(face, EYE_UPPER_SUBJECT_RIGHT, cal, aspect));
  out.eyeRingL = leftToRight(chain(face, EYE_LOWER_SUBJECT_LEFT, cal, aspect));
  out.eyeRingR = leftToRight(chain(face, EYE_LOWER_SUBJECT_RIGHT, cal, aspect));

  return out;
}

/** Face centre and scale in world terms (SPEC section 6.1). */
export function faceCentreAndScale(face: RawFace, cal: Calibration, aspect: number): { center: Vec2; scale: number } {
  const top = face.landmarks[TOP_OF_FOREHEAD];
  const chin = face.landmarks[CHIN];
  if (top === undefined || chin === undefined) return { center: { x: 0, y: 0 }, scale: 1 };
  const a = imageToWorld(top, cal, aspect);
  const b = imageToWorld(chin, cal, aspect);
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    scale: Math.hypot(b.x - a.x, b.y - a.y),
  };
}

/**
 * Converts raw blendshapes into personal 0..1 fractions using the calibration.
 * Everything downstream reads these, never the raw values, so a player with a
 * naturally slack jaw is not permanently mid-Maw (decision D6).
 */
export function normaliseBlend(face: RawFace, cal: Calibration): FaceData['blend'] {
  return {
    jawOpen: normaliseInRange(face.blend.jawOpen, cal.jaw.base, cal.jaw.wide),
    smile: normaliseInRange(face.blend.smile, cal.smileBase, 1),
    browUp: normaliseInRange(face.blend.browUp, cal.brow.base, cal.brow.high),
    blinkL: normaliseInRange(face.blend.blinkL, cal.blink.base, cal.blink.shut),
    blinkR: normaliseInRange(face.blend.blinkR, cal.blink.base, cal.blink.shut),
  };
}

/** Builds the full `FaceData` for one face. */
export function buildFaceData(face: RawFace, cal: Calibration, aspect: number): FaceData {
  const { center, scale } = faceCentreAndScale(face, cal, aspect);
  return {
    points: buildContours(face, cal, aspect),
    blend: normaliseBlend(face, cal),
    center,
    scale,
  };
}
