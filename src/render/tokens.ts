/**
 * The only place raw colours exist (CLAUDE.md section 6, SPEC section 12.2).
 * `src/ui/tokens.css` must carry the same values; `tests/render/tokens.test.ts`
 * checks the two files agree.
 */

export const tokens = {
  void: 0x07060a,
  ink: 0x15121b,
  dusk: 0x2b2236,
  bone: 0xede6d6,
  boneDim: 0x9e968a,
  candle: 0xffb547,
  ember: 0xff6a2b,
  rec: 0xe0322b,
  mold: 0x5f6e4c,
  wax: 0xeadcc0,
} as const;

export type TokenName = keyof typeof tokens;

/** The face contour line: `candle` at 35% (SPEC section 12.2, `chalk`). */
export const chalk = { color: tokens.candle, alpha: 0.35 } as const;

export const fonts = {
  osd: '"VT323", "Courier New", monospace',
  label: '"Special Elite", "Courier New", serif',
  ui: '"Inter", system-ui, sans-serif',
} as const;

export function hex(token: number): string {
  return '#' + token.toString(16).padStart(6, '0');
}

/** The thermal ramp used by the THERMAL filter (SPEC section 12.4). */
export const thermalRamp: readonly (readonly [number, number, number])[] = [
  [0.02, 0.0, 0.08],
  [0.25, 0.0, 0.45],
  [0.75, 0.1, 0.35],
  [1.0, 0.45, 0.05],
  [1.0, 0.85, 0.35],
  [1.0, 1.0, 0.9],
];
