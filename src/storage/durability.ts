/**
 * Keeping the save alive.
 *
 * The save is one `localStorage` key on one browser on one device - no server
 * means no account, no upload and nothing to breach (decision D1). By default
 * an origin's storage is "best-effort", which a browser may clear when the
 * device runs low on disk; `requestPersistent()` asks for the "persistent"
 * bucket instead. Chrome grants it silently based on engagement; there is no
 * prompt. Safari still deletes script-written storage after seven days
 * without a visit, and no API can change that.
 */

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
