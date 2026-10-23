/**
 * Small DOM helpers for the overlay screens (decision D14: menus are DOM over
 * the Pixi stage, so they stay crisp, selectable and keyboard-navigable).
 *
 * Accessibility is built in here rather than remembered per screen: `screen()`
 * creates a labelled dialog, `focusFirst` moves focus into it, and `trapFocus`
 * keeps Tab inside it. Every screen gets that for free.
 */

import { hex, tokens } from '../render/tokens.ts';

export type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Interface sounds (OVERHAUL 2.4): a soft tape click when focus moves, a heavy
 * mechanical clunk on confirm. The audio module registers them at boot, so
 * this file - and the UI gallery, which has no audio - never imports sound.
 */
const uiSounds: { focus: () => void; confirm: () => void } = { focus: () => undefined, confirm: () => undefined };

export function setUiSounds(s: { focus: () => void; confirm: () => void }): void {
  uiSounds.focus = s.focus;
  uiSounds.confirm = s.confirm;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/** The three button kinds (OVERHAUL 2.4). One system, used everywhere. */
export type ButtonKind = 'primary' | 'secondary' | 'tertiary';

export function button(label: string, onClick: () => void, kind: ButtonKind | string = 'secondary'): HTMLButtonElement {
  // Older call sites pass a class string; the three kinds are the only ones
  // the stylesheet knows.
  const cls = kind.startsWith('btn') ? kind : `btn ${kind}`;
  const b = el('button', { class: cls, type: 'button' }, [label]);
  b.addEventListener('click', () => {
    uiSounds.confirm();
    onClick();
  });
  b.addEventListener('focus', () => uiSounds.focus());
  return b;
}

/**
 * The sticky action row at the foot of a screen: equal widths, centred, and
 * never off screen. Tertiary links go underneath in their own line.
 */
export function actions(buttons: (HTMLElement | null)[], links: (HTMLElement | null)[] = []): HTMLElement {
  const row = buttons.some((b) => b !== null) ? el('div', { class: 'actions-row' }, buttons) : null;
  const linkRow = links.some((l) => l !== null) ? el('div', { class: 'links' }, links) : null;
  return el('div', { class: 'actions' }, [row, linkRow]);
}

/** A labelled row with a control on the right, used throughout Settings. */
export function field(label: string, control: Node, hint?: string): HTMLElement {
  return el('div', { class: 'field' }, [
    el('span', { class: 'field-label' }, [
      el('span', { class: 'field-name', text: label }),
      hint === undefined ? null : el('span', { class: 'field-hint', text: hint }),
    ]),
    el('span', { class: 'field-control' }, [control]),
  ]);
}

/** A segmented control. Returns the wrapper; re-render by calling `update`. */
export function segmented<T extends string>(
  options: readonly { value: T; label: string; disabled?: boolean }[],
  current: T,
  onPick: (value: T) => void,
): { node: HTMLElement; update: (value: T) => void } {
  const buttons = new Map<T, HTMLButtonElement>();
  const node = el('div', { class: 'segmented', role: 'group' });

  for (const opt of options) {
    const b = el('button', {
      class: 'seg',
      type: 'button',
      'aria-pressed': opt.value === current ? 'true' : 'false',
      disabled: opt.disabled === true,
      title: opt.disabled === true ? 'Locked' : undefined,
    }, [opt.label]);
    b.addEventListener('click', () => {
      uiSounds.confirm();
      onPick(opt.value);
    });
    b.addEventListener('focus', () => uiSounds.focus());
    buttons.set(opt.value, b);
    node.appendChild(b);
  }

  return {
    node,
    update(value: T): void {
      for (const [v, b] of buttons) b.setAttribute('aria-pressed', v === value ? 'true' : 'false');
    },
  };
}

/**
 * `hint` belongs to the row, not after it. Settings used to emit a toggle and
 * then a loose centred paragraph of explanation, so half the rows explained
 * themselves inside the box and half floated the explanation outside it,
 * centred, orphaned from the control it described.
 */
export function toggle(
  label: string,
  on: boolean,
  onChange: (next: boolean) => void,
  hint?: string,
): { node: HTMLElement; update: (on: boolean) => void } {
  const seg = segmented(
    [
      { value: 'on' as const, label: 'On' },
      { value: 'off' as const, label: 'Off' },
    ],
    on ? 'on' : 'off',
    (v) => onChange(v === 'on'),
  );
  return { node: field(label, seg.node, hint), update: (v: boolean) => seg.update(v ? 'on' : 'off') };
}

export function slider(label: string, value: number, onChange: (v: number) => void): HTMLElement {
  const input = el('input', {
    type: 'range',
    min: '0',
    max: '100',
    value: String(Math.round(value * 100)),
    'aria-label': label,
  });
  input.addEventListener('input', () => onChange(Number(input.value) / 100));
  return field(label, input);
}

/**
 * A full-screen overlay. `variant` controls whether the stage shows through;
 * `footer` is the screen's action row, placed after the panel so it can stick
 * to the bottom edge of the scrolling layer.
 */
export function screen(
  title: string,
  body: (Node | string | null | undefined)[],
  variant: 'solid' | 'transparent' | 'clear' = 'solid',
  footer: HTMLElement | null = null,
): HTMLElement {
  const cls = variant === 'solid' ? 'layer' : `layer ${variant}`;
  const panel = el('div', { class: 'panel' }, body);
  return el('div', { class: cls, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [panel, footer]);
}

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function focusFirst(root: HTMLElement): void {
  // The first one that is actually showing: focusing a `display: none`
  // button silently leaves focus on <body>, and then no key reaches the screen.
  const target = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].find((n) => n.offsetParent !== null);
  target?.focus();
}

/**
 * Keeps Tab inside a dialog, routes Escape to a handler, and lets the arrow
 * keys walk focus the way Tab does (OVERHAUL 2.4) - except inside a slider,
 * where they belong to the slider.
 */
export function trapFocus(root: HTMLElement, onEscape?: () => void): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && onEscape !== undefined) {
      e.preventDefault();
      onEscape();
      return;
    }
    const arrow = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (e.key !== 'Tab' && arrow === 0) return;
    if (arrow !== 0 && document.activeElement instanceof HTMLInputElement) return;
    const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
    if (items.length === 0) return;
    if (arrow !== 0) {
      e.preventDefault();
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = items[(at + arrow + items.length) % items.length];
      next?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

/**
 * A single flame, no candle body - the title screen's "one candle, one word,
 * one instruction" (docs/design-reference.html). Gently flickers via the same
 * `.bd-flame` keyframes the entry backdrop uses, so it is one flicker
 * language across the whole front door, not two.
 */
export function flameIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 12 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'title-flame');

  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'bd-flame');
  const flame = document.createElementNS(ns, 'path');
  flame.setAttribute('d', 'M6 1c1.8 3 3 4.3 3 6a3 3 0 0 1-6 0c0-1.7 1.2-3 3-6z');
  flame.setAttribute('fill', hex(tokens.candle));
  g.appendChild(flame);
  const core = document.createElementNS(ns, 'path');
  core.setAttribute('d', 'M6 4.2c.9 1.5 1.4 2.1 1.4 3a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.5 1.4-3z');
  core.setAttribute('fill', hex(tokens.ember));
  g.appendChild(core);
  svg.appendChild(g);
  return svg;
}

