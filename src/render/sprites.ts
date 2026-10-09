/**
 * World drawing (SPEC section 12.4 layers 3 and 4).
 *
 * Everything is drawn with `Graphics` and redrawn each frame rather than loaded
 * as textures. At this scale (a few dozen bodies and a few hundred terrain
 * segments) it costs little, and it means there are no image assets to license,
 * to load, or to get wrong at a different resolution - the whole game is
 * vectors and light.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { config } from '../config.ts';
import type { Calibration } from '../face/calibration.ts';
import type { ContourName, Vec2 } from '../face/types.ts';
import type { Level } from '../game/levelSchema.ts';
import type { Crawler, Drip, Moth } from '../physics/hazards.ts';
import type { Wick } from '../physics/wick.ts';
import type { Segment } from '../terrain/build.ts';
import { fhToPx, worldToScreen, type Viewport } from '../terrain/mapping.ts';
import { chalk, fonts, tokens } from './tokens.ts';

export interface DrawContext {
  cal: Calibration;
  vp: Viewport;
  /** One FH in screen pixels. */
  fhPx: number;
  timeMs: number;
  /** INK mode draws the face as glowing contour lines and no video. */
  ink: boolean;
  reducedEffects: boolean;
}

export function makeDrawContext(cal: Calibration, vp: Viewport, timeMs: number, ink: boolean, reducedEffects: boolean): DrawContext {
  return { cal, vp, fhPx: fhToPx(cal, vp), timeMs, ink, reducedEffects };
}

function sx(p: Vec2, ctx: DrawContext): Vec2 {
  return worldToScreen(p, ctx.cal, ctx.vp);
}

/** Contours that make up the visible face line. The eye rings are drawn too. */
const DRAWN_CONTOURS: readonly ContourName[] = [
  'forehead',
  'browL',
  'browR',
  'nose',
  'lipUpper',
  'lipLower',
  'cheekL',
  'cheekR',
  'jaw',
  'eyeLidL',
  'eyeLidR',
  'eyeRingL',
  'eyeRingR',
];

/**
 * The face as a thin line (SPEC section 12.4 layer 3). In INK mode this *is* the
 * face - no video is drawn at all, which is also "Hide my face" (decision D8),
 * so a streamer can play without appearing on camera.
 */
export function drawContours(g: Graphics, segments: readonly Segment[], ctx: DrawContext): void {
  g.clear();
  if (segments.length === 0) return;

  const width = Math.max(1, ctx.fhPx * (ctx.ink ? 0.012 : 0.008));
  const faceColor = ctx.ink ? tokens.candle : chalk.color;
  const faceAlpha = ctx.ink ? 0.95 : chalk.alpha;

  // Walkable face segments bright, scenery dim: the player learns at a glance
  // which parts of their own face the Wicks can use.
  for (const pass of [false, true]) {
    let any = false;
    for (const seg of segments) {
      if (seg.kind === 'ruin' || seg.kind === 'wall') continue;
      if (seg.contour !== null && !DRAWN_CONTOURS.includes(seg.contour)) continue;
      if (seg.walkable !== pass) continue;
      const a = sx({ x: seg.ax, y: seg.ay }, ctx);
      const b = sx({ x: seg.bx, y: seg.by }, ctx);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      any = true;
    }
    if (any) {
      g.stroke({
        width: pass ? width : width * 0.7,
        color: faceColor,
        alpha: pass ? faceAlpha : faceAlpha * 0.4,
        cap: 'round',
      });
    }
  }
}

