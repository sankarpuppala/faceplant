/**
 * Level format and validator (SPEC section 9.1).
 *
 * Hand-rolled rather than a schema library: it is one file, it keeps the
 * dependency list at three runtime packages, and the error messages can talk
 * about game concepts ("gate is outside the visible region") instead of JSON
 * paths. Every level file is validated by `tests/game/levels.test.ts`, so a
 * malformed level fails the test run rather than the player's session.
 */

import { config } from '../config.ts';
import { defaultCalibration } from '../face/calibration.ts';
import { computeViewport, visibleWorldBounds } from '../terrain/mapping.ts';

export type Vec2Tuple = [number, number];

export interface Polyline {
  points: Vec2Tuple[];
}

export interface SpawnSpec {
  x: number;
  y: number;
  count: number;
  intervalMs: number;
  /** Initial walking direction: 1 right, -1 left. */
  dir: 1 | -1;
}

export interface GateSpec {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HazardSpec =
  | { type: 'crawler'; x: number; y: number; atMs: number }
  | { type: 'drip'; x: number; y: number; atMs: number; intervalMs: number }
  | { type: 'moth'; x: number; y: number; atMs: number };

export interface DarkSpec {
  startRadiusFh: number;
  shrinkFhPerS: number;
}

export type ScareType = 'flicker' | 'whisper' | 'figure' | 'stinger' | 'behindYou' | 'faceLooksBack';

export interface ScareSpec {
  type: ScareType;
  atMs: number;
}

export interface ScriptedLine {
  atMs: number;
  text: string;
}

export interface CandleThresholds {
  /** Wicks that must be saved for 3, 2 and 1 candle. */
  3: number;
  2: number;
  1: number;
}

export type LevelMode = 'story' | 'daily' | 'endless';

export interface Level {
  id: string;
  tape: number;
  index: number;
  /** Camcorder shorthand, e.g. "T02/3". */
  label: string;
  title: string;
  timeLimitS: number;
  spawn: SpawnSpec;
  gate: GateSpec;
  ruins: Polyline[];
  walls: Polyline[];
  hazards: HazardSpec[];
  dark: DarkSpec;
  scares: ScareSpec[];
  lines: ScriptedLine[];
  candles: CandleThresholds;
  mode: LevelMode;
  /** U5 - set when the level is built around holding your eyes open or blinking. */
  teachesBlink?: boolean;
  /** A one-line hint shown on the level card, in the Wicks' voice. */
  hint?: string;
}

export class LevelError extends Error {}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new LevelError(`${where}: expected a finite number, got ${JSON.stringify(v)}`);
  return v;
}

function int(v: unknown, where: string): number {
  const n = num(v, where);
  if (!Number.isInteger(n)) throw new LevelError(`${where}: expected an integer, got ${n}`);
  return n;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) throw new LevelError(`${where}: expected a non-empty string`);
  return v;
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new LevelError(`${where}: expected an object`);
  return v as Record<string, unknown>;
}

function arr(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) throw new LevelError(`${where}: expected an array`);
  return v;
}

function point(v: unknown, where: string): Vec2Tuple {
  const a = arr(v, where);
  if (a.length !== 2) throw new LevelError(`${where}: expected [x, y]`);
  return [num(a[0], `${where}[0]`), num(a[1], `${where}[1]`)];
}

function polylines(v: unknown, where: string): Polyline[] {
  return arr(v, where).map((raw, i) => {
    const o = obj(raw, `${where}[${i}]`);
    const pts = arr(o.points, `${where}[${i}].points`);
    if (pts.length < 2) throw new LevelError(`${where}[${i}].points: needs at least 2 points`);
    return { points: pts.map((p, j) => point(p, `${where}[${i}].points[${j}]`)) };
  });
}

/**
 * The world rectangle a 16:9 screen shows at the default calibration. Authored
 * coordinates must sit inside it, because a Gate the player cannot see is not a
 * level, it is a bug (SPEC section 9.1).
 */
export function defaultVisibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
  const cal = defaultCalibration();
  const vp = computeViewport(1600, 900, config.render.aspect);
  return visibleWorldBounds(cal, vp);
}

