/**
 * Candlelight darkness (SPEC section 12.4 layer 2, decision D7).
 *
 * The player's face exists only where a flame touches it. That is the whole
 * look, and it does three jobs at once: it is atmospheric, it is flattering in
 * any room (SPEC 3.4 - raw webcam footage is not shareable, candlelit footage
 * is), and losing Wicks visibly darkens the world, so the stakes are legible
 * without a single number.
 *
 * Implementation: a low-resolution canvas holding the light map, uploaded as a
 * texture each frame and fed to `SimpleLightmapFilter`. Deliberately not a
 * custom shader - the light map is blurry by nature, so a 1/4-scale canvas
 * looks *better* than a per-pixel computation and costs one small upload.
 */

import { Texture } from 'pixi.js';
import { config } from '../config.ts';
import { tokens } from './tokens.ts';

export interface LightSource {
  /** Screen pixels. */
  x: number;
  y: number;
  /** Radius in screen pixels. */
  r: number;
  /** 0..1; a guttering flame is dimmer. */
  intensity: number;
}

/** Light map resolution. Low on purpose; it is upscaled with bilinear filtering. */
const MAP_WIDTH = 480;

export class LightMap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  readonly texture: Texture;

  constructor(aspect = config.render.aspect) {
    const c = document.createElement('canvas');
    c.width = MAP_WIDTH;
    c.height = Math.round(MAP_WIDTH / aspect);
    const ctx = c.getContext('2d', { alpha: false });
    if (ctx === null) throw new Error('A 2D canvas is required for the light map.');
    this.canvas = c;
    this.ctx = ctx;
    this.texture = Texture.from(c);
  }

  resize(aspect: number): void {
    const h = Math.max(1, Math.round(MAP_WIDTH / aspect));
    if (this.canvas.height === h) return;
    this.canvas.height = h;
  }

  /**
   * Redraws the light map.
   *
   * @param ambient 0..1 floor brightness. `1 - config.light.darknessAlpha` is
   *   the default; a flicker scare dips it.
   * @param flickerPhase radians, drives the per-flame guttering.
   * @param reduceEffects when true, flames do not flicker at all (invariant 4).
   */
  update(
    lights: readonly LightSource[],
    viewport: { offsetX: number; offsetY: number; width: number; height: number },
    canvasWidth: number,
    canvasHeight: number,
    ambient: number,
    flickerPhase: number,
    reduceEffects: boolean,
  ): Texture {
    const { ctx, canvas } = this;
    const sx = canvas.width / Math.max(1, canvasWidth);
    const sy = canvas.height / Math.max(1, canvasHeight);
    void viewport;

    const floor = Math.round(Math.min(1, Math.max(0, ambient)) * 255);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgb(${floor},${floor},${floor})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lights add, so two Wicks standing together genuinely light more.
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l === undefined) continue;

      // Low-amplitude noise at <= 2 Hz (config.light.flickerHz). Each flame
      // gets its own phase offset so they do not pulse in unison.
      const flicker = reduceEffects
        ? 1
        : 1 - config.light.flickerDepth * (0.5 + 0.5 * Math.sin(flickerPhase + i * 2.399));

      const cx = l.x * sx;
      const cy = l.y * sy;
      const r = Math.max(2, l.r * sx * flicker);
      const peak = Math.min(1, Math.max(0, l.intensity));
      if (peak <= 0.01) continue;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      // A warm core falling off to nothing. The stops are tuned so the edge is
      // soft enough that a moving Wick does not show a hard circle.
      g.addColorStop(0, `rgba(255, 214, 150, ${peak})`);
      g.addColorStop(0.35, `rgba(255, 170, 90, ${peak * 0.52})`);
      g.addColorStop(0.72, `rgba(180, 100, 50, ${peak * 0.16})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'source-over';
    this.texture.source.update();
    return this.texture;
  }

  destroy(): void {
    this.texture.destroy(true);
  }
}

/** Ambient colour of the unlit world, as `SimpleLightmapFilter` wants it. */
export const AMBIENT_COLOR = tokens.void;
