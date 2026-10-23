/**
 * The icon set.
 *
 * The interface had drifted into prose: a shop that described seven items in
 * sentences, an Ossuary that named causes of death in words, a results screen
 * that reported outcomes as a line of text. All of it was readable and none of
 * it was *scannable* - you had to read a paragraph to learn what a Moth was.
 *
 * These are drawn, not loaded. No image files anywhere in the project (see
 * `docs/CREDITS.md`), so every icon is inline SVG built from the same token
 * palette as the game, scales to any size, and costs nothing to download.
 *
 * Each icon is drawn in a 24x24 box so they line up wherever they are used.
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
export function iconCandleLit(): SVGSVGElement {
  const s = svg('Saved');
  add(s, 'rect', { x: 9, y: 11, width: 6, height: 11, rx: 1, fill: C.wax });
  add(s, 'path', { d: 'M12 2c2.2 3.4 3.6 5 3.6 6.8a3.6 3.6 0 0 1-7.2 0C8.4 7 9.8 5.4 12 2z', fill: C.candle });
  add(s, 'path', { d: 'M12 5.4c1.1 1.8 1.8 2.6 1.8 3.5a1.8 1.8 0 0 1-3.6 0c0-.9.7-1.7 1.8-3.5z', fill: C.ember });
  return s;
}

/** A Wick the Maw took: lips. */
export function iconMaw(): SVGSVGElement {
  const s = svg('Swallowed by the Maw');
  add(s, 'path', { d: 'M3 12c3-4 15-4 18 0-3 5-15 5-18 0z', fill: C.rec, 'fill-opacity': '0.85' });
  add(s, 'path', { d: 'M3 12h18', stroke: C.ink, 'stroke-width': '1.4' });
  add(s, 'path', { d: 'M7 12l1.6 2.4M12 12v2.8M17 12l-1.6 2.4', stroke: C.wax, 'stroke-width': '1.2' });
  return s;
}

