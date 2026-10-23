/**
 * The `?debug=1` overlay (docs/OVERHAUL.md section 7.1).
 *
 * Five numbers, updated four times a second, in the corner of the real game -
 * not on the separate debug page - because the regression it exists to catch
 * only shows up with the whole game running around the tracker:
 *
 *   tracker Hz   new landmark frames per second (must hold >= 25)
 *   render fps   game loop rate
 *   frame ms     worst frame of the last second
 *   detect ms    wall time of one `detectForVideo` call
 *   offset px    how far the nose-tip contour sits from the nose tip in the
 *                video picture. Measured through the video sprite's own
 *                transform, so any mirroring, aspect or lift change that moves
 *                the terrain off the face shows up here as a number.
 */

import { el } from './dom.ts';

export interface DebugSample {
  trackerHz: number;
  fps: number;
  worstFrameMs: number;
  detectMs: number | null;
  offsetPx: number | null;
}

export function debugEnabled(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1';
  } catch {
    return false;
  }
}

export class DebugOverlay {
  readonly node: HTMLElement;
  private readonly text: HTMLElement;
  private lastMs = 0;

  constructor() {
    this.text = el('pre', { class: 'debug-overlay-text' });
    this.node = el('div', { class: 'debug-overlay', 'aria-hidden': 'true' }, [this.text]);
  }

  /** Cheap to call every frame; only writes the DOM four times a second. */
  update(nowMs: number, s: DebugSample): void {
    if (nowMs - this.lastMs < 250) return;
    this.lastMs = nowMs;
    const f = (n: number | null, d = 1): string => (n === null ? '  -' : n.toFixed(d).padStart(5));
    this.text.textContent = [
      `tracker Hz ${f(s.trackerHz)}${s.trackerHz > 0 && s.trackerHz < 25 ? '  LOW' : ''}`,
      `render fps ${f(s.fps)}`,
      `frame ms   ${f(s.worstFrameMs)}`,
      `detect ms  ${f(s.detectMs)}`,
      `offset px  ${f(s.offsetPx)}`,
    ].join('\n');
  }
}
