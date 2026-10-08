/**
 * AC-2 — mapping, contours, the Maw and the eyelids.
 *
 * The Maw hysteresis tests are the ones that matter most here. One spurious
 * frame of "open" deletes the upper-lip bridge and drops whoever was standing
 * on it into the player's mouth, so "it must never flicker" is a correctness
 * requirement, not a polish note.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { FixtureFaceSource, type FixtureFile } from '../../src/face/fixtureSource.ts';
import { neutralPose, sampleSyntheticFace } from '../../src/face/syntheticSource.ts';
import { contourNames, type ContourName } from '../../src/face/types.ts';
import { buildContours, buildFaceData, normaliseBlend } from '../../src/terrain/contours.ts';
import { buildFaceTerrain, buildStaticTerrain, cloneContours, lerpContours } from '../../src/terrain/build.ts';
import { EyeDetector, eyePolygon } from '../../src/terrain/eyes.ts';
import {
  MawDetector,
  pointInPolygon,
  polygonArea,
  polygonCentre,
  swallowPolygon,
} from '../../src/terrain/maw.ts';
import {
  computeViewport,
  fhToPx,
  imageToUV,
  imageToWorld,
  screenToWorld,
  uvToImage,
  uvToWorld,
  visibleWorldBounds,
  worldToImage,
  worldToScreen,
  worldToUV,
} from '../../src/terrain/mapping.ts';
import { canWalkOn, classify, slopeDeg } from '../../src/terrain/walkable.ts';

const ASPECT = config.render.aspect;
const CAL = defaultCalibration(ASPECT);
const VP = computeViewport(1600, 900, ASPECT);

describe('coordinate mapping (SPEC 7)', () => {
  it('image to UV and back is an exact round trip', () => {
    for (const p of [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }, { x: 1, y: 1 }, { x: 0.23, y: 0.77 }]) {
      const back = uvToImage(imageToUV(p, ASPECT), ASPECT);
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('UV to world and back is an exact round trip', () => {
    for (const p of [{ x: 0.1, y: 0.2 }, { x: 1.4, y: 0.9 }]) {
      const back = worldToUV(uvToWorld(p, CAL), CAL);
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('image to world and back is an exact round trip', () => {
    for (const p of [{ x: 0.3, y: 0.4 }, { x: 0.9, y: 0.1 }]) {
      const back = worldToImage(imageToWorld(p, CAL, ASPECT), CAL, ASPECT);
      expect(back.x).toBeCloseTo(p.x, 10);
      expect(back.y).toBeCloseTo(p.y, 10);
    }
  });

  it('world to screen and back is an exact round trip', () => {
    for (const p of [{ x: 0, y: 0 }, { x: -1.5, y: 0.8 }, { x: 1.9, y: -1.1 }]) {
      const back = screenToWorld(worldToScreen(p, CAL, VP), CAL, VP);
      expect(back.x).toBeCloseTo(p.x, 8);
      expect(back.y).toBeCloseTo(p.y, 8);
    }
  });

  it('mirrors, so the player left is the screen left', () => {
    // A landmark on the image-right half must land on the world-left.
    const imageRight = imageToWorld({ x: 0.8, y: 0.5 }, CAL, ASPECT);
    expect(imageRight.x).toBeLessThan(0);
  });

  it('the world origin is the calibrated neutral centre', () => {
    const centre = worldToScreen({ x: 0, y: 0 }, CAL, VP);
    expect(centre.x).toBeCloseTo(VP.offsetX + VP.width / 2, 4);
    expect(centre.y).toBeCloseTo(VP.offsetY + VP.height / 2, 4);
  });

  it('a square FH is square on screen', () => {
    const o = worldToScreen({ x: 0, y: 0 }, CAL, VP);
    const right = worldToScreen({ x: 1, y: 0 }, CAL, VP);
    const down = worldToScreen({ x: 0, y: 1 }, CAL, VP);
    expect(right.x - o.x).toBeCloseTo(down.y - o.y, 4);
    expect(fhToPx(CAL, VP)).toBeCloseTo(down.y - o.y, 4);
  });

  it('letterboxes rather than stretching', () => {
    const tall = computeViewport(800, 1200, ASPECT);
    expect(tall.width).toBeCloseTo(800, 4);
    expect(tall.height).toBeCloseTo(800 / ASPECT, 4);
    expect(tall.offsetY).toBeGreaterThan(0);

    const wide = computeViewport(2400, 600, ASPECT);
    expect(wide.height).toBeCloseTo(600, 4);
    expect(wide.offsetX).toBeGreaterThan(0);
  });

  it('reports a visible region wide enough to author levels in', () => {
    const b = visibleWorldBounds(CAL, VP);
    expect(b.minX).toBeLessThan(-2);
    expect(b.maxX).toBeGreaterThan(2);
    expect(b.minY).toBeLessThan(-1.1);
    expect(b.maxY).toBeGreaterThan(1.1);
  });
});

describe('contours (SPEC 6.3)', () => {
  const face = sampleSyntheticFace(neutralPose(), ASPECT);
  const contours = buildContours(face, CAL, ASPECT);

  it('builds every named contour with no NaN', () => {
    for (const name of contourNames) {
      const pts = contours[name];
      expect(pts.length, `${name} is empty`).toBeGreaterThan(1);
      for (const p of pts) {
        expect(Number.isFinite(p.x), `${name} has NaN x`).toBe(true);
        expect(Number.isFinite(p.y), `${name} has NaN y`).toBe(true);
      }
    }
  });

  it('orders the walkable contours left to right', () => {
    const ordered: ContourName[] = ['forehead', 'browL', 'browR', 'lipUpper', 'lipLower', 'jaw'];
    for (const name of ordered) {
      const pts = contours[name];
      const first = pts[0];
      const last = pts[pts.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      if (first !== undefined && last !== undefined) {
        expect(last.x, `${name} is not ordered left to right`).toBeGreaterThan(first.x);
      }
    }
  });

  it('puts browL on the screen left and browR on the screen right', () => {
    // The whole point of mirroring in one place: "left" must mean the player's
    // left, everywhere above `mapping.ts`.
    const l = contours.browL[0];
    const r = contours.browR[0];
    expect(l).toBeDefined();
    expect(r).toBeDefined();
    if (l !== undefined && r !== undefined) expect(l.x).toBeLessThan(r.x);
  });

  it('keeps the nose top-to-bottom, because it is a slide', () => {
    const pts = contours.nose;
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first !== undefined && last !== undefined) expect(last.y).toBeGreaterThan(first.y);
  });

  it('classifies the face the way the game depends on', () => {
    const segs = buildFaceTerrain({
      current: contours,
      previous: cloneContours(contours),
      bridgeIntact: true,
      lidLShut: false,
      lidRShut: false,
    });

    const byContour = (name: ContourName): typeof segs => segs.filter((s) => s.contour === name);

    // The forehead is the main walking surface.
    expect(byContour('forehead').every((s) => canWalkOn(s))).toBe(true);
    // The brows are ledges you can stand on.
    expect(byContour('browL').every((s) => canWalkOn(s))).toBe(true);
    // The jaw is the shelf under the Maw.
    expect(byContour('jaw').every((s) => canWalkOn(s))).toBe(true);
    // The nose and the cheeks are rails: never floors, whatever their geometry.
    for (const name of ['nose', 'cheekL', 'cheekR'] as const) {
      const rails = byContour(name);
      expect(rails.length, `${name} produced no rail segments`).toBeGreaterThan(0);
      expect(rails.every((s) => s.kind === 'rail')).toBe(true);
      expect(rails.every((s) => !s.walkable)).toBe(true);
    }
    expect(classify(segs).nan).toBe(0);
  });

  it('removes the upper-lip bridge when the Maw opens (SPEC 6.4)', () => {
    const shut = buildFaceTerrain({
      current: contours,
      previous: contours,
      bridgeIntact: true,
      lidLShut: false,
      lidRShut: false,
    });
    const open = buildFaceTerrain({
      current: contours,
      previous: contours,
      bridgeIntact: false,
      lidLShut: false,
      lidRShut: false,
    });
    expect(shut.some((s) => s.contour === 'lipUpper')).toBe(true);
    expect(open.some((s) => s.contour === 'lipUpper')).toBe(false);
  });

  it('U5: a shut eyelid becomes terrain, an open one does not', () => {
    const openEyes = buildFaceTerrain({
      current: contours,
      previous: contours,
      bridgeIntact: true,
      lidLShut: false,
      lidRShut: false,
    });
    const shutEyes = buildFaceTerrain({
      current: contours,
      previous: contours,
      bridgeIntact: true,
      lidLShut: true,
      lidRShut: true,
    });
    expect(openEyes.some((s) => s.contour === 'eyeLidL')).toBe(false);
    expect(shutEyes.some((s) => s.contour === 'eyeLidL')).toBe(true);
    expect(shutEyes.some((s) => s.contour === 'eyeLidR')).toBe(true);
  });

  it('slope and normals agree', () => {
    const segs = buildStaticTerrain([{ points: [[-1, 0], [1, 0]] }], []);
    const flat = segs[0];
    expect(flat).toBeDefined();
    if (flat === undefined) return;
    expect(slopeDeg(flat)).toBeCloseTo(0, 6);
    expect(flat.ny).toBeCloseTo(-1, 6);
    expect(flat.walkable).toBe(true);
  });

  it('a wall is solid both ways and not walkable', () => {
    const segs = buildStaticTerrain([], [{ points: [[0, -1], [0, 1]] }]);
    const wall = segs[0];
    expect(wall).toBeDefined();
    if (wall === undefined) return;
    expect(wall.oneWay).toBe(false);
    expect(wall.walkable).toBe(false);
  });

  it('lerpContours interpolates, and snaps when the point count changes', () => {
    const a = cloneContours(contours);
    const b = cloneContours(contours);
    for (const p of b.forehead) p.y += 1;

    const out = cloneContours(contours);
    lerpContours(a, b, 0.5, out);
    const a0 = a.forehead[0];
    const out0 = out.forehead[0];
    expect(a0).toBeDefined();
    expect(out0).toBeDefined();
    if (a0 !== undefined && out0 !== undefined) expect(out0.y).toBeCloseTo(a0.y + 0.5, 6);

    // Tracking blip: different counts must snap to the newer frame.
    const shrunk = cloneContours(contours);
    shrunk.forehead = shrunk.forehead.slice(0, 2);
    lerpContours(a, shrunk, 0.5, out);
    expect(out.forehead).toHaveLength(2);
  });

  it('normaliseBlend maps into the personal range (decision D6)', () => {
    const slackJaw = sampleSyntheticFace({ ...neutralPose(), jawOpen: 0.3 }, ASPECT);
    // A calibration taken on someone whose resting jaw reads 0.3.
    const cal = { ...CAL, jaw: { base: 0.3, wide: 0.9 } };
    expect(normaliseBlend(slackJaw, cal).jawOpen).toBeCloseTo(0, 5);

    const wide = sampleSyntheticFace({ ...neutralPose(), jawOpen: 0.9 }, ASPECT);
    expect(normaliseBlend(wide, cal).jawOpen).toBeCloseTo(1, 5);
  });

  it('buildFaceData reports scale 1 at the calibrated distance', () => {
    const data = buildFaceData(sampleSyntheticFace(neutralPose(), ASPECT), CAL, ASPECT);
    expect(data.scale).toBeGreaterThan(0.85);
    expect(data.scale).toBeLessThan(1.15);

    const leaning = buildFaceData(sampleSyntheticFace({ ...neutralPose(), size: 0.6 }, ASPECT), CAL, ASPECT);
    expect(leaning.scale).toBeGreaterThan(data.scale);
  });
});

describe('the Maw (SPEC 6.4)', () => {
  const STEP = 1000 / 60;

  it('opens past the open threshold and closes below the close threshold', () => {
    const m = new MawDetector();
    for (let i = 0; i < 10; i++) m.update(0.9, STEP);
    expect(m.isOpen).toBe(true);
    for (let i = 0; i < 10; i++) m.update(0, STEP);
    expect(m.isOpen).toBe(false);
  });

  it('never changes state for oscillation inside the hysteresis band', () => {
    // The band is openFraction..closeFraction. A jaw hovering there must not
    // produce a single state change, or the lip bridge would strobe.
    const m = new MawDetector();
    const lo = config.maw.closeFraction + 0.01;
    const hi = config.maw.openFraction - 0.01;
    let changes = 0;
    for (let i = 0; i < 400; i++) {
      const s = m.update(i % 2 === 0 ? lo : hi, STEP);
      if (s.justOpened || s.justClosed) changes++;
    }
    expect(changes).toBe(0);
    expect(m.isOpen).toBe(false);
  });

  it('needs the state to hold for minStateMs before adopting it', () => {
    const m = new MawDetector();
    // A single wide frame, shorter than the minimum, must not open the Maw.
    const s = m.update(1, config.maw.minStateMs / 4);
    expect(s.open).toBe(false);
    // Held long enough, it opens.
    m.update(1, config.maw.minStateMs);
    expect(m.isOpen).toBe(true);
  });

  it('ignores a one-frame tracking spike', () => {
    const m = new MawDetector();
    let changes = 0;
    for (let i = 0; i < 100; i++) {
      // A single frame of garbage every 20 frames, each shorter than minStateMs.
      const v = i % 20 === 0 ? 1 : 0;
      const s = m.update(v, config.maw.minStateMs / 3);
      if (s.justOpened || s.justClosed) changes++;
    }
    expect(changes).toBe(0);
  });

  it('reports justOpened and justClosed exactly once per transition', () => {
    const m = new MawDetector();
    let opened = 0;
    let closed = 0;
    for (let i = 0; i < 30; i++) {
      const s = m.update(1, STEP);
      if (s.justOpened) opened++;
    }
    for (let i = 0; i < 30; i++) {
      const s = m.update(0, STEP);
      if (s.justClosed) closed++;
    }
    expect(opened).toBe(1);
    expect(closed).toBe(1);
  });

  it('U1: a forced yawn opens it regardless of the real jaw', () => {
    const m = new MawDetector();
    const s = m.update(0, STEP, true);
    expect(s.open).toBe(true);
    expect(s.justOpened).toBe(true);
    // And it closes again once the yawn ends.
    for (let i = 0; i < 10; i++) m.update(0, STEP, false);
    expect(m.isOpen).toBe(false);
  });

  it('builds a swallow polygon that contains the mouth centre and nothing far away', () => {
    const open = sampleSyntheticFace({ ...neutralPose(), jawOpen: 1 }, ASPECT);
    const poly = swallowPolygon(buildContours(open, CAL, ASPECT));
    expect(poly.length).toBeGreaterThanOrEqual(3);

    const centre = polygonCentre(poly);
    expect(pointInPolygon(centre, poly)).toBe(true);
    expect(pointInPolygon({ x: centre.x + 5, y: centre.y }, poly)).toBe(false);
    expect(pointInPolygon({ x: centre.x, y: centre.y - 5 }, poly)).toBe(false);
  });

  it('a wide-open mouth has more area than a nearly shut one', () => {
    const areaAt = (jaw: number): number =>
      polygonArea(swallowPolygon(buildContours(sampleSyntheticFace({ ...neutralPose(), jawOpen: jaw }, ASPECT), CAL, ASPECT)));
    expect(areaAt(1)).toBeGreaterThan(areaAt(0.2));
  });

  it('pointInPolygon returns false for a degenerate polygon', () => {
    expect(pointInPolygon({ x: 0, y: 0 }, [])).toBe(false);
    expect(pointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
  });
});

describe('the eyelids (U5)', () => {
  const STEP = 1000 / 60;

  it('shuts past the close threshold and reopens below the open threshold', () => {
    const e = new EyeDetector();
    for (let i = 0; i < 10; i++) e.update(1, 1, STEP);
    expect(e.update(1, 1, STEP).left.shut).toBe(true);
    for (let i = 0; i < 10; i++) e.update(0, 0, STEP);
    expect(e.update(0, 0, STEP).left.shut).toBe(false);
  });

  it('does not flicker inside its hysteresis band', () => {
    const e = new EyeDetector();
    const lo = config.eyes.openFraction + 0.01;
    const hi = config.eyes.closeFraction - 0.01;
    let changes = 0;
    for (let i = 0; i < 300; i++) {
      const s = e.update(i % 2 === 0 ? lo : hi, 0, STEP);
      if (s.left.justShut || s.left.justOpened) changes++;
    }
    expect(changes).toBe(0);
  });

  it('tracks each eye independently, so a wink is a wink', () => {
    const e = new EyeDetector();
    for (let i = 0; i < 10; i++) e.update(1, 0, STEP);
    const s = e.update(1, 0, STEP);
    expect(s.left.shut).toBe(true);
    expect(s.right.shut).toBe(false);
  });

  it('builds an eye polygon that a Wick can be tested against', () => {
    const contours = buildContours(sampleSyntheticFace(neutralPose(), ASPECT), CAL, ASPECT);
    const poly = eyePolygon(contours, 'L');
    expect(poly.length).toBeGreaterThanOrEqual(3);
    expect(pointInPolygon(polygonCentre(poly), poly)).toBe(true);
  });
});

describe('every fixture frame produces clean terrain', () => {
  const dir = join(import.meta.dirname, '..', '..', 'fixtures', 'faces');

  for (const name of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    it(`${name}: no NaN, contours ordered, on every single frame`, () => {
      const file = JSON.parse(readFileSync(join(dir, name), 'utf8')) as FixtureFile;
      const source = new FixtureFaceSource(file, defaultCalibration(file.aspect));
      const maw = new MawDetector();
      let prev = null as ReturnType<typeof buildContours> | null;
      let frames = 0;

      for (let i = 0; i < source.frameCount; i++) {
        const raw = source.rawAt(i);
        const face = raw?.faces[0];
        if (raw === null || face === undefined) continue;

        const contours = buildContours(face, defaultCalibration(raw.aspect), raw.aspect);
        const blend = normaliseBlend(face, defaultCalibration(raw.aspect));
        const m = maw.update(blend.jawOpen, 1000 / 30);

        const segs = buildFaceTerrain({
          current: contours,
          previous: prev ?? contours,
          bridgeIntact: !m.open,
          lidLShut: false,
          lidRShut: false,
        });

        expect(classify(segs).nan, `${name} frame ${i} produced NaN segments`).toBe(0);

        const fh = contours.forehead;
        const f0 = fh[0];
        const fl = fh[fh.length - 1];
        if (f0 !== undefined && fl !== undefined) {
          expect(fl.x, `${name} frame ${i}: forehead out of order`).toBeGreaterThan(f0.x);
        }

        prev = cloneContours(contours);
        frames++;
      }

      expect(frames).toBeGreaterThan(100);
    });
  }
});
