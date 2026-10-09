/**
 * THE WATCHER and the fail condition.
 *
 * The scare is the one thing in the game that is *earned* by playing badly, so
 * these tests care about two things: that it actually fires when half the
 * roster is gone, and that it is completely absent with Scares off - because a
 * jump scare that ignores the opt-out is the single worst bug this project
 * could ship (CLAUDE.md invariant 5).
 */

import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { watcherStateAt, watcherTotalMs } from '../../src/render/watcher.ts';
import { parseLevel, type Level } from '../../src/game/levelSchema.ts';
import { World } from '../../src/physics/world.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const STEP = 1000 / config.physics.stepHz;

function level(id: string): Level {
  return parseLevel(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'public', 'levels', `${id}.json`), 'utf8')), id);
}

/**
 * A level with no ground whatsoever: no ruins, and no face is ever delivered,
 * so every Wick that leaves the lantern falls straight into the void.
 *
 * Built here rather than borrowing a shipped level, because a shipped level
 * always has its two ruin ledges - the Wicks land on those and simply mill
 * about, so nothing is ever *lost* and the tape can never fail.
 */
function voidLevel(count: number): Level {
  return {
    ...level('01-1'),
    spawn: { x: 0, y: -1.1, count, intervalMs: 250, dir: 1 },
    ruins: [],
    walls: [],
    hazards: [],
    scares: [],
    lines: [],
    candles: { 3: count, 2: Math.max(1, count - 1), 1: 1 },
  };
}

/** Runs a world with no face at all, so every Wick falls into the void. */
function runToFailure(lvl: Level): { world: World; watcherEvents: number; overAtMs: number } {
  const world = new World({ level: lvl, tunables: defaultTunables(), seed: 3 });
  let watcherEvents = 0;
  let overAtMs = -1;

  for (let t = 0; t <= lvl.timeLimitS * 1000; t += STEP) {
    world.step(STEP);
    for (const e of world.drain()) if (e.kind === 'watcher') watcherEvents++;
    if (world.snapshot().over) {
      overAtMs = world.elapsedMs;
      break;
    }
  }
  return { world, watcherEvents, overAtMs };
}

describe('the fail threshold', () => {
  it('fails a level once more than half the roster is gone', () => {
    const { world, watcherEvents } = runToFailure(voidLevel(8));
    const snap = world.snapshot();

    expect(snap.failed, 'losing everyone did not fail the tape').toBe(true);
    expect(watcherEvents, 'the Watcher was not summoned').toBe(1);
    expect(snap.lost).toBeGreaterThan(Math.floor(snap.spawned * config.rules.failLossFraction));
  });

  it('summons the Watcher exactly once, however much worse it gets', () => {
    const { watcherEvents } = runToFailure(voidLevel(12));
    expect(watcherEvents).toBe(1);
  });

  it('holds the run open after failing, so the scare can land', () => {
    const { world } = runToFailure(voidLevel(8));
    // `over` must not be set the instant the threshold is crossed.
    expect(world.elapsedMs).toBeGreaterThanOrEqual(config.rules.failHoldMs);
    expect(config.rules.failHoldMs).toBeGreaterThan(watcherTotalMs(false) * 0.5);
  });

  it('does not fail a level that is going well', () => {
    const lvl = level('01-1');
    const world = new World({ level: lvl, tunables: defaultTunables(), seed: 3 });
    // No steps at all: nothing lost, nothing failed.
    expect(world.snapshot().failed).toBe(false);
    expect(world.snapshot().lossesRemaining).toBe(Math.floor(lvl.spawn.count * config.rules.failLossFraction));
  });

  it('reports how many may still be lost, so the HUD can warn', () => {
    const lvl = level('03-1');
    const world = new World({ level: lvl, tunables: defaultTunables(), seed: 3 });
    const budget = Math.floor(lvl.spawn.count * config.rules.failLossFraction);
    expect(world.snapshot().lossesRemaining).toBe(budget);

    const falling = new World({ level: voidLevel(lvl.spawn.count), tunables: defaultTunables(), seed: 3 });
    for (let t = 0; t < 20_000; t += STEP) {
      falling.step(STEP);
      falling.drain();
      const s = falling.snapshot();
      if (s.lost > 0 && !s.failed) {
        expect(s.lossesRemaining).toBe(budget - s.lost);
        return;
      }
      if (s.over) break;
    }
    throw new Error('no Wick was ever lost, so lossesRemaining went untested');
  });

  it('the endless mode keeps its own loss budget instead', () => {
    // The Long Tape already had a loss limit; the story fail rule must not
    // short-circuit it, and it reports null rather than a story budget.
    const endless = new World({
      level: { ...level('01-1'), mode: 'endless' },
      tunables: defaultTunables(),
      seed: 3,
      endless: true,
    });
    expect(endless.snapshot().lossesRemaining).toBeNull();
  });
});

