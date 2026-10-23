/**
 * A small offline DSP kit: everything the game's sounds are made from.
 *
 * Every sound in FACEPLANT is rendered once, in plain JavaScript, into a
 * Float32Array - no audio files, nothing to licence, nothing fetched. Doing it
 * in JS rather than with Web Audio nodes means the result is deterministic and
 * can be measured in a unit test: its peak, its loudness and its attack
 * (`tests/audio/samples.test.ts`, CLAUDE.md invariant 6).
 *
 * Conventions: mono, `rate` samples per second, amplitude -1..1.
 */

export type Signal = Float32Array;

/** A small deterministic generator, so a sound is the same every time it is rendered. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

export function silence(rate: number, seconds: number): Signal {
  return new Float32Array(Math.max(1, Math.round(rate * seconds)));
}

export function white(rate: number, seconds: number, seed: number): Signal {
  const r = rng(seed);
  const out = silence(rate, seconds);
  for (let i = 0; i < out.length; i++) out[i] = r() * 2 - 1;
  return out;
}

/** Brown-ish noise: integrated white, leaking back to centre. Rumble, wind, breath. */
export function brown(rate: number, seconds: number, seed: number): Signal {
  const r = rng(seed);
  const out = silence(rate, seconds);
  let y = 0;
  for (let i = 0; i < out.length; i++) {
    y = y * 0.995 + (r() * 2 - 1) * 0.06;
    out[i] = y;
  }
  return out;
}

// ------------------------------------------------------------------ filters

type BiquadKind = 'lowpass' | 'highpass' | 'bandpass' | 'peak' | 'highshelf';

/**
 * RBJ cookbook biquad, applied in place. `hz` may be a function of time (in
 * seconds) for sweeps; it is re-evaluated every 32 samples.
 */
export function biquad(x: Signal, rate: number, kind: BiquadKind, hz: number | ((t: number) => number), q = 0.707, gainDb = 0): Signal {
  let b0 = 1;
  let b1 = 0;
  let b2 = 0;
  let a1 = 0;
  let a2 = 0;
  const design = (f: number): void => {
    const w = (2 * Math.PI * Math.min(rate * 0.49, Math.max(10, f))) / rate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let n0 = 1;
    let n1 = 0;
    let n2 = 0;
    let d0 = 1;
    let d1 = 0;
    let d2 = 0;
    switch (kind) {
      case 'lowpass':
        n0 = (1 - cos) / 2;
        n1 = 1 - cos;
        n2 = (1 - cos) / 2;
        d0 = 1 + alpha;
        d1 = -2 * cos;
        d2 = 1 - alpha;
        break;
      case 'highpass':
        n0 = (1 + cos) / 2;
        n1 = -(1 + cos);
        n2 = (1 + cos) / 2;
        d0 = 1 + alpha;
        d1 = -2 * cos;
        d2 = 1 - alpha;
        break;
      case 'bandpass':
        n0 = alpha;
        n1 = 0;
        n2 = -alpha;
        d0 = 1 + alpha;
        d1 = -2 * cos;
        d2 = 1 - alpha;
        break;
      case 'peak':
        n0 = 1 + alpha * A;
        n1 = -2 * cos;
        n2 = 1 - alpha * A;
        d0 = 1 + alpha / A;
        d1 = -2 * cos;
        d2 = 1 - alpha / A;
        break;
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * alpha;
        n0 = A * (A + 1 + (A - 1) * cos + s);
        n1 = -2 * A * (A - 1 + (A + 1) * cos);
        n2 = A * (A + 1 + (A - 1) * cos - s);
        d0 = A + 1 - (A - 1) * cos + s;
        d1 = 2 * (A - 1 - (A + 1) * cos);
        d2 = A + 1 - (A - 1) * cos - s;
        break;
      }
    }
    b0 = n0 / d0;
    b1 = n1 / d0;
    b2 = n2 / d0;
    a1 = d1 / d0;
    a2 = d2 / d0;
  };
  const fixed = typeof hz === 'number';
  design(fixed ? hz : hz(0));
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (!fixed && i % 32 === 0) design(hz(i / rate));
    const xi = x[i] ?? 0;
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
  return x;
}

