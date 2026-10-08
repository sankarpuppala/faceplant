/**
 * Fixture replay (SPEC sections 6.1, 18 AC-4).
 *
 * A fixture is a recorded landmark stream. It stores **only** the indices the
 * game reads plus the five blendshapes (CLAUDE.md invariant 8), so a fixture
 * file cannot be turned back into a picture of anyone.
 *
 * Fixtures are the backbone of the test suite: the same recorded face is
 * replayed through the real terrain builder and the real solver, headlessly,
 * for its full length, asserting no tunnelling and no lost Wicks.
 */

import { config } from '../config.ts';
import { buildFaceData } from '../terrain/contours.ts';
import { defaultCalibration, type Calibration } from './calibration.ts';
import { FACE_MESH_POINTS, USED_INDICES } from './landmarks.ts';
import type { Blendshapes, FaceFrame, FaceSource, FaceSourceInfo, RawFace, RawFrame, Vec2 } from './types.ts';

export interface FixtureFrame {
  t: number;
  /** Flat [x0, y0, x1, y1, ...] in the order of `indices`. */
  p: number[];
  b: [number, number, number, number, number];
}

export interface FixtureFile {
  name: string;
  /** How the fixture was produced. Synthetic fixtures must say so. */
  origin: 'recorded' | 'synthetic';
  note?: string;
  aspect: number;
  /** Landmark indices each frame carries, in order. */
  indices: number[];
  frames: FixtureFrame[];
}

export const BLEND_ORDER = ['jawOpen', 'smile', 'browUp', 'blinkL', 'blinkR'] as const;

export function blendFromTuple(b: readonly number[]): Blendshapes {
  return {
    jawOpen: b[0] ?? 0,
    smile: b[1] ?? 0,
    browUp: b[2] ?? 0,
    blinkL: b[3] ?? 0,
    blinkR: b[4] ?? 0,
  };
}

/** Expands one fixture frame into a full-length landmark array. */
export function rawFaceFromFixture(file: FixtureFile, frame: FixtureFrame): RawFace {
  const landmarks: Vec2[] = new Array(FACE_MESH_POINTS);
  for (let i = 0; i < FACE_MESH_POINTS; i++) landmarks[i] = { x: 0.5, y: 0.5 };
  for (let k = 0; k < file.indices.length; k++) {
    const idx = file.indices[k];
    if (idx === undefined) continue;
    landmarks[idx] = { x: frame.p[k * 2] ?? 0.5, y: frame.p[k * 2 + 1] ?? 0.5 };
  }
  return { landmarks, blend: blendFromTuple(frame.b) };
}

export function validateFixture(file: FixtureFile): void {
  if (file.frames.length === 0) throw new Error(`fixture ${file.name}: no frames`);
  const want = file.indices.length * 2;
  for (const [i, f] of file.frames.entries()) {
    if (f.p.length !== want) {
      throw new Error(`fixture ${file.name}: frame ${i} has ${f.p.length} coordinates, expected ${want}`);
    }
    if (f.b.length !== 5) throw new Error(`fixture ${file.name}: frame ${i} has ${f.b.length} blendshapes, expected 5`);
  }
  // CLAUDE.md invariant 8: nothing beyond the game's own indices may be stored.
  const used = new Set(USED_INDICES);
  for (const idx of file.indices) {
    if (!used.has(idx)) throw new Error(`fixture ${file.name}: index ${idx} is not one the game reads`);
  }
}

/**
 * Replays a fixture. `advanceTo` is explicit rather than wall-clock driven so a
 * headless test can run a 40-second fixture in a few hundred milliseconds and
 * still see exactly the frame boundaries the recording had.
 */
export class FixtureFaceSource implements FaceSource {
  private i = 0;
  private frame: FaceFrame | null = null;
  private cal: Calibration;

  private readonly file: FixtureFile;

  constructor(file: FixtureFile, cal?: Calibration) {
    validateFixture(file);
    this.file = file;
    this.cal = cal ?? defaultCalibration(file.aspect);
  }

  setCalibration(cal: Calibration): void {
    this.cal = cal;
  }

  get calibration(): Calibration {
    return this.cal;
  }

  get durationMs(): number {
    const first = this.file.frames[0];
    const last = this.file.frames[this.file.frames.length - 1];
    if (first === undefined || last === undefined) return 0;
    return last.t - first.t;
  }

  get frameCount(): number {
    return this.file.frames.length;
  }

  async start(): Promise<void> {
    this.i = 0;
  }

  stop(): void {}

  /** The raw frame at an index, for calibration and for contour tests. */
  rawAt(i: number): RawFrame | null {
    const f = this.file.frames[i];
    if (f === undefined) return null;
    return { t: f.t, faces: [rawFaceFromFixture(this.file, f)], aspect: this.file.aspect };
  }

  /**
   * Advances to the newest frame at or before `tMs`. Returns the frame if it
   * changed, so the caller knows when to push a new face into the world.
   */
  advanceTo(tMs: number): FaceFrame | null {
    const start = this.file.frames[0];
    if (start === undefined) return null;

    let changed = false;
    while (this.i + 1 < this.file.frames.length) {
      const next = this.file.frames[this.i + 1];
      if (next === undefined || next.t - start.t > tMs) break;
      this.i++;
      changed = true;
    }
    if (this.frame !== null && !changed) return null;

    const f = this.file.frames[this.i];
    if (f === undefined) return null;
    const raw = rawFaceFromFixture(this.file, f);
    this.frame = { t: f.t - start.t, faces: [buildFaceData(raw, this.cal, this.file.aspect)] };
    return this.frame;
  }

  latest(): FaceFrame | null {
    return this.frame;
  }

  info(): FaceSourceInfo {
    return { kind: 'fixture', trackingHz: 30, video: null, aspect: this.file.aspect };
  }
}

/** Writes the recording side: packs a raw frame down to the stored indices. */
export function packFixtureFrame(t: number, face: RawFace): FixtureFrame {
  const p: number[] = [];
  for (const idx of USED_INDICES) {
    const lm = face.landmarks[idx];
    p.push(lm?.x ?? 0.5, lm?.y ?? 0.5);
  }
  return {
    t,
    p,
    b: [face.blend.jawOpen, face.blend.smile, face.blend.browUp, face.blend.blinkL, face.blend.blinkR],
  };
}

export function newFixtureFile(name: string, origin: FixtureFile['origin'], note?: string): FixtureFile {
  const file: FixtureFile = {
    name,
    origin,
    aspect: config.render.aspect,
    indices: [...USED_INDICES],
    frames: [],
  };
  if (note !== undefined) file.note = note;
  return file;
}