describe('the Watcher animation', () => {
  it('runs through approach, hold and leave, then stops', () => {
    const total = watcherTotalMs(false);
    expect(watcherStateAt(-1, false).phase).toBe('gone');
    expect(watcherStateAt(0, false).phase).toBe('approaching');
    expect(watcherStateAt(config.watcher.approachMs + 10, false).phase).toBe('holding');
    expect(watcherStateAt(total - 10, false).phase).toBe('leaving');
    expect(watcherStateAt(total + 1, false).phase).toBe('gone');
  });

  it('comes closer the whole way in, and never jumps', () => {
    // The approach has to be a smooth ramp: a jump in size would be a flash,
    // and flashes are what the photosensitivity rule forbids.
    let prev = -1;
    for (let t = 0; t <= config.watcher.approachMs; t += 8) {
      const a = watcherStateAt(t, false).approach;
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(1);
      if (prev >= 0) expect(a - prev).toBeLessThan(0.1);
      prev = a;
    }
    // And it is exactly arrived at the end of the approach.
    expect(watcherStateAt(config.watcher.approachMs, false).approach).toBeCloseTo(1, 6);
  });

  it('fades out rather than cutting', () => {
    const total = watcherTotalMs(false);
    const nearEnd = watcherStateAt(total - 20, false);
    expect(nearEnd.alpha).toBeGreaterThan(0);
    expect(nearEnd.alpha).toBeLessThan(0.2);
  });

  it('looms more slowly with reduced effects, but still arrives', () => {
    // Reduced effects should take the violence out of it, not the information.
    expect(watcherTotalMs(true)).toBeGreaterThan(watcherTotalMs(false));
    expect(watcherStateAt(config.watcher.approachMs * 1.8 - 10, true).phase).toBe('approaching');
    expect(watcherStateAt(watcherTotalMs(true) * 0.8, true).alpha).toBeGreaterThan(0);
  });

  it('pulses its eyes well under the photosensitivity ceiling', () => {
    expect(config.watcher.eyePulseHz).toBeLessThanOrEqual(3);
    expect(config.render.effects.watcher.maxFlashHz).toBeLessThanOrEqual(3);
  });

  it('is suppressed by reduced effects in the declared budget', () => {
    // Its shake is the part that must go; the declaration backs that up.
    expect(config.render.reducedEffectsDisables).toContain('watcher');
  });
});

describe('invariant 5: Scares off means the Watcher never happens', () => {
  /**
   * The suppression lives in `app.ts`, which is too DOM-bound to drive from a
   * headless test, so this checks the source directly - the same approach the
   * privacy tests take for `getUserMedia`. A jump scare that ignored the
   * opt-out would be the single worst bug this project could ship, so it is
   * worth asserting even in this blunt a way.
   */
  function appCode(): string {
    return readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app.ts'), 'utf8');
  }

  it('the watcher event handler is gated on settings.scares', () => {
    const src = appCode();
    const at = src.indexOf("case 'watcher':");
    expect(at, "no 'watcher' event handler found in app.ts").toBeGreaterThan(-1);

    // The guard must appear inside the handler, before anything is triggered.
    const handler = src.slice(at, at + 600);
    const guardAt = handler.indexOf('this.settings.scares');
    const soundAt = handler.indexOf("sound.play('watcherShout')");
    const startAt = handler.indexOf('this.watcherStartedMs = now');

    expect(guardAt, 'the watcher handler does not check settings.scares').toBeGreaterThan(-1);
    expect(soundAt, 'the shout is not played in the handler').toBeGreaterThan(-1);
    // Both the sound and the visual must come *after* the guard.
    expect(guardAt).toBeLessThan(soundAt);
    expect(guardAt).toBeLessThan(startAt);
  });

  it('the shout exists and is the only thing that plays it', () => {
    const src = appCode();
    const plays = [...src.matchAll(/sound\.play\('watcherShout'\)/g)];
    expect(plays).toHaveLength(1);
  });

  it('the world still fails the tape with scares off - only the scare is skipped', () => {
    // The fail condition is not a scare and must not be opt-out: the world
    // raises it regardless, and the app decides whether anything is shown.
    const { world, watcherEvents } = runToFailure(voidLevel(8));
    expect(world.snapshot().failed).toBe(true);
    expect(watcherEvents).toBe(1);
  });
});
