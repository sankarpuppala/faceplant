/**
 * Save durability: export, import, and what the save actually guarantees.
 *
 * The save is one localStorage key on one device. These tests cover the part
 * that can be tested headlessly - that an exported file round-trips, and that
 * a damaged or foreign file is rejected rather than corrupting a real save.
 */

import { describe, expect, it } from 'vitest';
import { parseSaveFile, SaveFileError, buildSaveFile } from '../../src/storage/durability.ts';
import { EMPTY_PROGRESS, type Progress } from '../../src/storage/progress.ts';

function sample(): Progress {
  return {
    ...structuredClone(EMPTY_PROGRESS),
    levels: {
      '01-1': { candles: 3, bestScore: 2400, bestSaved: 3, attempts: 2 },
      '02-1': { candles: 1, bestScore: 900, bestSaved: 4, attempts: 5 },
    },
    survivors: { kevin: 3, agnes: 1 },
    ossuary: [
      { name: 'deborah', title: null, cause: 'maw', lastWords: 'deborah is gone.', levelLabel: 'T02/1', at: 1_700_000_000 },
    ],
    rites: ['steadyWicks'],
    coins: 420,
    coinsEarned: 1300,
    endlessBest: { score: 8800, waves: 6, saved: 31 },
    endingSeen: true,
  };
}

describe('exporting and importing a save', () => {
  it('round-trips a real save without losing anything', () => {
    const before = sample();
    // `buildSaveFile` reads settings from localStorage, which does not exist
    // here; the progress half is what matters and must survive intact.
    const file = { game: 'faceplant' as const, version: 1 as const, exportedAt: '', progress: before, settings: null };
    const after = parseSaveFile(JSON.stringify(file));

    expect(after.coins).toBe(420);
    expect(after.coinsEarned).toBe(1300);
    expect(after.levels['01-1']?.candles).toBe(3);
    expect(after.levels['02-1']?.bestScore).toBe(900);
    expect(after.survivors.kevin).toBe(3);
    expect(after.ossuary).toHaveLength(1);
    expect(after.ossuary[0]?.name).toBe('deborah');
    expect(after.rites).toEqual(['steadyWicks']);
    expect(after.endlessBest.score).toBe(8800);
    expect(after.endingSeen).toBe(true);
  });

  it('rejects a file that is not a FACEPLANT save', () => {
    expect(() => parseSaveFile('{"game":"something-else"}')).toThrow(SaveFileError);
    expect(() => parseSaveFile('{"hello":true}')).toThrow(/not a FACEPLANT save/);
  });

  it('rejects malformed JSON rather than throwing something cryptic', () => {
    expect(() => parseSaveFile('{not json')).toThrow(/valid JSON/);
    expect(() => parseSaveFile('')).toThrow(SaveFileError);
  });

  it('rejects a save envelope with no progress in it', () => {
    expect(() => parseSaveFile('{"game":"faceplant","version":1}')).toThrow(/no progress/);
  });

  it('repairs a save with junk fields instead of crashing the game', () => {
    // A hand-edited or truncated file must not be able to break startup.
    const junk = JSON.stringify({
      game: 'faceplant',
      version: 1,
      progress: {
        levels: 'nope',
        survivors: 42,
        ossuary: 'not an array',
        rites: null,
        coins: -500,
        coinsEarned: Number.NaN,
      },
    });
    const p = parseSaveFile(junk);
    expect(p.levels).toEqual({});
    expect(p.survivors).toEqual({});
    expect(p.ossuary).toEqual([]);
    expect(p.rites).toEqual([]);
    // Negative and NaN coin counts must not survive - free coins or a broken UI.
    expect(p.coins).toBe(0);
    expect(p.coinsEarned).toBe(0);
  });

  it('accepts a save from a future build, keeping what it understands', () => {
    const future = JSON.stringify({
      game: 'faceplant',
      version: 99,
      progress: { ...sample(), somethingNew: { a: 1 } },
    });
    const p = parseSaveFile(future);
    expect(p.coins).toBe(420);
    expect(p.levels['01-1']?.candles).toBe(3);
  });

  it('writes an envelope that identifies itself', () => {
    // So a file sitting in a downloads folder in six months is recognisable.
    const file = buildSaveFile(sample());
    expect(file.game).toBe('faceplant');
    expect(file.version).toBe(1);
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(file.progress.coins).toBe(420);
  });
});
