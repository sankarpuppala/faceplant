/**
 * THE WATCHER - the jump scare for losing half the roster.
 *
 * Every other scare in the game is scheduled by a level. This one is *earned*:
 * the moment more than half the Wicks are gone, something that has been
 * watching the whole time decides to come and look at you properly.
 *
 * It is the loudest, closest thing in the game, and it still obeys every
 * safety rule in CLAUDE.md:
 *
 *   - **No flashing.** The approach is one smooth ramp and the eyes pulse at
 *     2 Hz, both well under the WCAG 2.3.1 ceiling of 3. There is no frame in
 *     which the screen changes brightness abruptly.
 *   - **Reduced effects** suppresses the screen shake and the horns' jitter,
 *     and slows the approach, but still shows it - the information that you
 *     have failed should not be optional.
 *   - **Scares off** means this never runs at all. The level just ends.
 *   - The shout goes through the same -6 dBFS limiter as everything else, with
 *     a 40 ms attack (see `sound.ts`, 'watcherShout').
 *
 * Drawn with the same vector vocabulary as the rest of the game - no image
 * assets - so it scales to any resolution and matches the tape's palette.
 */

import { Container, Graphics } from 'pixi.js';
import { config } from '../config.ts';
import type { Viewport } from '../terrain/mapping.ts';
import { tokens } from './tokens.ts';

export type WatcherPhase = 'approaching' | 'holding' | 'leaving' | 'gone';

export interface WatcherState {
  phase: WatcherPhase;
  /** 0..1 through the approach. */
  approach: number;
  /** 0..1 overall opacity. */
  alpha: number;
}

const TOTAL_MS = config.watcher.approachMs + config.watcher.holdMs + config.watcher.leaveMs;

export function watcherStateAt(elapsedMs: number, reducedEffects: boolean): WatcherState {
  // Reduced effects stretches the approach, so it looms rather than lunges.
  const approachMs = config.watcher.approachMs * (reducedEffects ? 1.8 : 1);
  const total = approachMs + config.watcher.holdMs + config.watcher.leaveMs;

  if (elapsedMs < 0 || elapsedMs >= total) return { phase: 'gone', approach: 0, alpha: 0 };

  if (elapsedMs < approachMs) {
    const t = elapsedMs / approachMs;
    // Ease-in: slow at the edge of the dark, then fast. This is the part that
    // makes it read as something closing distance rather than a fade-in.
    const eased = t * t;
    return { phase: 'approaching', approach: eased, alpha: Math.min(1, 0.25 + eased * 0.9) };
  }

  if (elapsedMs < approachMs + config.watcher.holdMs) {
    return { phase: 'holding', approach: 1, alpha: 1 };
  }

  const t = (elapsedMs - approachMs - config.watcher.holdMs) / config.watcher.leaveMs;
  return { phase: 'leaving', approach: 1, alpha: 1 - t };
}

export function watcherTotalMs(reducedEffects: boolean): number {
  return reducedEffects
    ? config.watcher.approachMs * 1.8 + config.watcher.holdMs + config.watcher.leaveMs
    : TOTAL_MS;
}

/**
 * The face itself. A horned silhouette with ember eyes and a mouth that opens
 * as it arrives - built from the same primitives as the Wicks so it belongs in
 * the same world, just very much larger.
 */
export class Watcher extends Container {
  private readonly g = new Graphics();
  /** The veil that swallows the level behind it. */
  private readonly veil = new Graphics();

  constructor() {
    super();
    this.addChild(this.veil, this.g);
    this.visible = false;
  }

  hide(): void {
    this.visible = false;
    this.g.clear();
    this.veil.clear();
  }

