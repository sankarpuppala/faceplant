/**
 * The face diagram: the whole of the instructions, with one sentence
 * (OVERHAUL 8), shown on the first tape insert. Inline SVG from the token
 * palette - no image files.
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
  // The box has to hold the callout text, not just the face. At 420 wide the
  // labels ran off both edges and were clipped mid-word - "blink shut = a
  // bridge" rendered as "link shut = a bridge".
  const root = svg('-96 18 622 400', 'diagram face-diagram');

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
  //
  // Every colour here is a palette token (CLAUDE.md section 6). Two of them
  // used to be raw literals - a mint green for EYES and a sky blue for NOSE -
  // which were the only two cold colours anywhere in a game lit entirely by
  // candles, and they looked exactly as out of place as that sounds.
  //
  // `side` decides which way a label is anchored and which end of the leader
  // it hangs off. They were all centre-anchored on the end of their own
  // leader line before, so the dashes ran straight through the words.
  const leaders = node('g', { stroke: dim, 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.55 });
  const callouts: {
    from: [number, number];
    to: [number, number];
    text: string;
    sub: string;
    color: number;
    side: 'left' | 'right' | 'top' | 'bottom';
  }[] = [
    { from: [210, 68], to: [210, 40], text: 'FOREHEAD', sub: 'walk here - the main floor', color: tokens.candle, side: 'top' },
    { from: [168, 124], to: [96, 100], text: 'BROWS', sub: 'ledges - raise fast to flick', color: tokens.ember, side: 'left' },
    { from: [252, 124], to: [324, 100], text: 'BROWS', sub: '', color: tokens.ember, side: 'right' },
    { from: [170, 150], to: [96, 164], text: 'EYES', sub: 'blink shut = a bridge', color: tokens.bone, side: 'left' },
    { from: [208, 195], to: [324, 182], text: 'NOSE', sub: 'a slide, aimed at the mouth', color: tokens.wax, side: 'right' },
    { from: [240, 262], to: [330, 268], text: 'THE MAW', sub: 'your mouth - open = danger', color: tokens.rec, side: 'right' },
    { from: [152, 250], to: [96, 242], text: 'CHEEKS', sub: 'rails to the jaw', color: tokens.boneDim, side: 'left' },
    { from: [210, 326], to: [210, 372], text: 'JAW', sub: 'the floor beneath the Maw', color: tokens.mold, side: 'bottom' },
  ];

  // A dot at the face end, so a leader reads as pointing at something.
  const dots = node('g', { fill: dim, 'fill-opacity': 0.8 });
  for (const c of callouts) {
    leaders.appendChild(node('line', { x1: c.from[0], y1: c.from[1], x2: c.to[0], y2: c.to[1] }));
    dots.appendChild(node('circle', { cx: c.from[0], cy: c.from[1], r: 2.5 }));
  }
  root.appendChild(leaders);
  root.appendChild(dots);

  for (const c of callouts) {
    if (c.text === 'BROWS' && c.sub === '') continue; // only label the pair once

    // Hang the text clear of the line's end rather than on top of it.
    const PAD = 8;
    const anchor = c.side === 'left' ? 'end' : c.side === 'right' ? 'start' : 'middle';
    const x = c.to[0] + (c.side === 'left' ? -PAD : c.side === 'right' ? PAD : 0);
    const y = c.to[1] + (c.side === 'top' ? -10 : c.side === 'bottom' ? 18 : 0);

    root.appendChild(label(x, y, c.text, { color: c.color, size: 15, weight: 'bold', anchor }));
    if (c.sub !== '') root.appendChild(label(x, y + 15, c.sub, { color: tokens.boneDim, size: 11, anchor }));
  }

  return root;
}