/** Ruins and walls: burnt-paper silhouettes with an amber rim (SPEC 12.1). */
export function drawStatic(g: Graphics, level: Level, ctx: DrawContext): void {
  g.clear();
  const thickness = ctx.fhPx * 0.035;

  for (const r of level.ruins) {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const pa = r.points[i];
      const pb = r.points[i + 1];
      if (pa === undefined || pb === undefined) continue;
      const a = sx({ x: pa[0], y: pa[1] }, ctx);
      const b = sx({ x: pb[0], y: pb[1] }, ctx);

      // Body: a slab hanging below the walking surface.
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.lineTo(b.x, b.y + thickness * 2.2);
      g.lineTo(a.x, a.y + thickness * 2.2);
      g.closePath();
      g.fill({ color: tokens.ink, alpha: 0.96 });

      // Rim light on the top edge only, as if lit from the candles below.
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke({ width: Math.max(1, thickness * 0.3), color: tokens.candle, alpha: 0.4 });
    }
  }

  for (const w of level.walls) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const pa = w.points[i];
      const pb = w.points[i + 1];
      if (pa === undefined || pb === undefined) continue;
      const a = sx({ x: pa[0], y: pa[1] }, ctx);
      const b = sx({ x: pb[0], y: pb[1] }, ctx);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke({ width: Math.max(2, thickness), color: tokens.dusk, alpha: 1, cap: 'square' });
    }
  }
}

/** The spawn lantern: a little door the Wicks come out of. */
export function drawLantern(g: Graphics, level: Level, ctx: DrawContext): void {
  g.clear();
  const p = sx({ x: level.spawn.x, y: level.spawn.y }, ctx);
  const s = ctx.fhPx * 0.13;

  g.rect(p.x - s * 0.6, p.y - s, s * 1.2, s * 1.6).fill({ color: tokens.ink, alpha: 0.95 });
  g.rect(p.x - s * 0.6, p.y - s, s * 1.2, s * 1.6).stroke({ width: Math.max(1, s * 0.12), color: tokens.candle, alpha: 0.55 });
  // The doorway itself, glowing.
  g.rect(p.x - s * 0.32, p.y - s * 0.4, s * 0.64, s * 1.0).fill({ color: tokens.ember, alpha: 0.5 });
}

/** The Gate: a glowing doorway, breathing slightly so it reads as the goal. */
export function drawGate(g: Graphics, level: Level, ctx: DrawContext, gateBonusFh: number): void {
  g.clear();
  const pad = gateBonusFh;
  const tl = sx({ x: level.gate.x - pad, y: level.gate.y - pad }, ctx);
  const br = sx({ x: level.gate.x + level.gate.w + pad, y: level.gate.y + level.gate.h + pad }, ctx);
  const w = br.x - tl.x;
  const h = br.y - tl.y;

  const pulse = ctx.reducedEffects ? 1 : 0.9 + 0.1 * Math.sin(ctx.timeMs / 520);

  for (const [scale, alpha] of [[1.5, 0.1], [1.22, 0.18], [1, 0.42]] as const) {
    const gw = w * scale;
    const gh = h * scale;
    g.roundRect(tl.x - (gw - w) / 2, tl.y - (gh - h) / 2, gw, gh, Math.min(gw, gh) * 0.2).fill({
      color: tokens.candle,
      alpha: alpha * pulse,
    });
  }
  g.roundRect(tl.x, tl.y, w, h, Math.min(w, h) * 0.2).stroke({
    width: Math.max(1, ctx.fhPx * 0.012),
    color: tokens.bone,
    alpha: 0.7,
  });
}

/**
 * A Wick: a cream wax body, two dot eyes, an amber flame with an ember core,
 * and a walk bob (SPEC PLAN Day 6). An unlit Wick keeps its body and loses the
 * flame - which is why losing one visibly darkens the level.
 */
