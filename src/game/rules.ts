/**
 * Scoring, candles and stamps (SPEC sections 9.2, 12.5).
 */

import { config } from '../config.ts';
import type { Level } from './levelSchema.ts';
import type { WorldSnapshot } from '../physics/world.ts';
import type { LostCause } from '../physics/wick.ts';
import { coinsFor } from './shop.ts';

export type Stamp = 'KEPT STILL' | 'THE MAW AWOKE' | 'LIGHTS OUT' | 'COMPOSED' | 'CRACKED' | 'TAPE LOST';

export interface RunResult {
  levelId: string;
  label: string;
  title: string;
  mode: Level['mode'];
  spawned: number;
  saved: number;
  lost: number;
  candles: 0 | 1 | 2 | 3;
  stamp: Stamp;
  score: number;
  mawWokeCount: number;
  offerings: number;
  bestProcession: number;
  /** Composure left at the end, 0..1. */
  composureLeft: number;
  /** The lowest composure reached, 0..1 - how close the player came to cracking. */
  composureLow: number;
  lossesByCause: Record<LostCause, number>;
  outcomes: ('saved' | LostCause | 'alive')[];
  elapsedMs: number;
  wave: number;
  /** True when more than half the roster was lost - the tape is lost. */
  failed: boolean;
  /** Coins earned, 0 on a failed or practice run. */
  coins: number;
}

export function candlesFor(level: Level, saved: number): 0 | 1 | 2 | 3 {
  if (saved >= level.candles[3]) return 3;
  if (saved >= level.candles[2]) return 2;
  if (saved >= level.candles[1]) return 1;
  return 0;
}

/**
 * The stamp is the one-word story of the run, and the order matters: we check
 * total failure first, then whether the mouth was the cause, and only then
 * reward composure. "COMPOSED" is reserved for a flawless run held with a
 * steady face, which is the thing the game is actually asking for (U1).
 */
export function stampFor(result: Omit<RunResult, 'stamp'>): Stamp {
  // Failure outranks every other reading of the run.
  if (result.failed) return 'TAPE LOST';
  if (result.saved === 0) return 'LIGHTS OUT';
  if (result.composureLow <= config.composure.panicFraction && result.saved === result.spawned) return 'CRACKED';
  if (result.lossesByCause.maw > 0) return 'THE MAW AWOKE';
  if (result.saved === result.spawned && result.composureLeft > 0.75) return 'COMPOSED';
  return 'KEPT STILL';
}

/**
 * @param replay true when this level has already been cleared, which pays
 *   fewer coins - so grinding the easiest level is not the best way to earn.
 */
export function buildResult(
  level: Level,
  snap: WorldSnapshot,
  finalScore: number,
  replay = false,
): RunResult {
  const partial: Omit<RunResult, 'stamp'> = {
    levelId: level.id,
    label: level.label,
    title: level.title,
    mode: level.mode,
    spawned: snap.spawned,
    saved: snap.saved,
    lost: snap.lost,
    candles: candlesFor(level, snap.saved),
    score: finalScore,
    mawWokeCount: snap.mawWokeCount,
    offerings: snap.offerings,
    bestProcession: snap.procession.best,
    composureLeft: snap.composure.fraction,
    composureLow: snap.composure.lowestFraction,
    lossesByCause: snap.lossesByCause,
    outcomes: snap.outcomes,
    elapsedMs: snap.elapsedMs,
    wave: snap.wave,
    failed: snap.failed,
    coins: coinsFor({
      failed: snap.failed,
      saved: snap.saved,
      spawned: snap.spawned,
      candles: candlesFor(level, snap.saved),
      composureLeft: snap.composure.fraction,
      offerings: snap.offerings,
      mode: level.mode,
      wave: snap.wave,
      replay,
    }),
  };
  return { ...partial, stamp: stampFor(partial) };
}

/** Candles unlock filters (SPEC section 9.2). INK is always available (decision D8). */
export const THERMAL_UNLOCK_CANDLES = 12;

export function filterUnlocked(filter: 'vhs' | 'ink' | 'thermal', totalCandles: number): boolean {
  if (filter === 'thermal') return totalCandles >= THERMAL_UNLOCK_CANDLES;
  return true;
}
