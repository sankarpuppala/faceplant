/**
 * Settings and progress in localStorage (SPEC section 12.5, CLAUDE.md invariant 3).
 *
 * **Only** preferences and progress are stored. Never a frame, never a
 * landmark, never an image. Every read is defensive: a corrupted or
 * hand-edited value must not stop the game loading, because there is no
 * account to fall back on.
 */

export type FilterName = 'vhs' | 'ink' | 'thermal';
export type ControlMode = 'face' | 'assist';

export interface Settings {
  scares: boolean;
  reducedEffects: boolean;
  /** Camera filter. INK draws no video at all - the face as contour lines only. */
  filter: FilterName;
  controls: ControlMode;
  /** U8 - the clip recorder is off until the player turns it on. */
  recording: boolean;
  /** Master volume, 0..1. */
  volume: number;
  /** Music bus (title music box, drone), 0..1. */
  musicVolume: number;
  /** Sound effects bus, 0..1. */
  sfxVolume: number;
  /** Set once the first-launch notice has been acknowledged. */
  noticeSeen: boolean;
  /**
   * Set once the first tape insert has shown the face diagram and its one
   * sentence of instructions (OVERHAUL 8: no how-to-play screen).
   */
  howToPlaySeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  scares: true,
  reducedEffects: false,
  filter: 'vhs',
  controls: 'assist',
  recording: false,
  volume: 0.7,
  musicVolume: 0.8,
  sfxVolume: 0.9,
  noticeSeen: false,
  howToPlaySeen: false,
};

const KEY = 'faceplant.settings.v1';

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__faceplant__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    // Private browsing, blocked site data, or an embedded frame with no access.
    return null;
  }
}

/**
 * Whether anything can actually be persisted. False in a private window, with
 * site data blocked, or in an embedded frame without storage access - all of
 * which are survivable (the game runs on defaults), but the UI should not
 * promise a save it cannot make.
 */
export function storageAvailable(): boolean {
  return storage() !== null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function loadSettings(): Settings {
  const s = storage();
  if (s === null) return { ...DEFAULT_SETTINGS };
  try {
    const raw = s.getItem(KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const o = parsed as Record<string, unknown>;

    const filter = o.filter;
    const controls = o.controls;
    const unit = (v: unknown, fallback: number): number =>
      typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

    // Older saves carried `hideMyFace`, which was INK under another name.
    const legacyHide = o.hideMyFace === true;

    return {
      scares: bool(o.scares, DEFAULT_SETTINGS.scares),
      reducedEffects: bool(o.reducedEffects, DEFAULT_SETTINGS.reducedEffects),
      filter: legacyHide
        ? 'ink'
        : filter === 'ink' || filter === 'thermal' || filter === 'vhs'
          ? filter
          : DEFAULT_SETTINGS.filter,
      controls: controls === 'face' || controls === 'assist' ? controls : DEFAULT_SETTINGS.controls,
      recording: bool(o.recording, DEFAULT_SETTINGS.recording),
      volume: unit(o.volume, DEFAULT_SETTINGS.volume),
      musicVolume: unit(o.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: unit(o.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      noticeSeen: bool(o.noticeSeen, DEFAULT_SETTINGS.noticeSeen),
      howToPlaySeen: bool(o.howToPlaySeen, DEFAULT_SETTINGS.howToPlaySeen),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  const s = storage();
  if (s === null) return;
  try {
    s.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Quota or a locked store: a lost preference is not worth a crash.
  }
}

/** Honours the OS-level preference the first time the game runs. */
export function applySystemPreferences(settings: Settings): Settings {
  if (!settings.noticeSeen && typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return { ...settings, reducedEffects: true };
      }
    } catch {
      /* matchMedia can throw in odd embedding contexts. */
    }
  }
  return settings;
}
