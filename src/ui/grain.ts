/**
 * The film grain every screen sits under (OVERHAUL 2.3), generated on a
 * canvas once at boot - no image file, nothing to licence, nothing fetched.
 *
 * A 192 px tile of `static` noise at 8 %, stored as a data URL in the `--grain`
 * CSS variable, where `.layer::after` and `.box::after` pick it up.
 */

import { staticAlpha, tokens } from '../render/tokens.ts';

const TILE_PX = 192;

export function installGrain(seed = 0x5eed): void {
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const ctx = c.getContext('2d');
  if (ctx === null) return;

  const img = ctx.createImageData(TILE_PX, TILE_PX);
  const r = (tokens.static >> 16) & 0xff;
  const g = (tokens.static >> 8) & 0xff;
  const b = tokens.static & 0xff;
  let s = seed >>> 0;
  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const n = s / 4294967296;
    // Mostly transparent, a speck here and there: grain, not a grey wash.
    const a = n > 0.55 ? (n - 0.55) / 0.45 : 0;
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = b;
    img.data[i * 4 + 3] = Math.round(a * staticAlpha * 2 * 255);
  }
  ctx.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain', `url(${c.toDataURL('image/png')})`);
}
