/**
 * THE WATCHER - the jump scare for losing half the roster.
 *
 * Every other scare in the game is scheduled by a level. This one is *earned*:
 * the moment more than half the Wicks are gone, something that has been
 * watching the whole time comes to look at you properly.
 *
 * ## Why it is built in four beats
 *
 * The first version was a horned silhouette that scaled up, and it was not
 * frightening - it arrived fully formed and all at once, so there was nothing
 * to dread and nothing to resolve. A scare is a shape in time, not a picture:
 *
 *   1. **stare**   - two eyes, far off, in a dark that has swallowed the level.
 *                    You can tell something is there. You cannot tell what.
 *   2. **approach** - it closes the distance, and the face assembles out of the
 *                    dark as it comes: sockets, then jaw, then teeth.
 *   3. **hold**    - it fills the frame and screams, jaw juddering, close
 *                    enough that the mouth covers the middle of the screen.
 *   4. **leave**   - it withdraws rather than cutting, so the quiet afterwards
 *                    belongs to it too.
 *
 * It is drawn from the game's own motifs so it reads as *this* game's monster:
 * wax running from the eye sockets like the Wicks' own melt, and ember light
 * in the cracks, as though something is burning inside it.
 *
 * ## Safety (CLAUDE.md invariants 4 and 6) - all of it still holds
 *
 *   - **No flashing.** Every movement is a continuous ramp. The only periodic
 *     motions are a 2 Hz eye pulse and a 2.5 Hz jaw judder, both under the
 *     WCAG 2.3.1 ceiling of 3 Hz, and both are *motion*, not luminance steps.
 *   - **Reduced effects** stretches the approach, removes the shake and the
 *     judder, and keeps the face: being told you failed is not optional.
 *   - **Scares off** means none of this runs. The tape simply ends.
 *   - The shout is limited and attacked in `sound.ts`, not here.
 */

import { Container, Graphics } from 'pixi.js';
import { config } from '../config.ts';
import type { Viewport } from '../terrain/mapping.ts';
import { tokens } from './tokens.ts';

export type WatcherPhase = 'staring' | 'approaching' | 'holding' | 'leaving' | 'gone';

export interface WatcherState {
  phase: WatcherPhase;
  /** 0..1 through the approach, after the stare. */
  approach: number;
  /** 0..1 overall opacity. */
  alpha: number;
  /** 0..1 through the hold, for the scream. */
  scream: number;
}

function phaseTimes(reducedEffects: boolean): { stare: number; approach: number; hold: number; leave: number } {
  // Reduced effects stretches the approach so it looms instead of lunging.
  return {
    stare: config.watcher.stareMs,
    approach: config.watcher.approachMs * (reducedEffects ? 1.9 : 1),
    hold: config.watcher.holdMs,
    leave: config.watcher.leaveMs,
  };
}

export function watcherTotalMs(reducedEffects: boolean): number {
  const t = phaseTimes(reducedEffects);
  return t.stare + t.approach + t.hold + t.leave;
}

export function watcherStateAt(elapsedMs: number, reducedEffects: boolean): WatcherState {
  const t = phaseTimes(reducedEffects);
  const total = watcherTotalMs(reducedEffects);
  if (elapsedMs < 0 || elapsedMs >= total) return { phase: 'gone', approach: 0, alpha: 0, scream: 0 };

  if (elapsedMs < t.stare) {
    // Only the eyes, and the dark arriving with them.
    return { phase: 'staring', approach: 0, alpha: elapsedMs / t.stare, scream: 0 };
  }

  const afterStare = elapsedMs - t.stare;
  if (afterStare < t.approach) {
    const k = afterStare / t.approach;
    // Ease-in: slow at the edge of the dark, then fast. This is what makes it
    // read as something closing distance rather than a fade-in.
    return { phase: 'approaching', approach: k * k, alpha: 1, scream: 0 };
  }

  const afterApproach = afterStare - t.approach;
  if (afterApproach < t.hold) {
    return { phase: 'holding', approach: 1, alpha: 1, scream: afterApproach / t.hold };
  }

  const k = (afterApproach - t.hold) / t.leave;
  return { phase: 'leaving', approach: 1, alpha: 1 - k, scream: 1 };
}

/** The face. Built from primitives so it scales to any resolution. */
export class Watcher extends Container {
  private readonly veil = new Graphics();
  private readonly g = new Graphics();
  private readonly glow = new Graphics();

  constructor() {
    super();
    this.addChild(this.veil, this.glow, this.g);
    this.visible = false;
  }

