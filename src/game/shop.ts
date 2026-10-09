/**
 * THE PEDLAR - the shop, and the coins that pay for it.
 *
 * This replaces the old "Rites" screen, which spent *candles*. That was a
 * design mistake worth naming: candles are a per-level rating, like stars, so
 * spending them meant your record of how well you had played went down when
 * you bought something. Coins are earnings instead, so buying things never
 * erases an achievement, and the two numbers stop competing.
 *
 * Every item is a permanent, stated, mechanical effect - no cosmetics and no
 * randomness, so a player can always see exactly what their coins bought.
 * `riteTunables()` in `app.ts` is where they take hold.
 */

import { config } from '../config.ts';

export type ShopItemId =
  | 'steadyWicks'
  | 'slowSpawn'
  | 'wideGate'
  | 'secondChance'
  | 'lanternOil'
  | 'ironNerve'
  | 'wardingSalt';

export interface ShopItem {
  id: ShopItemId;
  name: string;
  /** Key into `src/ui/icons.ts`, so each row leads with a picture. */
  icon: ShopItemId;
  /** What it does, in the Wicks' register but plain enough to act on. */
  blurb: string;
  /** What it does mechanically, stated in numbers the player can verify. */
  effect: string;
  costCoins: number;
}

/**
 * Ordered cheapest first, which also happens to be roughly the order they
 * become useful: footing and spawn rate matter in Tape 01-02, nerve and salt
 * matter once the scares and Crawlers arrive.
 */
export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'steadyWicks',
    icon: 'steadyWicks',
    name: 'Steady Feet',
    blurb: 'They will risk a longer stride.',
    effect: `Gaps and drops they will cross are ${Math.round((config.rites.steadyWicksMultiple - 1) * 100)}% wider.`,
    costCoins: 120,
  },
  {
    id: 'lanternOil',
    icon: 'lanternOil',
    name: 'Lantern Oil',
    blurb: 'A better flame sees further into the dark.',
    effect: 'Every flame lights 25% further, and the Dark takes longer to find them.',
    costCoins: 160,
  },
  {
    id: 'slowSpawn',
    icon: 'slowSpawn',
    name: 'Rite of Patience',
    blurb: 'They leave the lantern less often.',
    effect: `Spawns are ${Math.round((config.rites.slowSpawnMultiple - 1) * 100)}% further apart, so fewer are exposed at once.`,
    costCoins: 200,
  },
  {
    id: 'wardingSalt',
    icon: 'wardingSalt',
    name: 'Warding Salt',
    blurb: 'Crawlers do not like the taste of the road.',
    effect: 'Crawlers move 20% slower and take 50% longer to put a flame out.',
    costCoins: 260,
  },
  {
    id: 'wideGate',
    icon: 'wideGate',
    name: 'The Wider Door',
    blurb: 'The Gate counts a near miss as an arrival.',
    effect: `The Gate's reach grows by ${config.rites.wideGateBonusFh.toFixed(2)} face-heights on every side.`,
    costCoins: 320,
  },
  {
    id: 'ironNerve',
    icon: 'ironNerve',
    name: 'Iron Nerve',
    blurb: 'You will hold yourself together a little longer.',
    effect: 'Composure drains 25% more slowly, so laughing costs less.',
    costCoins: 400,
  },
  {
    id: 'secondChance',
    icon: 'secondChance',
    name: 'The Second Flame',
    blurb: 'One of them gets to come back.',
    effect: `${config.rites.secondChanceCount} lost Wick per run returns to the lantern. The Maw is exempt.`,
    costCoins: 500,
  },
];

export function shopItem(id: ShopItemId): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export const SHOP_ITEM_IDS: readonly ShopItemId[] = SHOP_ITEMS.map((i) => i.id);

/**
 * Coins for a finished run. A failed tape pays nothing - that is most of what
 * makes failing sting, now that it exists.
 */
export function coinsFor(args: {
  failed: boolean;
  saved: number;
  spawned: number;
  candles: number;
  composureLeft: number;
  offerings: number;
  mode: 'story' | 'daily' | 'endless';
  wave: number;
  /** True when this level has already been cleared, which pays less. */
  replay: boolean;
}): number {
  if (args.failed) return 0;

  const c = config.coins;
  let total = 0;

  if (args.mode === 'endless') {
    total = c.perClear + args.wave * c.perEndlessWave + args.saved * c.perSavedWick;
  } else {
    total += c.perClear;
    total += args.saved * c.perSavedWick;
    total += args.candles * c.perCandle;
    if (args.saved === args.spawned && args.spawned > 0) total += c.flawlessBonus;
    total += Math.round(c.composureBonus * Math.max(0, Math.min(1, args.composureLeft)));
    total += args.offerings * c.perOffering;
  }

  // Replaying a cleared level still pays, but not enough to make grinding the
  // easiest level the best way to earn.
  if (args.replay) total = Math.round(total * c.replayMultiple);

  return Math.max(0, total);
}
