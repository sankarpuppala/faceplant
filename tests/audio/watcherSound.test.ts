/**
 * THE WATCHER's audio, driven through a fake AudioContext.
 *
 * Invariant 6: master output through a limiter, no sound above -6 dBFS peak,
 * and scare sounds attack no faster than 30 ms. The old single shout met it by
 * being one sound with a hand-checked gain. The new sequence is a dozen layers
 * - heartbeat, drone, whispers, three throats, a wail, a choir, a sub hit -
 * and "I checked them" does not scale to a dozen. So this records every gain
 * envelope the sequence creates and checks each one.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';

import { envelopes, FakeContext, log } from './fakeAudio.ts';

type SoundModule = typeof import('../../src/audio/sound.ts');
let mod: SoundModule;

beforeAll(async () => {
  (globalThis as unknown as { window: unknown }).window = { AudioContext: FakeContext };
  mod = await import('../../src/audio/sound.ts');
  await mod.sound.resume();
});

afterAll(() => {
  mod.sound.dispose();
  delete (globalThis as unknown as { window?: unknown }).window;
});

const FLOOR_S = config.audio.scareMinAttackMs / 1000;
const CEILING = Math.pow(10, config.audio.limiterCeilingDbfs / 20);

describe('THE WATCHER sound honours invariant 6', () => {
  it('records a real, layered sequence to check (the test itself is not vacuous)', () => {
    log.reset();
    mod.sound.watcherSequence(1120, 1);
    expect(envelopes().length).toBeGreaterThanOrEqual(12);
  });

  it('attacks no layer faster than the 30 ms floor', () => {
    log.reset();
    mod.sound.watcherSequence(1120, 1);
    for (const e of envelopes()) expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
  });

  it('keeps every individual layer under the -6 dBFS ceiling', () => {
    log.reset();
    mod.sound.watcherSequence(1120, 1);
    for (const e of envelopes()) expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
  });

  it('holds across all five faces, which scream in different registers', () => {
    for (const pitch of [0.65, 0.8, 0.9, 1.05, 1.2]) {
      log.reset();
      mod.sound.watcherSequence(1120, pitch);
      for (const e of envelopes()) {
        expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
        expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
      }
    }
  });

  it('holds with Reduce effects, whose longer approach stretches the rise', () => {
    log.reset();
    mod.sound.watcherSequence(500 + 620 * 1.9, 1);
    for (const e of envelopes()) {
      expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
      expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
    }
  });

  it('exports the attack the layers use, past the floor', () => {
    expect(mod.WATCHER_ATTACK_S).toBeGreaterThanOrEqual(FLOOR_S);
  });

  it('still plays the lone shout, for anything that asks for it, under the same rules', () => {
    log.reset();
    mod.sound.play('watcherShout');
    // The scream's layers are rendered samples (measured in samples.test.ts);
    // the oscillator layer beside them is held to the same envelope rules.
    expect(log.sources.filter((s) => s.started > 0).length).toBeGreaterThanOrEqual(5);
    for (const e of envelopes()) {
      expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
      expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
    }
  });

  it('plays nothing at all while muted', () => {
    log.reset();
    mod.sound.setMuted(true);
    mod.sound.watcherSequence(1120, 1);
    mod.sound.setMuted(false);
    expect(envelopes()).toHaveLength(0);
  });
});
