/**
 * Level loading and the tape shelf (SPEC sections 9.3, 11.1).
 *
 * Levels are JSON under `public/levels/`, fetched same-origin. The manifest is
 * a module constant rather than a fetched index, so a missing level is a build
 * error caught by `tests/game/levels.test.ts` rather than a blank shelf.
 */

import { parseLevel, type Level } from './levelSchema.ts';

export interface Tape {
  number: number;
  /** Shelf sticker, e.g. "keep still". */
  name: string;
  /** What the tape teaches, for the shelf blurb. */
  teaches: string;
  levelIds: readonly string[];
}

/** SPEC section 9.3. */
export const TAPES: readonly Tape[] = [
  {
    number: 1,
    name: 'keep still',
    teaches: 'holding still, the nose slide, tilting between brows, leaning to bridge a gap',
    levelIds: ['01-1', '01-2', '01-3', '01-4'],
  },
  {
    number: 2,
    name: 'the maw',
    teaches: 'the closed mouth as a bridge, swallowing Crawlers, timing the Maw',
    levelIds: ['02-1', '02-2', '02-3'],
  },
  {
    number: 3,
    name: 'hold your breath',
    teaches: 'long crossings over the mouth, where any sound costs you',
    levelIds: ['03-1', '03-2', '03-3'],
  },
  {
    number: 4,
    name: 'dread',
    teaches: 'the Dark, Drips under flicker, and the finale',
    levelIds: ['04-1', '04-2'],
  },
  {
    number: 5,
    name: 'no mercy',
    teaches: 'everything at once, with no slack left in the timing',
    levelIds: ['05-1', '05-2', '05-3'],
  },
];

export const ALL_LEVEL_IDS: readonly string[] = TAPES.flatMap((t) => t.levelIds);

/**
 * The narrative finale (SPEC section 10.3) - the level the ending card belongs
 * to. **Not** the last level on disk: Tape 05 is post-game content that
 * unlocks after the story ends, so walking `ALL_LEVEL_IDS` to find the end
 * would move the ending credits onto a bonus level, which is exactly what
 * happened when Tape 05 was added.
 */
export const STORY_FINALE_ID = '04-2';

export function isStoryFinale(levelId: string): boolean {
  return levelId === STORY_FINALE_ID;
}

/**
 * Where CONTINUE should take a returning player: the first level they have not
 * finished. Null once everything is done, in which case the shelf is the right
 * destination instead.
 */
export function nextUnplayedLevelId(completed: ReadonlySet<string>): string | null {
  for (const id of ALL_LEVEL_IDS) {
    if (!completed.has(id)) return id;
  }
  return null;
}

const cache = new Map<string, Level>();

export function levelUrl(id: string): string {
  // Relative so the game works from a project page or an itch.io zip.
  return `levels/${id}.json`;
}

export async function loadLevel(id: string): Promise<Level> {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;

  const res = await fetch(levelUrl(id));
  if (!res.ok) throw new Error(`Level ${id} failed to load (${res.status})`);
  const level = parseLevel(await res.json(), id);
  if (level.id !== id) throw new Error(`Level ${id} declares id "${level.id}"`);
  cache.set(id, level);
  return level;
}

export function tapeFor(levelId: string): Tape | undefined {
  return TAPES.find((t) => t.levelIds.includes(levelId));
}

export function nextLevelId(levelId: string): string | null {
  const i = ALL_LEVEL_IDS.indexOf(levelId);
  if (i < 0 || i + 1 >= ALL_LEVEL_IDS.length) return null;
  return ALL_LEVEL_IDS[i + 1] ?? null;
}

/**
 * Unlocking (SPEC section 11.1): tapes unlock in order, levels within a tape
 * unlock in order. A level is open if the one before it was finished at all -
 * one candle is enough, so a struggling player is never walled in.
 */
export function isLevelUnlocked(levelId: string, completed: ReadonlySet<string>): boolean {
  const i = ALL_LEVEL_IDS.indexOf(levelId);
  if (i <= 0) return true;
  const prev = ALL_LEVEL_IDS[i - 1];
  return prev !== undefined && completed.has(prev);
}

export function isTapeUnlocked(tape: number, completed: ReadonlySet<string>): boolean {
  if (tape <= 1) return true;
  const previous = TAPES.find((t) => t.number === tape - 1);
  if (previous === undefined) return true;
  return previous.levelIds.every((id) => completed.has(id));
}

/** The Daily Tape unlocks after Tape 01 (SPEC section 11.2). */
export function isDailyUnlocked(completed: ReadonlySet<string>): boolean {
  return (TAPES[0]?.levelIds ?? []).every((id) => completed.has(id));
}

/** U4 - the Long Tape unlocks alongside the Daily, so the loop opens early. */
export function isEndlessUnlocked(completed: ReadonlySet<string>): boolean {
  return isDailyUnlocked(completed);
}
