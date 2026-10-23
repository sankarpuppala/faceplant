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

class Param {
  value = 0;
  events: { type: string; v: number; t: number }[] = [];
  setValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'set', v, t });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'lin', v, t });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.events.push({ type: 'exp', v, t });
    return this;
  }
  setTargetAtTime(): this {
    return this;
  }
}
class Node {
  connect<T>(n: T): T {
    return n;
  }
  disconnect(): void {}
}
class Osc extends Node {
  type = 'sine';
  frequency = new Param();
  detune = new Param();
  start(): void {}
  stop(): void {}
}
const gains: Param[] = [];
class Gain extends Node {
  gain = new Param();
  constructor() {
    super();
    gains.push(this.gain);
  }
}
class Filter extends Node {
  type = 'lowpass';
  frequency = new Param();
  Q = new Param();
}
class Shaper extends Node {
  curve: unknown = null;
}
class Source extends Node {
  buffer: unknown = null;
  loop = false;
  start(): void {}
  stop(): void {}
}
class Compressor extends Node {
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
}
class FakeContext {
  currentTime = 10;
  state = 'running';
  sampleRate = 8000;
  destination = new Node();
  createGain = (): Gain => new Gain();
  createOscillator = (): Osc => new Osc();
  createBiquadFilter = (): Filter => new Filter();
  createWaveShaper = (): Shaper => new Shaper();
  createBufferSource = (): Source => new Source();
  createDynamicsCompressor = (): Compressor => new Compressor();
  createBuffer(_c: number, len: number): { getChannelData: () => Float32Array } {
    return { getChannelData: () => new Float32Array(len) };
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

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

/** Each gain that goes 0 -> peak: its attack in seconds and its peak, linear. */
function envelopes(): { attackS: number; peak: number }[] {
  const out: { attackS: number; peak: number }[] = [];
  for (const g of gains) {
    const start = g.events.find((e) => e.type === 'set' && e.v <= 0.0001);
    const rise = g.events.find((e) => e.type === 'lin' && e.v > 0.001);
    if (start !== undefined && rise !== undefined) out.push({ attackS: rise.t - start.t, peak: rise.v });
  }
  return out;
}

const FLOOR_S = config.audio.scareMinAttackMs / 1000;
const CEILING = Math.pow(10, config.audio.limiterCeilingDbfs / 20);

describe('THE WATCHER sound honours invariant 6', () => {
  it('records a real, layered sequence to check (the test itself is not vacuous)', () => {
    gains.length = 0;
    mod.sound.watcherSequence(1120, 1);
    expect(envelopes().length).toBeGreaterThanOrEqual(12);
  });

  it('attacks no layer faster than the 30 ms floor', () => {
    gains.length = 0;
    mod.sound.watcherSequence(1120, 1);
    for (const e of envelopes()) expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
  });

  it('keeps every individual layer under the -6 dBFS ceiling', () => {
    gains.length = 0;
    mod.sound.watcherSequence(1120, 1);
    for (const e of envelopes()) expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
  });

  it('holds across all five faces, which scream in different registers', () => {
    for (const pitch of [0.65, 0.8, 0.9, 1.05, 1.2]) {
      gains.length = 0;
      mod.sound.watcherSequence(1120, pitch);
      for (const e of envelopes()) {
        expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
        expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
      }
    }
  });

  it('holds with Reduce effects, whose longer approach stretches the rise', () => {
    gains.length = 0;
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
    gains.length = 0;
    mod.sound.play('watcherShout');
    const es = envelopes();
    expect(es.length).toBeGreaterThan(4);
    for (const e of es) {
      expect(e.attackS).toBeGreaterThanOrEqual(FLOOR_S - 1e-9);
      expect(e.peak).toBeLessThanOrEqual(CEILING + 1e-9);
    }
  });

  it('plays nothing at all while muted', () => {
    gains.length = 0;
    mod.sound.setMuted(true);
    mod.sound.watcherSequence(1120, 1);
    mod.sound.setMuted(false);
    expect(envelopes()).toHaveLength(0);
  });
});
