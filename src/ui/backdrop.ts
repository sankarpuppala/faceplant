/**
 * The room behind the menus.
 *
 * The first thing anyone sees - the safety notice, then the title - was text
 * on a flat black page. All of the camcorder atmosphere lived in the game
 * canvas, and a menu that is a blank screen with a heading on it is not the
 * front of a horror game, it is the front of a settings dialog.
 *
 * This is a candle-lit hall drawn from inline SVG and CSS, no image files:
 * a drifting fog, embers rising off a row of Wicks along the floor, and a huge
 * face looking out of the dark behind the wordmark with its eyes slowly
 * waking. Everything moves on cycles of 2.5 seconds or longer, none of it
 * changes luminance sharply, and `body.reduced-effects` and
 * `prefers-reduced-motion` (see tokens.css) stop every animation in it, so it
 * stays inside the photosensitivity rules (CLAUDE.md invariant 4) by
 * construction rather than by checking.
 */

import { hex, tokens } from '../render/tokens.ts';

const NS = 'http://www.w3.org/2000/svg';

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

/** A small deterministic generator, so the embers are the same every visit. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One tiny candle-headed creature, standing, for the row along the floor. */
function wick(x: number, y: number, scale: number, delayS: number): SVGGElement {
  const g = svgEl('g', { transform: `translate(${x} ${y}) scale(${scale})`, class: 'bd-wick' });
  g.style.setProperty('--d', `${delayS}s`);
  // Body, then the candle on its head, then the flame, which is what flickers.
  g.appendChild(svgEl('rect', { x: -5, y: -22, width: 10, height: 22, rx: 3, fill: hex(tokens.wax), 'fill-opacity': 0.9 }));
  g.appendChild(svgEl('rect', { x: -2, y: -38, width: 4, height: 17, rx: 1.5, fill: hex(tokens.bone), 'fill-opacity': 0.95 }));
  g.appendChild(svgEl('circle', { cx: -2, cy: -15, r: 1.1, fill: hex(tokens.void) }));
  g.appendChild(svgEl('circle', { cx: 2, cy: -15, r: 1.1, fill: hex(tokens.void) }));
  const flame = svgEl('path', {
    d: 'M0 -52c-4 4-6 8-6 12a6 6 0 0 0 12 0c0-4-2-8-6-12z',
    fill: hex(tokens.candle),
    class: 'bd-flame',
  });
  g.appendChild(flame);
  g.appendChild(
    svgEl('ellipse', { cx: 0, cy: -42, rx: 16, ry: 22, fill: hex(tokens.candle), 'fill-opacity': 0.1, class: 'bd-halo' }),
  );
  return g;
}

/**
 * The backdrop. Insert as the first child of a `.layer`; it is absolutely
 * positioned behind the panel and ignores pointer events.
 *
 * @param kind `title` is the full scene; `notice` is the same room with the
 *   face hidden, so the safety notice reads as the corridor before the room.
 */
export function backdrop(kind: 'title' | 'notice' = 'title'): HTMLElement {
  const root = document.createElement('div');
  root.className = `backdrop backdrop-${kind}`;
  root.setAttribute('aria-hidden', 'true');

  // Fog: two slow drifting banks, as plain gradients.
  for (const cls of ['bd-fog bd-fog-a', 'bd-fog bd-fog-b']) {
    const fog = document.createElement('div');
    fog.className = cls;
    root.appendChild(fog);
  }

  const scene = svgEl('svg', {
    viewBox: '0 0 1000 600',
    preserveAspectRatio: 'xMidYMid slice',
    class: 'bd-scene',
  });

  // The face in the dark: only an outline and two eyes, as if the room is
  // being looked at from a long way off. Opacity stays low so it is a thing
  // you notice on the second glance.
  if (kind === 'title') {
    const face = svgEl('g', { class: 'bd-face' });
    const line = { fill: 'none', stroke: hex(tokens.boneDim), 'stroke-width': 3, 'stroke-linecap': 'round' };
    face.appendChild(svgEl('path', { ...line, d: 'M290 215 Q500 -70 710 215' }));
    face.appendChild(svgEl('path', { ...line, d: 'M300 225 Q268 420 420 585' }));
    face.appendChild(svgEl('path', { ...line, d: 'M700 225 Q732 420 580 585' }));
    face.appendChild(svgEl('path', { ...line, d: 'M420 585 Q500 622 580 585' }));
    face.appendChild(svgEl('path', { ...line, d: 'M410 475 Q500 512 590 475' }));
    for (const x of [370, 630]) {
      face.appendChild(svgEl('ellipse', { cx: x, cy: 245, rx: 44, ry: 27, fill: hex(tokens.void) }));
    }
    scene.appendChild(face);
    // The eyes are their own layer. Inside the face group they inherited its
    // low opacity and were too faint to ever be the second glance they exist
    // to be.
    const eyes = svgEl('g', { class: 'bd-eyes' });
    for (const x of [370, 630]) {
      eyes.appendChild(
        svgEl('ellipse', { cx: x, cy: 248, rx: 44, ry: 28, fill: hex(tokens.ember), 'fill-opacity': 0.18, class: 'bd-eye-glow' }),
      );
      eyes.appendChild(svgEl('circle', { cx: x, cy: 248, r: 7, fill: hex(tokens.candle), class: 'bd-eye' }));
    }
    scene.appendChild(eyes);
  }

  // The floor, and the Wicks standing on it.
  scene.appendChild(
    svgEl('rect', { x: 0, y: 560, width: 1000, height: 40, fill: hex(tokens.ink), 'fill-opacity': 0.85 }),
  );
  const rand = seeded(1307);
  const xs = [90, 170, 245, 330, 640, 725, 805, 890, 130, 850];
  xs.forEach((x, i) => {
    const scale = 0.7 + rand() * 0.5;
    scene.appendChild(wick(x, 575 + (i % 3) * 6, scale, rand() * 4));
  });
  root.appendChild(scene);

  // Embers: small warm dots rising and fading, each on its own period.
  const embers = document.createElement('div');
  embers.className = 'bd-embers';
  const r2 = seeded(4242);
  for (let i = 0; i < 26; i++) {
    const e = document.createElement('i');
    e.style.setProperty('--x', `${(r2() * 100).toFixed(1)}%`);
    e.style.setProperty('--s', `${(2 + r2() * 3).toFixed(1)}px`);
    e.style.setProperty('--t', `${(7 + r2() * 9).toFixed(1)}s`);
    e.style.setProperty('--d', `${(-r2() * 14).toFixed(1)}s`);
    e.style.setProperty('--drift', `${((r2() - 0.5) * 80).toFixed(0)}px`);
    embers.appendChild(e);
  }
  root.appendChild(embers);

  return root;
}
