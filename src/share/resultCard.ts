/**
 * The result card (SPEC section 16): a 1080x1350 PNG, downloaded locally.
 *
 * Drawn on a 2D canvas rather than captured from the Pixi stage, because the
 * card has to be portrait and legible at thumbnail size while the game is
 * 16:9. The freeze-frame is composited in from the stage canvas, so the card
 * shows whatever filter the player was using - including INK, where no face
 * appears at all (decision D8).
 *
 * Nothing is uploaded. The PNG goes straight to a download.
 */

import type { RunResult } from '../game/rules.ts';
import { hex, tokens } from '../render/tokens.ts';
import { gameUrl, outcomeRow } from './shareText.ts';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface CardOptions {
  result: RunResult;
  /** The game canvas, drawn in as the freeze-frame. */
  frame: HTMLCanvasElement | null;
  url?: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawResultCard(opts: CardOptions): HTMLCanvasElement {
  const { result } = opts;
  const url = opts.url ?? gameUrl();

  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('A 2D canvas is required for the result card.');

  ctx.fillStyle = hex(tokens.void);
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // --- freeze-frame, cropped to a 4:3 window at the top -------------------
  const frameH = 760;
  if (opts.frame !== null && opts.frame.width > 0 && opts.frame.height > 0) {
    const src = opts.frame;
    // Cover the window, centred, so the face stays in shot.
    const scale = Math.max(CARD_WIDTH / src.width, frameH / src.height);
    const dw = src.width * scale;
    const dh = src.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CARD_WIDTH, frameH);
    ctx.clip();
    ctx.drawImage(src, (CARD_WIDTH - dw) / 2, (frameH - dh) / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = hex(tokens.ink);
    ctx.fillRect(0, 0, CARD_WIDTH, frameH);
  }

  // Scanlines over the frame, so the card matches the game's look.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let y = 0; y < frameH; y += 4) ctx.fillRect(0, y, CARD_WIDTH, 2);

  // Fade the bottom of the frame into the card body.
  const fade = ctx.createLinearGradient(0, frameH - 220, 0, frameH);
  fade.addColorStop(0, 'rgba(7,6,10,0)');
  fade.addColorStop(1, hex(tokens.void));
  ctx.fillStyle = fade;
  ctx.fillRect(0, frameH - 220, CARD_WIDTH, 220);

  // --- the stamp ----------------------------------------------------------
  const stampColor =
    result.stamp === 'LIGHTS OUT'
      ? hex(tokens.boneDim)
      : result.stamp === 'THE MAW AWOKE' || result.stamp === 'CRACKED'
        ? hex(tokens.rec)
        : hex(tokens.candle);

  ctx.save();
  ctx.translate(CARD_WIDTH / 2, frameH - 90);
  ctx.rotate((-5 * Math.PI) / 180);
  ctx.font = '64px "Special Elite", "Courier New", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const stampW = ctx.measureText(result.stamp).width + 64;
  ctx.strokeStyle = stampColor;
  ctx.lineWidth = 6;
  roundRect(ctx, -stampW / 2, -56, stampW, 112, 4);
  ctx.stroke();
  ctx.fillStyle = stampColor;
  ctx.fillText(result.stamp, 0, 4);
  ctx.restore();

  // --- the wordmark -------------------------------------------------------
  let y = frameH + 110;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = hex(tokens.bone);
  ctx.font = '72px "Special Elite", "Courier New", serif';
  ctx.letterSpacing = '14px';
  ctx.fillText('FACEPLANT', CARD_WIDTH / 2, y);
  ctx.letterSpacing = '0px';

  y += 56;
  ctx.fillStyle = hex(tokens.boneDim);
  ctx.font = '34px "VT323", "Courier New", monospace';
  ctx.fillText(
    result.mode === 'daily' ? result.label : result.mode === 'endless' ? 'THE LONG TAPE' : `TAPE ${result.levelId.toUpperCase()} · ${result.title}`,
    CARD_WIDTH / 2,
    y,
  );

  // --- the emoji row: one per Wick, in spawn order -----------------------
  y += 86;
  const row = outcomeRow(result.outcomes);
  // Shrink to fit rather than wrap: the row's shape is the story.
  let size = 56;
  ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  while (ctx.measureText(row).width > CARD_WIDTH - 120 && size > 20) {
    size -= 4;
    ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  }
  ctx.fillStyle = hex(tokens.bone);
  ctx.fillText(row, CARD_WIDTH / 2, y);

  // --- stats --------------------------------------------------------------
  y += 94;
  ctx.font = '40px "VT323", "Courier New", monospace';
  ctx.fillStyle = hex(tokens.bone);
  const headline =
    result.mode === 'endless'
      ? `wave ${result.wave} · saved ${result.saved}`
      : `saved ${result.saved}/${result.spawned} · the maw woke ${result.mawWokeCount}x`;
  ctx.fillText(headline, CARD_WIDTH / 2, y);

  y += 52;
  ctx.fillStyle = hex(tokens.candle);
  ctx.fillText(`composure ${Math.round(result.composureLeft * 100)}%`, CARD_WIDTH / 2, y);

  y += 48;
  ctx.fillStyle = hex(tokens.boneDim);
  ctx.font = '32px "VT323", "Courier New", monospace';
  const extras: string[] = [`${result.score.toLocaleString('en-US')} pts`];
  if (result.bestProcession > 1) extras.push(`procession x${result.bestProcession}`);
  if (result.offerings > 0) extras.push(`${result.offerings} offering${result.offerings === 1 ? '' : 's'}`);
  ctx.fillText(extras.join(' · '), CARD_WIDTH / 2, y);

  // --- footer -------------------------------------------------------------
  ctx.fillStyle = hex(tokens.boneDim);
  ctx.font = '30px "VT323", "Courier New", monospace';
  ctx.fillText(url.replace(/^https?:\/\//, ''), CARD_WIDTH / 2, CARD_HEIGHT - 52);

  // Vignette, to finish the tape look.
  const vig = ctx.createRadialGradient(CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH * 0.3, CARD_WIDTH / 2, CARD_HEIGHT / 2, CARD_WIDTH * 0.85);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  return canvas;
}

/** Triggers a local download. Nothing leaves the device. */
export function downloadCanvas(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (blob === null) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    // Give the browser a moment to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

export function cardFilename(result: RunResult): string {
  const tag = result.mode === 'daily' ? result.label.replace(/[^\w]+/g, '-').toLowerCase() : result.levelId;
  return `faceplant-${tag}.png`;
}
