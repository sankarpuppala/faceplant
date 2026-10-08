/**
 * AC-4 — fixture simulations. The most important tests in the project.
 *
 * Every fixture is replayed through the **real** terrain builder and the
 * **real** solver, headlessly, for its full length, with 20 Wicks in the arena.
 * Three properties are asserted at every single physics step:
 *
 *   1. **No tunnelling.** No body may cross a walkable surface without being
 *      caught by it. Checked by watching for a body whose position jumps from
 *      above a segment to below it inside its extent.
 *   2. **Conservation.** saved + lost + alive == spawned, always. A Wick cannot
 *      be silently dropped, double-counted or resurrected.
 *   3. **No NaN.** Not in a landmark, not in a contour, not in a segment, not
 *      in a body. One NaN anywhere poisons the whole simulation.
 *
 * The fixtures are synthetic (see `fixtures/faces/README.md`) and deliberately
 * more violent than a real head - `head-jerk` moves the face about 0.9 FH
 * between two tracker frames.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { FixtureFaceSource, type FixtureFile } from '../../src/face/fixtureSource.ts';
import { ReactionDetector } from '../../src/face/reactions.ts';
import { parseLevel } from '../../src/game/levelSchema.ts';
import { World } from '../../src/physics/world.ts';
import { classify } from '../../src/terrain/walkable.ts';
import { rawParam } from '../../src/physics/vec.ts';
import type { Segment } from '../../src/terrain/build.ts';

const FIXTURE_DIR = join(import.meta.dirname, '..', '..', 'fixtures', 'faces');
const ARENA = parseLevel(JSON.parse(readFileSync(join(import.meta.dirname, 'fixture-arena.json'), 'utf8')), 'fixture-arena');

function fixtureFiles(): { name: string; file: FixtureFile }[] {
  return readdirSync(FIXTURE_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => ({ name: n.replace(/\.json$/, ''), file: JSON.parse(readFileSync(join(FIXTURE_DIR, n), 'utf8')) as FixtureFile }));
}

interface Tracked {
  id: number;
  x: number;
  y: number;
}

/**
 * Tunnelling detector.
 *
 * The failure this exists to catch is specific: **a body fell through a surface
 * it should have landed on.** Three conditions have to hold together, and
 * getting any of them wrong makes the test either toothless or a liar.
 *
 *   1. The body was outside the surface at the start of the step, measured
 *      against *that step's* pose of the segment, and is inside it now,
 *      measured against the current pose. Mixing the two frames - comparing an
 *      old position against a new pose - was the first version's bug, and it
 *      reported the head-jerk fixture as tunnelling when nothing was wrong.
 *   2. The crossing happened within the segment's extent, not off its end.
 *   3. **The body moved into the surface**, rather than the surface sweeping
 *      over the body. A face that moves through a stationary Wick is not a
 *      bug; it is decision D3, which exists precisely so a Wick can never end
 *      up trapped inside a face. Only the body's own displacement along the
 *      inward normal counts.
 */
function detectTunnelling(
  prev: Map<number, Tracked>,
  bodies: readonly { id: number; x: number; y: number; r: number; attached: boolean }[],
  segments: readonly Segment[],
): string | null {
  for (const b of bodies) {
    if (b.attached) continue;
    const before = prev.get(b.id);
    if (before === undefined) continue;

    const dx = b.x - before.x;
    const dy = b.y - before.y;
    // A body that barely moved cannot have tunnelled, and skipping those keeps
    // this check affordable at 120 Hz across six fixtures.
    if (Math.hypot(dx, dy) < b.r * 0.5) continue;

    for (const seg of segments) {
      if (!seg.walkable || seg.kind === 'rail') continue;

      // Previous pose normal, recomputed the way the solver does it.
      const pdx = seg.pbx - seg.pax;
      const pdy = seg.pby - seg.pay;
      const plen = Math.hypot(pdx, pdy);
      if (plen <= 1e-9) continue;
      const pnx = pdy / plen;
      const pny = -pdx / plen;

      const d0 = (before.x - seg.pax) * pnx + (before.y - seg.pay) * pny;
      const d1 = (b.x - seg.ax) * seg.nx + (b.y - seg.ay) * seg.ny;
      // Clearly outside, then clearly inside.
      if (!(d0 > b.r && d1 < -b.r)) continue;

      // 3 - the body's own motion has to be what carried it in.
      const intoSurface = dx * -seg.nx + dy * -seg.ny;
      if (intoSurface < b.r) continue;

      const t = rawParam((before.x + b.x) / 2, (before.y + b.y) / 2, seg.ax, seg.ay, seg.bx, seg.by);
      if (t < 0.05 || t > 0.95) continue;

      return `body ${b.id} crossed ${seg.id} from ${d0.toFixed(3)} to ${d1.toFixed(3)} at t=${t.toFixed(2)} without landing`;
    }
  }
  return null;
}

