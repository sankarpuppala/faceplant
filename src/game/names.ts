/**
 * U7 - named Wicks.
 *
 * SPEC v1.0 already had the instinct, in one line of sample copy: "brother
 * kevin is gone." It is funnier and sadder than "1 lost" for a reason, and the
 * reason is that Kevin had a name. So every Wick gets one.
 *
 * The names are deliberately mundane and slightly ecclesiastical - a tiny
 * devout people with the naming conventions of a parish register. A candle
 * called Deborah dying in your mouth is the joke.
 */

import { Rng } from '../physics/vec.ts';

export const WICK_NAMES: readonly string[] = [
  'kevin', 'agnes', 'deborah', 'mortimer', 'prudence', 'clive', 'wilhelmina', 'barnaby',
  'edith', 'roland', 'hestia', 'cuthbert', 'maude', 'alfred', 'temperance', 'oswin',
  'bernice', 'horace', 'drusilla', 'percival', 'winifred', 'archibald', 'constance',
  'bartholomew', 'gwendolyn', 'reginald', 'millicent', 'ambrose', 'philippa', 'desmond',
  'bridget', 'leopold', 'rosalind', 'crispin', 'henrietta', 'augustin', 'beatrix',
  'lionel', 'theodora', 'ignatius', 'marigold', 'wilbur', 'octavia', 'ferdinand',
  'hyacinth', 'rupert', 'evangeline', 'silas', 'perpetua', 'bartlett',
];

/** Titles a Wick earns by surviving, awarded in order of runs survived. */
export const TITLES: readonly string[] = [
  'the twice-blessed',
  'who has seen the maw',
  'the unmelted',
  'keeper of the third flame',
  'who does not speak of it',
  'the stubborn',
];

export function titleForRunsSurvived(runs: number): string | null {
  if (runs <= 1) return null;
  return TITLES[Math.min(runs - 2, TITLES.length - 1)] ?? null;
}

/** Full display name, e.g. "kevin, twice-blessed". */
export function displayName(name: string, title: string | null): string {
  return title === null ? name : `${name}, ${title}`;
}

/**
 * Deals out names without repeats inside a run. Seeded, so a Daily Tape has the
 * same cast for everyone - which makes the share text comparable in a way a
 * bare count is not.
 */
export class NameDealer {
  private pool: string[];
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    this.pool = [...WICK_NAMES];
    // Fisher-Yates with the seeded rng, so the order is reproducible.
    for (let i = this.pool.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i + 1);
      const a = this.pool[i];
      const b = this.pool[j];
      if (a === undefined || b === undefined) continue;
      this.pool[i] = b;
      this.pool[j] = a;
    }
  }

  next(): string {
    const n = this.pool.pop();
    if (n !== undefined) return n;
    // More Wicks than names: start numbering, which is its own small joke.
    this.pool = WICK_NAMES.map((n2) => `${n2} the second`);
    return this.pool.pop() ?? 'anonymous';
  }
}
