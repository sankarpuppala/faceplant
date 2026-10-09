/**
 * Progress, the Ossuary (U7), Rites (U9) and the Long Tape best (U4).
 *
 * All local, all small, all plain JSON. There is no server (decision D1), so
 * this file is the entire save game.
 */

import { config } from '../config.ts';
import type { LostCause } from '../physics/wick.ts';
import type { RunResult } from '../game/rules.ts';

export type RiteName = 'steadyWicks' | 'slowSpawn' | 'wideGate' | 'secondChance';

export const RITE_NAMES: readonly RiteName[] = ['steadyWicks', 'slowSpawn', 'wideGate', 'secondChance'];

/** U7 - one entry per lost Wick, kept forever. */
export interface BoneRecord {
  name: string;
  title: string | null;
  cause: LostCause;
  /** The last thing it said, if it said anything. */
  lastWords: string | null;
  levelLabel: string;
  /** Unix ms. */
  at: number;
}

export interface LevelProgress {
  candles: 0 | 1 | 2 | 3;
  bestScore: number;
  bestSaved: number;
  attempts: number;
}

export interface DailyRecord {
  /** Day number since the epoch. */
  day: number;
  /** The first attempt is the one that counts (decision D12). */
  result: {
    saved: number;
    spawned: number;
    mawWokeCount: number;
    score: number;
    outcomes: ('saved' | LostCause | 'alive')[];
  };
}

export interface Progress {
  levels: Record<string, LevelProgress>;
  /** U7 - name to runs survived, so veterans return with titles. */
  survivors: Record<string, number>;
  ossuary: BoneRecord[];
  rites: RiteName[];
  /** Candles already spent on Rites. */
  candlesSpent: number;
  /** U4 - the Long Tape. */
  endlessBest: { score: number; waves: number; saved: number };
  daily: DailyRecord | null;
  endingSeen: boolean;
}

export const EMPTY_PROGRESS: Progress = {
  levels: {},
  survivors: {},
  ossuary: [],
  rites: [],
  candlesSpent: 0,
  endlessBest: { score: 0, waves: 0, saved: 0 },
  daily: null,
  endingSeen: false,
};

const KEY = 'faceplant.progress.v1';
/** The Ossuary is a memorial, not a database; cap it so storage stays tiny. */
const MAX_BONES = 300;

function storage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__fp__', '1');
    s.removeItem('__fp__');
    return s;
  } catch {
    return null;
  }
}

export function loadProgress(): Progress {
  const s = storage();
  if (s === null) return structuredClone(EMPTY_PROGRESS);
  try {
    const raw = s.getItem(KEY);
    if (raw === null) return structuredClone(EMPTY_PROGRESS);
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return structuredClone(EMPTY_PROGRESS);
    const o = parsed as Partial<Progress>;
    return {
      levels: typeof o.levels === 'object' && o.levels !== null ? o.levels : {},
      survivors: typeof o.survivors === 'object' && o.survivors !== null ? o.survivors : {},
      ossuary: Array.isArray(o.ossuary) ? o.ossuary.slice(-MAX_BONES) : [],
      rites: Array.isArray(o.rites) ? o.rites.filter((r): r is RiteName => RITE_NAMES.includes(r as RiteName)) : [],
      candlesSpent: typeof o.candlesSpent === 'number' ? o.candlesSpent : 0,
      endlessBest:
        typeof o.endlessBest === 'object' && o.endlessBest !== null
          ? o.endlessBest
          : { score: 0, waves: 0, saved: 0 },
      daily: typeof o.daily === 'object' ? (o.daily ?? null) : null,
      endingSeen: o.endingSeen === true,
    };
  } catch {
    return structuredClone(EMPTY_PROGRESS);
  }
}

export function saveProgress(p: Progress): void {
  const s = storage();
  if (s === null) return;
  try {
    s.setItem(KEY, JSON.stringify({ ...p, ossuary: p.ossuary.slice(-MAX_BONES) }));
  } catch {
    /* ignore */
  }
}

