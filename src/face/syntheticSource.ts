/**
 * Assist mode (SPEC section 13, CLAUDE.md invariant 7) and U10.
 *
 * A drawn face driven by mouse and keyboard, emitting exactly the same
 * `FaceFrame` as the webcam. Two jobs:
 *
 *   1. Accessibility. Every level must be completable without a camera, and
 *      `tests/levels/solvable.test.ts` proves it by driving this source
 *      headlessly through every shipped level.
 *   2. U10 - the funnel. Nobody grants camera access to a game they have not
 *      played, so the first level runs on this with no permission prompt at
 *      all, and the camera is offered afterwards as an upgrade.
 *
 * Controls: mouse moves the face, wheel tilts, Space opens the Maw, Shift
 * raises the brows, Up/Down lean, B blinks (U5).
 */

import { config } from '../config.ts';
import {
  CHIN,
  FACE_MESH_POINTS,
  TOP_OF_FOREHEAD,
  BROW_UPPER_SUBJECT_LEFT,
  BROW_UPPER_SUBJECT_RIGHT,
  CHEEK_SUBJECT_LEFT,
  CHEEK_SUBJECT_RIGHT,
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
} from './landmarks.ts';
import type { FaceSource, FaceSourceInfo, RawFace, RawFrame, Vec2 } from './types.ts';
import { buildFaceData } from '../terrain/contours.ts';
import type { Calibration } from './calibration.ts';
import { defaultCalibration } from './calibration.ts';
import type { FaceFrame } from './types.ts';

/** The pose the synthetic face is drawn in. All angles in radians. */
export interface SyntheticPose {
  /** Face centre in normalised image coordinates (NOT mirrored). */
  cx: number;
  cy: number;
  /** Face height as a fraction of frame height. */
  size: number;
  tilt: number;
  jawOpen: number;
  smile: number;
  browUp: number;
  blinkL: number;
  blinkR: number;
}

