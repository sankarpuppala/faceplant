/**
 * A fake Web Audio context for the audio tests: records every gain envelope
 * and every connection, so the mixer's structure and the scare sounds'
 * envelopes can be checked without a browser.
 */

export class Param {
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
  setTargetAtTime(v: number, t: number): this {
    this.events.push({ type: 'target', v, t });
    this.value = v;
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

export class FakeNode {
  readonly kind: string;
  readonly outputs: FakeNode[] = [];
  constructor(kind: string) {
    this.kind = kind;
    log.nodes.push(this);
  }
  connect<T>(n: T): T {
    this.outputs.push(n as unknown as FakeNode);
    return n;
  }
  disconnect(): void {}
}

export class Osc extends FakeNode {
  type = 'sine';
  frequency = new Param();
  detune = new Param();
  at = 0;
  constructor() {
    super('osc');
    log.oscs.push(this);
  }
  start(at = 0): void {
    this.at = at;
  }
  stop(): void {}
}
export class Gain extends FakeNode {
  gain = new Param();
  constructor() {
    super('gain');
    log.gains.push(this.gain);
  }
}
class Filter extends FakeNode {
  type = 'lowpass';
  frequency = new Param();
  Q = new Param();
  constructor() {
    super('filter');
  }
}
export class Shaper extends FakeNode {
  curve: Float32Array | null = null;
  constructor() {
    super('shaper');
  }
}
export class Source extends FakeNode {
  buffer: unknown = null;
  loop = false;
  playbackRate = new Param();
  started = 0;
  /** When it was told to start and stop, on the context clock. */
  at = 0;
  stopAt = Infinity;
  constructor() {
    super('source');
    log.sources.push(this);
  }
  start(at = 0): void {
    this.started++;
    this.at = at;
  }
  stop(at = 0): void {
    this.stopAt = at;
  }
}
class Panner extends FakeNode {
  pan = new Param();
  constructor() {
    super('panner');
  }
}
export class Compressor extends FakeNode {
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  constructor() {
    super('compressor');
  }
}

export const log = {
  gains: [] as Param[],
  nodes: [] as FakeNode[],
  sources: [] as Source[],
  oscs: [] as Osc[],
  reset(): void {
    this.gains.length = 0;
    this.nodes.length = 0;
    this.sources.length = 0;
    this.oscs.length = 0;
  },
};

export class FakeContext {
  currentTime = 10;
  state = 'running';
  sampleRate = 8000;
  destination = new FakeNode('destination');
  createGain = (): Gain => new Gain();
  createOscillator = (): Osc => new Osc();
  createBiquadFilter = (): Filter => new Filter();
  createWaveShaper = (): Shaper => new Shaper();
  createBufferSource = (): Source => new Source();
  createDynamicsCompressor = (): Compressor => new Compressor();
  createStereoPanner = (): Panner => new Panner();
  createBuffer(_c: number, len: number): { length: number; getChannelData: () => Float32Array } {
    const data = new Float32Array(len);
    return { length: len, getChannelData: () => data };
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

/** Each gain that goes 0 -> peak: its attack in seconds and its peak, linear. */
export function envelopes(): { attackS: number; peak: number }[] {
  const out: { attackS: number; peak: number }[] = [];
  for (const g of log.gains) {
    const start = g.events.find((e) => e.type === 'set' && e.v <= 0.0001);
    const rise = g.events.find((e) => e.type === 'lin' && e.v > 0.001);
    if (start !== undefined && rise !== undefined) out.push({ attackS: rise.t - start.t, peak: rise.v });
  }
  return out;
}