// -------------------------------------------------------------- oscillators

export type Wave = 'sine' | 'saw' | 'square' | 'triangle';

/** An oscillator whose frequency may follow a curve over time. */
export function osc(rate: number, seconds: number, wave: Wave, hz: number | ((t: number) => number), phase0 = 0): Signal {
  const out = silence(rate, seconds);
  let phase = phase0;
  for (let i = 0; i < out.length; i++) {
    const f = typeof hz === 'number' ? hz : hz(i / rate);
    phase += f / rate;
    phase -= Math.floor(phase);
    switch (wave) {
      case 'sine':
        out[i] = Math.sin(phase * 2 * Math.PI);
        break;
      case 'saw':
        out[i] = phase * 2 - 1;
        break;
      case 'square':
        out[i] = phase < 0.5 ? 1 : -1;
        break;
      case 'triangle':
        out[i] = phase < 0.5 ? phase * 4 - 1 : 3 - phase * 4;
        break;
    }
  }
  return out;
}

// ---------------------------------------------------------------- envelopes

/**
 * Attack, hold, then an exponential-ish decay to silence at the end. Times in
 * seconds. The attack is a raised-cosine ramp, so even a short one has no
 * corner - and a scare sound's attack is never under 30 ms (invariant 6).
 */
export function envelope(x: Signal, rate: number, attackS: number, holdS: number, releaseS: number, delayS = 0): Signal {
  const a = Math.max(1, attackS * rate);
  const d = delayS * rate;
  const h = holdS * rate;
  const r = Math.max(1, releaseS * rate);
  for (let i = 0; i < x.length; i++) {
    const t = i - d;
    let g: number;
    if (t < 0) g = 0;
    else if (t < a) g = 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
    else if (t < a + h) g = 1;
    else if (t < a + h + r) {
      const u = (t - a - h) / r;
      g = Math.pow(1 - u, 3);
    } else g = 0;
    x[i] = (x[i] ?? 0) * g;
  }
  return x;
}

/** Multiplies by a gain curve over time. */
export function shape(x: Signal, rate: number, gain: (t: number) => number): Signal {
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * gain(i / rate);
  return x;
}

/** Fades both ends, so a one-shot never starts or stops on a click. */
export function fadeEnds(x: Signal, rate: number, ms = 4): Signal {
  const n = Math.min(Math.floor(x.length / 2), Math.round((rate * ms) / 1000));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    x[i] = (x[i] ?? 0) * g;
    x[x.length - 1 - i] = (x[x.length - 1 - i] ?? 0) * g;
  }
  return x;
}

// ------------------------------------------------------------------ editing

/** Adds `src` into `dst` at `atS` seconds, scaled by `gain`. */
export function mixInto(dst: Signal, src: Signal, rate: number, atS = 0, gain = 1): Signal {
  const at = Math.round(atS * rate);
  for (let i = 0; i < src.length; i++) {
    const j = at + i;
    if (j < 0 || j >= dst.length) continue;
    dst[j] = (dst[j] ?? 0) + (src[i] ?? 0) * gain;
  }
  return dst;
}

export function reverse(x: Signal): Signal {
  return x.slice().reverse();
}

/** Plays a signal faster (>1) or slower (<1): pitch and length together, like tape. */
export function resample(x: Signal, speed: number | ((t: number) => number), rate: number, maxSeconds = 60): Signal {
  const cap = Math.round(rate * maxSeconds);
  let out = new Float32Array(Math.min(cap, x.length * 2 + 16));
  let pos = 0;
  let n = 0;
  while (pos < x.length - 1 && n < cap) {
    if (n === out.length) {
      const grown = new Float32Array(Math.min(cap, out.length * 2));
      grown.set(out);
      out = grown;
    }
    const i = Math.floor(pos);
    const f = pos - i;
    out[n] = (x[i] ?? 0) * (1 - f) + (x[i + 1] ?? 0) * f;
    n++;
    const s = typeof speed === 'number' ? speed : speed(n / rate);
    pos += Math.max(0.01, s);
  }
  return out.slice(0, n);
}