export function drawWick(g: Graphics, w: Wick, ctx: DrawContext): void {
  if (w.state === 'saved') return;
  const p = sx({ x: w.body.x, y: w.body.y }, ctx);
  const r = config.wick.radiusFh * ctx.fhPx;

  // Walk bob: only while actually walking, so standing still looks still.
  const bob = w.state === 'walking' && !ctx.reducedEffects ? Math.sin(w.ageMs / 95) * r * 0.14 : 0;
  const y = p.y + bob;

  if (w.state === 'lost') {
    // An unlit candle, briefly, then the world forgets it.
    g.roundRect(p.x - r * 0.5, y - r * 0.6, r, r * 1.6, r * 0.3).fill({ color: tokens.wax, alpha: 0.3 });
    return;
  }

  // Body.
  g.roundRect(p.x - r * 0.52, y - r * 0.5, r * 1.04, r * 1.7, r * 0.32).fill({ color: tokens.wax, alpha: 0.96 });

  // Eyes. Wider apart and higher when fleeing an open Maw - the one piece of
  // Wick animation that carries information the player needs.
  const eyeY = y - r * 0.05;
  const eyeDx = r * (w.fleeing ? 0.26 : 0.2);
  const eyeR = r * (w.fleeing ? 0.17 : 0.13);
  g.circle(p.x - eyeDx, eyeY, eyeR).fill({ color: tokens.void, alpha: 0.9 });
  g.circle(p.x + eyeDx, eyeY, eyeR).fill({ color: tokens.void, alpha: 0.9 });

  if (!w.lit) return;

  // Flame: a teardrop, leaning with horizontal motion so a sliding Wick's
  // flame streams behind it.
  const lean = Math.max(-0.5, Math.min(0.5, w.body.vx * 0.22));
  const flicker = ctx.reducedEffects ? 1 : 0.92 + 0.08 * Math.sin(ctx.timeMs / 70 + w.id);
  const fh = r * 1.5 * flicker;
  const fx = p.x + lean * r;
  const fy = y - r * 0.55;

  g.moveTo(p.x, fy);
  g.quadraticCurveTo(fx - r * 0.44, fy - fh * 0.5, fx, fy - fh);
  g.quadraticCurveTo(fx + r * 0.44, fy - fh * 0.5, p.x, fy);
  g.fill({ color: tokens.candle, alpha: 0.95 });

  g.moveTo(p.x, fy);
  g.quadraticCurveTo(fx - r * 0.2, fy - fh * 0.3, fx * 0.5 + p.x * 0.5, fy - fh * 0.52);
  g.quadraticCurveTo(fx + r * 0.2, fy - fh * 0.3, p.x, fy);
  g.fill({ color: tokens.ember, alpha: 0.95 });
}

export function drawCrawler(g: Graphics, c: Crawler, ctx: DrawContext): void {
  if (!c.alive) return;
  const p = sx({ x: c.body.x, y: c.body.y }, ctx);
  const r = config.crawler.radiusFh * ctx.fhPx;

  // Legs first, so the body sits on top of them.
  for (let i = 0; i < 6; i++) {
    const phase = ctx.timeMs / 90 + i * 1.05;
    const side = i % 2 === 0 ? -1 : 1;
    const lx = p.x + side * r * 1.25;
    const ly = p.y + Math.sin(phase) * r * 0.42;
    g.moveTo(p.x, p.y);
    g.lineTo(lx, ly);
  }
  g.stroke({ width: Math.max(1, r * 0.17), color: tokens.mold, alpha: 0.9 });

  // A dull body alone was hard to pick out against the dark terrain it walks
  // on. A thin warm rim - the same trick the ruins use - keeps its outline
  // legible without making the Crawler itself look lit.
  g.ellipse(p.x, p.y, r * 1.08, r * 0.8).stroke({ width: Math.max(1, r * 0.1), color: tokens.candle, alpha: 0.35 });
  g.ellipse(p.x, p.y, r, r * 0.72).fill({ color: tokens.mold, alpha: c.sated ? 0.4 : 0.98 });

  // A sated Crawler has had its flame and cannot take another, so it must not
  // keep looking like a threat. Its eyes go out; it is still worth swallowing.
  if (c.sated) {
    g.circle(p.x - r * 0.3, p.y - r * 0.18, r * 0.13).fill({ color: tokens.void, alpha: 0.7 });
    g.circle(p.x + r * 0.3, p.y - r * 0.18, r * 0.13).fill({ color: tokens.void, alpha: 0.7 });
    return;
  }
  g.circle(p.x - r * 0.3, p.y - r * 0.18, r * 0.16).fill({ color: tokens.rec, alpha: 0.95 });
  g.circle(p.x + r * 0.3, p.y - r * 0.18, r * 0.16).fill({ color: tokens.rec, alpha: 0.95 });
}

