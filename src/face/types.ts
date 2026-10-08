/**
 * The only way the game learns about faces (SPEC section 6.1, CLAUDE.md section 6).
 *
 * Game code never imports MediaPipe. Three implementations satisfy this
 * interface: `WebcamFaceSource` (real tracking), `SyntheticFaceSource`
 * (Assist mode, no camera) and `FixtureFaceSource` (tests).
 */

export interface Vec2 {
  x: number;
  y: number;
}

/** Named terrain contours built from landmarks (SPEC section 6.3). */
export const contourNames = [
  'forehead',
  'browL',
  'browR',
  'nose',
  'lipUpper',
  'lipLower',
  'lipInnerUpper',
  'lipInnerLower',
  'cheekL',
  'cheekR',
  'jaw',
  'eyeLidL',
  'eyeLidR',
  'eyeRingL',
  'eyeRingR',
] as const;

export type ContourName = (typeof contourNames)[number];

export type ContourMap = Record<ContourName, Vec2[]>;

export interface Blendshapes {
  jawOpen: number;
  smile: number;
  browUp: number;
  blinkL: number;
  blinkR: number;
}

export const blendshapeNames = ['jawOpen', 'smile', 'browUp', 'blinkL', 'blinkR'] as const;

export interface FaceData {
  /** World FH coordinates, mirrored for selfie view, relative to the neutral centre. */
  points: ContourMap;
  blend: Blendshapes;
  /** Face centre in FH relative to the calibrated neutral centre. */
  center: Vec2;
  /** Current face height over the calibrated face height. 1 = where you calibrated. */
  scale: number;
}

export interface FaceFrame {
  /** Monotonic ms. */
  t: number;
  faces: FaceData[];
}

export interface FaceSourceInfo {
  kind: 'webcam' | 'synthetic' | 'fixture';
  /** Tracker updates per second, averaged over the last second. */
  trackingHz: number;
  /** The element the video filter should sample, if any. */
  video: HTMLVideoElement | null;
  /** Frame aspect (width / height) of the source. */
  aspect: number;
}

export interface FaceSource {
  start(): Promise<void>;
  stop(): void;
  /** The newest frame, or null before the first one arrives. */
  latest(): FaceFrame | null;
  info(): FaceSourceInfo;
}

/** Raw normalised landmarks, before calibration maps them into FH world space. */
export interface RawFace {
  /** 468+ landmarks in normalised image coordinates, x right, y down, NOT mirrored. */
  landmarks: readonly Vec2[];
  blend: Blendshapes;
}

export interface RawFrame {
  t: number;
  faces: RawFace[];
  aspect: number;
}

export function emptyContourMap(): ContourMap {
  const out = {} as ContourMap;
  for (const n of contourNames) out[n] = [];
  return out;
}

export function zeroBlend(): Blendshapes {
  return { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
}
