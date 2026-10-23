/**
 * Post-process and the three filters (SPEC section 12.4 layers 1 and 5).
 *
 * Built entirely from `pixi-filters` rather than hand-written shaders: CRT for
 * scanlines and vignette, RGBSplit for chromatic aberration, OldFilm for grain,
 * Adjustment for the VHS grade and ColorMap for THERMAL.
 *
 * Every flashing or shifting effect declares a maximum rate in
 * `config.render.effects`, `npm run check:flash` asserts all of them are at or
 * under 3 Hz (WCAG 2.3.1, invariant 4), and "Reduce effects" removes flicker,
 * aberration, wobble, shake and scanlines outright.
 */

import { Texture, type Filter } from 'pixi.js';
import { AdjustmentFilter, ColorMapFilter, CRTFilter, OldFilmFilter, RGBSplitFilter } from 'pixi-filters';
import { config } from '../config.ts';
import type { FilterName } from '../storage/settings.ts';
import { thermalRamp } from './tokens.ts';

/** Effect names that carry a declared flash budget. */
export type EffectName = keyof typeof config.render.effects;

export function isEffectEnabled(name: EffectName, reducedEffects: boolean): boolean {
  if (!reducedEffects) return true;
  return !(config.render.reducedEffectsDisables as readonly string[]).includes(name);
}

/**
 * Builds the 16x16x16 colour-map LUT for THERMAL as a 256x16 strip, the layout
 * `ColorMapFilter` expects: 16 slices of 16x16, slice index = blue.
 */
