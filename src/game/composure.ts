/**
 * U1 - COMPOSURE. The hook, as a system.
 *
 * SPEC v1.0 section 3.1 said the game wins when you lose your composure, and
 * then never measured it. This is the meter that makes that sentence true:
 *
 *   - Every involuntary tell drains it. Laughing costs most, then a gasp, then
 *     a flinch, then a smile, then a brow flash.
 *   - Holding the Maw open drains it too, which is the price of using your
 *     mouth as a weapon (U2).
 *   - Stillness refills it, but only after a pause - so you cannot rescue a
 *     laugh by immediately freezing.
 *   - At zero, THE YAWN: the Maw opens on its own. You are never punished for
 *     your mouth. You are punished for cracking.
 *
 * It also reports *how close to cracking* you are, which the line director uses
 * to escalate. The game hunts your composure, and gets funnier the nearer you
 * are to losing it.
 */

import { config } from '../config.ts';
import type { Reactions } from '../face/reactions.ts';

export type ComposureTell = 'laughing' | 'gasp' | 'smiling' | 'browsUp' | 'flinch' | 'mawOpen';

export type ComposureMood = 'steady' | 'cracking' | 'panic';

export interface ComposureState {
  units: number;
  /** units / maxUnits, 0..1. */
  fraction: number;
  mood: ComposureMood;
  /** True while THE YAWN is forcing the Maw open. */
  yawning: boolean;
  /** Set on the step the yawn begins. */
  justYawned: boolean;
  /** Which tells are draining right now, strongest first. */
  activeTells: ComposureTell[];
  /** Lowest fraction reached so far - U8 uses this to find the clip highlight. */
  lowestFraction: number;
  /** Timestamp of the biggest single drop, for the clip highlight. */
  worstMomentMs: number;
}

export class Composure {
  private units: number = config.composure.startUnits;
  private lastTellMs = -Infinity;
  private yawnUntilMs = -Infinity;
  private yawnCooldownUntilMs = -Infinity;
  private lowest = 1;
  private worstMs = 0;
  private worstDrop = 0;
  private tells: ComposureTell[] = [];
  private justYawned = false;

  update(reactions: Reactions, mawOpen: boolean, dtMs: number, nowMs: number): ComposureState {
    const dtS = dtMs / 1000;
    const before = this.units;
    this.justYawned = false;
    this.tells = [];

    let drain = 0;
    const d = config.composure.drainPerS;

    // Laughing supersedes smiling: a laugh already includes the smile, and
    // charging for both made a single giggle lethal.
    if (reactions.laughing) {
      drain += d.laughing;
      this.tells.push('laughing');
    } else if (reactions.smiling) {
      drain += d.smiling;
      this.tells.push('smiling');
    }
    if (reactions.gasp) {
      drain += d.gasp;
      this.tells.push('gasp');
    }
    if (reactions.browsUp) {
      drain += d.browsUp;
      this.tells.push('browsUp');
    }
    if (reactions.flinching) {
      drain += d.flinch;
      this.tells.push('flinch');
    }
    if (mawOpen) {
      drain += d.mawOpen;
      this.tells.push('mawOpen');
    }

    if (drain > 0) {
      this.units -= drain * dtS;
      this.lastTellMs = nowMs;
    } else if (nowMs - this.lastTellMs >= config.composure.regainDelayMs) {
      this.units += config.composure.regainPerS * dtS;
    }

    this.units = Math.min(config.composure.maxUnits, Math.max(0, this.units));

    // THE YAWN.
    if (
      this.units <= 0 &&
      nowMs >= this.yawnCooldownUntilMs &&
      nowMs >= this.yawnUntilMs
    ) {
      this.yawnUntilMs = nowMs + config.composure.yawn.durationMs;
      this.yawnCooldownUntilMs = this.yawnUntilMs + config.composure.yawn.cooldownMs;
      // Hand back a little, so a yawn is a setback rather than a death spiral.
      this.units = config.composure.yawn.refundUnits;
      this.justYawned = true;
    }

    const fraction = this.units / config.composure.maxUnits;
    if (fraction < this.lowest) this.lowest = fraction;

    const drop = before - this.units;
    if (drop > this.worstDrop) {
      this.worstDrop = drop;
      this.worstMs = nowMs;
    }

    return {
      units: this.units,
      fraction,
      mood: moodFor(fraction),
      yawning: nowMs < this.yawnUntilMs,
      justYawned: this.justYawned,
      activeTells: [...this.tells],
      lowestFraction: this.lowest,
      worstMomentMs: this.worstMs,
    };
  }

  /** U2 - a clean offering hands composure back. The mouth can pay for itself. */
  reward(units: number): void {
    this.units = Math.min(config.composure.maxUnits, this.units + units);
  }

  get fraction(): number {
    return this.units / config.composure.maxUnits;
  }

  get lowestFraction(): number {
    return this.lowest;
  }

  get worstMomentMs(): number {
    return this.worstMs;
  }

  reset(): void {
    this.units = config.composure.startUnits;
    this.lastTellMs = -Infinity;
    this.yawnUntilMs = -Infinity;
    this.yawnCooldownUntilMs = -Infinity;
    this.lowest = 1;
    this.worstMs = 0;
    this.worstDrop = 0;
    this.tells = [];
    this.justYawned = false;
  }
}

export function moodFor(fraction: number): ComposureMood {
  if (fraction <= config.composure.panicFraction) return 'panic';
  if (fraction <= config.composure.crackingFraction) return 'cracking';
  return 'steady';
}
