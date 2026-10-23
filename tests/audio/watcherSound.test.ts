/**
 * THE WATCHER's sound against the beat sheet (OVERHAUL 5) and invariants 5
 * and 6, through a fake AudioContext that records when every source starts
 * and stops.
 *
 * The rendered layers themselves (the scream, the boom, the breath) are
 * measured for peak and attack in samples.test.ts; this checks the timing:
 * the heart first, something behind you, then half a second of nothing at
 * all, then the hit - and with Scares off, none of it.
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

/** The fake context's clock reads 10 s; times below are relative to that. */
const T0 = 10;
const B = config.watcher.beatsMs;
const s = (ms: number): number => ms / 1000;
const FLOOR_S = config.audio.scareMinAttackMs / 1000;
const CEILING = Math.pow(10, config.audio.limiterCeilingDbfs / 20);

function run(scares: boolean, pitch = 1): { at: number; stopAt: number }[] {
  log.reset();
  mod.sound.watcherSequence(pitch, scares);
  return log.sources.filter((x) => x.started > 0).map((x) => ({ at: x.at - T0, stopAt: x.stopAt - T0 }));
}

describe('THE WATCHER sound follows the beat sheet', () => {
  it('starts the heart in the first beat and something behind you in the second', () => {
    const starts = run(true).map((x) => x.at);
    expect(starts.some((a) => a < s(B.dyingUntilMs))).toBe(true);
    expect(starts.some((a) => a >= s(B.dyingUntilMs) && a < s(B.behindUntilMs))).toBe(true);
  });

  it('is silent for the whole of the silence beat: nothing starts, nothing is still playing', () => {
    const srcs = run(true);
    const from = s(B.behindUntilMs);
    const to = s(B.silenceUntilMs);
    for (const x of srcs) {
      expect(x.at >= from && x.at < to - 1e-6, `a sound starts at ${x.at.toFixed(2)} s, inside the silence`).toBe(false);
      if (x.at < from) expect(x.stopAt, 'a sound from before the silence plays into it').toBeLessThanOrEqual(from + 0.05);
    }
  });

  it('hits on the lunge with the layered scream, the boom and the scrape', () => {
    const atHit = run(true).filter((x) => Math.abs(x.at - s(B.silenceUntilMs)) < 0.01);
    expect(atHit.length).toBeGreaterThanOrEqual(4);
  });

  it('stops the tape when the tape dies', () => {
    expect(run(true).some((x) => Math.abs(x.at - s(B.lungeUntilMs)) < 0.01)).toBe(true);
  });

  it('attacks every oscillator layer over the 30 ms floor, under the -6 dBFS ceiling', () => {
    for (const pitch of [0.65, 0.8, 0.9, 1.05, 1.2]) {
      run(true, pitch);
      for (const e of envelopes()) {
        expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
        expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
      }
    }
  });
});

describe('Scares off (invariant 5)', () => {
  it('plays not one scare sound: no heart, no breath, no scream', () => {
    expect(run(false)).toHaveLength(0);
  });

  it('plays only one soft low tone, attacked slowly, under the ceiling', () => {
    run(false);
    const es = envelopes();
    expect(es.length).toBe(1);
    for (const e of es) {
      expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S);
      expect(e.peak).toBeLessThanOrEqual(CEILING);
    }
    expect(log.oscs[0]?.frequency.events[0]?.v ?? 999).toBeLessThan(120);
  });
});

describe('the lone shout', () => {
  it('still plays its layers when something asks for it', () => {
    log.reset();
    mod.sound.play('watcherShout');
    expect(log.sources.filter((x) => x.started > 0).length).toBeGreaterThanOrEqual(4);
  });

  it('plays nothing at all while muted', () => {
    mod.sound.setMuted(true);
    expect(run(true)).toHaveLength(0);
    mod.sound.setMuted(false);
  });
});
