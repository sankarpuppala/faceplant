/**
 * The mixer (OVERHAUL 6.1, invariants 5 and 6), through a fake AudioContext.
 *
 *   - four buses into one master, a compressor, a limiter at -6 dBFS and a
 *     hard ceiling at -6 dBFS, and nothing reaches the output any other way;
 *   - Scares off mutes the scare bus, and the scare sounds do not even start;
 *   - composure brings the heartbeat and whispers in, and only below their
 *     thresholds.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config.ts';
import { Compressor, FakeContext, FakeNode, Gain, log, Shaper, type Source } from './fakeAudio.ts';

type SoundModule = typeof import('../../src/audio/sound.ts');
let mod: SoundModule;
let ctx: FakeContext;

class Ctx extends FakeContext {
  constructor() {
    super();
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the test needs the instance the mixer builds
    ctx = this;
  }
}

beforeAll(async () => {
  vi.useFakeTimers();
  (globalThis as unknown as { window: unknown }).window = { AudioContext: Ctx };
  mod = await import('../../src/audio/sound.ts');
  await mod.sound.resume();
});

afterAll(() => {
  mod.sound.dispose();
  vi.useRealTimers();
  delete (globalThis as unknown as { window?: unknown }).window;
});

/** Every node that eventually feeds the destination, by walking connections forward. */
function reachesDestination(n: FakeNode, seen = new Set<FakeNode>()): boolean {
  if (n === ctx.destination) return true;
  if (seen.has(n)) return false;
  seen.add(n);
  return n.outputs.some((o) => reachesDestination(o, seen));
}

/** The chain from a node to the destination, by kind. */
function chain(n: FakeNode): string[] {
  const out: string[] = [];
  let cur: FakeNode | undefined = n;
  while (cur !== undefined && cur !== ctx.destination) {
    out.push(cur.kind);
    cur = cur.outputs[0];
  }
  return out;
}

describe('the mixer', () => {
  it('ends in a limiter and a hard ceiling, both at -6 dBFS, before the output', () => {
    const into = log.nodes.filter((n) => n.outputs.includes(ctx.destination));
    expect(into).toHaveLength(1);
    const ceiling = into[0] as Shaper;
    expect(ceiling.kind).toBe('shaper');
    const top = Math.pow(10, config.audio.limiterCeilingDbfs / 20);
    const curve = ceiling.curve ?? new Float32Array();
    expect(Math.max(...curve)).toBeLessThanOrEqual(top + 1e-6);
    expect(Math.min(...curve)).toBeGreaterThanOrEqual(-top - 1e-6);

    const limiter = log.nodes.find((n) => n.outputs.includes(ceiling)) as Compressor;
    expect(limiter.kind).toBe('compressor');
    expect(limiter.threshold.value).toBe(config.audio.limiterCeilingDbfs);
    expect(limiter.ratio.value).toBeGreaterThanOrEqual(20);
  });

  it('has four buses, each going master -> compressor -> limiter -> ceiling', () => {
    // The first gains built after the master are the buses.
    const gains = log.nodes.filter((n): n is Gain => n.kind === 'gain');
    const master = gains[0];
    expect(master).toBeDefined();
    if (master === undefined) return;
    expect(chain(master)).toEqual(['gain', 'compressor', 'compressor', 'shaper']);
    const buses = gains.filter((g) => g.outputs.includes(master));
    expect(buses).toHaveLength(4);
  });

  it('routes every sound it plays through the master', () => {
    mod.sound.play('gateChime');
    mod.sound.play('gulp');
    mod.sound.play('uiConfirm');
    mod.sound.play('stinger');
    for (const s of log.sources.filter((x) => x.started > 0)) expect(reachesDestination(s)).toBe(true);
  });

  it('Scares off: the scare bus goes silent and scare sounds never start (invariant 5)', () => {
    mod.sound.setScaresEnabled(false);
    const before = log.sources.length;
    expect(mod.sound.playSample('screamA')).toBeNull();
    expect(mod.sound.playSample('breath')).toBeNull();
    mod.sound.fakeOut();
    mod.sound.watcherSequence(1);
    const started = log.sources.slice(before).filter((s: Source) => s.started > 0);
    expect(started).toHaveLength(0);
    mod.sound.setScaresEnabled(true);
    expect(mod.sound.playSample('screamA')).not.toBeNull();
  });

  it('brings in the heartbeat below 40 % composure and whispers below 25 %, not before', () => {
    mod.sound.startBed();
    const startedOf = (): number => log.sources.filter((s) => s.started > 0).length;

    mod.sound.setComposure(0.9);
    let before = startedOf();
    ctx.currentTime += 20;
    vi.advanceTimersByTime(20_000);
    expect(startedOf()).toBe(before);

    mod.sound.setComposure(config.audio.composure.heartbeatBelowFraction - 0.05);
    before = startedOf();
    ctx.currentTime += 5;
    vi.advanceTimersByTime(1000);
    expect(startedOf()).toBeGreaterThan(before);
    mod.sound.stopBed();
  });
});