/** Soft saturation, for grit. */
export function saturate(x: Signal, drive: number): Signal {
  const norm = Math.tanh(drive);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh((x[i] ?? 0) * drive) / norm;
  return x;
}

/**
 * Makes a loop seamless: crossfades the last `fadeS` seconds into the start,
 * then trims them, so the end flows into the beginning.
 */
export function makeLoop(x: Signal, rate: number, fadeS: number): Signal {
  const n = Math.min(Math.floor(x.length / 3), Math.round(fadeS * rate));
  const out = x.slice(0, x.length - n);
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i] = (out[i] ?? 0) * g + (x[x.length - n + i] ?? 0) * (1 - g);
  }
  return out;
}

// --------------------------------------------------------------- measuring

export function peak(x: Signal): number {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i] ?? 0));
  return m;
}

export function toDb(linear: number): number {
  return 20 * Math.log10(Math.max(1e-9, linear));
}

export function fromDb(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Integrated loudness, LUFS, after ITU-R BS.1770: K-weighting (a high shelf
 * and a high-pass), 400 ms blocks with 75 % overlap, the absolute gate at
 * -70 LUFS and the relative gate 10 LU below.
 */
export function loudness(x: Signal, rate: number): number {
  const k = biquad(biquad(x.slice(), rate, 'highshelf', 1681, 0.707, 4), rate, 'highpass', 38, 0.5);
  const block = Math.round(rate * 0.4);
  const hop = Math.round(block / 4);
  const blocks: number[] = [];
  if (k.length < block) {
    let s = 0;
    for (let i = 0; i < k.length; i++) s += (k[i] ?? 0) ** 2;
    blocks.push(s / Math.max(1, k.length));
  } else {
    for (let start = 0; start + block <= k.length; start += hop) {
      let s = 0;
      for (let i = start; i < start + block; i++) s += (k[i] ?? 0) ** 2;
      blocks.push(s / block);
    }
  }
  const lufs = (ms: number): number => -0.691 + 10 * Math.log10(Math.max(1e-12, ms));
  const abs = blocks.filter((b) => lufs(b) > -70);
  if (abs.length === 0) return -70;
  const mean = abs.reduce((a, b) => a + b, 0) / abs.length;
  const rel = abs.filter((b) => lufs(b) > lufs(mean) - 10);
  const gated = rel.length === 0 ? mean : rel.reduce((a, b) => a + b, 0) / rel.length;
  return lufs(gated);
}

/**
 * Normalises to `lufs` (OVERHAUL 6.1: -14 LUFS) unless that would push the
 * peak over `peakDbfs`, in which case the peak wins. Short transients - a
 * click, a thump - end up quieter than -14 LUFS, never louder than the ceiling.
 */
export function normalise(x: Signal, rate: number, lufs: number, peakDbfs: number): Signal {
  const l = loudness(x, rate);
  const p = peak(x);
  if (p <= 0) return x;
  const byLoudness = l <= -69 ? Infinity : fromDb(lufs - l);
  const byPeak = fromDb(peakDbfs) / p;
  const g = Math.min(byLoudness, byPeak);
  for (let i = 0; i < x.length; i++) x[i] = (x[i] ?? 0) * g;
  return x;
}

/**
 * The attack: from the first moment the 5 ms envelope passes 2 % of its
 * maximum to the moment it reaches 90 %. Invariant 6 holds every scare sound
 * to 30 ms or more.
 */
export function attackMs(x: Signal, rate: number): number {
  const win = Math.max(1, Math.round(rate * 0.005));
  const env: number[] = [];
  for (let s = 0; s < x.length; s += win) {
    let m = 0;
    for (let i = s; i < Math.min(x.length, s + win); i++) m = Math.max(m, Math.abs(x[i] ?? 0));
    env.push(m);
  }
  const max = Math.max(...env);
  if (max <= 0) return Infinity;
  const start = env.findIndex((e) => e >= max * 0.02);
  const top = env.findIndex((e) => e >= max * 0.9);
  return ((top - start) * win * 1000) / rate;
}
