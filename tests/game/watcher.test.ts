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
import { FACE, watcherComposition } from '../../src/render/watcher.ts';
import { lightDied, lungeScale, rollLook, watcherBeatAt, watcherTotalMs, type WatcherBeat } from '../../src/game/watcherBeats.ts';
import { rng } from '../../src/audio/dsp.ts';
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

describe('the Watcher sequence (OVERHAUL 5)', () => {
  const B = config.watcher.beatsMs;
  const beatAt = (ms: number, scares = true): WatcherBeat => watcherBeatAt(ms, scares).beat;

  it('runs the five beats in order, on the brief\'s clock, then ends', () => {
    expect(beatAt(0)).toBe('dying');
    expect(beatAt(B.dyingUntilMs - 1)).toBe('dying');
    expect(beatAt(B.dyingUntilMs + 1)).toBe('behind');
    expect(beatAt(B.behindUntilMs + 1)).toBe('silence');
    expect(beatAt(B.silenceUntilMs + 1)).toBe('lunge');
    expect(beatAt(B.lungeUntilMs + 1)).toBe('tapeDies');
    expect(beatAt(B.endMs + 1)).toBe('done');
    expect([B.dyingUntilMs, B.behindUntilMs, B.silenceUntilMs, B.lungeUntilMs, B.endMs]).toEqual([1200, 2600, 3100, 4400, 6000]);
    expect(watcherTotalMs(true)).toBe(6000);
  });

  it('holds half a second of black and silence before the lunge', () => {
    expect(B.silenceUntilMs - B.behindUntilMs).toBe(500);
  });

  it('puts the light out over the first beat, one flame at a time, and keeps it out', () => {
    let prev = -1;
    for (let ms = 0; ms < B.dyingUntilMs; ms += 50) {
      const d = lightDied(watcherBeatAt(ms, true), true);
      expect(d).toBeGreaterThanOrEqual(prev);
      prev = d;
    }
    expect(lightDied(watcherBeatAt(B.behindUntilMs - 10, true), true)).toBe(1);
  });

  it('lunges from 0.4 to 1.25 of a frame-filling face in 250 ms, overshooting and settling', () => {
    expect(lungeScale(0)).toBeCloseTo(0.4 / 1.25, 2);
    let peak = 0;
    for (let ms = 0; ms <= config.watcher.lungeMs; ms += 5) peak = Math.max(peak, lungeScale(ms));
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.2);
    expect(lungeScale(config.watcher.lungeMs)).toBeCloseTo(1, 6);
    expect(lungeScale(config.watcher.lungeMs + 500)).toBeCloseTo(1, 6);
  });

  it('never changes the face\'s size by more than a fifth of the frame in one 60 fps frame', () => {
    // The brightness limit (< 20 % change per frame) holds for a dark face if
    // its size does not leap: the lit area grows with the square of the scale.
    for (let ms = 0; ms < config.watcher.lungeMs; ms += 16) {
      const a = lungeScale(ms) ** 2;
      const b = lungeScale(ms + 16) ** 2;
      expect(Math.abs(b - a)).toBeLessThan(0.36);
    }
  });

  it('with Scares off, is only the light dying and the fade to black', () => {
    const seen = new Set<WatcherBeat>();
    for (let ms = 0; ms <= watcherTotalMs(false) + 100; ms += 20) seen.add(beatAt(ms, false));
    expect([...seen].sort()).toEqual(['done', 'dying']);
    expect(watcherTotalMs(false)).toBeLessThan(watcherTotalMs(true));
  });

  it('rolls a different look each loss: tilt, mouth, side and eyes', () => {
    const r = rng(7);
    const looks = Array.from({ length: 40 }, () => rollLook(r));
    const [lo, hi] = config.watcher.tiltDeg;
    for (const l of looks) {
      const deg = (Math.abs(l.tiltRad) * 180) / Math.PI;
      expect(deg).toBeGreaterThanOrEqual(lo);
      expect(deg).toBeLessThanOrEqual(hi);
      expect(l.mouthWidthMultiple).toBeGreaterThanOrEqual(config.watcher.mouthWidthMultiple[0]);
      expect(l.mouthWidthMultiple).toBeLessThanOrEqual(config.watcher.mouthWidthMultiple[1]);
      expect(l.eyeSkewFraction).toBeGreaterThan(0);
    }
    expect(new Set(looks.map((l) => l.side)).size).toBe(2);
    expect(new Set(looks.map((l) => Math.sign(l.tiltRad))).size).toBe(2);
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

  it('pulses its eyes well under the photosensitivity ceiling', () => {
    expect(config.watcher.eyePulseHz).toBeLessThanOrEqual(3);
    expect(config.render.effects.watcher.maxFlashHz).toBeLessThanOrEqual(3);
  });

  it('is suppressed by reduced effects in the declared budget', () => {
    // Its shake is the part that must go; the declaration backs that up.
    expect(config.render.reducedEffectsDisables).toContain('watcher');
  });
});

describe('invariant 5: Scares off means the Watcher never shows itself', () => {
  /**
   * `app.ts` is too DOM-bound to drive from a headless test, so the wiring is
   * checked in the source; the behaviour itself - which beats exist with
   * Scares off, and that the sound plays nothing - is tested directly above
   * and in tests/audio/watcherSound.test.ts.
   */
  function code(file: string): string {
    return readFileSync(join(import.meta.dirname, '..', '..', 'src', file), 'utf8');
  }

  it('the sequence is told the Scares setting, in exactly one place', () => {
    const src = code('app.ts');
    const calls = [...src.matchAll(/sound\.watcherSequence\(([^)]*)\)/g)];
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toContain('this.settings.scares');
    expect([...src.matchAll(/sound\.play\('watcherShout'\)/g)]).toHaveLength(0);
  });

  it('the picture is told the Scares setting too', () => {
    expect(code('app.ts')).toContain('scares: this.settings.scares');
    expect(code('render/stage.ts')).toMatch(/this\.watcher\.draw\([^)]*input\.scares\)/);
  });

  it('the world still fails the tape with scares off - only the scare is skipped', () => {
    const { world, watcherEvents } = runToFailure(voidLevel(8));
    expect(world.snapshot().failed).toBe(true);
    expect(watcherEvents).toBe(1);
  });
});