export function parseLevel(raw: unknown, source = 'level'): Level {
  const o = obj(raw, source);

  const spawnO = obj(o.spawn, `${source}.spawn`);
  const dirRaw = int(spawnO.dir, `${source}.spawn.dir`);
  if (dirRaw !== 1 && dirRaw !== -1) throw new LevelError(`${source}.spawn.dir: must be 1 or -1`);

  const gateO = obj(o.gate, `${source}.gate`);
  const darkO = obj(o.dark ?? { startRadiusFh: 99, shrinkFhPerS: 0 }, `${source}.dark`);
  const candlesO = obj(o.candles, `${source}.candles`);

  const modeRaw = o.mode === undefined ? 'story' : str(o.mode, `${source}.mode`);
  if (modeRaw !== 'story' && modeRaw !== 'daily' && modeRaw !== 'endless') {
    throw new LevelError(`${source}.mode: must be story, daily or endless`);
  }

  const level: Level = {
    id: str(o.id, `${source}.id`),
    tape: int(o.tape, `${source}.tape`),
    index: int(o.index, `${source}.index`),
    label: str(o.label, `${source}.label`),
    title: str(o.title, `${source}.title`),
    timeLimitS: num(o.timeLimitS, `${source}.timeLimitS`),
    spawn: {
      x: num(spawnO.x, `${source}.spawn.x`),
      y: num(spawnO.y, `${source}.spawn.y`),
      count: int(spawnO.count, `${source}.spawn.count`),
      intervalMs: num(spawnO.intervalMs, `${source}.spawn.intervalMs`),
      dir: dirRaw,
    },
    gate: {
      x: num(gateO.x, `${source}.gate.x`),
      y: num(gateO.y, `${source}.gate.y`),
      w: num(gateO.w, `${source}.gate.w`),
      h: num(gateO.h, `${source}.gate.h`),
    },
    ruins: polylines(o.ruins ?? [], `${source}.ruins`),
    walls: polylines(o.walls ?? [], `${source}.walls`),
    hazards: arr(o.hazards ?? [], `${source}.hazards`).map((h, i) => parseHazard(h, `${source}.hazards[${i}]`)),
    dark: {
      startRadiusFh: num(darkO.startRadiusFh, `${source}.dark.startRadiusFh`),
      shrinkFhPerS: num(darkO.shrinkFhPerS, `${source}.dark.shrinkFhPerS`),
    },
    scares: arr(o.scares ?? [], `${source}.scares`).map((s, i) => parseScare(s, `${source}.scares[${i}]`)),
    lines: arr(o.lines ?? [], `${source}.lines`).map((l, i) => {
      const lo = obj(l, `${source}.lines[${i}]`);
      return { atMs: num(lo.atMs, `${source}.lines[${i}].atMs`), text: str(lo.text, `${source}.lines[${i}].text`) };
    }),
    candles: {
      3: int(candlesO['3'], `${source}.candles.3`),
      2: int(candlesO['2'], `${source}.candles.2`),
      1: int(candlesO['1'], `${source}.candles.1`),
    },
    mode: modeRaw,
  };

  if (o.teachesBlink !== undefined) level.teachesBlink = o.teachesBlink === true;
  if (o.hint !== undefined) level.hint = str(o.hint, `${source}.hint`);

  validateLevel(level, source);
  return level;
}

function parseHazard(raw: unknown, where: string): HazardSpec {
  const o = obj(raw, where);
  const type = str(o.type, `${where}.type`);
  const x = num(o.x, `${where}.x`);
  const y = num(o.y, `${where}.y`);
  const atMs = num(o.atMs, `${where}.atMs`);
  switch (type) {
    case 'crawler':
      return { type: 'crawler', x, y, atMs };
    case 'moth':
      return { type: 'moth', x, y, atMs };
    case 'drip':
      return { type: 'drip', x, y, atMs, intervalMs: num(o.intervalMs, `${where}.intervalMs`) };
    default:
      throw new LevelError(`${where}.type: unknown hazard "${type}"`);
  }
}

const SCARE_TYPES: readonly ScareType[] = ['flicker', 'whisper', 'figure', 'stinger', 'behindYou', 'faceLooksBack'];

function parseScare(raw: unknown, where: string): ScareSpec {
  const o = obj(raw, where);
  const type = str(o.type, `${where}.type`) as ScareType;
  if (!SCARE_TYPES.includes(type)) throw new LevelError(`${where}.type: unknown scare "${type}"`);
  return { type, atMs: num(o.atMs, `${where}.atMs`) };
}

/** Semantic checks, separate from shape checks so both can be tested. */
export function validateLevel(level: Level, source = 'level'): void {
  const b = defaultVisibleBounds();
  const inside = (x: number, y: number, what: string): void => {
    if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) {
      throw new LevelError(
        `${source}: ${what} at (${x}, ${y}) is outside the visible region ` +
          `(x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}, y ${b.minY.toFixed(2)}..${b.maxY.toFixed(2)})`,
      );
    }
  };

  inside(level.spawn.x, level.spawn.y, 'spawn');
  inside(level.gate.x, level.gate.y, 'gate');
  inside(level.gate.x + level.gate.w, level.gate.y + level.gate.h, 'gate far corner');

  for (const [i, r] of level.ruins.entries()) {
    for (const [j, p] of r.points.entries()) inside(p[0], p[1], `ruins[${i}].points[${j}]`);
  }
  for (const [i, w] of level.walls.entries()) {
    for (const [j, p] of w.points.entries()) inside(p[0], p[1], `walls[${i}].points[${j}]`);
  }
  for (const [i, h] of level.hazards.entries()) inside(h.x, h.y, `hazards[${i}]`);

  if (level.spawn.count < 1) throw new LevelError(`${source}: spawn.count must be at least 1`);
  if (level.timeLimitS <= 0) throw new LevelError(`${source}: timeLimitS must be positive`);
  if (level.gate.w <= 0 || level.gate.h <= 0) throw new LevelError(`${source}: gate must have positive size`);

  const { 1: one, 2: two, 3: three } = level.candles;
  if (!(one <= two && two <= three)) {
    throw new LevelError(`${source}: candle thresholds must be ascending (1 <= 2 <= 3), got ${one}/${two}/${three}`);
  }
  if (three > level.spawn.count) {
    throw new LevelError(`${source}: 3-candle threshold (${three}) exceeds spawn.count (${level.spawn.count})`);
  }

  for (const line of level.lines) {
    if (line.atMs < 0) throw new LevelError(`${source}: a scripted line has a negative atMs`);
  }
  if (level.mode === 'story' && level.scares.some((s) => s.atMs > level.timeLimitS * 1000)) {
    throw new LevelError(`${source}: a scare fires after the time limit, so it can never play`);
  }
}