describe('AC-4 fixture simulations', () => {
  const files = fixtureFiles();

  it('has at least the six required fixtures', () => {
    const names = files.map((f) => f.name).sort();
    expect(names).toEqual(['brows', 'head-jerk', 'lean', 'mouth-laugh', 'neutral', 'tilt']);
  });

  for (const { name, file } of files) {
    it(`${name}: no tunnelling, conservation holds, no NaN`, () => {
      const source = new FixtureFaceSource(file, defaultCalibration(file.aspect));
      const reactions = new ReactionDetector();
      const world = new World({
        level: ARENA,
        tunables: defaultTunables(),
        seed: 12345,
        endless: false,
      });

      const stepMs = 1000 / config.physics.stepHz;
      const durationMs = source.durationMs;
      const prev = new Map<number, Tracked>();

      let steps = 0;
      let maxSegments = 0;
      let tunnelReport: string | null = null;

      for (let t = 0; t <= durationMs; t += stepMs) {
        const frame = source.advanceTo(t);
        if (frame !== null) {
          const face = frame.faces[0];
          expect(face).toBeDefined();
          if (face !== undefined) {
            // 3 - no NaN in the contours.
            for (const [cname, pts] of Object.entries(face.points)) {
              for (const p of pts) {
                expect(Number.isFinite(p.x), `${name}: NaN x in ${cname}`).toBe(true);
                expect(Number.isFinite(p.y), `${name}: NaN y in ${cname}`).toBe(true);
              }
            }
            world.setFace(frame);
            reactions.update(face.blend, face.scale, world.faceSpeedFhPerS, t, config.quake.speedFhPerS);
            world.setReactions(reactions.current);
          }
        }

        world.step(stepMs);
        world.drain();
        steps++;

        const snap = world.snapshot();

        // 2 - conservation, at every step.
        expect(
          snap.saved + snap.lost + snap.alive,
          `${name}: conservation broke at ${t.toFixed(0)}ms`,
        ).toBe(snap.spawned);

        // 3 - no NaN in the terrain.
        const stats = classify(world.segments);
        expect(stats.nan, `${name}: ${stats.nan} NaN segments at ${t.toFixed(0)}ms`).toBe(0);
        maxSegments = Math.max(maxSegments, stats.total);

        // 3 - no NaN in any body.
        const bodies = [
          ...world.wicks.map((w) => ({
            id: w.id,
            x: w.body.x,
            y: w.body.y,
            r: w.body.r,
            attached: w.body.groundId !== null || w.body.railId !== null || w.state === 'saved' || w.state === 'lost',
          })),
        ];
        for (const b of bodies) {
          expect(Number.isFinite(b.x), `${name}: NaN body x at ${t.toFixed(0)}ms`).toBe(true);
          expect(Number.isFinite(b.y), `${name}: NaN body y at ${t.toFixed(0)}ms`).toBe(true);
        }

        // 1 - tunnelling.
        if (tunnelReport === null) tunnelReport = detectTunnelling(prev, bodies, world.segments);

        prev.clear();
        for (const b of bodies) prev.set(b.id, { id: b.id, x: b.x, y: b.y });

        if (snap.over) break;
      }

      expect(tunnelReport, `${name}: ${tunnelReport ?? ''}`).toBeNull();

      const final = world.snapshot();
      expect(steps).toBeGreaterThan(100);
      expect(final.spawned).toBeGreaterThan(0);
      expect(maxSegments).toBeGreaterThan(20);
      // And the simulation actually did something, rather than idling.
      expect(final.saved + final.lost).toBeGreaterThan(0);
    });
  }
});

describe('the tunnelling detector has teeth', () => {
  it('flags a body teleported straight through a surface', () => {
    // PLAN.md Day 3 asks for proof the detector can fail. This is that proof,
    // expressed as a test rather than a throwaway edit to the solver.
    const ground: Segment = {
      id: 'probe',
      ax: -1,
      ay: 0,
      bx: 1,
      by: 0,
      pax: -1,
      pay: 0,
      pbx: 1,
      pby: 0,
      nx: 0,
      ny: -1,
      len: 2,
      walkable: true,
      oneWay: true,
      kind: 'face',
      contour: null,
    };

    const prev = new Map<number, Tracked>([[1, { id: 1, x: 0, y: -0.5 }]]);
    const report = detectTunnelling(prev, [{ id: 1, x: 0, y: 0.5, r: 0.035, attached: false }], [ground]);
    expect(report).not.toBeNull();
    expect(report).toContain('without landing');
  });

  it('does not flag a body that stayed on the outside', () => {
    const ground: Segment = {
      id: 'probe',
      ax: -1,
      ay: 0,
      bx: 1,
      by: 0,
      pax: -1,
      pay: 0,
      pbx: 1,
      pby: 0,
      nx: 0,
      ny: -1,
      len: 2,
      walkable: true,
      oneWay: true,
      kind: 'face',
      contour: null,
    };
    const prev = new Map<number, Tracked>([[1, { id: 1, x: 0, y: -0.5 }]]);
    expect(detectTunnelling(prev, [{ id: 1, x: 0, y: -0.2, r: 0.035, attached: false }], [ground])).toBeNull();
  });
});