/** The lit/unlit candle icon used on the shelf and the results screen. */
export function candleIcon(lit: boolean): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 12 24');
  svg.setAttribute('aria-hidden', 'true');
  if (!lit) svg.classList.add('pending');

  const body = document.createElementNS(ns, 'rect');
  body.setAttribute('x', '3');
  body.setAttribute('y', '9');
  body.setAttribute('width', '6');
  body.setAttribute('height', '14');
  body.setAttribute('rx', '1');
  body.setAttribute('fill', lit ? hex(tokens.wax) : hex(tokens.rot));
  svg.appendChild(body);

  if (lit) {
    const flame = document.createElementNS(ns, 'path');
    flame.setAttribute('d', 'M6 1c1.8 3 3 4.3 3 6a3 3 0 0 1-6 0c0-1.7 1.2-3 3-6z');
    flame.setAttribute('fill', hex(tokens.candle));
    svg.appendChild(flame);
    const core = document.createElementNS(ns, 'path');
    core.setAttribute('d', 'M6 4.2c.9 1.5 1.4 2.1 1.4 3a1.4 1.4 0 0 1-2.8 0c0-.9.5-1.5 1.4-3z');
    core.setAttribute('fill', hex(tokens.ember));
    svg.appendChild(core);
  }
  return svg;
}

export function candleRow(count: number, of = 3): HTMLElement {
  const row = el('div', { class: 'candlerow' });
  for (let i = 0; i < of; i++) row.appendChild(candleIcon(i < count));
  return row;
}

export function toast(parent: HTMLElement, message: string, ms = 2200): void {
  const t = el('div', { class: 'toast', role: 'status' }, [message]);
  parent.appendChild(t);
  setTimeout(() => t.remove(), ms);
}