  /**
   * @param elapsedMs since the Watcher was summoned.
   * @returns the shake to apply this frame, in FH, or 0.
   */
  draw(elapsedMs: number, vp: Viewport, reducedEffects: boolean, timeMs: number): number {
    const st = watcherStateAt(elapsedMs, reducedEffects);
    if (st.phase === 'gone') {
      this.hide();
      return 0;
    }

    this.visible = true;
    const { g, veil } = this;
    g.clear();
    veil.clear();

    const cx = vp.offsetX + vp.width / 2;
    const cy = vp.offsetY + vp.height * 0.52;

    // The dark comes in with it, so the level behind is swallowed rather than
    // simply covered. Smooth ramp - never a flash.
    veil
      .rect(vp.offsetX, vp.offsetY, vp.width, vp.height)
      .fill({ color: tokens.void, alpha: st.alpha * 0.82 });

    // Size: starts small and distant, ends filling the frame.
    const startH = vp.height * 0.16;
    const endH = vp.height * config.watcher.finalHeightFraction;
    const h = startH + (endH - startH) * st.approach;
    const w = h * 0.78;
    const a = st.alpha;

    // A slight sway, killed by reduced effects.
    const sway = reducedEffects ? 0 : Math.sin(timeMs / 220) * w * 0.012;
    const x = cx + sway;

    // --- the head -------------------------------------------------------
    // Tapered: wide at the brow, narrow at the jaw. Drawn as a path so it
    // reads as a skull rather than an oval.
    const halfW = w / 2;
    const top = cy - h * 0.46;
    const jaw = cy + h * 0.46;

    g.moveTo(x - halfW * 0.86, top + h * 0.16);
    g.quadraticCurveTo(x - halfW * 1.0, top - h * 0.04, x - halfW * 0.5, top - h * 0.02);
    g.quadraticCurveTo(x, top - h * 0.08, x + halfW * 0.5, top - h * 0.02);
    g.quadraticCurveTo(x + halfW * 1.0, top - h * 0.04, x + halfW * 0.86, top + h * 0.16);
    g.quadraticCurveTo(x + halfW * 0.92, cy + h * 0.1, x + halfW * 0.34, jaw - h * 0.04);
    g.quadraticCurveTo(x, jaw + h * 0.06, x - halfW * 0.34, jaw - h * 0.04);
    g.quadraticCurveTo(x - halfW * 0.92, cy + h * 0.1, x - halfW * 0.86, top + h * 0.16);
    g.closePath();
    g.fill({ color: 0x000000, alpha: a * 0.95 });
    // The rim, so the silhouette separates from the veil behind it.
    g.stroke({ width: Math.max(1, h * 0.004), color: tokens.ember, alpha: a * 0.3 });

    // --- horns ----------------------------------------------------------
    for (const side of [-1, 1] as const) {
      const hx = x + side * halfW * 0.72;
      const hy = top + h * 0.1;
      g.moveTo(hx, hy);
      g.quadraticCurveTo(hx + side * w * 0.26, hy - h * 0.2, hx + side * w * 0.12, hy - h * 0.34);
      g.quadraticCurveTo(hx + side * w * 0.1, hy - h * 0.14, hx, hy);
      g.closePath();
      g.fill({ color: 0x000000, alpha: a * 0.95 });
      g.stroke({ width: Math.max(1, h * 0.003), color: tokens.ember, alpha: a * 0.26 });
    }

    // --- eyes -----------------------------------------------------------
    // The thing you actually see. A 2 Hz pulse, declared in config as the
    // Watcher's flash budget and comfortably under the 3 Hz ceiling.
    const pulse = 0.72 + 0.28 * Math.sin((timeMs / 1000) * config.watcher.eyePulseHz * Math.PI * 2);
    const eyeY = cy - h * 0.1;
    const eyeDx = halfW * 0.38;
    const eyeR = h * 0.055;

    for (const side of [-1, 1] as const) {
      const ex = x + side * eyeDx;
      // Outer glow, then core - the same two-layer flame trick the Wicks use.
      g.circle(ex, eyeY, eyeR * 2.6).fill({ color: tokens.ember, alpha: a * 0.16 * pulse });
      g.circle(ex, eyeY, eyeR * 1.5).fill({ color: tokens.ember, alpha: a * 0.4 * pulse });
      g.circle(ex, eyeY, eyeR).fill({ color: tokens.candle, alpha: a * pulse });
      // A slit pupil, because round pupils look friendly.
      g.ellipse(ex, eyeY, eyeR * 0.22, eyeR * 0.82).fill({ color: 0x000000, alpha: a * 0.9 });
    }

    // --- mouth ----------------------------------------------------------
    // Opens as it arrives, and it is shouting by the time it is holding.
    const openness = st.phase === 'approaching' ? st.approach * st.approach : 1;
    const mouthY = cy + h * 0.22;
    const mouthW = halfW * 0.6;
    const mouthH = h * 0.03 + h * 0.17 * openness;

    g.moveTo(x - mouthW, mouthY);
    g.quadraticCurveTo(x, mouthY - mouthH * 0.25, x + mouthW, mouthY);
    g.quadraticCurveTo(x, mouthY + mouthH, x - mouthW, mouthY);
    g.closePath();
    g.fill({ color: 0x120306, alpha: a });
    g.stroke({ width: Math.max(1, h * 0.003), color: tokens.rec, alpha: a * 0.45 });

    // Teeth, revealed by the opening. Thin wedges, not a cartoon grin.
    if (openness > 0.3) {
      const teeth = 7;
      const ta = a * (openness - 0.3) * 1.4;
      for (let i = 0; i < teeth; i++) {
        const t = (i + 0.5) / teeth;
        const tx = x - mouthW + mouthW * 2 * t;
        const tw = mouthW * 0.1;
        const th = mouthH * (0.3 + 0.22 * Math.sin(i * 2.1));
        g.moveTo(tx - tw, mouthY);
        g.lineTo(tx, mouthY + th);
        g.lineTo(tx + tw, mouthY);
        g.closePath();
      }
      g.fill({ color: tokens.wax, alpha: Math.min(0.75, ta * 0.75) });
    }

    // The shake is the physical half of the startle, and it is the one part
    // "Reduce effects" removes entirely.
    if (reducedEffects) return 0;
    return st.phase === 'approaching'
      ? config.watcher.shakeFh * st.approach
      : st.phase === 'holding'
        ? config.watcher.shakeFh * 0.5
        : 0;
  }
}
