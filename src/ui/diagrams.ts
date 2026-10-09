/**
 * The two diagrams on the How to Play screen (added after feedback that the
 * game had no instructions at all).
 *
 * Both are inline SVG built the same way `dom.ts`'s `candleIcon` is - with
 * `createElementNS`, no external image files, matching the tape's own token
 * colours so they look like part of the game rather than a pasted-in manual
 * page.
 */

import { hex, tokens } from '../render/tokens.ts';

const NS = 'http://www.w3.org/2000/svg';

function svg(viewBox: string, extraClass = ''): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', viewBox);
  el.setAttribute('role', 'img');
  if (extraClass !== '') el.setAttribute('class', extraClass);
  return el;
}

function node<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

function label(
  x: number,
  y: number,
  text: string,
  opts: { anchor?: 'start' | 'middle' | 'end'; color?: number; size?: number; weight?: string } = {},
): SVGTextElement {
  const t = node('text', {
    x,
    y,
    'text-anchor': opts.anchor ?? 'middle',
    fill: hex(opts.color ?? tokens.bone),
    'font-family': '"VT323", "Courier New", monospace',
    'font-size': opts.size ?? 15,
  });
  if (opts.weight !== undefined) t.setAttribute('font-weight', opts.weight);
  t.textContent = text;
  return t;
}

/**
 * The face map: a labelled diagram of which part of your face does what.
 * Deliberately drawn in the same "chalk contour" style as the in-game terrain
 * line, so a player who has seen this once recognises their own forehead,
 * brow and jaw when they see the real contour glowing on their video.
 */
export function faceMapSvg(): SVGSVGElement {
  const root = svg('0 0 420 460', 'diagram face-diagram');

  const chalk = hex(tokens.candle);
  const dim = hex(tokens.boneDim);

  // --- the face itself, as a simple oval with the same named regions the
  // terrain builder uses (src/terrain/contours.ts), drawn as a simplified
  // chalk line rather than the true landmark mesh.
  const g = node('g', { fill: 'none', stroke: chalk, 'stroke-width': 2, 'stroke-opacity': 0.75 });

  // Forehead dome.
  g.appendChild(node('path', { d: 'M 140 90 Q 210 50 280 90', 'stroke-linecap': 'round' }));
  // Brows.
  g.appendChild(node('path', { d: 'M 150 130 Q 170 118 190 128' }));
  g.appendChild(node('path', { d: 'M 230 128 Q 250 118 270 130' }));
  // Eyes (small arcs).
  g.appendChild(node('path', { d: 'M 158 150 Q 172 142 186 150', 'stroke-opacity': 0.5 }));
  g.appendChild(node('path', { d: 'M 234 150 Q 248 142 262 150', 'stroke-opacity': 0.5 }));
  // Nose, running down the centre.
  g.appendChild(node('path', { d: 'M 210 128 L 206 210 L 214 222' }));
  // Cheeks, from temple to jaw.
  g.appendChild(node('path', { d: 'M 148 135 Q 128 220 160 290', 'stroke-opacity': 0.5 }));
  g.appendChild(node('path', { d: 'M 272 135 Q 292 220 260 290', 'stroke-opacity': 0.5 }));
  // Lips.
  g.appendChild(node('path', { d: 'M 178 260 Q 210 248 242 260', 'stroke-width': 3 }));
  g.appendChild(node('path', { d: 'M 178 266 Q 210 280 242 266' }));
  // Jaw, down to the chin.
  g.appendChild(node('path', { d: 'M 160 290 Q 210 345 260 290' }));
  root.appendChild(g);

  // --- leader lines and labels, one per region --------------------------
  const leaders = node('g', { stroke: dim, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.6 });
  const callouts: { from: [number, number]; to: [number, number]; text: string; sub: string; color?: number }[] = [
    { from: [210, 65], to: [210, 24], text: 'FOREHEAD', sub: 'walk here - the main floor', color: tokens.candle },
    { from: [168, 122], to: [70, 95], text: 'BROWS', sub: 'ledges - raise fast to flick', color: tokens.ember },
    { from: [250, 122], to: [360, 95], text: 'BROWS', sub: '', color: tokens.ember },
    { from: [172, 148], to: [70, 155], text: 'EYES', sub: 'blink shut = a bridge', color: 0x8fff9b },
    { from: [208, 190], to: [360, 170], text: 'NOSE', sub: 'a slide, aimed at the mouth', color: 0x5fd0ff },
    { from: [210, 254], to: [210, 400], text: 'THE MAW', sub: 'your mouth - open = danger', color: tokens.rec },
    { from: [155, 250], to: [70, 230], text: 'CHEEKS', sub: 'rails to the jaw', color: tokens.boneDim },
    { from: [210, 320], to: [210, 440], text: 'JAW', sub: 'the floor beneath the Maw', color: tokens.wax },
  ];

  for (const c of callouts) {
    leaders.appendChild(node('line', { x1: c.from[0], y1: c.from[1], x2: c.to[0], y2: c.to[1] }));
  }
  root.appendChild(leaders);

  for (const c of callouts) {
    if (c.text === 'BROWS' && c.sub === '') continue; // only label the pair once
    const atTop = c.to[1] < 230;
    root.appendChild(
      label(c.to[0], c.to[1] + (atTop ? -6 : 14), c.text, { color: c.color, size: 15, weight: 'bold' }),
    );
    if (c.sub !== '') {
      root.appendChild(
        label(c.to[0], c.to[1] + (atTop ? 10 : 30), c.sub, { color: tokens.boneDim, size: 11 }),
      );
    }
  }

  return root;
}

