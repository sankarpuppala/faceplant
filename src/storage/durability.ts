/**
 * Keeping a save alive, and letting the player take it with them.
 *
 * The save is one `localStorage` key on one browser on one device. That is the
 * right choice for this game - no server means no account, no upload and
 * nothing to breach (decision D1) - but it is worth being precise about what
 * it actually guarantees, because "will my progress still be there in a
 * month?" has a different answer per browser:
 *
 *   - **Chrome, Edge, Firefox**: it persists indefinitely. The one risk is
 *     *eviction*: by default an origin's storage is "best-effort", which a
 *     browser may clear when the device runs low on disk. `requestPersistent()`
 *     asks for the "persistent" bucket instead, which is exempt. Chrome grants
 *     it silently based on engagement (installed, bookmarked, frequently
 *     visited); there is no permission prompt to annoy anyone with.
 *   - **Safari**: caps script-writable storage. If the player does not visit
 *     for **seven days**, the save is deleted - and `persist()` does not change
 *     that. There is no API that can prevent it.
 *   - **Private windows** anywhere: cleared when the window closes.
 *   - Clearing browsing data, or a different browser or device, is a different
 *     save. Nothing syncs.
 *
 * Since the Safari case cannot be fixed from script, the honest answer is to
 * let the player hold a copy themselves - hence export and import. A file in
 * their downloads folder outlives any eviction policy.
 */

import { EMPTY_PROGRESS, type Progress } from './progress.ts';

const PROGRESS_KEY = 'faceplant.progress.v1';
const SETTINGS_KEY = 'faceplant.settings.v1';

/** What `localStorage` is actually promising us right now. */
export type Durability = 'persistent' | 'best-effort' | 'unavailable';

export async function requestPersistent(): Promise<Durability> {
  try {
    if (typeof navigator === 'undefined' || navigator.storage === undefined) return 'best-effort';
    if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) {
      return 'persistent';
    }
    if (typeof navigator.storage.persist === 'function') {
      return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
    }
    return 'best-effort';
  } catch {
    // Not supported, or blocked. The game still saves; it is just evictable.
    return 'best-effort';
  }
}

export async function currentDurability(canSave: boolean): Promise<Durability> {
  if (!canSave) return 'unavailable';
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.storage?.persisted === 'function') {
      return (await navigator.storage.persisted()) ? 'persistent' : 'best-effort';
    }
  } catch {
    /* fall through */
  }
  return 'best-effort';
}

/** The shape written to an exported file. Versioned so an old file is readable. */
export interface SaveFile {
  game: 'faceplant';
  version: 1;
  exportedAt: string;
  progress: Progress;
  settings: unknown;
}

export function buildSaveFile(progress: Progress): SaveFile {
  let settings: unknown = null;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    settings = raw === null ? null : JSON.parse(raw);
  } catch {
    settings = null;
  }
  return {
    game: 'faceplant',
    version: 1,
    exportedAt: new Date().toISOString(),
    progress,
    settings,
  };
}

export function exportSave(progress: Progress): void {
  const blob = new Blob([JSON.stringify(buildSaveFile(progress), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 10);
  a.download = `faceplant-save-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export class SaveFileError extends Error {}

/**
 * Parses an exported file. Deliberately strict about the envelope and
 * forgiving about the contents: a save from a newer build may carry fields
 * this one does not know, and `loadProgress`-style defaulting handles that.
 */
export function parseSaveFile(text: string): Progress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SaveFileError('That file is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new SaveFileError('That file is not a FACEPLANT save.');

  const o = parsed as Partial<SaveFile>;
  if (o.game !== 'faceplant') throw new SaveFileError('That file is not a FACEPLANT save.');
  if (typeof o.progress !== 'object' || o.progress === null) throw new SaveFileError('That save has no progress in it.');

  const p = o.progress as Partial<Progress>;
  // Rebuild through the empty save so missing or junk fields get defaults
  // rather than crashing the game on load.
  return {
    ...structuredClone(EMPTY_PROGRESS),
    ...p,
    levels: typeof p.levels === 'object' && p.levels !== null ? p.levels : {},
    survivors: typeof p.survivors === 'object' && p.survivors !== null ? p.survivors : {},
    ossuary: Array.isArray(p.ossuary) ? p.ossuary : [],
    rites: Array.isArray(p.rites) ? p.rites : [],
    coins: typeof p.coins === 'number' && Number.isFinite(p.coins) ? Math.max(0, p.coins) : 0,
    coinsEarned: typeof p.coinsEarned === 'number' && Number.isFinite(p.coinsEarned) ? Math.max(0, p.coinsEarned) : 0,
  };
}

/** Writes an imported save straight to storage, then hands it back. */
export function applySaveFile(progress: Progress): Progress {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* unavailable storage is reported separately; the in-memory save still works */
  }
  return progress;
}

/** Opens a file picker and resolves the parsed save, or null if cancelled. */
export function pickSaveFile(): Promise<Progress | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(null);
        return;
      }
      void file
        .text()
        .then((text) => resolve(parseSaveFile(text)))
        .catch((err: unknown) => reject(err instanceof Error ? err : new SaveFileError('That file could not be read.')));
    });
    // A cancelled picker fires nothing in some browsers, so this promise may
    // simply never settle. That is fine - nothing is waiting on it.
    input.click();
  });
}
