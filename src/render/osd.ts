/**
 * The camcorder on-screen display (docs/OVERHAUL.md section 3.1, after Iron
 * Lung: almost no UI). Four corners and nothing else:
 *
 *   top-left      ● REC 00:01:12
 *   top-right     T02/3
 *   bottom-left   one candle per Wick: lit, out, or still to come
 *   bottom-right  the Maw: lips, dim while shut, blood-red while open
 *
 * Composure is not on the OSD at all - it is shown by the picture (the stage
 * closes the vignette and thickens the grain as it falls).
 *
 * Below 30 % composure the OSD briefly shows things it should not, for one
 * frame at a time (The Mortuary Assistant): "REC" reads "SEE", or there is
 * one Wick too many. A text change, never a change in brightness.
 *
 * Sits outside the post-process container, so it stays crisp over the tape.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { config } from '../config.ts';
import type { WorldSnapshot } from '../physics/world.ts';
import type { Viewport } from '../terrain/mapping.ts';
import { fonts, tokens } from './tokens.ts';

function osdStyle(size: number, color: number = tokens.bone): TextStyle {
  return new TextStyle({ fontFamily: fonts.osd, fontSize: size, fill: color, letterSpacing: 1.4 });
}

/** hh:mm:ss, which is what a camcorder's tape counter shows. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

/** `02-3` -> `T02/3`; the daily and the Long Tape get their own marks. */
export function tapeMark(levelId: string, mode: 'story' | 'daily' | 'endless', wave = 0): string {
  if (mode === 'daily') return 'DAILY';
  if (mode === 'endless') return `LONG W${String(wave).padStart(2, '0')}`;
  const [tape, chapter] = levelId.split('-');
  return `T${tape ?? '00'}/${Number(chapter ?? 1)}`;
}

export interface OsdInput {
  snap: WorldSnapshot;
  mark: string;
  /** How many Wicks the level will spawn in all, so the row is full from the start. */
  rosterSize: number;
  timeMs: number;
  reducedEffects: boolean;
  /** Composure 0..1, for the glitch. */
  composure: number;
  /** Glitches are a scare; Scares off means none. */
  glitches: boolean;
}

export class Osd extends Container {
  private readonly recDot = new Graphics();
  private readonly recText: Text;
  private readonly mark: Text;
  private readonly wicks = new Graphics();
  private readonly maw = new Graphics();

  private size = 16;
  private left = 0;
  private right = 0;
  private bottom = 0;

  private lastRec = '';
  private lastMark = '';
  private lastWickKey = '';
  private lastMawOpen: boolean | null = null;
  /** Until when, on the render clock, the current glitch shows; and when the next may start. */
  private glitchUntilMs = 0;
  private nextGlitchAtMs = 0;
  private glitch: 'see' | 'extra' | null = null;

  constructor() {
    super();
    this.recText = new Text({ text: 'REC 00:00:00', style: osdStyle(20) });
    this.mark = new Text({ text: '', style: osdStyle(20) });
    this.addChild(this.recDot, this.recText, this.mark, this.wicks, this.maw);
  }

  /** Lays the OSD out for a viewport. Called on resize, not every frame. */
  layout(vp: Viewport): void {
    const size = Math.max(14, Math.round(vp.height * 0.036));
    const pad = Math.round(vp.height * 0.05);
    this.size = size;
    this.left = vp.offsetX + pad;
    this.right = vp.offsetX + vp.width - pad;
    this.bottom = vp.offsetY + vp.height - pad;
    const top = vp.offsetY + pad;

    this.recText.style.fontSize = size;
    this.mark.style.fontSize = size;

    const dotR = size * 0.24;
    this.recDot.clear().circle(this.left + dotR, top + size * 0.52, dotR).fill({ color: tokens.rec });
    this.recText.position.set(this.left + dotR * 2 + size * 0.3, top);
    this.mark.anchor.set(1, 0);
    this.mark.position.set(this.right, top);

    this.wicks.position.set(this.left, this.bottom - size * 1.5);
    this.maw.position.set(this.right - size * 0.9, this.bottom - size * 0.45);

    // Everything memoised in `update` was drawn at the old size.
    this.lastWickKey = '';
    this.lastMawOpen = null;
  }

  update(input: OsdInput): void {
    const { snap, timeMs } = input;
    const size = this.size;

    // REC dot blinks at 1 Hz (config.render.effects.recDot.maxFlashHz).
    const hz = config.render.effects.recDot.maxFlashHz;
    this.recDot.alpha = input.reducedEffects ? 1 : Math.floor((timeMs / 1000) * hz * 2) % 2 === 0 ? 1 : 0.18;

    this.updateGlitch(input);

    const rec = `${this.glitch === 'see' ? 'SEE' : 'REC'} ${formatTimecode(snap.elapsedMs)}`;
    if (rec !== this.lastRec) {
      this.recText.text = rec;
      this.lastRec = rec;
    }
    if (input.mark !== this.lastMark) {
      this.mark.text = input.mark;
      this.lastMark = input.mark;
    }

    // One candle per Wick: lit when saved, dark when lost, faint until then.
    const extra = this.glitch === 'extra' ? 1 : 0;
    const roster = Math.min(config.hud.maxWickIconsCount, Math.max(input.rosterSize, snap.spawned) + extra);
    const wickKey = `${roster}:${snap.outcomes.join(',')}`;
    if (wickKey !== this.lastWickKey) {
      this.lastWickKey = wickKey;
      const g = this.wicks.clear();
      const w = size * 0.36;
      const gap = size * 0.24;
      for (let i = 0; i < roster; i++) {
        const outcome = snap.outcomes[i];
        const x = i * (w + gap);
        const lit = outcome === 'saved';
        const lost = outcome !== undefined && outcome !== 'saved' && outcome !== 'alive';
        g.rect(x, size * 0.45, w, size * 0.9).fill({ color: lost ? tokens.rot : tokens.wax, alpha: lit ? 0.95 : lost ? 0.9 : 0.3 });
        if (lit) g.circle(x + w / 2, size * 0.26, w * 0.42).fill({ color: tokens.candle, alpha: 0.95 });
      }
    }

    // The Maw: lips, dim while shut and blood-red while open. Two shapes only,
    // so it is redrawn on the flip, never per frame.
    const open = snap.maw.open;
    if (open !== this.lastMawOpen) {
      this.lastMawOpen = open;
      const w = size * 1.6;
      const h = size * (open ? 0.75 : 0.22);
      this.maw
        .clear()
        .moveTo(-w / 2, 0)
        .quadraticCurveTo(0, -h, w / 2, 0)
        .quadraticCurveTo(0, h, -w / 2, 0)
        .fill({ color: open ? tokens.blood : tokens.ink, alpha: open ? 0.95 : 0.6 })
        .stroke({ width: 1.5, color: open ? tokens.rec : tokens.boneDim, alpha: open ? 0.9 : 0.55 });
    }
  }

  /** One frame of wrongness every few seconds, only while composure is low. */
  private updateGlitch(input: OsdInput): void {
    const now = input.timeMs;
    if (this.glitch !== null && now >= this.glitchUntilMs) this.glitch = null;
    if (!input.glitches || input.composure >= config.hud.glitchBelowComposureFraction) {
      this.glitch = null;
      return;
    }
    if (this.glitch === null && now >= this.nextGlitchAtMs) {
      this.glitch = Math.random() < 0.5 ? 'see' : 'extra';
      this.glitchUntilMs = now + config.hud.glitchMs;
      const [lo, hi] = config.hud.glitchGapMs;
      this.nextGlitchAtMs = now + lo + Math.random() * (hi - lo);
    }
  }
}
