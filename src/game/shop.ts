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
  | 'mawSense'
  | 'tallowShell'
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
 * Ordered cheapest first, which is also roughly the order they become useful.
 *
 * Every item is checked against what actually kills Wicks. An earlier version
 * of this list was not, and it showed: measured over fifteen levels, five of
 * the seven items saved *zero* extra Wicks, because they insured against
 * falling in gaps, going out in the dark, and missing the Gate - none of
 * which happen - while Crawlers and Drips accounted for 94% of real deaths.
 * `The Wider Door` is gone for that reason; `Tallow Shell` took its place
 * because nothing in the shop answered a Drip at all.
 *
 * The other half of the fix is that each one now reports what it did:
 * `riteSaves` on the run result, shown on the results screen. An invisible
 * permanent buff feels identical to a broken one.
 */
export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'steadyWicks',
    icon: 'steadyWicks',
    name: 'Steady Feet',
    blurb: 'They walk like they have somewhere to be.',
    effect:
      `They walk ${Math.round((config.rites.steadyWicksSpeedMultiple - 1) * 100)}% faster and cross gaps ` +
      `${Math.round((config.rites.steadyWicksMultiple - 1) * 100)}% wider, so they are out in the open for less time.`,
    costCoins: 120,
  },
  {
    id: 'tallowShell',
    icon: 'tallowShell',
    name: 'Tallow Shell',
    blurb: 'A skin of cold wax. The first splash just hisses.',
    effect:
      `Every Wick survives ${config.rites.tallowShellCount} Drip before the flame goes out. ` +
      `Drips are the second most common way you lose them.`,
    costCoins: 180,
  },
  {
    id: 'mawSense',
    icon: 'mawSense',
    name: 'The Warning',
    blurb: 'They feel the draught before the mouth opens.',
    effect:
      `They notice an open Maw from ${Math.round((config.rites.mawSenseRadiusMultiple - 1) * 100)}% further away ` +
      `and start running sooner. Buy this if you laugh.`,
    costCoins: 220,
  },
  {
    id: 'ironNerve',
    icon: 'ironNerve',
    name: 'Iron Nerve',
    blurb: 'You do not gasp. Whatever it does.',
    /**
     * Priced lower than it was, and honestly. Measured across a whole
     * playthrough this saves very few Wicks in any playstyle, because THE
     * YAWN fires when you are already laughing with your mouth open - so it
     * mostly buys you the composure bonus, which is coins rather than lives.
     * Charging 400 for that was the shop's other credibility problem.
     */
    effect:
      `Composure drains ${Math.round((1 - config.rites.ironNerveMultiple) * 100)}% more slowly and THE YAWN never ` +
      `takes your mouth, so you keep the composure bonus on every tape.`,
    costCoins: 240,
  },
  {
    id: 'lanternOil',
    icon: 'lanternOil',
    name: 'Lantern Oil',
    blurb: 'A better flame is a harder flame to put out.',
    effect:
      `Flames light 25% further and take ${config.rites.lanternOilSnuffMultiple}x as long for a Moth or the ` +
      `Dark to kill - long enough that you can answer.`,
    costCoins: 280,
  },
  {
    id: 'wardingSalt',
    icon: 'wardingSalt',
    name: 'Warding Salt',
    blurb: 'Crawlers do not like the taste of the road.',
    effect:
      `Every Crawler is driven off the first flame it reaches and backs away for ` +
      `${(config.rites.wardingSaltRetreatMs / 1000).toFixed(0)}s - straight across your mouth, if you want it. ` +
      `They are also ${Math.round((1 - config.rites.wardingSaltSpeedMultiple) * 100)}% slower and need ` +
      `${Math.round((config.rites.wardingSaltTouchMultiple - 1) * 100)}% longer to feed.`,
    costCoins: 320,
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
