/**
 * The Daily Tape (SPEC section 11.2) and the Long Tape (U4).
 *
 * Determinism is the whole contract: the same day must produce a byte-identical
 * level for everyone, or the shared result line means nothing. So the generator
 * takes nothing but the day number, seeds mulberry32 with it, and never touches
 * Math.random, Date.now or the player's progress.
 * `tests/game/daily.test.ts` asserts byte equality across two generations and
 * inequality across adjacent days.
 *
 * Both generators build on `routes.ts`, the same geometry the hand-authored
 * levels use. They originally carried their own copy of the numbers, and that
 * is exactly how every Daily Tape came to be unplayable while the story levels
 * were fine - the solvability test caught it.
 */

import { config } from '../config.ts';
import { Rng } from '../physics/vec.ts';
import type { HazardSpec, Level, Polyline } from './levelSchema.ts';
import { validateLevel } from './levelSchema.ts';
import { CEILING_Y, gateFor, ledges, ROUTES, ruin, spawnFor, type RouteName } from './routes.ts';

/** Whole days since the configured epoch, UTC, so a timezone cannot shift it. */
export function dayNumber(now: Date = new Date()): number {
  const epoch = Date.parse(`${config.daily.epochDate}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.max(0, Math.floor((today - epoch) / 86_400_000));
}

/**
 * Four templates (SPEC section 11.2). Each is a *shape of problem* rather than a
 * difficulty tier, so consecutive days feel different rather than harder.
 */
export type TemplateName = 'crossing' | 'siege' | 'congaLine' | 'blinkRun';

export const TEMPLATES: readonly TemplateName[] = ['crossing', 'siege', 'congaLine', 'blinkRun'];

/** Which part of the face each template makes you use. */
const TEMPLATE_ROUTE: Record<TemplateName, RouteName> = {
  crossing: 'mouth',
  siege: 'forehead',
  congaLine: 'forehead',
  blinkRun: 'chin',
};

export function generateDaily(day: number): Level {
  const rng = new Rng(day * 2654435761 + 12345);
  const template = TEMPLATES[day % TEMPLATES.length] ?? 'crossing';
  const route = ROUTES[TEMPLATE_ROUTE[template]];

  const fromLeft = rng.next() < 0.5;
  const count = 6 + rng.int(0, 5);
  const intervalMs = 1600 + rng.int(0, 900);
  const timeLimitS = 75 + rng.int(0, 21);

  const ruins: Polyline[] = [...ledges(route)];
  const hazards: HazardSpec[] = [];
  const scares: Level['scares'] = [];
  let dark: Level['dark'] = { startRadiusFh: 99, shrinkFhPerS: 0 };
  let teachesBlink = false;
  let hint = route.blurb;

  const farSide = fromLeft ? 1 : -1;

  switch (template) {
    case 'crossing':
      // Nothing but your upper lip between the lantern and the Gate, plus one
      // Crawler walking the same road.
      hazards.push({ type: 'crawler', x: farSide * 1.3, y: route.y, atMs: 15_000 + rng.int(0, 8000) });
      hint = 'keep the lip shut. the lip is the bridge.';
      break;

    case 'siege':
      // Wax from above: the face has to become an umbrella.
      hazards.push({ type: 'drip', x: -0.3, y: CEILING_Y, atMs: 5000, intervalMs: 2200 + rng.int(0, 900) });
      hazards.push({ type: 'drip', x: 0.3, y: CEILING_Y, atMs: 8000, intervalMs: 2400 + rng.int(0, 900) });
      hazards.push({ type: 'crawler', x: farSide * 1.3, y: route.y, atMs: 22_000 });
      scares.push({ type: 'flicker', atMs: 25_000 + rng.int(0, 15_000) });
      hint = 'tilt. a brow is a roof.';
      break;

    case 'congaLine':
      // Fast spawns and moths: the Procession is the point (U3).
      hazards.push({ type: 'moth', x: rng.range(-0.9, 0.9), y: CEILING_Y, atMs: 17_000 });
      hazards.push({ type: 'moth', x: rng.range(-0.9, 0.9), y: CEILING_Y, atMs: 45_000 });
      hint = 'they come quickly. do not laugh at the queue.';
      break;

    case 'blinkRun':
      // U5 - ruins that stop either side of the eye, so the lid is the crossing.
      teachesBlink = true;
      ruins.push(ruin(-0.95, -0.46, -0.38, -0.46));
      ruins.push(ruin(0.38, -0.46, 0.95, -0.46));
      hazards.push({ type: 'moth', x: 0.8, y: CEILING_Y, atMs: 13_000 });
      dark = { startRadiusFh: 2.7, shrinkFhPerS: 0.006 };
      hint = 'blink, and the lid becomes a bridge.';
      break;
  }

  const level: Level = {
    id: `daily-${day}`,
    tape: 0,
    index: day,
    label: `DAILY #${String(day).padStart(3, '0')}`,
    title: `Tape of day ${day}`,
    timeLimitS,
    spawn: spawnFor(route, fromLeft, count, intervalMs),
    gate: gateFor(route, fromLeft),
    ruins,
    walls: [],
    hazards,
    dark,
    scares,
    lines: [{ atMs: 2200, text: 'a new tape. the same face.' }],
    // Thresholds scale with the roster, and 1 candle stays generous so a bad
    // daily still counts for something.
    candles: { 3: count, 2: Math.max(1, count - 3), 1: Math.max(1, Math.ceil(count / 3)) },
    mode: 'daily',
    hint,
  };
  if (teachesBlink) level.teachesBlink = true;

  validateLevel(level, `daily-${day}`);
  return level;
}

/**
 * U4 - THE LONG TAPE. An arena rather than a puzzle: the forehead route,
 * generous geometry, and a clock long enough that the run ends when you run out
 * of Wicks rather than time. Escalation is `World`'s job (see `doWaves`).
 */
export function generateEndless(): Level {
  const route = ROUTES.forehead;
  const level: Level = {
    id: 'endless',
    tape: 5,
    index: 1,
    label: 'LONG',
    title: 'The Long Tape',
    timeLimitS: 3600,
    spawn: spawnFor(route, true, 9999, 2400),
    gate: gateFor(route, true),
    // Brow-height stones, so the eyebrow flick stays useful all the way through.
    ruins: [...ledges(route), ruin(-0.34, -0.2, -0.05, -0.2), ruin(0.05, -0.2, 0.34, -0.2)],
    walls: [],
    hazards: [],
    dark: { startRadiusFh: 99, shrinkFhPerS: 0 },
    scares: [],
    lines: [{ atMs: 1800, text: 'this tape does not end. we keep walking.' }],
    candles: { 3: 24, 2: 12, 1: 4 },
    mode: 'endless',
    hint: 'it does not end. see how long you can keep a straight face.',
  };
  validateLevel(level, 'endless');
  return level;
}
