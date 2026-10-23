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

/**
 * THE WATCHER's own palette, kept here because colours live in exactly one
 * file (CLAUDE.md section 6) and the Watcher used raw hex literals before.
 *
 * It is not in the SPEC section 12.2 palette on purpose: the game's palette is
 * a camcorder looking at a candlelit room, and the Watcher is the one thing
 * that is not in that room. It is lit from below, by the Wicks, in bone and
 * ember - so the ramp runs from a warm lit bone down through a cold shadow to
 * a black that is blacker than `void`.
 */
export const watcherTokens = {
  /** The brightest point of the form: bone with candlelight on it. */
  litBone: 0xcbb795,
  /** Mid-tone, where the form turns away from the light. */
  midBone: 0x4a3a2b,
  /** Where it falls into shadow but is still a surface. */
  shadow: 0x150f0e,
  /** The silhouette edge, barely above the veil behind it. */
  rim: 0x0b0708,
  /** Inside a socket or the throat. Nothing is in there. */
  cavity: 0x000000,
  /** Long hair, for the faces that have it. Blacker than the veil's own dark. */
  hair: 0x040304,
  /** The cowl. */
  hood: 0x0d0f15,
  /** Teeth: harder and colder than the skin of the face. */
  tooth: 0xe6dcc6,
  /** The gum line and the shadow between teeth. */
  toothRoot: 0x3a2a22,
} as const;

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

/**
 * THE WATCHER, one face per tape.
 *
 * A single monster that appears every time gets familiar by the third loss and
 * stops being frightening. Five faces - each drawn from primitives, no image
 * files, so nothing here needs a licence - keep the dread fresh: a drowned
 * ghost behind her own hair, a red horned devil, a hooded reaper, a charred
 * thing with ram's horns, and a grinning skull with too many teeth.
 *
 * Colours live here with the rest of them (CLAUDE.md section 6). `voicePitch`
 * is read by the audio side so each face also screams in its own register.
 */
export type WatcherHorns = 'none' | 'devil' | 'ram' | 'many';
export type WatcherEyes = 'ember' | 'hollow' | 'blaze';

export interface WatcherVariant {
  name: string;
  /** Skin ramp, lit centre to rim. */
  lit: number;
  mid: number;
  shadow: number;
  rim: number;
  tooth: number;
  toothRoot: number;
  /** Light inside the sockets, the throat and the cracks. */
  glow: number;
  /** The brightest point of the eye. */
  eye: number;
  blood: number;
  horns: WatcherHorns;
  eyes: WatcherEyes;
  /** Long black hair hanging over the face. */
  hair: boolean;
  /** A black cowl around the head. */
  hood: boolean;
  /** Blood from the mouth and eyes instead of wax. */
  gore: boolean;
  teeth: number;
  /** Multiplies the eye sockets. */
  socketScale: number;
  /** Multiplies the scream's pitch: below 1 is a growl, above 1 a shriek. */
  voicePitch: number;
}

export const watcherVariants: readonly WatcherVariant[] = [
  {
    name: 'the drowned',
    lit: 0xd9d4c8, mid: 0x7d776e, shadow: 0x2a2723, rim: 0x0b0a0a,
    tooth: 0xcfc9b8, toothRoot: 0x2a1414, glow: 0xbfd8ff, eye: 0xffffff, blood: 0x6e0f10,
    horns: 'none', eyes: 'hollow', hair: true, hood: false, gore: true,
    teeth: 11, socketScale: 1.3, voicePitch: 1.2,
  },
  {
    name: 'the red one',
    lit: 0xe0452f, mid: 0x8a1a12, shadow: 0x3b0705, rim: 0x120302,
    tooth: 0xf0e2c0, toothRoot: 0x2a0605, glow: 0xffc13a, eye: 0xfff0a0, blood: 0x4a0606,
    horns: 'devil', eyes: 'blaze', hair: false, hood: false, gore: false,
    teeth: 11, socketScale: 1.05, voicePitch: 0.8,
  },
  {
    name: 'the reaper',
    lit: 0xcfd2bf, mid: 0x6b705f, shadow: 0x1f221c, rim: 0x070806,
    tooth: 0xdfe0cc, toothRoot: 0x20231b, glow: 0x7fe3ff, eye: 0xeaffff, blood: 0x1a2a2a,
    horns: 'none', eyes: 'hollow', hair: false, hood: true, gore: false,
    teeth: 13, socketScale: 1.2, voicePitch: 0.9,
  },
  {
    name: 'the burnt',
    lit: 0xa3826c, mid: 0x4d3b32, shadow: 0x120d0b, rim: 0x050303,
    tooth: 0xd8c8a8, toothRoot: 0x1a0c06, glow: 0xff6a2b, eye: 0xffb347, blood: 0x5a1005,
    horns: 'ram', eyes: 'ember', hair: false, hood: false, gore: false,
    teeth: 9, socketScale: 1.1, voicePitch: 0.65,
  },
  {
    name: 'the grinner',
    lit: 0xe9e4d2, mid: 0x8f897a, shadow: 0x2e2a25, rim: 0x0a0908,
    tooth: 0xf5f0de, toothRoot: 0x3a1010, glow: 0xff2a2a, eye: 0xff6060, blood: 0x8a0a0a,
    horns: 'many', eyes: 'blaze', hair: true, hood: false, gore: true,
    teeth: 17, socketScale: 1.15, voicePitch: 1.05,
  },
];
