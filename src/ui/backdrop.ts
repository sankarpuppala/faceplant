/**
 * The room behind the title (docs/OVERHAUL.md section 3.1, after Inscryption:
 * the menu is a place, and something in it is watching you).
 *
 * A dark room, a table edge, one candle - and behind it, almost lost in the
 * dark, a face. Its eyes are shut. Leave the title alone for 20 seconds and
 * they open, slowly, over four. Touch anything and they close again.
 *
 * Inline SVG and CSS only, no image files. Nothing changes brightness quickly:
 * the eyes open over seconds, and the flame sways at under 2 Hz. "Reduce
 * effects" and `prefers-reduced-motion` stop the flame (see tokens.css); the
 * eyes still open, because that is a slow fade, not motion.
 */

import { config } from '../config.ts';
import { hex, tokens } from '../render/tokens.ts';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/**
 * @param kind `title` is the room with the face; `plain` is the same dark room
 *   with only the candle, for screens that should not be watched.
 */
export function backdrop(kind: 'title' | 'plain' = 'title'): HTMLElement {
  const root = document.createElement('div');
  root.className = `backdrop backdrop-${kind}`;
  root.setAttribute('aria-hidden', 'true');

  const scene = svgEl('svg', { viewBox: '0 0 1000 600', preserveAspectRatio: 'xMidYMid slice', class: 'bd-scene' });

  const defs = svgEl('defs', {});
  const glow = svgEl('radialGradient', { id: 'bd-glow', r: '0.5' });
  glow.appendChild(svgEl('stop', { offset: '0', 'stop-color': hex(tokens.candle), 'stop-opacity': '0.22' }));
  glow.appendChild(svgEl('stop', { offset: '0.5', 'stop-color': hex(tokens.ember), 'stop-opacity': '0.05' }));
  glow.appendChild(svgEl('stop', { offset: '1', 'stop-color': hex(tokens.void), 'stop-opacity': '0' }));
  defs.appendChild(glow);
  const skin = svgEl('radialGradient', { id: 'bd-skin', cx: '0.5', cy: '0.62', r: '0.55' });
  skin.appendChild(svgEl('stop', { offset: '0', 'stop-color': hex(tokens.rot), 'stop-opacity': '0.9' }));
  skin.appendChild(svgEl('stop', { offset: '1', 'stop-color': hex(tokens.void), 'stop-opacity': '0' }));
  defs.appendChild(skin);
  scene.appendChild(defs);

  if (kind === 'title') {
    // The face: a long oval lit faintly from below by the candle, so only the
    // chin, the cheekbones and the underside of the brow catch anything.
    const face = svgEl('g', { class: 'bd-face' });
    face.appendChild(svgEl('ellipse', { cx: 500, cy: 300, rx: 210, ry: 270, fill: 'url(#bd-skin)' }));
    const line = { fill: 'none', stroke: hex(tokens.boneDim), 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.35 };
    face.appendChild(svgEl('path', { ...line, d: 'M330 420 Q360 540 500 566 Q640 540 670 420' }));
    face.appendChild(svgEl('path', { ...line, d: 'M372 236 Q420 214 466 232' }));
    face.appendChild(svgEl('path', { ...line, d: 'M534 230 Q580 212 628 236' }));
    face.appendChild(svgEl('path', { ...line, d: 'M440 470 Q500 482 560 470', opacity: 0.25 }));
    scene.appendChild(face);

    // The eyes: two lids, shut. `.awake` on the root fades the lids out and
    // the pupils in. Slightly misaligned, because a face that is a little
    // wrong is worse than one that is very wrong.
    const eyes = svgEl('g', { class: 'bd-eyes' });
    for (const [x, y] of [
      [418, 262],
      [584, 266],
    ] as const) {
      eyes.appendChild(svgEl('ellipse', { cx: x, cy: y, rx: 34, ry: 14, fill: hex(tokens.void), class: 'bd-socket' }));
      eyes.appendChild(svgEl('circle', { cx: x + 3, cy: y + 1, r: 3.2, fill: hex(tokens.bone), class: 'bd-pupil' }));
      eyes.appendChild(svgEl('path', { d: `M${x - 34} ${y} Q${x} ${y + 9} ${x + 34} ${y}`, fill: 'none', stroke: hex(tokens.boneDim), 'stroke-width': 2, class: 'bd-lid', opacity: 0.4 }));
    }
    scene.appendChild(eyes);
  }

  // The table edge, and the one candle on it - raised into the middle of the
  // frame, so the menu buttons sit on the table below it, not over the flame.
  const table = svgEl('g', { transform: 'translate(0 -96)' });
  scene.appendChild(table);
  table.appendChild(svgEl('rect', { x: 0, y: 548, width: 1000, height: 160, fill: hex(tokens.ink) }));
  table.appendChild(svgEl('ellipse', { cx: 500, cy: 520, rx: 220, ry: 150, fill: 'url(#bd-glow)', class: 'bd-halo' }));
  const candle = svgEl('g', { class: 'bd-candle' });
  candle.appendChild(svgEl('rect', { x: 489, y: 500, width: 22, height: 50, fill: hex(tokens.wax), opacity: 0.85 }));
  candle.appendChild(svgEl('rect', { x: 499, y: 492, width: 2, height: 9, fill: hex(tokens.rot) }));
  const flame = svgEl('g', { class: 'bd-flame' });
  flame.appendChild(svgEl('path', { d: 'M500 462c-6 9-9 15-9 21a9 9 0 0 0 18 0c0-6-3-12-9-21z', fill: hex(tokens.candle) }));
  flame.appendChild(svgEl('path', { d: 'M500 474c-3 5-4 8-4 11a4 4 0 0 0 8 0c0-3-1-6-4-11z', fill: hex(tokens.ember) }));
  candle.appendChild(flame);
  table.appendChild(candle);

  root.appendChild(scene);

  if (kind === 'title') watchForIdle(root);
  return root;
}

/**
 * Opens the eyes after `config.title.eyesOpenAfterIdleMs` with no input, and
 * shuts them on the next one. Stops itself once the title is gone.
 */
function watchForIdle(root: HTMLElement): void {
  let last = performance.now();
  const wake = (): void => {
    last = performance.now();
    root.classList.remove('awake');
  };
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  window.addEventListener('keydown', wake);

  const timer = window.setInterval(() => {
    // The title is a detached element once another screen replaces it.
    if (!root.isConnected && performance.now() - last > 1000) {
      window.clearInterval(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      return;
    }
    if (performance.now() - last >= config.title.eyesOpenAfterIdleMs) root.classList.add('awake');
  }, 500);
}
