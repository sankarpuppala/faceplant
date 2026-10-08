/**
 * Scoring, candles and stamps (SPEC sections 9.2, 12.5).
 */

import { config } from '../config.ts';
import type { Level } from './levelSchema.ts';
import type { WorldSnapshot } from '../physics/world.ts';
import type { LostCause } from '../physics/wick.ts';

export type Stamp = 'KEPT STILL' | 'THE MAW AWOKE' | 'LIGHTS OUT' | 'COMPOSED' | 'CRACKED';

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
  if (result.saved === 0) return 'LIGHTS OUT';
  if (result.composureLow <= config.composure.panicFraction && result.saved === result.spawned) return 'CRACKED';
  if (result.lossesByCause.maw > 0) return 'THE MAW AWOKE';
  if (result.saved === result.spawned && result.composureLeft > 0.75) return 'COMPOSED';
  return 'KEPT STILL';
}

export function buildResult(level: Level, snap: WorldSnapshot, finalScore: number): RunResult {
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
  };
  return { ...partial, stamp: stampFor(partial) };
}

/** Candles unlock filters (SPEC section 9.2). INK is always available (decision D8). */
export const THERMAL_UNLOCK_CANDLES = 12;

export function filterUnlocked(filter: 'vhs' | 'ink' | 'thermal', totalCandles: number): boolean {
  if (filter === 'thermal') return totalCandles >= THERMAL_UNLOCK_CANDLES;
  return true;
}
