/**
 * `npm run make:terrain-ref` - snapshots what the terrain pipeline makes of
 * every face fixture, for `tests/terrain/v1Reference.test.ts`.
 *
 * Run it against v1 to (re)create the reference the test holds the current
 * code to (docs/OVERHAUL.md section 7.6):
 *
 *   git worktree add ../fp-v1 5715a98
 *   npm run make:terrain-ref -- ../fp-v1
 *
 * It imports the *given* checkout's own `src/`, so the numbers come from v1's
 * code, not from today's code pretending to be v1.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? process.cwd());
const here = resolve(import.meta.dirname, '..');
const OUT = join(here, 'tests', 'terrain', 'v1-reference.json');
/** Every Nth frame - enough to cover each fixture's motion, small enough to commit. */
const STRIDE = 60;

const mod = async <T>(rel: string): Promise<T> => (await import(pathToFileURL(join(root, 'src', rel)).href)) as T;

interface Vec2 {
  x: number;
  y: number;
}

const { rawFaceFromFixture } = await mod<{ rawFaceFromFixture: (f: unknown, fr: unknown) => unknown }>('face/fixtureSource.ts');
const { defaultCalibration } = await mod<{ defaultCalibration: (aspect: number) => unknown }>('face/calibration.ts');
const { buildFaceData } = await mod<{
  buildFaceData: (face: unknown, cal: unknown, aspect: number) => { points: Record<string, Vec2[]>; center: Vec2; scale: number };
}>('terrain/contours.ts');
const { buildFaceTerrain } = await mod<{
  buildFaceTerrain: (i: unknown) => { id: string; ax: number; ay: number; bx: number; by: number; walkable: boolean }[];
}>('terrain/build.ts');
const { computeViewport, worldToScreen } = await mod<{
  computeViewport: (w: number, h: number, a: number) => unknown;
  worldToScreen: (p: Vec2, cal: unknown, vp: unknown) => Vec2;
}>('terrain/mapping.ts');

const r = (n: number): number => Math.round(n * 1e5) / 1e5;
const fixtureDir = join(here, 'fixtures', 'faces');
const out: Record<string, unknown[]> = {};

for (const name of readdirSync(fixtureDir).filter((n) => n.endsWith('.json')).sort()) {
  const file = JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as { aspect: number; frames: unknown[] };
  const cal = defaultCalibration(file.aspect);
  const vp = computeViewport(1600, 900, 16 / 9);
  const frames: unknown[] = [];
  for (let i = 0; i < file.frames.length; i += STRIDE) {
    const face = buildFaceData(rawFaceFromFixture(file, file.frames[i]), cal, file.aspect);
    const segs = buildFaceTerrain({ current: face.points, previous: face.points, bridgeIntact: true, lidLShut: false, lidRShut: false });
    const nose = face.points['nose']?.[0];
    const screen = nose === undefined ? null : worldToScreen(nose, cal, vp);
    frames.push({
      i,
      center: [r(face.center.x), r(face.center.y)],
      scale: r(face.scale),
      segments: segs.map((s) => [s.id, r(s.ax), r(s.ay), r(s.bx), r(s.by), s.walkable ? 1 : 0]),
      noseScreen: screen === null ? null : [r(screen.x), r(screen.y)],
    });
  }
  out[name.replace(/\.json$/, '')] = frames;
}

writeFileSync(OUT, JSON.stringify({ source: execFileSync('git', ['-C', root, 'rev-parse', '--short', 'HEAD']).toString().trim(), stride: STRIDE, fixtures: out }));
console.log(`wrote ${OUT}`);
