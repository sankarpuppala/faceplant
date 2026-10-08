/**
 * U3 - THE PROCESSION. A combo that is made of light instead of a number.
 *
 * Consecutive saves with no loss raise a multiplier, and every step up widens
 * the candle radius. A high Procession literally reveals more of the player's
 * face; a loss dims it back down. That means the combo is visible in a muted
 * two-second clip, which is pillar 2, and it gives a flawless run a look of its
 * own rather than just a bigger total.
 */

import { config } from '../config.ts';

export interface ProcessionState {
  /** Saves since the last loss. */
  streak: number;
  /** Current multiplier, 1..maxMultiple. */
  multiple: number;
  /** Extra light radius this multiplier grants, FH. */
  lightBonusFh: number;
  /** Set on the step the multiplier went up, for the chime and the flare. */
  justStepped: boolean;
  /** Set on the step a loss broke it. */
  justBroken: boolean;
  /** Best multiplier reached this run, for the results screen. */
  best: number;
}

export class Procession {
  private streak = 0;
  private best = 1;
  private stepped = false;
  private broken = false;

  save(): void {
    const before = this.multiple;
    this.streak++;
    this.stepped = this.multiple > before;
    this.broken = false;
    if (this.multiple > this.best) this.best = this.multiple;
  }

  loss(): void {
    const before = this.multiple;
    this.streak = Math.max(0, this.streak - config.procession.stepsLostOnLoss * config.procession.savesPerStep);
    this.stepped = false;
    this.broken = this.multiple < before;
  }

  /** Clears the one-shot flags; called once per frame after they have been read. */
  clearFlags(): void {
    this.stepped = false;
    this.broken = false;
  }

  get multiple(): number {
    return Math.min(
      config.procession.maxMultiple,
      1 + Math.floor(this.streak / config.procession.savesPerStep),
    );
  }

  get state(): ProcessionState {
    const multiple = this.multiple;
    return {
      streak: this.streak,
      multiple,
      lightBonusFh: (multiple - 1) * config.procession.lightBonusFhPerStep,
      justStepped: this.stepped,
      justBroken: this.broken,
      best: this.best,
    };
  }

  reset(): void {
    this.streak = 0;
    this.best = 1;
    this.stepped = false;
    this.broken = false;
  }
}
