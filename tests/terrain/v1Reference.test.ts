/**
 * docs/OVERHAUL.md section 7.6 - the face terrain must stay what v1 made.
 *
 * `v1-reference.json` was produced by `npm run make:terrain-ref -- ../fp-v1`,
 * which runs **v1's own code** (5715a98) over every face fixture. This replays
 * the same frames through today's code and requires the same terrain to
 * within EPS, plus the same on-screen position of the nose contour.
 *
 * The second block pins the camera picture to the terrain: the video is drawn
 * in `videoRect`, and every landmark must land on the same pixel whether it
 * goes through the picture or through the terrain mapping.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { rawFaceFromFixture, type FixtureFile } from '../../src/face/fixtureSource.ts';
import { buildFaceTerrain } from '../../src/terrain/build.ts';
import { buildFaceData } from '../../src/terrain/contours.ts';
import { computeViewport, imageToWorld, videoRect, worldToScreen } from '../../src/terrain/mapping.ts';

/** The reference is rounded to 1e-5; anything above that is a real change. */
const EPS = 2e-5;

interface Reference {
  source: string;
  stride: number;
  fixtures: Record<
    string,
    { i: number; center: [number, number]; scale: number; segments: [string, number, number, number, number, number][]; noseScreen: [number, number] | null }[]
  >;
}

const ref = JSON.parse(readFileSync(join(import.meta.dirname, 'v1-reference.json'), 'utf8')) as Reference;
const fixtureDir = join(import.meta.dirname, '..', '..', 'fixtures', 'faces');

describe('terrain matches v1 on every face fixture', () => {
  it('was generated from v1', () => {
    expect(ref.source).toBe('5715a98');
  });

  for (const [name, frames] of Object.entries(ref.fixtures)) {
    it(name, () => {
      const file = JSON.parse(readFileSync(join(fixtureDir, `${name}.json`), 'utf8')) as FixtureFile;
      const cal = defaultCalibration(file.aspect);
      const vp = computeViewport(1600, 900, 16 / 9);
      for (const want of frames) {
        const frame = file.frames[want.i];
        expect(frame).toBeDefined();
        if (frame === undefined) continue;
        const face = buildFaceData(rawFaceFromFixture(file, frame), cal, file.aspect);
        expect(Math.abs(face.center.x - want.center[0])).toBeLessThan(EPS);
        expect(Math.abs(face.center.y - want.center[1])).toBeLessThan(EPS);
        expect(Math.abs(face.scale - want.scale)).toBeLessThan(EPS);

        const segs = buildFaceTerrain({ current: face.points, previous: face.points, bridgeIntact: true, lidLShut: false, lidRShut: false });
        expect(segs.map((s) => s.id)).toEqual(want.segments.map((s) => s[0]));
        segs.forEach((s, k) => {
          const w = want.segments[k];
          if (w === undefined) return;
          expect(Math.abs(s.ax - w[1]) + Math.abs(s.ay - w[2]) + Math.abs(s.bx - w[3]) + Math.abs(s.by - w[4])).toBeLessThan(4 * EPS);
          expect(s.walkable ? 1 : 0).toBe(w[5]);
        });

        const nose = face.points.nose[0];
        if (want.noseScreen !== null && nose !== undefined) {
          const p = worldToScreen(nose, cal, vp);
          expect(Math.abs(p.x - want.noseScreen[0])).toBeLessThan(1e-3);
          expect(Math.abs(p.y - want.noseScreen[1])).toBeLessThan(1e-3);
        }
      }
    });
  }
});

describe('the camera picture sits under the terrain', () => {
  /** Where the stage draws a normalised image point: mirrored, inside videoRect. */
  function viaPicture(p: { x: number; y: number }, videoAspect: number, vp: ReturnType<typeof computeViewport>): { x: number; y: number } {
    const r = videoRect(vp, videoAspect);
    return { x: r.x + (1 - p.x) * r.width, y: r.y + p.y * r.height };
  }

  for (const [label, aspect] of [
    ['16:9 camera', 16 / 9],
    ['4:3 camera (low power)', 4 / 3],
  ] as const) {
    it(label, () => {
      const cal = defaultCalibration(aspect);
      for (const [w, h] of [
        [1600, 900],
        [1280, 1024],
        [700, 900],
      ] as const) {
        const vp = computeViewport(w, h, 16 / 9);
        for (const p of [
          { x: 0.5, y: 0.5 },
          { x: 0.1, y: 0.2 },
          { x: 0.93, y: 0.81 },
        ]) {
          const a = viaPicture(p, aspect, vp);
          const b = worldToScreen(imageToWorld(p, cal, aspect), cal, vp);
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
        }
      }
    });
  }

  it('is the whole viewport for a 16:9 camera, as v1 drew it', () => {
    const vp = computeViewport(1600, 900, 16 / 9);
    expect(videoRect(vp, 16 / 9)).toEqual({ x: vp.offsetX, y: vp.offsetY, width: vp.width, height: vp.height });
  });
});