  hide(): void {
    this.visible = false;
    this.g.clear();
    this.veil.clear();
    this.glow.clear();
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
    const { g, veil, glow } = this;
    g.clear();
    veil.clear();
    glow.clear();

    const cx = vp.offsetX + vp.width / 2;
    const cy = vp.offsetY + vp.height * 0.5;

    // --- the dark it brings with it --------------------------------------
    // Deeper than the game's own darkness, so the level is gone, not dimmed.
    veil.rect(vp.offsetX, vp.offsetY, vp.width, vp.height).fill({
      color: 0x000000,
      alpha: st.phase === 'staring' ? st.alpha * 0.96 : 0.97 * st.alpha,
    });

    // --- size -------------------------------------------------------------
    // It lunges slightly past its final size and settles back, which is what
    // sells the last few inches of the approach.
    const startH = vp.height * 0.22;
    const endH = vp.height * config.watcher.finalHeightFraction;
    let h: number;
    if (st.phase === 'staring') {
      h = startH * 0.8;
    } else if (st.phase === 'approaching') {
      h = startH + (endH - startH) * st.approach;
    } else {
      const settle = Math.min(1, st.scream * 6);
      h = endH * (1 + config.watcher.overshootFraction * (1 - settle));
    }

    const w = h * 0.74;
    const halfW = w / 2;
    const a = st.alpha;

    // A head tilt that grows as it arrives: a face that is level is a portrait,
    // a face that is tilted is looking at you.
    const tilt = reducedEffects ? 0 : (st.phase === 'staring' ? 0 : 0.06 * st.approach);
    const sway = reducedEffects ? 0 : Math.sin(timeMs / 260) * w * 0.008;
    const x = cx + sway;

    // The eye pulse, 2 Hz, declared as the Watcher's flash budget.
    const pulse = 0.7 + 0.3 * Math.sin((timeMs / 1000) * config.watcher.eyePulseHz * Math.PI * 2);

    const eyeDx = halfW * 0.4;
    const socketR = h * 0.1;

    // --- the stare: eyes only, nothing else legible ----------------------
    if (st.phase === 'staring') {
      for (const side of [-1, 1] as const) {
        const ex = x + side * startH * 0.16;
        const ey = cy - startH * 0.04;
        const r = startH * 0.028;
        glow.circle(ex, ey, r * 7).fill({ color: tokens.ember, alpha: a * 0.05 * pulse });
        glow.circle(ex, ey, r * 3).fill({ color: tokens.ember, alpha: a * 0.18 * pulse });
        g.circle(ex, ey, r).fill({ color: tokens.candle, alpha: a * 0.9 * pulse });
      }
      return 0;
    }

    g.rotation = 0;

    // --- skull ------------------------------------------------------------
    // Hollow temples and a long jaw, so it reads as a skull rather than an egg.
    const cheek = halfW * 0.96;

    const px = (dx: number, dy: number): [number, number] => {
      // Apply the tilt about the face centre.
      const c = Math.cos(tilt);
      const s2 = Math.sin(tilt);
      return [x + dx * c - dy * s2, cy + dx * s2 + dy * c];
    };

    const [bl, blY] = px(-cheek, -h * 0.26);
    const [tl, tlY] = px(-halfW * 0.56, -h * 0.5);
    const [tr, trY] = px(halfW * 0.56, -h * 0.5);
    const [br, brY] = px(cheek, -h * 0.26);
    const [jl, jlY] = px(-halfW * 0.4, h * 0.34);
    const [jr, jrY] = px(halfW * 0.4, h * 0.34);
    const [chinX, chinY] = px(0, h * 0.52);

    g.moveTo(bl, blY);
    g.quadraticCurveTo(...px(-cheek * 1.02, -h * 0.46), tl, tlY);
    g.quadraticCurveTo(...px(0, -h * 0.58), tr, trY);
    g.quadraticCurveTo(...px(cheek * 1.02, -h * 0.46), br, brY);
    // Temples pinch in, then the jaw flares out and down to the chin.
    g.quadraticCurveTo(...px(cheek * 0.84, h * 0.06), jr, jrY);
    g.quadraticCurveTo(...px(halfW * 0.22, h * 0.54), chinX, chinY);
    g.quadraticCurveTo(...px(-halfW * 0.22, h * 0.54), jl, jlY);
    g.quadraticCurveTo(...px(-cheek * 0.84, h * 0.06), bl, blY);
    g.closePath();
    g.fill({ color: 0x050204, alpha: a });
    g.stroke({ width: Math.max(1, h * 0.0035), color: tokens.ember, alpha: a * 0.32 });

    // --- horns ------------------------------------------------------------
    // Asymmetric, because symmetry looks designed and this should not.
    for (const [side, len, curl] of [
      [-1, 0.46, 0.3],
      [1, 0.38, 0.22],
    ] as const) {
      const [hx, hy] = px(side * halfW * 0.56, -h * 0.44);
      const [c1x, c1y] = px(side * halfW * 1.16, -h * (0.44 + len * 0.5));
      const [tipX, tipY] = px(side * halfW * (0.6 + curl), -h * (0.44 + len));
      const [c2x, c2y] = px(side * halfW * 0.74, -h * (0.44 + len * 0.42));
      g.moveTo(hx, hy);
      g.quadraticCurveTo(c1x, c1y, tipX, tipY);
      g.quadraticCurveTo(c2x, c2y, hx, hy);
      g.closePath();
      g.fill({ color: 0x050204, alpha: a });
      g.stroke({ width: Math.max(1, h * 0.003), color: tokens.ember, alpha: a * 0.26 });
    }

    // --- cracks, lit from inside -----------------------------------------
    // Something is burning in there. Fixed offsets, so it does not crawl.
    const cracks: [number, number, number, number, number, number][] = [
      [-0.5, -0.3, -0.34, -0.1, -0.4, 0.08],
      [0.46, -0.34, 0.3, -0.14, 0.38, 0.04],
      [-0.12, -0.46, -0.06, -0.3, -0.16, -0.2],
      [0.2, 0.3, 0.1, 0.42, 0.22, 0.5],
    ];
    for (const [ax, ay, bx2, by2, cx2, cy2] of cracks) {
      g.moveTo(...px(ax * halfW, ay * h));
      g.lineTo(...px(bx2 * halfW, by2 * h));
      g.lineTo(...px(cx2 * halfW, cy2 * h));
    }
    g.stroke({ width: Math.max(1, h * 0.004), color: tokens.ember, alpha: a * 0.5 * pulse });

    // --- eye sockets ------------------------------------------------------
    // Deep and empty, with the light sitting *inside* them rather than on the
    // surface - that is the difference between eyes and glowing dots.
    for (const side of [-1, 1] as const) {
      const [sx2, sy2] = px(side * eyeDx, -h * 0.1);

      // The socket: a dark hollow, slightly angled inward to read as a brow.
      glow.ellipse(sx2, sy2, socketR * 3.4, socketR * 3.0).fill({ color: tokens.ember, alpha: a * 0.07 * pulse });
      g.ellipse(sx2, sy2, socketR * 1.5, socketR * 1.75).fill({ color: 0x000000, alpha: a });

      // The brow ridge, cutting the top of the socket at an angle.
      g.moveTo(...px(side * (eyeDx - socketR * 1.8), -h * 0.21));
      g.lineTo(...px(side * (eyeDx + socketR * 1.7), -h * 0.17));
      g.lineTo(...px(side * (eyeDx + socketR * 1.7), -h * 0.13));
      g.lineTo(...px(side * (eyeDx - socketR * 1.8), -h * 0.16));
      g.closePath();
      g.fill({ color: 0x050204, alpha: a });

      // The light in the hollow, and a small hard pupil inside that.
      glow.circle(sx2, sy2 + socketR * 0.15, socketR * 0.95).fill({ color: tokens.ember, alpha: a * 0.55 * pulse });
      g.circle(sx2, sy2 + socketR * 0.15, socketR * 0.46).fill({ color: tokens.candle, alpha: a * pulse });
      g.ellipse(sx2, sy2 + socketR * 0.15, socketR * 0.1, socketR * 0.34).fill({ color: 0x000000, alpha: a * 0.92 });

      // --- wax tears ----------------------------------------------------
      // The Wicks' own melt, running out of it. Ties the monster to the game.
      for (let i = 0; i < config.watcher.tearCount; i++) {
        const t2 = (i + 1) / (config.watcher.tearCount + 1);
        const tx = side * (eyeDx + (t2 - 0.5) * socketR * 1.6);
        const run = h * (0.1 + 0.22 * st.approach) * (0.6 + 0.4 * Math.sin(i * 2.3 + 1));
        const wx = Math.max(1, h * 0.008);
        const [p0x, p0y] = px(tx, -h * 0.04);
        const [p1x, p1y] = px(tx, -h * 0.04 + run);
        g.moveTo(p0x - wx, p0y);
        g.lineTo(p1x - wx * 0.6, p1y);
        g.lineTo(p1x + wx * 0.6, p1y);
        g.lineTo(p0x + wx, p0y);
        g.closePath();
      }
      g.fill({ color: tokens.wax, alpha: a * 0.3 });
    }

    // --- the nose: two slits, not a nose ---------------------------------
    for (const side of [-1, 1] as const) {
      g.ellipse(...px(side * halfW * 0.1, h * 0.1), halfW * 0.045, h * 0.035)
        .fill({ color: 0x000000, alpha: a * 0.85 });
    }

    // --- the mouth --------------------------------------------------------
    // The screaming part. Opens through the approach and judders on the hold.
    const judder =
      reducedEffects || st.phase !== 'holding'
        ? 0
        : Math.sin((timeMs / 1000) * config.watcher.jawJudderHz * Math.PI * 2) * 0.05;
    const openness = st.phase === 'approaching' ? st.approach * st.approach : 1;
    const mouthH = h * (0.06 + 0.4 * openness + judder);
    const mouthW = halfW * (0.5 + 0.22 * openness);
    const mouthY = h * 0.26;

    // The throat, lit from deep inside.
    glow.ellipse(...px(0, mouthY + mouthH * 0.3), mouthW * 1.3, mouthH * 0.9)
      .fill({ color: tokens.ember, alpha: a * 0.2 * openness });

    g.moveTo(...px(-mouthW, mouthY));
    g.quadraticCurveTo(...px(0, mouthY - mouthH * 0.3), ...px(mouthW, mouthY));
    g.quadraticCurveTo(...px(mouthW * 0.6, mouthY + mouthH), ...px(0, mouthY + mouthH * 1.1));
    g.quadraticCurveTo(...px(-mouthW * 0.6, mouthY + mouthH), ...px(-mouthW, mouthY));
    g.closePath();
    g.fill({ color: 0x0a0103, alpha: a });

    // Teeth: irregular, uneven, top and bottom, interlocking.
    if (openness > 0.15) {
      const ta = a * Math.min(1, (openness - 0.15) * 1.8);
      const n = 11;
      for (let i = 0; i < n; i++) {
        const t2 = (i + 0.5) / n;
        const tx = -mouthW + mouthW * 2 * t2;
        // Narrow toward the corners, so it follows the mouth's shape.
        const edge = 1 - Math.abs(t2 - 0.5) * 1.5;
        const tw = mouthW * 0.085 * edge;
        const th = mouthH * (0.3 + 0.26 * Math.abs(Math.sin(i * 2.7))) * edge;
        const lip = mouthH * 0.16 * (1 - edge);
        // Upper
        g.moveTo(...px(tx - tw, mouthY + lip));
        g.lineTo(...px(tx, mouthY + lip + th));
        g.lineTo(...px(tx + tw, mouthY + lip));
        g.closePath();
        // Lower, offset so they interlock
        const t3 = (i + 1) / n;
        const bx3 = -mouthW + mouthW * 2 * t3;
        const bEdge = 1 - Math.abs(t3 - 0.5) * 1.5;
        const bw = mouthW * 0.075 * bEdge;
        const bh = mouthH * (0.24 + 0.2 * Math.abs(Math.cos(i * 1.9))) * bEdge;
        g.moveTo(...px(bx3 - bw, mouthY + mouthH * 1.02 - lip));
        g.lineTo(...px(bx3, mouthY + mouthH * 1.02 - lip - bh));
        g.lineTo(...px(bx3 + bw, mouthY + mouthH * 1.02 - lip));
        g.closePath();
      }
      g.fill({ color: tokens.wax, alpha: ta * 0.8 });
    }

    // --- it closes in on the edges too ------------------------------------
    // A hard vignette, so even the corners of the screen are not safe.
    const vig = Math.max(0, st.phase === 'holding' ? 1 : st.approach);
    if (vig > 0.01) {
      const inset = Math.min(vp.width, vp.height) * 0.14 * vig;
      veil.rect(vp.offsetX, vp.offsetY, vp.width, inset).fill({ color: 0x000000, alpha: a * 0.5 });
      veil.rect(vp.offsetX, vp.offsetY + vp.height - inset, vp.width, inset).fill({ color: 0x000000, alpha: a * 0.5 });
      veil.rect(vp.offsetX, vp.offsetY, inset, vp.height).fill({ color: 0x000000, alpha: a * 0.5 });
      veil.rect(vp.offsetX + vp.width - inset, vp.offsetY, inset, vp.height).fill({ color: 0x000000, alpha: a * 0.5 });
    }

    // The shake is the physical half of the startle, and the one part that
    // "Reduce effects" removes entirely.
    if (reducedEffects) return 0;
    if (st.phase === 'approaching') return config.watcher.shakeFh * st.approach;
    if (st.phase === 'holding') return config.watcher.shakeFh * (0.5 + 0.5 * Math.abs(judder) * 10);
    return 0;
  }
}
