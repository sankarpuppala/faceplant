/**
 * The portrait capture canvas (SPEC section 16, decision D9).
 *
 * The game is 16:9; short-video platforms are 9:16. Rather than letterbox - a
 * clip with black bars is a clip nobody watches - this crops a 9:16 window out
 * of the stage, centred on the face, and re-lays the OSD for portrait.
 *
 * It is a plain 2D canvas that copies from the WebGL canvas each frame, so it
 * costs one drawImage and needs no second renderer.
 */

import { config } from '../config.ts';
import { hex, tokens } from '../render/tokens.ts';
import type { WorldSnapshot } from '../physics/world.ts';

export interface PortraitFrameInput {
  /** The live game canvas. */
  source: HTMLCanvasElement;
  /** Where the face is on the source canvas, in px; the crop follows it. */
  faceScreenX: number;
  faceScreenY: number;
  snapshot: WorldSnapshot;
  label: string;
  timeMs: number;
}

export class PortraitCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Eased crop centre, so the clip pans smoothly instead of snapping. */
  private panX: number | null = null;
  private panY: number | null = null;

  constructor() {
    const c = document.createElement('canvas');
    c.width = config.clip.width;
    c.height = config.clip.height;
    const ctx = c.getContext('2d', { alpha: false });
    if (ctx === null) throw new Error('A 2D canvas is required for portrait capture.');
    this.canvas = c;
    this.ctx = ctx;
  }

  /** Copies one frame. Call once per rendered frame while recording. */
  draw(input: PortraitFrameInput): void {
    const { ctx, canvas } = this;
    const src = input.source;
    if (src.width === 0 || src.height === 0) return;

    ctx.fillStyle = hex(tokens.void);
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // The crop window: as tall as the source, 9:16 wide.
    const cropH = src.height;
    const cropW = Math.min(src.width, cropH * (canvas.width / canvas.height));

    const targetX = input.faceScreenX;
    const targetY = input.faceScreenY;
    this.panX = this.panX === null ? targetX : this.panX + (targetX - this.panX) * 0.12;
    this.panY = this.panY === null ? targetY : this.panY + (targetY - this.panY) * 0.12;

    const sx = Math.max(0, Math.min(src.width - cropW, this.panX - cropW / 2));
    const sy = Math.max(0, Math.min(src.height - cropH, this.panY - cropH / 2));

    ctx.drawImage(src, sx, sy, cropW, cropH, 0, 0, canvas.width, canvas.height);

    this.drawPortraitOsd(input);
  }

  /** A minimal OSD, re-laid for the taller frame. */
  private drawPortraitOsd(input: PortraitFrameInput): void {
    const { ctx, canvas } = this;
    const { snapshot } = input;
    const pad = 36;

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // REC, blinking at 1 Hz (config.render.effects.recDot.maxFlashHz).
    const on = Math.floor(input.timeMs / 500) % 2 === 0;
    ctx.fillStyle = hex(tokens.rec);
    ctx.globalAlpha = on ? 1 : 0.2;
    ctx.beginPath();
    ctx.arc(pad + 9, pad + 15, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '30px "VT323", "Courier New", monospace';
    ctx.fillStyle = hex(tokens.bone);
    ctx.fillText('REC', pad + 26, pad);
    ctx.textAlign = 'right';
    ctx.fillText(input.label, canvas.width - pad, pad);

    // U1 - the composure bar. This is the single most important thing in the
    // clip: it is what makes a silent six seconds legible to a stranger.
    const barW = canvas.width - pad * 2;
    const barY = canvas.height - 150;
    ctx.textAlign = 'left';
    ctx.font = '26px "VT323", "Courier New", monospace';
    ctx.fillStyle = hex(tokens.boneDim);
    ctx.fillText('COMPOSURE', pad, barY - 34);

    ctx.fillStyle = '#140f19';
    ctx.fillRect(pad, barY, barW, 14);
    const frac = Math.max(0, Math.min(1, snapshot.composure.fraction));
    ctx.fillStyle =
      snapshot.composure.mood === 'panic'
        ? hex(tokens.rec)
        : snapshot.composure.mood === 'cracking'
          ? hex(tokens.ember)
          : hex(tokens.candle);
    ctx.fillRect(pad, barY, barW * frac, 14);

    // Saved / lost, big enough to read on a phone.
    ctx.font = '44px "VT323", "Courier New", monospace';
    ctx.fillStyle = hex(tokens.bone);
    ctx.fillText(`${snapshot.saved} saved`, pad, barY + 36);
    if (snapshot.procession.multiple > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = hex(tokens.candle);
      ctx.fillText(`x${snapshot.procession.multiple}`, canvas.width - pad, barY + 36);
    }

    // Wordmark, so a reposted clip still carries the name (pillar 4).
    ctx.textAlign = 'center';
    ctx.font = '34px "Special Elite", "Courier New", serif';
    ctx.fillStyle = hex(tokens.boneDim);
    ctx.fillText('FACEPLANT', canvas.width / 2, canvas.height - 58);
  }

  /** The result card tail (SPEC section 16: the last 2 s show the card). */
  drawCard(card: HTMLCanvasElement): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = hex(tokens.void);
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / card.width, canvas.height / card.height);
    const w = card.width * scale;
    const h = card.height * scale;
    ctx.drawImage(card, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }

  reset(): void {
    this.panX = null;
    this.panY = null;
  }
}