/**
 * Wipes the save. Offered in Settings because this game's entire save file is
 * one localStorage key on one device - so "start again" and "delete the data
 * you hold about me" are the same action, and the player should be able to do
 * both without clearing their whole browser.
 */
export function resetProgress(): Progress {
  const s = storage();
  try {
    s?.removeItem(KEY);
  } catch {
    /* a save we cannot clear is not worth a crash */
  }
  return structuredClone(EMPTY_PROGRESS);
}

export function totalCandles(p: Progress): number {
  let n = 0;
  for (const key of Object.keys(p.levels)) n += p.levels[key]?.candles ?? 0;
  return n;
}

/** Level ids the player has finished with at least one candle. */
export function completedLevelIds(p: Progress): Set<string> {
  return new Set(Object.keys(p.levels).filter((id) => (p.levels[id]?.candles ?? 0) > 0));
}

/** True once anything at all has been played, which decides CONTINUE vs INSERT FACE. */
export function hasProgress(p: Progress): boolean {
  return Object.keys(p.levels).length > 0 || p.endlessBest.score > 0 || p.daily !== null;
}

export function spendableCandles(p: Progress): number {
  return Math.max(0, totalCandles(p) - p.candlesSpent);
}

export function riteCost(rite: RiteName): number {
  return config.rites.costCandles[rite];
}

export function canBuyRite(p: Progress, rite: RiteName): boolean {
  return !p.rites.includes(rite) && spendableCandles(p) >= riteCost(rite);
}

export function buyRite(p: Progress, rite: RiteName): Progress {
  if (!canBuyRite(p, rite)) return p;
  return { ...p, rites: [...p.rites, rite], candlesSpent: p.candlesSpent + riteCost(rite) };
}

/** Folds a finished run into the save: candles, bests, survivors and bones. */
export function recordRun(
  p: Progress,
  result: RunResult,
  roster: readonly { name: string; title: string | null; state: string; cause: LostCause | null; lastWords: string | null }[],
): Progress {
  const next: Progress = structuredClone(p);

  if (result.mode === 'story') {
    const prior = next.levels[result.levelId] ?? { candles: 0 as const, bestScore: 0, bestSaved: 0, attempts: 0 };
    next.levels[result.levelId] = {
      candles: Math.max(prior.candles, result.candles) as 0 | 1 | 2 | 3,
      bestScore: Math.max(prior.bestScore, result.score),
      bestSaved: Math.max(prior.bestSaved, result.saved),
      attempts: prior.attempts + 1,
    };
  }

  if (result.mode === 'endless' && result.score > next.endlessBest.score) {
    next.endlessBest = { score: result.score, waves: result.wave, saved: result.saved };
  }

  for (const w of roster) {
    if (w.state === 'saved') {
      next.survivors[w.name] = (next.survivors[w.name] ?? 0) + 1;
    } else if (w.state === 'lost' && w.cause !== null) {
      next.ossuary.push({
        name: w.name,
        title: w.title,
        cause: w.cause,
        lastWords: w.lastWords,
        levelLabel: result.label,
        at: Date.now(),
      });
      // A Wick that dies loses its accumulated title; the name is free again.
      delete next.survivors[w.name];
    }
  }

  next.ossuary = next.ossuary.slice(-MAX_BONES);
  return next;
}

/** Decision D12: only the first daily attempt is stored. */
export function recordDaily(p: Progress, day: number, result: RunResult): Progress {
  if (p.daily !== null && p.daily.day === day) return p;
  return {
    ...p,
    daily: {
      day,
      result: {
        saved: result.saved,
        spawned: result.spawned,
        mawWokeCount: result.mawWokeCount,
        score: result.score,
        outcomes: result.outcomes,
      },
    },
  };
}

export function survivorMap(p: Progress): Map<string, number> {
  return new Map(Object.entries(p.survivors));
}
