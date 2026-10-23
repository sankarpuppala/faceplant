/**
 * Coordinate mapping (SPEC section 7). Three spaces, two conversions:
 *
 *   normalised image  --mirror + aspect-->  UV  --centre + FH-->  world (FH)
 *   world (FH)  --------------------------------->  screen px
 *
 * Mirroring happens here and only here, so that "left" means the player's left
 * everywhere above this file. Both conversions are exact inverses, which
 * `tests/terrain/mapping.test.ts` proves by round-trip.
 */

import type { Vec2 } from '../face/types.ts';
import type { Calibration } from '../face/calibration.ts';

/** Mirrored, aspect-corrected UV from a normalised landmark. */
export function imageToUV(p: Vec2, aspect: number): Vec2 {
  return { x: (1 - p.x) * aspect, y: p.y };
}

export function uvToImage(p: Vec2, aspect: number): Vec2 {
  return { x: 1 - p.x / aspect, y: p.y };
}

/** UV to world FH, relative to the calibrated neutral centre. */
export function uvToWorld(p: Vec2, cal: Calibration): Vec2 {
  return { x: (p.x - cal.centerUV.x) / cal.fhUV, y: (p.y - cal.centerUV.y) / cal.fhUV };
}

export function worldToUV(p: Vec2, cal: Calibration): Vec2 {
  return { x: p.x * cal.fhUV + cal.centerUV.x, y: p.y * cal.fhUV + cal.centerUV.y };
}

/** Straight through: normalised landmark to world FH. */
export function imageToWorld(p: Vec2, cal: Calibration, aspect: number): Vec2 {
  return uvToWorld(imageToUV(p, aspect), cal);
}

export function worldToImage(p: Vec2, cal: Calibration, aspect: number): Vec2 {
  return uvToImage(worldToUV(p, cal), aspect);
}

/**
 * The drawing area: the largest rectangle of the configured aspect that fits
 * the canvas, centred. The camera frame is cropped to it, which is why the
 * calibration stores its own aspect.
 */
export interface Viewport {
  /** Offset of the drawing area inside the canvas, in px. */
  offsetX: number;
  offsetY: number;
  /** Size of the drawing area, in px. */
  width: number;
  height: number;
  /** Aspect of the drawing area. */
  aspect: number;
}

export function computeViewport(canvasWidth: number, canvasHeight: number, aspect: number): Viewport {
  const byWidth = canvasWidth / aspect;
  let width: number;
  let height: number;
  if (byWidth <= canvasHeight) {
    width = canvasWidth;
    height = byWidth;
  } else {
    height = canvasHeight;
    width = canvasHeight * aspect;
  }
  return {
    offsetX: (canvasWidth - width) / 2,
    offsetY: (canvasHeight - height) / 2,
    width,
    height,
    aspect,
  };
}

/** World FH to canvas pixels. */
export function worldToScreen(p: Vec2, cal: Calibration, vp: Viewport): Vec2 {
  const uv = worldToUV(p, cal);
  return {
    x: vp.offsetX + (uv.x / vp.aspect) * vp.width,
    y: vp.offsetY + uv.y * vp.height,
  };
}

export function screenToWorld(p: Vec2, cal: Calibration, vp: Viewport): Vec2 {
  const uv = {
    x: (((p.x - vp.offsetX) / vp.width) * vp.aspect),
    y: (p.y - vp.offsetY) / vp.height,
  };
  return uvToWorld(uv, cal);
}

/**
 * Where the camera picture must be drawn so that it sits exactly under the
 * terrain: the rectangle `worldToScreen` maps the whole image onto. UV spans
 * 0..videoAspect horizontally and 0..1 vertically, so the picture is one
 * viewport tall and anchored at the viewport's left edge.
 *
 * For a 16:9 camera on the 16:9 stage this is the viewport itself, which is
 * what v1 drew. For any other camera aspect v1 scaled the picture to *cover*
 * the stage instead, which stretched it away from the landmarks - a 4:3 camera
 * (or low-power mode, which asks for 640x480) put the terrain a quarter of a
 * screen off the face.
 */
export function videoRect(vp: Viewport, videoAspect: number): { x: number; y: number; width: number; height: number } {
  return {
    x: vp.offsetX,
    y: vp.offsetY,
    width: (videoAspect / vp.aspect) * vp.width,
    height: vp.height,
  };
}

/** One FH in pixels for the current viewport. Used for radii and line widths. */
export function fhToPx(cal: Calibration, vp: Viewport): number {
  return cal.fhUV * vp.height;
}

/**
 * The world-space rectangle the viewport shows. The level validator checks
 * every authored coordinate against this at the default calibration, so a
 * level cannot place a Gate off screen (SPEC section 9.1).
 */
export function visibleWorldBounds(cal: Calibration, vp: Viewport): { minX: number; minY: number; maxX: number; maxY: number } {
  const tl = screenToWorld({ x: vp.offsetX, y: vp.offsetY }, cal, vp);
  const br = screenToWorld({ x: vp.offsetX + vp.width, y: vp.offsetY + vp.height }, cal, vp);
  return {
    minX: Math.min(tl.x, br.x),
    minY: Math.min(tl.y, br.y),
    maxX: Math.max(tl.x, br.x),
    maxY: Math.max(tl.y, br.y),
  };
}
