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
import { FACE, watcherComposition, watcherStateAt, watcherTotalMs } from '../../src/render/watcher.ts';
import { watcherTokens } from '../../src/render/tokens.ts';
import type { Viewport } from '../../src/terrain/mapping.ts';
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
  it('runs stare, approach, hold and leave, then stops', () => {
    // The stare is the beat the first version was missing: a moment where you
    // can tell something is out there and not yet what it is.
    const total = watcherTotalMs(false);
    const stare = config.watcher.stareMs;

    expect(watcherStateAt(-1, false).phase).toBe('gone');
    expect(watcherStateAt(0, false).phase).toBe('staring');
    expect(watcherStateAt(stare - 10, false).phase).toBe('staring');
    expect(watcherStateAt(stare + 10, false).phase).toBe('approaching');
    expect(watcherStateAt(stare + config.watcher.approachMs + 10, false).phase).toBe('holding');
    expect(watcherStateAt(total - 10, false).phase).toBe('leaving');
    expect(watcherStateAt(total + 1, false).phase).toBe('gone');
  });

  it('shows nothing but the eyes during the stare', () => {
    // Nothing has approached yet, so the face must not be assembled.
    const mid = watcherStateAt(config.watcher.stareMs * 0.5, false);
    expect(mid.phase).toBe('staring');
    expect(mid.approach).toBe(0);
    // It fades the dark in rather than cutting to it.
    expect(mid.alpha).toBeGreaterThan(0);
    expect(mid.alpha).toBeLessThan(1);
  });

  it('comes closer the whole way in, and never jumps', () => {
    // The approach has to be a smooth ramp: a jump in size would be a flash,
    // and flashes are what the photosensitivity rule forbids.
    const stare = config.watcher.stareMs;
    let prev = -1;
    for (let t = stare; t <= stare + config.watcher.approachMs; t += 8) {
      const a = watcherStateAt(t, false).approach;
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(1);
      if (prev >= 0) expect(a - prev).toBeLessThan(0.1);
      prev = a;
    }
    // And it has arrived by the end of the approach.
    expect(watcherStateAt(stare + config.watcher.approachMs, false).approach).toBeCloseTo(1, 6);
  });

  it('screams through the hold, measurably', () => {
    const stare = config.watcher.stareMs;
    const intoHold = stare + config.watcher.approachMs + config.watcher.holdMs * 0.5;
    const st = watcherStateAt(intoHold, false);
    expect(st.phase).toBe('holding');
    expect(st.scream).toBeGreaterThan(0.3);
    expect(st.scream).toBeLessThan(0.7);
  });

  /**
   * This replaces an earlier test that asserted `finalHeightFraction > 1.5`.
   * That test was passing - the value was 2.1 - and the scare was still broken,
   * because "big" is not the property that matters. A head scaled to 2.1x the
   * frame height, centred on the skull's middle, puts the mouth 33px *below*
   * the bottom edge of a 1280x720 viewport: the player watched the climax of
   * the scare as two glowing dots on a black screen. Filling the frame and
   * being *in* the frame are different claims, and only one of them was being
   * checked. So this checks the composition instead, on every shape of screen
   * the game can be opened on.
   */
  describe('the framing', () => {
    const SHAPES: readonly (readonly [string, number, number])[] = [
      ['1920x1080 desktop', 1920, 1080],
      ['1280x720', 1280, 720],
      ['1366x768 laptop', 1366, 768],
      ['2560x1080 ultrawide', 2560, 1080],
      ['820x1180 tablet', 820, 1180],
      ['390x844 phone', 390, 844],
      ['a letterboxed viewport inside a larger canvas', 900, 500],
    ];

    function vpOf(w: number, h: number, offX = 0, offY = 0): Viewport {
      return { offsetX: offX, offsetY: offY, width: w, height: h, aspect: w / h };
    }

    for (const [name, w, h] of SHAPES) {
      it(`keeps the eyes and the whole mouth on screen at ${name}`, () => {
        const c = watcherComposition(vpOf(w, h));

        expect(c.eyesY, 'eyes above the top edge').toBeGreaterThan(0);
        expect(c.eyesY, 'eyes below the bottom edge').toBeLessThan(h);
        expect(c.eyeLeftX).toBeGreaterThan(0);
        expect(c.eyeRightX).toBeLessThan(w);

        // The mouth is the scare. All of it has to be visible, including the
        // bottom row of teeth.
        expect(c.mouthTopY, 'top of the mouth off screen').toBeGreaterThan(0);
        expect(c.mouthBottomY, 'the open jaw hangs off the bottom edge').toBeLessThan(h);
      });
    }

    it('honours a viewport that is offset inside the canvas', () => {
      const c = watcherComposition(vpOf(800, 600, 240, 120));
      expect(c.originX).toBeCloseTo(240 + 400, 6);
      expect(c.mouthBottomY).toBeLessThan(120 + 600);
      expect(c.eyesY).toBeGreaterThan(120);
    });

    it('composes the face the way a close-up is composed', () => {
      const h = 1080;
      const c = watcherComposition(vpOf(1920, h));
      // Eyes in the upper third, mouth in the lower third. This is the shape
      // of every horror close-up ever framed, and it is what was lost.
      expect(c.eyesY / h).toBeGreaterThan(0.1);
      expect(c.eyesY / h).toBeLessThan(0.4);
      expect(c.mouthTopY / h).toBeGreaterThan(0.55);
      expect(c.mouthBottomY / h).toBeLessThan(0.99);
      // Eyes above the mouth, which a sign error would quietly reverse.
      expect(c.eyesY).toBeLessThan(c.mouthTopY);
    });

    it('still gets close enough to crop the head', () => {
      // A scare that stays politely inside the viewport is a portrait. The
      // crown and the chin should both be outside the frame on a normal
      // desktop screen - you are too close to see the whole head.
      const h = 1080;
      const c = watcherComposition(vpOf(1920, h));
      expect(c.headHeightPx).toBeGreaterThan(h);
      expect(c.originY + FACE.crownV * c.headHeightPx, 'the crown is politely in frame').toBeLessThan(0);
      expect(c.originY + FACE.chinV * c.headHeightPx, 'the chin is politely in frame').toBeGreaterThan(h);
    });

    it('is drawn as a lit face, not a black shape on black', () => {
      // The other half of why it looked bad: the skull was filled near-black
      // on a near-black veil, so it had no silhouette at all. The lit end of
      // its ramp has to be genuinely bright against the veil behind it.
      const lum = (c: number): number =>
        (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;
      expect(lum(watcherTokens.litBone)).toBeGreaterThan(0.5);
      expect(lum(watcherTokens.tooth)).toBeGreaterThan(0.75);
      expect(lum(watcherTokens.cavity)).toBeLessThan(0.02);
      // And the teeth have to be the brightest thing in it, because they are
      // what sits against the throat.
      expect(lum(watcherTokens.tooth)).toBeGreaterThan(lum(watcherTokens.litBone));
    });
  });

  it('judders and pulses under the photosensitivity ceiling', () => {
    expect(config.watcher.jawJudderHz).toBeLessThanOrEqual(3);
    expect(config.watcher.eyePulseHz).toBeLessThanOrEqual(3);
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
    const midApproach = config.watcher.stareMs + config.watcher.approachMs * 1.9 * 0.5;
    expect(watcherStateAt(midApproach, true).phase).toBe('approaching');
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
    const soundAt = handler.indexOf('sound.watcherSequence(');
    const startAt = handler.indexOf('this.watcherStartedMs = now');

    expect(guardAt, 'the watcher handler does not check settings.scares').toBeGreaterThan(-1);
    expect(soundAt, 'the shout is not played in the handler').toBeGreaterThan(-1);
    // Both the sound and the visual must come *after* the guard.
    expect(guardAt).toBeLessThan(soundAt);
    expect(guardAt).toBeLessThan(startAt);
  });

  it('the scare sequence exists and is the only thing that plays it', () => {
    // The scream used to be `sound.play('watcherShout')` fired the instant the
    // event arrived - half a second before the face did. It is now a scheduled
    // sequence (heartbeat, drone, whispers, a hole of silence, then the
    // scream) timed to the picture. Still exactly one call site, and that
    // call site is the one behind the Scares-off guard above.
    const src = appCode();
    expect([...src.matchAll(/sound\.watcherSequence\(/g)]).toHaveLength(1);
    expect([...src.matchAll(/sound\.play\('watcherShout'\)/g)]).toHaveLength(0);
  });

  it('the world still fails the tape with scares off - only the scare is skipped', () => {
    // The fail condition is not a scare and must not be opt-out: the world
    // raises it regardless, and the app decides whether anything is shown.
    const { world, watcherEvents } = runToFailure(voidLevel(8));
    expect(world.snapshot().failed).toBe(true);
    expect(watcherEvents).toBe(1);
  });
});