/** A Wick lost any other way: a puff of smoke over a dead candle. */
export function iconSmoke(): SVGSVGElement {
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
export function iconPending(): SVGSVGElement {
  const s = svg('Still walking');
  add(s, 'rect', { x: 9, y: 11, width: 6, height: 11, rx: 1, fill: C.rot });
  add(s, 'circle', { cx: 12, cy: 7, r: 2, fill: 'none', stroke: C.dim, 'stroke-width': '1.2' });
  return s;
}

// ---------------------------------------------------------------- hazards ---

export function iconCrawler(): SVGSVGElement {
  const s = svg('Crawler');
  for (const [x1, y1, x2, y2] of [
    [8, 12, 3, 8],
    [8, 13, 3, 14],
    [8, 14, 4, 19],
    [16, 12, 21, 8],
    [16, 13, 21, 14],
    [16, 14, 20, 19],
  ] as const) {
    add(s, 'path', { d: `M${x1} ${y1}L${x2} ${y2}`, stroke: C.mold, 'stroke-width': '1.4', 'stroke-linecap': 'round' });
  }
  add(s, 'ellipse', { cx: 12, cy: 13, rx: 5, ry: 3.6, fill: C.mold });
  add(s, 'circle', { cx: 10.2, cy: 12, r: 1, fill: C.rec });
  add(s, 'circle', { cx: 13.8, cy: 12, r: 1, fill: C.rec });
  return s;
}

export function iconMoth(): SVGSVGElement {
  const s = svg('Moth');
  add(s, 'ellipse', { cx: 6.5, cy: 11, rx: 4.5, ry: 6, fill: C.bone, 'fill-opacity': '0.85' });
  add(s, 'ellipse', { cx: 17.5, cy: 11, rx: 4.5, ry: 6, fill: C.bone, 'fill-opacity': '0.85' });
  add(s, 'ellipse', { cx: 6.5, cy: 11, rx: 4.5, ry: 6, fill: 'none', stroke: C.ember, 'stroke-opacity': '0.5' });
  add(s, 'ellipse', { cx: 17.5, cy: 11, rx: 4.5, ry: 6, fill: 'none', stroke: C.ember, 'stroke-opacity': '0.5' });
  add(s, 'ellipse', { cx: 12, cy: 12, rx: 1.8, ry: 6, fill: C.rot });
  add(s, 'path', { d: 'M11 6l-1.6-3M13 6l1.6-3', stroke: C.ember, 'stroke-width': '1.2', 'stroke-linecap': 'round' });
  return s;
}

export function iconDrip(): SVGSVGElement {
  const s = svg('Falling wax');
  add(s, 'path', { d: 'M12 3c2.6 5 4.4 7 4.4 9.6a4.4 4.4 0 0 1-8.8 0C7.6 10 9.4 8 12 3z', fill: C.wax, 'fill-opacity': '0.9' });
  add(s, 'path', { d: 'M12 19v3', stroke: C.wax, 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-opacity': '0.5' });
  return s;
}

export function iconDark(): SVGSVGElement {
  const s = svg('The Dark');
  add(s, 'circle', { cx: 12, cy: 12, r: 10, fill: '#000' });
  add(s, 'circle', { cx: 12, cy: 12, r: 4, fill: C.candle, 'fill-opacity': '0.35' });
  add(s, 'circle', { cx: 12, cy: 12, r: 2, fill: C.candle });
  add(s, 'circle', { cx: 12, cy: 12, r: 9.2, fill: 'none', stroke: C.rot, 'stroke-width': '1.2' });
  return s;
}

export function iconVoid(): SVGSVGElement {
  const s = svg('Fell');
  add(s, 'path', { d: 'M12 3v11', stroke: C.dim, 'stroke-width': '1.6', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M8 11l4 5 4-5', fill: 'none', stroke: C.dim, 'stroke-width': '1.6', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M4 20h16', stroke: C.rot, 'stroke-width': '2', 'stroke-dasharray': '3 3' });
  return s;
}

// ------------------------------------------------------------- shop items ---

export function iconSteadyFeet(): SVGSVGElement {
  const s = svg('Steady Feet');
  add(s, 'path', { d: 'M4 18h5l2-10h3l-1 10h7', fill: 'none', stroke: C.candle, 'stroke-width': '1.8', 'stroke-linejoin': 'round' });
  add(s, 'path', { d: 'M3 21h18', stroke: C.wax, 'stroke-width': '1.6' });
  return s;
}

export function iconLanternOil(): SVGSVGElement {
  const s = svg('Lantern Oil');
  add(s, 'circle', { cx: 12, cy: 12, r: 9, fill: C.candle, 'fill-opacity': '0.12' });
  add(s, 'circle', { cx: 12, cy: 12, r: 5.5, fill: C.candle, 'fill-opacity': '0.22' });
  add(s, 'path', { d: 'M12 7c1.8 2.8 3 4 3 5.5a3 3 0 0 1-6 0C9 11 10.2 9.8 12 7z', fill: C.candle });
  for (const r of [0, 60, 120, 180, 240, 300]) {
    add(s, 'path', {
      d: 'M12 1.5v2.4',
      stroke: C.candle,
      'stroke-width': '1.4',
      'stroke-linecap': 'round',
      'stroke-opacity': '0.6',
      transform: `rotate(${r} 12 12)`,
    });
  }
  return s;
}

export function iconPatience(): SVGSVGElement {
  const s = svg('Rite of Patience');
  add(s, 'path', { d: 'M6 3h12M6 21h12', stroke: C.wax, 'stroke-width': '1.8', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M8 3c0 4 4 6 4 9s-4 5-4 9M16 3c0 4-4 6-4 9s4 5 4 9', fill: 'none', stroke: C.candle, 'stroke-width': '1.5' });
  add(s, 'path', { d: 'M12 12c1.6 1.4 2.6 2.6 2.6 4.4H9.4c0-1.8 1-3 2.6-4.4z', fill: C.candle, 'fill-opacity': '0.7' });
  return s;
}

export function iconWardingSalt(): SVGSVGElement {
  const s = svg('Warding Salt');
  add(s, 'circle', { cx: 12, cy: 12, r: 9, fill: 'none', stroke: C.bone, 'stroke-width': '1.4', 'stroke-dasharray': '2 2.6' });
  add(s, 'ellipse', { cx: 12, cy: 13, rx: 4, ry: 2.8, fill: C.mold, 'fill-opacity': '0.55' });
  add(s, 'path', { d: 'M7 8l10 10M17 8L7 18', stroke: C.rec, 'stroke-width': '1.8', 'stroke-linecap': 'round' });
  return s;
}

/** Tallow Shell: a drip breaking against a shell around the flame. */
export function iconTallowShell(): SVGSVGElement {
  const s = svg('Tallow Shell');
  // The falling drip, and the splash where it stops.
  add(s, 'path', { d: 'M12 1.5c0 0-2 2.6-2 4a2 2 0 1 0 4 0c0-1.4-2-4-2-4z', fill: C.bone, 'fill-opacity': '0.75' });
  add(s, 'path', { d: 'M7.5 9.5l-1.6-1.4M16.5 9.5l1.6-1.4', stroke: C.bone, 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-opacity': '0.7' });
  // The shell: a dome over the flame, which is what the drip hits.
  add(s, 'path', { d: 'M4.5 16a7.5 7.5 0 0 1 15 0', fill: 'none', stroke: C.candle, 'stroke-width': '1.8', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M4.5 16a7.5 7.5 0 0 1 15 0z', fill: C.candle, 'fill-opacity': '0.16' });
  // The flame, safe underneath it.
  add(s, 'path', { d: 'M12 20.5c-1.5 0-2.6-1-2.6-2.3 0-1.4 1.6-2.2 2.6-4 1 1.8 2.6 2.6 2.6 4 0 1.3-1.1 2.3-2.6 2.3z', fill: C.candle });
  return s;
}

/** The Warning: a Wick turning and running from the edge of a mouth. */
export function iconTheWarning(): SVGSVGElement {
  const s = svg('The Warning');
  // The edge of the Maw, arriving from the right.
  add(s, 'path', { d: 'M21 4c-4 3-4 13 0 16', fill: 'none', stroke: C.rec, 'stroke-width': '1.8', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M17.5 7.2c-2 2.6-2 7 0 9.6', fill: 'none', stroke: C.rec, 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-opacity': '0.5' });
  // The Wick, already running the other way.
  add(s, 'path', { d: 'M8 20.5c-1.7 0-3-1.2-3-2.7 0-1.6 1.8-2.6 3-4.6 1.2 2 3 3 3 4.6 0 1.5-1.3 2.7-3 2.7z', fill: C.candle });
  add(s, 'path', { d: 'M8 10.8V7.5', stroke: C.bone, 'stroke-width': '1.4', 'stroke-linecap': 'round' });
  // The draught it felt.
  add(s, 'path', { d: 'M12.5 9.5h-2.2M13.5 12.5h-3', stroke: C.bone, 'stroke-width': '1.2', 'stroke-linecap': 'round', 'stroke-opacity': '0.65' });
  return s;
}

export function iconIronNerve(): SVGSVGElement {
  const s = svg('Iron Nerve');
  add(s, 'path', {
    d: 'M12 21s-7-4.2-7-9.6A4.4 4.4 0 0 1 12 8a4.4 4.4 0 0 1 7 3.4C19 16.8 12 21 12 21z',
    fill: 'none',
    stroke: C.rec,
    'stroke-width': '1.6',
  });
  add(s, 'path', { d: 'M3 13h4l2-3 2 6 2-4 2 2h4', fill: 'none', stroke: C.candle, 'stroke-width': '1.6', 'stroke-linejoin': 'round' });
  return s;
}

export function iconSecondFlame(): SVGSVGElement {
  const s = svg('The Second Flame');
  add(s, 'rect', { x: 4, y: 13, width: 5, height: 9, rx: 1, fill: C.rot });
  add(s, 'rect', { x: 15, y: 13, width: 5, height: 9, rx: 1, fill: C.wax });
  add(s, 'path', { d: 'M17.5 5.5c1.6 2.5 2.6 3.6 2.6 5a2.6 2.6 0 0 1-5.2 0c0-1.4 1-2.5 2.6-5z', fill: C.candle });
  add(s, 'path', { d: 'M6.5 11.5A5 5 0 0 1 12 4', fill: 'none', stroke: C.candle, 'stroke-width': '1.4', 'stroke-dasharray': '2 2' });
  add(s, 'path', { d: 'M11 2.6L12.4 4 11 5.4', fill: 'none', stroke: C.candle, 'stroke-width': '1.4' });
  return s;
}

// ------------------------------------------------------------------ misc ----

export function iconCoin(): SVGSVGElement {
  const s = svg('Coins');
  add(s, 'circle', { cx: 12, cy: 12, r: 8.5, fill: C.candle, 'fill-opacity': '0.2' });
  add(s, 'circle', { cx: 12, cy: 12, r: 8.5, fill: 'none', stroke: C.candle, 'stroke-width': '1.6' });
  add(s, 'circle', { cx: 12, cy: 12, r: 4.2, fill: 'none', stroke: C.candle, 'stroke-width': '1.2' });
  add(s, 'path', { d: 'M12 6.2c1.3 2 2.1 2.9 2.1 4a2.1 2.1 0 0 1-4.2 0c0-1.1.8-2 2.1-4z', fill: C.candle });
  return s;
}

export function iconShelf(): SVGSVGElement {
  const s = svg('The Shelf');
  add(s, 'rect', { x: 3, y: 4, width: 4, height: 15, rx: 1, fill: C.rot, stroke: C.dim, 'stroke-width': '0.8' });
  add(s, 'rect', { x: 8.5, y: 4, width: 4, height: 15, rx: 1, fill: C.ink, stroke: C.candle, 'stroke-width': '1' });
  add(s, 'rect', { x: 14, y: 4, width: 4, height: 15, rx: 1, fill: C.rot, stroke: C.dim, 'stroke-width': '0.8' });
  add(s, 'path', { d: 'M2 20h20', stroke: C.wax, 'stroke-width': '2', 'stroke-linecap': 'round' });
  return s;
}

export function iconOssuary(): SVGSVGElement {
  const s = svg('The Ossuary');
  add(s, 'path', { d: 'M12 3a7 7 0 0 0-7 7c0 2.6 1.4 3.6 1.4 5.4V18h11.2v-2.6c0-1.8 1.4-2.8 1.4-5.4a7 7 0 0 0-7-7z', fill: C.wax, 'fill-opacity': '0.85' });
  add(s, 'circle', { cx: 9.4, cy: 10.4, r: 1.9, fill: '#000' });
  add(s, 'circle', { cx: 14.6, cy: 10.4, r: 1.9, fill: '#000' });
  add(s, 'path', { d: 'M10.6 14.6h2.8', stroke: '#000', 'stroke-width': '1.2' });
  add(s, 'path', { d: 'M7 20h10', stroke: C.dim, 'stroke-width': '1.6', 'stroke-linecap': 'round' });
  return s;
}

/** The composure bar, as a picture. */
export function iconComposure(): SVGSVGElement {
  const s = svg('Composure');
  add(s, 'rect', { x: 2, y: 9, width: 20, height: 6, rx: 1, fill: C.ink, stroke: C.rot, 'stroke-width': '1' });
  add(s, 'rect', { x: 3, y: 10, width: 9, height: 4, fill: C.candle });
  add(s, 'path', { d: 'M15 6.5l2 2-2 2M19 6.5l2 2-2 2', fill: 'none', stroke: C.rec, 'stroke-width': '1.3', 'stroke-linecap': 'round' });
  return s;
}

/** The three how-to steps, as pictures. */
export function iconStepWalk(): SVGSVGElement {
  const s = svg('They walk on you');
  add(s, 'path', { d: 'M2 17c4-7 16-7 20 0', fill: 'none', stroke: C.candle, 'stroke-width': '1.6', 'stroke-opacity': '0.8' });
  for (const [x, y] of [
    [6, 13.2],
    [11.6, 11.4],
    [17.2, 13],
  ] as const) {
    add(s, 'rect', { x: x - 1.2, y, width: 2.4, height: 4, rx: 0.6, fill: C.wax });
    add(s, 'circle', { cx: x, cy: y - 1.4, r: 1.3, fill: C.candle });
  }
  add(s, 'rect', { x: 19.5, y: 7, width: 4, height: 7, rx: 1.6, fill: C.candle, 'fill-opacity': '0.4' });
  return s;
}

export function iconStepBridge(): SVGSVGElement {
  const s = svg('Your face is the bridge');
  add(s, 'path', { d: 'M1 11h5M18 11h5', stroke: C.rot, 'stroke-width': '2.4', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M6 11c3-3 9-3 12 0', fill: 'none', stroke: C.candle, 'stroke-width': '1.8' });
  add(s, 'rect', { x: 10.8, y: 6.4, width: 2.4, height: 4, rx: 0.6, fill: C.wax });
  add(s, 'circle', { cx: 12, cy: 5, r: 1.3, fill: C.candle });
  add(s, 'path', { d: 'M7 17c2.6 2.6 7.4 2.6 10 0', fill: 'none', stroke: C.rec, 'stroke-width': '1.6', 'stroke-dasharray': '2.4 2' });
  return s;
}

export function iconStepLose(): SVGSVGElement {
  const s = svg('Lose half and you lose the tape');
  add(s, 'rect', { x: 2, y: 14, width: 3, height: 7, rx: 0.8, fill: C.wax });
  add(s, 'circle', { cx: 3.5, cy: 12.4, r: 1.5, fill: C.candle });
  add(s, 'rect', { x: 7.5, y: 14, width: 3, height: 7, rx: 0.8, fill: C.wax });
  add(s, 'circle', { cx: 9, cy: 12.4, r: 1.5, fill: C.candle });
  add(s, 'rect', { x: 13, y: 14, width: 3, height: 7, rx: 0.8, fill: C.rot });
  add(s, 'rect', { x: 18.5, y: 14, width: 3, height: 7, rx: 0.8, fill: C.rot });
  add(s, 'path', { d: 'M12.5 2.5h9.5M17.2 2.5v3', stroke: C.rec, 'stroke-width': '1.2', 'stroke-opacity': '0.6' });
  add(s, 'path', {
    d: 'M17.2 5.5a4.2 4.2 0 0 0-4.2 4.2c0 1.6.9 2.2.9 3.3h6.6c0-1.1.9-1.7.9-3.3a4.2 4.2 0 0 0-4.2-4.2z',
    fill: '#000',
    stroke: C.rec,
    'stroke-width': '1.1',
  });
  add(s, 'circle', { cx: 15.9, cy: 9.8, r: 0.9, fill: C.ember });
  add(s, 'circle', { cx: 18.5, cy: 9.8, r: 0.9, fill: C.ember });
  return s;
}

/** The face regions, for the Maw card. */
export function iconMawCard(): SVGSVGElement {
  const s = svg('The Maw');
  add(s, 'ellipse', { cx: 12, cy: 12, rx: 8.5, ry: 10, fill: 'none', stroke: C.candle, 'stroke-width': '1.3', 'stroke-opacity': '0.55' });
  add(s, 'path', { d: 'M7.5 8.5h3M13.5 8.5h3', stroke: C.candle, 'stroke-width': '1.4', 'stroke-linecap': 'round' });
  add(s, 'path', { d: 'M6 15c3.4-2.4 8.6-2.4 12 0-3.4 4.4-8.6 4.4-12 0z', fill: C.rec, 'fill-opacity': '0.85' });
  add(s, 'path', { d: 'M8.6 15l1.2 1.8M12 15v2.2M15.4 15l-1.2 1.8', stroke: C.wax, 'stroke-width': '1' });
  return s;
}

/** Icon for a shop item, by id. */
export function iconForShopItem(id: string): SVGSVGElement {
  switch (id) {
    case 'steadyWicks':
      return iconSteadyFeet();
    case 'lanternOil':
      return iconLanternOil();
    case 'mawSense':
      return iconTheWarning();
    case 'wardingSalt':
      return iconWardingSalt();
    case 'tallowShell':
      return iconTallowShell();
    case 'ironNerve':
      return iconIronNerve();
    case 'secondChance':
      return iconSecondFlame();
    default:
      return iconCoin();
  }
}

/** Cause-of-death icon for an Ossuary row. */
export function iconForCause(cause: string): SVGSVGElement {
  switch (cause) {
    case 'maw':
      return iconMaw();
    case 'crawler':
      return iconCrawler();
    case 'moth':
      return iconMoth();
    case 'drip':
      return iconDrip();
    case 'dark':
      return iconDark();
    default:
      return iconVoid();
  }
}

/** Outcome icon for a per-Wick results strip. */
export function iconForOutcome(outcome: string): SVGSVGElement {
  if (outcome === 'saved') return iconCandleLit();
  if (outcome === 'maw') return iconMaw();
  if (outcome === 'alive') return iconPending();
  return iconSmoke();
}
