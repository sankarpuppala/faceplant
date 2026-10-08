/**
 * One Euro filter (SPEC section 6.2). Casiez, Roussel & Vogel, CHI 2012.
 *
 * Adaptive low-pass: it smooths hard when the signal is slow (so a still face
 * stops shimmering) and barely at all when the signal is fast (so a real head
 * turn is not laggy). That trade is exactly what face terrain needs - jitter
 * reads as the ground shaking under the Wicks.
 */

import { config } from '../config.ts';

/** Smoothing factor for a cutoff frequency at a given sample rate. */
export function alphaFor(cutoffHz: number, dtS: number): number {
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtS);
}

class LowPass {
  private y = 0;
  private initialised = false;

  filter(x: number, alpha: number): number {
    if (!this.initialised) {
      this.y = x;
      this.initialised = true;
      return x;
    }
    this.y = alpha * x + (1 - alpha) * this.y;
    return this.y;
  }

  get value(): number {
    return this.y;
  }

  get ready(): boolean {
    return this.initialised;
  }

  reset(): void {
    this.initialised = false;
    this.y = 0;
  }
}

export interface OneEuroOptions {
  minCutoffHz: number;
  beta: number;
  dCutoffHz: number;
}

export class OneEuroFilter {
  private readonly x = new LowPass();
  private readonly dx = new LowPass();
  private lastRaw = 0;
  private hasLast = false;

  private readonly opts: OneEuroOptions;

  constructor(opts: OneEuroOptions) {
    this.opts = opts;
  }

  filter(value: number, dtS: number): number {
    if (!Number.isFinite(value)) return this.x.ready ? this.x.value : 0;
    if (dtS <= 0) return this.x.ready ? this.x.value : value;

    const rawDerivative = this.hasLast ? (value - this.lastRaw) / dtS : 0;
    this.lastRaw = value;
    this.hasLast = true;

    const edx = this.dx.filter(rawDerivative, alphaFor(this.opts.dCutoffHz, dtS));
    const cutoff = this.opts.minCutoffHz + this.opts.beta * Math.abs(edx);
    return this.x.filter(value, alphaFor(cutoff, dtS));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.hasLast = false;
  }
}

/**
 * One filter pair per landmark, created lazily. Landmark count is fixed by the
 * model, so this allocates once and then runs allocation-free.
 */
export class LandmarkSmoother {
  private fx: OneEuroFilter[] = [];
  private fy: OneEuroFilter[] = [];
  private lastT = -1;

  private readonly opts: OneEuroOptions;

  constructor(opts: OneEuroOptions = config.face.oneEuro) {
    this.opts = opts;
  }

  /** Smooths in place into `out`, which may be the same array across calls. */
  smooth(points: readonly { x: number; y: number }[], tMs: number, out: { x: number; y: number }[]): void {
    const dtS = this.lastT < 0 ? 1 / 30 : Math.max(1e-4, (tMs - this.lastT) / 1000);
    this.lastT = tMs;

    for (let i = 0; i < points.length; i++) {
      let fx = this.fx[i];
      let fy = this.fy[i];
      if (fx === undefined || fy === undefined) {
        fx = new OneEuroFilter(this.opts);
        fy = new OneEuroFilter(this.opts);
        this.fx[i] = fx;
        this.fy[i] = fy;
      }
      const p = points[i];
      if (p === undefined) continue;
      const o = out[i];
      const sx = fx.filter(p.x, dtS);
      const sy = fy.filter(p.y, dtS);
      if (o === undefined) out[i] = { x: sx, y: sy };
      else {
        o.x = sx;
        o.y = sy;
      }
    }
    out.length = points.length;
  }

  reset(): void {
    for (const f of this.fx) f.reset();
    for (const f of this.fy) f.reset();
    this.lastT = -1;
  }
}

/** Exponential moving average, used for blendshapes (SPEC section 6.2). */
export class Ema {
  private y: number | null = null;

  private readonly alpha: number;

  constructor(alpha: number) {
    this.alpha = alpha;
  }

  filter(x: number): number {
    if (!Number.isFinite(x)) return this.y ?? 0;
    this.y = this.y === null ? x : this.alpha * x + (1 - this.alpha) * this.y;
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}
