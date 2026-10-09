/**
 * The camcorder on-screen display (SPEC section 12.4 layer 6).
 *
 * Sits outside the post-process container, so the OSD stays crisp while the
 * picture behind it is a degraded tape. That contrast is most of what makes the
 * look read as "a camcorder recording something" rather than "a game with a
 * filter on it".
 *
 * The Maw indicator earns its place: players cannot see their own mouth, and
 * the game is about their mouth, so it is the one piece of the HUD that teaches
 * something they cannot otherwise learn.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { config } from '../config.ts';
import type { WorldSnapshot } from '../physics/world.ts';
import type { Viewport } from '../terrain/mapping.ts';
import { fonts, tokens } from './tokens.ts';

function osdStyle(size: number, color: number = tokens.bone): TextStyle {
  return new TextStyle({ fontFamily: fonts.osd, fontSize: size, fill: color, letterSpacing: 1.2 });
}

/** mm:ss:ff at 25 frames, which is what a camcorder timestamp looks like. */
export function formatTimecode(ms: number): string {
  const total = Math.max(0, Math.floor(ms));
  const mm = Math.floor(total / 60_000);
  const ss = Math.floor((total % 60_000) / 1000);
  const ff = Math.floor(((total % 1000) / 1000) * 25);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(mm)}:${p(ss)}:${p(ff)}`;
}

export class Osd extends Container {
  private readonly recDot = new Graphics();
  private readonly recText: Text;
  private readonly timecode: Text;
  private readonly tapeLabel: Text;
  private readonly sp: Text;
  private readonly battery = new Graphics();
  private readonly candleBar = new Graphics();
  private readonly candleCount: Text;
  private readonly mawIcon = new Graphics();
  private readonly mawLabel: Text;
  private readonly scoreText: Text;
  private readonly waveText: Text;
  private readonly procText: Text;

  constructor() {
    super();
    this.recText = new Text({ text: 'REC', style: osdStyle(20) });
    this.timecode = new Text({ text: '00:00:00', style: osdStyle(20) });
    this.tapeLabel = new Text({ text: '', style: osdStyle(20) });
    this.sp = new Text({ text: 'SP', style: osdStyle(20) });
    this.candleCount = new Text({ text: '', style: osdStyle(18, tokens.boneDim) });
    this.mawLabel = new Text({ text: 'MAW', style: osdStyle(16, tokens.boneDim) });
    this.scoreText = new Text({ text: '', style: osdStyle(22, tokens.candle) });
    this.waveText = new Text({ text: '', style: osdStyle(18, tokens.boneDim) });
    this.procText = new Text({ text: '', style: osdStyle(20, tokens.candle) });

    this.addChild(
      this.recDot,
      this.recText,
      this.timecode,
      this.tapeLabel,
      this.sp,
      this.battery,
      this.candleBar,
      this.candleCount,
      this.mawIcon,
      this.mawLabel,
      this.scoreText,
      this.waveText,
      this.procText,
    );
  }

  /** Lays the OSD out for a viewport. Called on resize, not every frame. */
  layout(vp: Viewport): void {
    const size = Math.max(12, Math.round(vp.height * 0.032));
    const pad = Math.round(vp.height * 0.035);
    const left = vp.offsetX + pad;
    const right = vp.offsetX + vp.width - pad;
    const top = vp.offsetY + pad;
    const bottom = vp.offsetY + vp.height - pad;

    for (const t of [this.recText, this.timecode, this.tapeLabel, this.sp, this.scoreText, this.procText]) {
      t.style.fontSize = size;
    }
    this.candleCount.style.fontSize = Math.round(size * 0.9);
    this.waveText.style.fontSize = Math.round(size * 0.9);
    this.mawLabel.style.fontSize = Math.round(size * 0.78);

    const dotR = size * 0.26;
    this.recDot.clear().circle(left + dotR, top + size * 0.52, dotR).fill({ color: tokens.rec });
    this.recText.position.set(left + dotR * 2 + size * 0.35, top);
    this.timecode.position.set(left, top + size * 1.2);

    this.sp.anchor.set(1, 0);
    this.sp.position.set(right, top);
    this.tapeLabel.anchor.set(1, 0);
    this.tapeLabel.position.set(right, top + size * 1.2);

    // Decorative battery, bottom of the right stack.
    const bw = size * 1.5;
    const bh = size * 0.62;
    this.battery
      .clear()
      .rect(right - bw, top + size * 2.5, bw, bh)
      .stroke({ width: 1, color: tokens.boneDim, alpha: 0.8 })
      .rect(right - bw + 2, top + size * 2.5 + 2, bw * 0.62 - 2, bh - 4)
      .fill({ color: tokens.boneDim, alpha: 0.8 })
      .rect(right, top + size * 2.5 + bh * 0.28, 2, bh * 0.44)
      .fill({ color: tokens.boneDim, alpha: 0.8 });

    this.scoreText.anchor.set(1, 1);
    this.scoreText.position.set(right, bottom - size * 1.5);
    this.waveText.anchor.set(1, 1);
    this.waveText.position.set(right, bottom - size * 0.2);

    this.candleCount.position.set(left, bottom - size * 0.95);
    this.candleBar.position.set(left, bottom - size * 2.5);

    this.mawLabel.anchor.set(0.5, 1);
    this.mawLabel.position.set(vp.offsetX + vp.width / 2, bottom);
    this.mawIcon.position.set(vp.offsetX + vp.width / 2, bottom - size * 1.5);

    this.procText.anchor.set(0, 1);
    this.procText.position.set(left, bottom - size * 3.6);

    this.lastSize = size;

    // Everything memoised in `update` was drawn at the old size, so a resize
    // has to invalidate it or the candle row and Maw icon keep the old scale.
    this.lastCandleKey = '';
    this.lastMawOpen = null;
  }

  private lastSize = 16;

  /**
   * Memos for the per-frame work that used to be unconditional. The OSD is
   * updated every rendered frame, but almost nothing on it changes that often:
   * the score changes on a save, the candle row changes on an outcome, the
   * Maw icon changes on a state flip. Rebuilding all of it 60 times a second -
   * including an Intl `toLocaleString` call and two full Graphics rebuilds -
   * was spending frame budget that the face contour needed.
   */
  private lastScore = -1;
  private lastTimecode = '';
  private lastLabel = '';
  private lastCandleKey = '';
  private lastCountText = '';
  private lastMawOpen: boolean | null = null;
  private lastWaveText = '';
  private lastProcText = '';

  update(snap: WorldSnapshot, label: string, timeMs: number, reducedEffects: boolean, endless: boolean): void {
    const size = this.lastSize;

    // REC dot blinks at 1 Hz (config.render.effects.recDot.maxFlashHz).
    const hz = config.render.effects.recDot.maxFlashHz;
    this.recDot.alpha = reducedEffects ? 1 : (Math.floor((timeMs / 1000) * hz * 2) % 2 === 0 ? 1 : 0.18);

    const tc = formatTimecode(snap.elapsedMs);
    if (tc !== this.lastTimecode) {
      this.timecode.text = tc;
      this.lastTimecode = tc;
    }
    if (label !== this.lastLabel) {
      this.tapeLabel.text = label;
      this.lastLabel = label;
    }

    // Candle counter: lit for each saved Wick, unlit for each lost one.
    // Rebuilt only when an outcome actually changes.
    const candleKey = `${snap.spawned}:${snap.saved}:${snap.lost}`;
    if (candleKey !== this.lastCandleKey) {
      this.lastCandleKey = candleKey;
      this.candleBar.clear();
      const iconW = size * 0.42;
      const gap = size * 0.2;
      const shown = Math.min(14, snap.spawned);
      for (let i = 0; i < shown; i++) {
        const outcome = snap.outcomes[i];
        const x = i * (iconW + gap);
        const lit = outcome === 'saved';
        const pending = outcome === 'alive';
        this.candleBar
          .rect(x, size * 0.5, iconW, size * 0.95)
          .fill({ color: tokens.wax, alpha: lit ? 0.95 : pending ? 0.4 : 0.14 });
        if (lit) {
          this.candleBar.circle(x + iconW / 2, size * 0.32, iconW * 0.42).fill({ color: tokens.candle, alpha: 0.95 });
        }
      }
    }

    const countText = endless
      ? `SAVED ${snap.saved}  LOST ${snap.lost}/${config.endless.lossesAllowed}`
      : `${snap.saved}/${snap.spawned} SAVED`;
    if (countText !== this.lastCountText) {
      this.candleCount.text = countText;
      this.lastCountText = countText;
    }

    // The Maw indicator: lips that glow `rec` while open (SPEC section 12.4).
    // Only two shapes exist, so it is redrawn on the flip, not every frame.
    const open = snap.maw.open;
    if (open !== this.lastMawOpen) {
      this.lastMawOpen = open;
      const w = size * 1.5;
      const h = size * (open ? 0.72 : 0.2);
      this.mawIcon.clear();
      this.mawIcon
        .moveTo(-w / 2, 0)
        .quadraticCurveTo(0, -h, w / 2, 0)
        .quadraticCurveTo(0, h, -w / 2, 0)
        .fill({ color: open ? tokens.rec : tokens.ink, alpha: open ? 0.85 : 0.6 })
        .stroke({ width: 1.5, color: open ? tokens.rec : tokens.boneDim, alpha: open ? 1 : 0.6 });
      this.mawLabel.style.fill = open ? tokens.rec : tokens.boneDim;
    }

    // `toLocaleString` is an Intl call; it has no business running 60 times a
    // second for a number that changes when a Wick reaches the Gate.
    if (snap.score !== this.lastScore) {
      this.lastScore = snap.score;
      this.scoreText.text = snap.score.toLocaleString('en-US');
    }

    const waveText = endless ? `WAVE ${snap.wave}` : `${Math.ceil(snap.timeLeftS)}s`;
    if (waveText !== this.lastWaveText) {
      this.waveText.text = waveText;
      this.lastWaveText = waveText;
    }

    // U3 - the Procession multiplier. Hidden at x1 so it only appears when it means something.
    const procText = snap.procession.multiple > 1 ? `PROCESSION x${snap.procession.multiple}` : '';
    if (procText !== this.lastProcText) {
      this.procText.text = procText;
      this.lastProcText = procText;
    }
  }
}