export function drawDrip(g: Graphics, d: Drip, ctx: DrawContext): void {
  if (!d.alive) return;
  const p = sx({ x: d.body.x, y: d.body.y }, ctx);
  const r = config.drip.radiusFh * ctx.fhPx;
  // A teardrop with a tail, so its direction of travel is obvious.
  g.moveTo(p.x, p.y - r * 2.1);
  g.quadraticCurveTo(p.x + r, p.y - r * 0.3, p.x, p.y + r);
  g.quadraticCurveTo(p.x - r, p.y - r * 0.3, p.x, p.y - r * 2.1);
  g.fill({ color: tokens.wax, alpha: 0.85 });
}

export function drawMoth(g: Graphics, m: Moth, ctx: DrawContext): void {
  if (!m.alive) return;
  const p = sx({ x: m.body.x, y: m.body.y }, ctx);
  const r = config.moth.radiusFh * ctx.fhPx;
  const flap = Math.abs(Math.sin(ctx.timeMs / 45));

  // A soft warm halo first: a moth hunting a flame should read as carrying a
  // little of that light with it, and the glow is what keeps it visible
  // against the dark terrain rather than disappearing into it.
  g.circle(p.x, p.y, r * 1.9).fill({ color: tokens.ember, alpha: 0.14 });

  for (const side of [-1, 1] as const) {
    g.ellipse(p.x + side * r * 0.8, p.y - r * 0.2, r * (0.45 + flap * 0.5), r * 0.9).fill({
      color: tokens.bone,
      alpha: 0.85,
    });
    g.ellipse(p.x + side * r * 0.8, p.y - r * 0.2, r * (0.45 + flap * 0.5), r * 0.9).stroke({
      width: 1,
      color: tokens.ember,
      alpha: 0.4,
    });
  }
  g.ellipse(p.x, p.y, r * 0.34, r * 0.85).fill({ color: tokens.dusk, alpha: 0.95 });
  g.circle(p.x - r * 0.1, p.y - r * 0.45, r * 0.1).fill({ color: tokens.ember, alpha: 0.9 });
  g.circle(p.x + r * 0.1, p.y - r * 0.45, r * 0.1).fill({ color: tokens.ember, alpha: 0.9 });
}

/** Reusable speech bubble (SPEC section 12.7 - one at a time). */
export class SpeechBubble extends Container {
  private readonly bg = new Graphics();
  private readonly caption: Text;

  constructor() {
    super();
    this.caption = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: fonts.label,
        fontSize: 15,
        fill: tokens.bone,
        align: 'center',
        wordWrap: true,
        wordWrapWidth: 320,
      }),
    });
    this.caption.anchor.set(0.5, 1);
    this.addChild(this.bg, this.caption);
    this.visible = false;
  }

  show(text: string, screenX: number, screenY: number, fontPx: number, vp: Viewport): void {
    this.visible = true;
    this.caption.text = text;
    this.caption.style.fontSize = fontPx;
    this.caption.style.wordWrapWidth = Math.min(vp.width * 0.62, fontPx * 22);

    // Keep the bubble on screen: clamp to the viewport with a margin, and flip
    // below the speaker if there is no room above.
    const pad = fontPx * 0.5;
    const w = this.caption.width + pad * 2;
    const h = this.caption.height + pad * 1.4;
    const above = screenY - fontPx * 1.4;
    const flip = above - h < vp.offsetY + pad;
    const y = flip ? screenY + fontPx * 2.2 + h : above;
    const x = Math.min(
      vp.offsetX + vp.width - w / 2 - pad,
      Math.max(vp.offsetX + w / 2 + pad, screenX),
    );

    this.caption.position.set(x, y);
    this.bg.clear();
    this.bg
      .roundRect(x - w / 2, y - h, w, h, 3)
      .fill({ color: tokens.void, alpha: 0.78 })
      .stroke({ width: 1, color: tokens.dusk, alpha: 0.8 });
  }

  hide(): void {
    this.visible = false;
  }
}