export function buildThermalLut(): HTMLCanvasElement {
  const size = 16;
  const c = document.createElement('canvas');
  c.width = size * size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('A 2D canvas is required for the thermal LUT.');

  const img = ctx.createImageData(c.width, c.height);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const x = b * size + r;
        const y = g;
        const i = (y * c.width + x) * 4;

        // Map the source colour's luminance onto the thermal ramp. A thermal
        // camera does not care about hue, only heat, so luminance is the input.
        const rn = r / (size - 1);
        const gn = g / (size - 1);
        const bn = b / (size - 1);
        const lum = 0.2126 * rn + 0.7152 * gn + 0.0722 * bn;

        const pos = lum * (thermalRamp.length - 1);
        const lo = Math.floor(pos);
        const hi = Math.min(thermalRamp.length - 1, lo + 1);
        const t = pos - lo;
        const a = thermalRamp[lo] ?? [0, 0, 0];
        const z = thermalRamp[hi] ?? a;

        img.data[i] = Math.round(((a[0] ?? 0) + ((z[0] ?? 0) - (a[0] ?? 0)) * t) * 255);
        img.data[i + 1] = Math.round(((a[1] ?? 0) + ((z[1] ?? 0) - (a[1] ?? 0)) * t) * 255);
        img.data[i + 2] = Math.round(((a[2] ?? 0) + ((z[2] ?? 0) - (a[2] ?? 0)) * t) * 255);
        img.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The video grade for one filter mode (SPEC section 12.4 layer 1). */
export class VideoGrade {
  private readonly vhs = new AdjustmentFilter({
    // 70% desaturated, warm, crushed blacks.
    saturation: 0.3,
    brightness: 0.92,
    contrast: 1.22,
    gamma: 1.1,
    red: 1.12,
    green: 0.98,
    blue: 0.82,
  });

  private readonly thermalAdjust = new AdjustmentFilter({ saturation: 0, contrast: 1.15, brightness: 1 });
  private thermalMap: ColorMapFilter | null = null;

  /**
   * THE WATCHER's first beat drains the picture: `k` 0..1 takes the colour out
   * and dims it. Changes over a second, so it is a fade, not a flash.
   */
  setDrain(k: number): void {
    this.vhs.saturation = 0.3 * (1 - k);
    this.vhs.brightness = 0.92 * (1 - 0.45 * k);
  }

  /** Filters for the video layer, in order. Empty for INK (no video at all). */
  forFilter(name: FilterName): Filter[] {
    if (name === 'ink') return [];
    if (name === 'thermal') {
      if (this.thermalMap === null) {
        this.thermalMap = new ColorMapFilter({ colorMap: Texture.from(buildThermalLut()), nearest: false, mix: 1 });
      }
      return [this.thermalAdjust, this.thermalMap];
    }
    return [this.vhs];
  }

  destroy(): void {
    this.vhs.destroy();
    this.thermalAdjust.destroy();
    this.thermalMap?.destroy();
  }
}

/**
 * The tape look over the whole stage. `update` advances the animated uniforms;
 * `apply` returns the filter list for the current settings.
 */
export class TapeFx {
  private readonly crt = new CRTFilter({
    curvature: 1.1,
    lineWidth: 1.6,
    lineContrast: 0.18,
    noise: 0.06,
    noiseSize: 1.1,
    vignetting: 0.32,
    vignettingAlpha: 0.62,
    vignettingBlur: 0.4,
    time: 0,
  });

  private readonly film = new OldFilmFilter({
    sepia: 0.08,
    noise: 0.11,
    noiseSize: 1,
    scratch: 0,
    scratchDensity: 0,
    scratchWidth: 1,
    vignetting: 0,
    vignettingAlpha: 0,
  });

  private readonly split = new RGBSplitFilter({ red: { x: -1, y: 0 }, green: { x: 0, y: 0 }, blue: { x: 1, y: 0 } });

  /** Reduced-effects list: grain and vignette only (SPEC section 12.4 layer 5). */
  private readonly reducedCrt = new CRTFilter({
    curvature: 0,
    lineWidth: 0,
    lineContrast: 0,
    noise: 0,
    vignetting: 0.3,
    vignettingAlpha: 0.5,
    vignettingBlur: 0.4,
  });

  private wobblePhase = 0;
  private shake = 0;
  /** 0..1: the tape going wrong while THE WATCHER comes. Wider colour split, harder lines. */
  private trouble = 0;

  constructor() {
    // Capped, so a 2x display does not quadruple the cost of every pass.
    for (const f of [this.crt, this.film, this.split, this.reducedCrt]) f.resolution = config.render.postfxResolutionMultiple;
  }

  /** Current shake offset in pixels, applied by the stage to the world container. */
  shakeOffset = { x: 0, y: 0 };

  /** Call once per frame. `dtS` in seconds. */
  update(dtS: number, nowMs: number, reducedEffects: boolean): void {
    this.crt.time += dtS * 6;
    this.film.seed = Math.random();

    // Tracking wobble: a slow horizontal roll, capped at 1 Hz by config.
    if (isEffectEnabled('wobble', reducedEffects)) {
      const hz = config.render.effects.wobble.maxFlashHz;
      this.wobblePhase += dtS * Math.PI * 2 * hz;
      // Only occasionally, so it reads as a tape fault rather than a wave.
      const gate = Math.sin(nowMs / 7000) > 0.86 ? 1 : 0;
      this.crt.verticalLine = false;
      this.crt.lineContrast = 0.18 + gate * 0.1 * (0.5 + 0.5 * Math.sin(this.wobblePhase)) + this.trouble * 0.18;
    }

    if (isEffectEnabled('aberration', reducedEffects)) {
      const drift = Math.sin(nowMs / 2400);
      const tear = 1 + this.trouble * 5;
      this.split.red = { x: (-1 - drift * 0.6) * tear, y: 0 };
      this.split.blue = { x: (1 + drift * 0.6) * tear, y: 0 };
    }

    // Screen shake decays exponentially; capped by config.render.maxShakeFh.
    this.shake = Math.max(0, this.shake - this.shake * config.render.shakeDecayPerS * dtS);
    if (isEffectEnabled('shake', reducedEffects) && this.shake > 0.001) {
      this.shakeOffset.x = (Math.random() * 2 - 1) * this.shake;
      this.shakeOffset.y = (Math.random() * 2 - 1) * this.shake;
    } else {
      this.shakeOffset.x = 0;
      this.shakeOffset.y = 0;
    }
  }

  /**
   * Composure is shown by the picture, not a bar (OVERHAUL 3.1): as it falls
   * the vignette closes in and the grain thickens. Both move smoothly with
   * composure, which changes over seconds, so neither can flash.
   *
   * @param fraction composure, 0..1
   */
  setComposure(fraction: number): void {
    const strain = 1 - Math.min(1, Math.max(0, fraction));
    const c = config.render.composureImage;
    this.crt.vignetting = c.vignetteFraction[0] + (c.vignetteFraction[1] - c.vignetteFraction[0]) * strain;
    this.crt.vignettingAlpha = c.vignetteAlpha[0] + (c.vignetteAlpha[1] - c.vignetteAlpha[0]) * strain;
    this.reducedCrt.vignetting = this.crt.vignetting;
    this.reducedCrt.vignettingAlpha = this.crt.vignettingAlpha;
    this.film.noise = c.grainFraction[0] + (c.grainFraction[1] - c.grainFraction[0]) * strain;
  }

  /** THE WATCHER's tracking trouble, 0..1. Reduce effects passes 0. */
  setTrouble(k: number): void {
    this.trouble = Math.min(1, Math.max(0, k));
  }

  /** Adds screen shake, in pixels. Clamped so it can never become disorienting. */
  addShake(px: number, maxPx: number): void {
    this.shake = Math.min(maxPx, this.shake + px);
  }

  filters(reducedEffects: boolean): Filter[] {
    if (reducedEffects) return [this.reducedCrt, this.film];
    return [this.split, this.crt, this.film];
  }

  destroy(): void {
    this.crt.destroy();
    this.film.destroy();
    this.split.destroy();
    this.reducedCrt.destroy();
  }
}

/** The declared flash budget, read by `scripts/check-flash.ts`. */
export function flashBudget(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, spec] of Object.entries(config.render.effects)) out[name] = spec.maxFlashHz;
  return out;
}