/**
 * The flow chart: title to results, with the two side features - the Ossuary
 * and Rites - drawn as clearly-optional branches off the shelf rather than
 * steps in the main loop. That distinction is the whole fix for "what are
 * these for": they are not part of playing a level, they are things you visit
 * between runs.
 */
export function flowChartSvg(): SVGSVGElement {
  const root = svg('0 0 760 360', 'diagram flow-diagram');

  const boxFill = hex(tokens.ink);
  const mainStroke = hex(tokens.candle);

  function box(x: number, y: number, w: number, h: number, text: string, sub: string, accent?: number): SVGGElement {
    const g = node('g', {});
    g.appendChild(
      node('rect', {
        x,
        y,
        width: w,
        height: h,
        rx: 6,
        fill: boxFill,
        stroke: hex(accent ?? tokens.dusk),
        'stroke-width': accent !== undefined ? 2 : 1.4,
      }),
    );
    g.appendChild(label(x + w / 2, y + h / 2 - (sub ? 6 : -4), text, { size: 14, weight: 'bold' }));
    if (sub !== '') g.appendChild(label(x + w / 2, y + h / 2 + 14, sub, { color: tokens.boneDim, size: 10 }));
    return g;
  }

  function arrow(x1: number, y1: number, x2: number, y2: number, dashed = false): SVGGElement {
    const g = node('g', { stroke: dashed ? hex(tokens.boneDim) : mainStroke, 'stroke-width': 2, fill: 'none' });
    if (dashed) g.setAttribute('stroke-dasharray', '4 4');
    g.setAttribute('opacity', dashed ? '0.6' : '0.85');
    g.appendChild(node('line', { x1, y1, x2, y2 }));
    // A simple arrowhead triangle.
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const ah = 7;
    const ax = x2 - ah * Math.cos(angle - 0.4);
    const ay = y2 - ah * Math.sin(angle - 0.4);
    const bx = x2 - ah * Math.cos(angle + 0.4);
    const by = y2 - ah * Math.sin(angle + 0.4);
    g.appendChild(
      node('polygon', { points: `${x2},${y2} ${ax},${ay} ${bx},${by}`, fill: dashed ? hex(tokens.boneDim) : mainStroke }),
    );
    return g;
  }

  const row1Y = 26;
  const bw = 118;
  const bh = 52;
  const gap = 24;

  const xs = [20, 20 + bw + gap, 20 + 2 * (bw + gap), 20 + 3 * (bw + gap), 20 + 4 * (bw + gap)];

  root.appendChild(arrow(xs[0]! + bw, row1Y + bh / 2, xs[1]!, row1Y + bh / 2));
  root.appendChild(arrow(xs[1]! + bw, row1Y + bh / 2, xs[2]!, row1Y + bh / 2));
  root.appendChild(arrow(xs[2]! + bw, row1Y + bh / 2, xs[3]!, row1Y + bh / 2));
  root.appendChild(arrow(xs[3]! + bw, row1Y + bh / 2, xs[4]!, row1Y + bh / 2));

  root.appendChild(box(xs[0]!, row1Y, bw, bh, 'TITLE', 'Insert Face', tokens.candle));
  root.appendChild(box(xs[1]!, row1Y, bw, bh, 'CALIBRATE', 'or Assist mode'));
  root.appendChild(box(xs[2]!, row1Y, bw, bh, 'SHELF', 'pick a tape'));
  root.appendChild(box(xs[3]!, row1Y, bw, bh, 'LEVEL', 'play!', tokens.rec));
  root.appendChild(box(xs[4]!, row1Y, bw, bh, 'RESULTS', 'candles + score'));

  // Results loops back to Level (Retry / Next) and forward to Shelf.
  const loopY = row1Y + bh + 34;
  root.appendChild(
    arrow(xs[4]! + bw / 2, row1Y + bh, xs[4]! + bw / 2, loopY),
  );
  root.appendChild(arrow(xs[4]! + bw / 2, loopY, xs[3]! + bw / 2, loopY));
  root.appendChild(arrow(xs[3]! + bw / 2, loopY, xs[3]! + bw / 2, row1Y + bh));
  root.appendChild(label(xs[3]! + bw, loopY - 6, 'retry / next level', { color: tokens.boneDim, size: 10 }));

  root.appendChild(arrow(xs[4]! + bw, row1Y + bh / 2 + 10, xs[2]! + bw + gap / 2, row1Y + bh + 70, true));
  root.appendChild(label((xs[4]! + xs[2]! + bw) / 2 + 10, row1Y + bh + 86, 'back to the shelf', { color: tokens.boneDim, size: 10 }));

  // Shelf's two optional side branches: the Ossuary and Rites.
  const row2Y = row1Y + bh + 120;
  root.appendChild(arrow(xs[2]! + bw * 0.3, row1Y + bh, xs[2]! + bw * 0.1, row2Y, true));
  root.appendChild(arrow(xs[2]! + bw * 0.7, row1Y + bh, xs[2]! + bw * 1.3, row2Y, true));

  root.appendChild(box(xs[2]! - bw * 0.35, row2Y, bw, bh, 'OSSUARY', 'memorial - optional', tokens.boneDim));
  root.appendChild(box(xs[2]! + bw * 0.65, row2Y, bw, bh, 'RITES', 'spend candles - optional', tokens.boneDim));

  root.appendChild(
    label(xs[2]! + bw / 2, row2Y + bh + 22, 'Neither is a level. Both are places to visit between runs.', {
      color: tokens.boneDim,
      size: 11,
    }),
  );

  return root;
}
