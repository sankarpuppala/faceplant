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
  filter: FilterName;
  /** Forces INK, so the player's face is never drawn (decision D8). */
  hideMyFace: boolean;
  controls: ControlMode;
  /** U8 - the clip recorder is off until the player turns it on. */
  recording: boolean;
  /** 0..1. */
  volume: number;
  /** Set once the first-launch notice has been acknowledged. */
  noticeSeen: boolean;
  lowPower: boolean;
  /**
   * Set once the How to Play screen has been shown. It is shown automatically
   * the first time this is false, right after the notice - because a title
   * screen with no instructions is not a title screen a new player can use.
   */
  howToPlaySeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  scares: true,
  reducedEffects: false,
  filter: 'vhs',
  hideMyFace: false,
  controls: 'assist',
  recording: false,
  volume: 0.7,
  noticeSeen: false,
  lowPower: false,
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
    const volume = typeof o.volume === 'number' && Number.isFinite(o.volume) ? Math.min(1, Math.max(0, o.volume)) : DEFAULT_SETTINGS.volume;

    return {
      scares: bool(o.scares, DEFAULT_SETTINGS.scares),
      reducedEffects: bool(o.reducedEffects, DEFAULT_SETTINGS.reducedEffects),
      filter: filter === 'ink' || filter === 'thermal' || filter === 'vhs' ? filter : DEFAULT_SETTINGS.filter,
      hideMyFace: bool(o.hideMyFace, DEFAULT_SETTINGS.hideMyFace),
      controls: controls === 'face' || controls === 'assist' ? controls : DEFAULT_SETTINGS.controls,
      recording: bool(o.recording, DEFAULT_SETTINGS.recording),
      volume,
      noticeSeen: bool(o.noticeSeen, DEFAULT_SETTINGS.noticeSeen),
      lowPower: bool(o.lowPower, DEFAULT_SETTINGS.lowPower),
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