export function neutralPose(): SyntheticPose {
  return { cx: 0.5, cy: 0.5, size: 0.42, tilt: 0, jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
}

/**
 * A canonical face in "face units": origin at the face centre, y down, and the
 * face exactly 1 unit tall. Hand-placed to match the proportions of the real
 * mesh closely enough that a level authored against a real face plays the same
 * way here - which is the whole point of Assist mode.
 */
interface Canon {
  x: number;
  y: number;
}

const CANON = new Map<number, Canon>();

function setCanon(indices: readonly number[], from: Canon, to: Canon, curve = 0): void {
  const n = indices.length;
  for (let i = 0; i < n; i++) {
    const idx = indices[i];
    if (idx === undefined) continue;
    const t = n === 1 ? 0.5 : i / (n - 1);
    const bow = Math.sin(t * Math.PI) * curve;
    CANON.set(idx, {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t - bow,
    });
  }
}

// Vertical landmarks that define the face height.
CANON.set(TOP_OF_FOREHEAD, { x: 0, y: -0.5 });
CANON.set(CHIN, { x: 0, y: 0.5 });

// The dome. Bowed upward so it is a hill rather than a plank.
setCanon(FOREHEAD, { x: -0.34, y: -0.3 }, { x: 0.34, y: -0.3 }, 0.14);

// Brow ledges, slightly tilted outward, sitting below the dome.
setCanon(BROW_UPPER_SUBJECT_LEFT, { x: 0.08, y: -0.19 }, { x: 0.3, y: -0.15 }, 0.02);
setCanon(BROW_UPPER_SUBJECT_RIGHT, { x: -0.3, y: -0.15 }, { x: -0.08, y: -0.19 }, 0.02);

// The nose: the rail from between the brows down to the tip.
setCanon(NOSE_BRIDGE, { x: 0, y: -0.13 }, { x: 0, y: 0.1 });
setCanon(NOSE_BASE, { x: 0, y: 0.1 }, { x: 0, y: 0.14 });

// Lips. Height is adjusted by jawOpen at sample time.
setCanon(LIP_OUTER_UPPER, { x: -0.16, y: 0.22 }, { x: 0.16, y: 0.22 }, 0.02);
setCanon(LIP_OUTER_LOWER, { x: -0.16, y: 0.26 }, { x: 0.16, y: 0.26 }, -0.02);
setCanon(LIP_INNER_UPPER, { x: -0.12, y: 0.235 }, { x: 0.12, y: 0.235 }, 0.012);
setCanon(LIP_INNER_LOWER, { x: -0.12, y: 0.25 }, { x: 0.12, y: 0.25 }, -0.012);

// Cheeks, temple down to jaw. These become rails, so their job is to run from
// just under the brow line down to where the jaw starts.
setCanon(CHEEK_SUBJECT_LEFT, { x: 0.33, y: -0.22 }, { x: 0.16, y: 0.4 }, -0.05);
setCanon(CHEEK_SUBJECT_RIGHT, { x: -0.33, y: -0.22 }, { x: -0.16, y: 0.4 }, 0.05);

// The jaw, bowing down to the chin at (0, 0.5). This is the face's floor.
setCanon(JAW, { x: -0.16, y: 0.4 }, { x: 0.16, y: 0.4 }, -0.1);

// Eyes. The lid chains collapse onto each other as the eye closes (U5).
setCanon(EYE_UPPER_SUBJECT_LEFT, { x: 0.09, y: -0.08 }, { x: 0.26, y: -0.08 }, 0.035);
setCanon(EYE_LOWER_SUBJECT_LEFT, { x: 0.09, y: -0.04 }, { x: 0.26, y: -0.04 }, -0.02);
setCanon(EYE_UPPER_SUBJECT_RIGHT, { x: -0.26, y: -0.08 }, { x: -0.09, y: -0.08 }, 0.035);
setCanon(EYE_LOWER_SUBJECT_RIGHT, { x: -0.26, y: -0.04 }, { x: -0.09, y: -0.04 }, -0.02);

const LIP_UPPER_SET = new Set<number>([...LIP_OUTER_UPPER, ...LIP_INNER_UPPER]);
const LIP_LOWER_SET = new Set<number>([...LIP_OUTER_LOWER, ...LIP_INNER_LOWER]);
const BROW_SET = new Set<number>([...BROW_UPPER_SUBJECT_LEFT, ...BROW_UPPER_SUBJECT_RIGHT]);
const LID_L_SET = new Set<number>(EYE_UPPER_SUBJECT_LEFT);
const LID_R_SET = new Set<number>(EYE_UPPER_SUBJECT_RIGHT);

/** Renders the canonical face into normalised image landmarks for a pose. */
export function sampleSyntheticFace(pose: SyntheticPose, aspect: number): RawFace {
  const landmarks: Vec2[] = new Array(FACE_MESH_POINTS);
  const cos = Math.cos(pose.tilt);
  const sin = Math.sin(pose.tilt);

  // Mouth opening moves the lower lip down and the upper lip up a little, which
  // is what makes the inner-lip polygon grow into a real swallow sensor.
  const jaw = pose.jawOpen;
  const smileLift = pose.smile * 0.012;

  for (let i = 0; i < FACE_MESH_POINTS; i++) {
    const c = CANON.get(i);
    if (c === undefined) {
      // Unused index: park it at the centre. Nothing reads it, and leaving holes
      // would mean every consumer had to handle undefined.
      landmarks[i] = { x: 0.5, y: 0.5 };
      continue;
    }

    let fx = c.x;
    let fy = c.y;

    if (LIP_LOWER_SET.has(i)) fy += jaw * 0.16;
    else if (LIP_UPPER_SET.has(i)) fy -= jaw * 0.02;
    if (LIP_UPPER_SET.has(i) || LIP_LOWER_SET.has(i)) fy -= smileLift;
    if (BROW_SET.has(i)) fy -= pose.browUp * 0.07;
    // A closing lid drops to meet the lower lid, becoming a bridge.
    if (LID_L_SET.has(i)) fy += pose.blinkL * 0.04;
    if (LID_R_SET.has(i)) fy += pose.blinkR * 0.04;

    // Tilt about the face centre, then scale into the frame. Dividing x by the
    // aspect undoes the frame's own stretch, so the face stays circular.
    const rx = fx * cos - fy * sin;
    const ry = fx * sin + fy * cos;

    landmarks[i] = {
      x: pose.cx + (rx * pose.size) / aspect,
      y: pose.cy + ry * pose.size,
    };
  }

  return {
    landmarks,
    blend: {
      jawOpen: pose.jawOpen,
      smile: pose.smile,
      browUp: pose.browUp,
      blinkL: pose.blinkL,
      blinkR: pose.blinkR,
    },
  };
}

/** Everything the synthetic face needs that is not a DOM event. */
export interface SyntheticDriver {
  /** Called once per produced frame; mutate the pose in place. */
  update(pose: SyntheticPose, tMs: number): void;
}

/**
 * Headless source: the pose comes from a driver function rather than input.
 * This is what the solvability tests use to play the game.
 */
export class SyntheticFaceSource implements FaceSource {
  private readonly pose = neutralPose();
  private frame: FaceFrame | null = null;
  private running = false;
  private lastT = 0;
  private hz = 0;
  private readonly aspect: number;
  private cal: Calibration;

  private readonly driver: SyntheticDriver | null;

  constructor(driver: SyntheticDriver | null = null, aspect = config.render.aspect, cal?: Calibration) {
    this.driver = driver;
    this.aspect = aspect;
    this.cal = cal ?? defaultCalibration(aspect);
  }

  /** Assist mode calibrates against the canonical face, not a real one. */
  setCalibration(cal: Calibration): void {
    this.cal = cal;
  }

  get calibration(): Calibration {
    return this.cal;
  }

  get currentPose(): SyntheticPose {
    return this.pose;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** Produces one frame at time `tMs`. Driven by the app's render loop. */
  tick(tMs: number): FaceFrame {
    if (this.driver !== null) this.driver.update(this.pose, tMs);
    const raw = sampleSyntheticFace(this.pose, this.aspect);
    const frame: FaceFrame = { t: tMs, faces: [buildFaceData(raw, this.cal, this.aspect)] };
    this.frame = frame;
    const dt = tMs - this.lastT;
    if (dt > 0) this.hz = this.hz * 0.9 + (1000 / dt) * 0.1;
    this.lastT = tMs;
    return frame;
  }

  /** The raw frame, for calibrating against the synthetic face. */
  tickRaw(tMs: number): RawFrame {
    if (this.driver !== null) this.driver.update(this.pose, tMs);
    return { t: tMs, faces: [sampleSyntheticFace(this.pose, this.aspect)], aspect: this.aspect };
  }

  latest(): FaceFrame | null {
    return this.frame;
  }

  info(): FaceSourceInfo {
    return { kind: 'synthetic', trackingHz: this.running ? this.hz : 0, video: null, aspect: this.aspect };
  }
}

/** Maps browser input onto the pose (SPEC section 13). */
export class AssistInput implements SyntheticDriver {
  private targetCx = 0.5;
  private targetCy = 0.5;
  private tilt = 0;
  private size = 0.42;
  private space = false;
  private shift = false;
  private blink = false;
  private smileKey = false;
  private readonly cleanup: (() => void)[] = [];

  attach(el: HTMLElement): void {
    const onMove = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      // Mirrored: moving the mouse right moves the face right on screen, which
      // is what a player expects even though the source is unmirrored.
      this.targetCx = 1 - (e.clientX - r.left) / r.width;
      this.targetCy = (e.clientY - r.top) / r.height;
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      this.tilt = Math.max(-0.5, Math.min(0.5, this.tilt + Math.sign(e.deltaY) * 0.04));
    };
    const onKey = (e: KeyboardEvent): void => {
      const down = e.type === 'keydown';
      switch (e.code) {
        case 'Space':
          this.space = down;
          e.preventDefault();
          break;
        case 'ShiftLeft':
        case 'ShiftRight':
          this.shift = down;
          break;
        case 'KeyB':
          this.blink = down;
          break;
        case 'KeyL':
          this.smileKey = down;
          break;
        case 'ArrowUp':
          if (down) this.size = Math.min(0.62, this.size + 0.02);
          e.preventDefault();
          break;
        case 'ArrowDown':
          if (down) this.size = Math.max(0.3, this.size - 0.02);
          e.preventDefault();
          break;
        case 'ArrowLeft':
          if (down) this.tilt = Math.max(-0.5, this.tilt - 0.05);
          e.preventDefault();
          break;
        case 'ArrowRight':
          if (down) this.tilt = Math.min(0.5, this.tilt + 0.05);
          e.preventDefault();
          break;
        default:
          break;
      }
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    this.cleanup.push(() => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    });
  }

  detach(): void {
    for (const fn of this.cleanup) fn();
    this.cleanup.length = 0;
  }

  update(pose: SyntheticPose, _tMs: number): void {
    void _tMs;
    // Ease toward the pointer, so a mouse jerk produces a quake just like a
    // real flinch would.
    const k = 0.25;
    pose.cx += (this.targetCx - pose.cx) * k;
    pose.cy += (this.targetCy - pose.cy) * k;
    pose.size += (this.size - pose.size) * 0.2;
    pose.tilt += (this.tilt - pose.tilt) * 0.2;

    const ease = (cur: number, want: number): number => cur + (want - cur) * 0.35;
    pose.jawOpen = ease(pose.jawOpen, this.space ? 1 : 0);
    pose.browUp = ease(pose.browUp, this.shift ? 1 : 0);
    pose.smile = ease(pose.smile, this.smileKey ? 0.8 : 0);
    const b = this.blink ? 1 : 0;
    pose.blinkL = ease(pose.blinkL, b);
    pose.blinkR = ease(pose.blinkR, b);
  }
}
