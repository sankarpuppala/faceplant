/**
 * The results screen's per-Wick icons: lit, swallowed, snuffed, or still out
 * there. Drawn, not loaded - inline SVG from the token palette, nothing to
 * download or licence. Each is drawn in a 24x24 box.
 */

import { hex, tokens } from '../render/tokens.ts';

const NS = 'http://www.w3.org/2000/svg';

function svg(title: string): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('class', 'icon');
  // Decorative by default: every caller pairs the icon with a text label, so
  // announcing it twice would just be noise for a screen reader.
  el.setAttribute('aria-hidden', 'true');
  el.setAttribute('focusable', 'false');
  const t = document.createElementNS(NS, 'title');
  t.textContent = title;
  el.appendChild(t);
  return el;
}

function add<K extends keyof SVGElementTagNameMap>(
  parent: SVGElement,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent.appendChild(el);
  return el;
}

const C = {
  wax: hex(tokens.wax),
  candle: hex(tokens.candle),
  ember: hex(tokens.ember),
  rec: hex(tokens.rec),
  mold: hex(tokens.mold),
  bone: hex(tokens.bone),
  dim: hex(tokens.boneDim),
  rot: hex(tokens.rot),
  ink: hex(tokens.ink),
} as const;

// --------------------------------------------------------------- outcomes ---

/** A Wick that made it: a lit candle. */
function iconCandleLit(): SVGSVGElement {
  const s = svg('Saved');
  add(s, 'rect', { x: 9, y: 11, width: 6, height: 11, rx: 1, fill: C.wax });
  add(s, 'path', { d: 'M12 2c2.2 3.4 3.6 5 3.6 6.8a3.6 3.6 0 0 1-7.2 0C8.4 7 9.8 5.4 12 2z', fill: C.candle });
  add(s, 'path', { d: 'M12 5.4c1.1 1.8 1.8 2.6 1.8 3.5a1.8 1.8 0 0 1-3.6 0c0-.9.7-1.7 1.8-3.5z', fill: C.ember });
  return s;
}

/** A Wick the Maw took: lips. */
function iconMaw(): SVGSVGElement {
  const s = svg('Swallowed by the Maw');
  add(s, 'path', { d: 'M3 12c3-4 15-4 18 0-3 5-15 5-18 0z', fill: C.rec, 'fill-opacity': '0.85' });
  add(s, 'path', { d: 'M3 12h18', stroke: C.ink, 'stroke-width': '1.4' });
  add(s, 'path', { d: 'M7 12l1.6 2.4M12 12v2.8M17 12l-1.6 2.4', stroke: C.wax, 'stroke-width': '1.2' });
  return s;
}

/** A Wick lost any other way: a puff of smoke over a dead candle. */
function iconSmoke(): SVGSVGElement {
  const s = svg('Lost');
  add(s, 'rect', { x: 9, y: 13, width: 6, height: 9, rx: 1, fill: C.rot });
  add(s, 'path', {
    d: 'M12 11c-2 0-2.4-1.6-1-2.4-1.8-.4-1.4-2.6.6-2.4-.8-1.6 1.4-2.6 2.4-1.2 1-1 2.8 0 2.2 1.4 1.8.2 1.8 2.4 0 2.6.8 1.2-.6 2.2-2 1.6',
    fill: 'none',
    stroke: C.dim,
    'stroke-width': '1.2',
    'stroke-linecap': 'round',
  });
  return s;
}

/** A Wick still walking. */
function iconPending(): SVGSVGElement {
  const s = svg('Still walking');
  add(s, 'rect', { x: 9, y: 11, width: 6, height: 11, rx: 1, fill: C.rot });
  add(s, 'circle', { cx: 12, cy: 7, r: 2, fill: 'none', stroke: C.dim, 'stroke-width': '1.2' });
  return s;
}

// ---------------------------------------------------------------- hazards ---

// ------------------------------------------------------------------ misc ----

/** Outcome icon for a per-Wick results strip. */
export function iconForOutcome(outcome: string): SVGSVGElement {
  if (outcome === 'saved') return iconCandleLit();
  if (outcome === 'maw') return iconMaw();
  if (outcome === 'alive') return iconPending();
  return iconSmoke();
}
