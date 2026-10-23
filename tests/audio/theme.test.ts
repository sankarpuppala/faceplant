/**
 * The menu theme, as a score.
 *
 * It is synthesized (no file, nothing to license - CLAUDE.md invariant 10), so
 * the score lives in `audio/theme.ts` as plain data and these tests hold it to
 * what it is meant to be: slow, sparse, in a minor key, and never the same
 * loop twice.
 */

import { describe, expect, it } from 'vitest';
import {
  BEATS_PER_CHORD,
  THEME_BEATS,
  THEME_BPM,
  THEME_CHORDS,
  THEME_MELODY,
  chordAt,
  chordStartsAt,
  melodyAt,
  midiToHz,
  WRONG_NOTE_BEAT,
} from '../../src/audio/theme.ts';

describe('the menu theme score', () => {
  it('is slow - a lullaby, not a march', () => {
    expect(THEME_BPM).toBeLessThanOrEqual(60);
  });

  it('is four chords of eight beats, three voices each', () => {
    expect(THEME_CHORDS).toHaveLength(4);
    for (const chord of THEME_CHORDS) expect(chord).toHaveLength(3);
    expect(THEME_BEATS).toBe(BEATS_PER_CHORD * THEME_CHORDS.length);
    expect(THEME_MELODY).toHaveLength(THEME_BEATS);
  });

  it('changes chord exactly on the first beat of each bar', () => {
    for (let beat = 0; beat < THEME_BEATS * 2; beat++) {
      expect(chordStartsAt(beat)).toBe(beat % BEATS_PER_CHORD === 0);
    }
    expect(chordAt(0)).toEqual(THEME_CHORDS[0]);
    expect(chordAt(BEATS_PER_CHORD)).toEqual(THEME_CHORDS[1]);
    // And wraps, so it can loop for as long as somebody sits on the title.
    expect(chordAt(THEME_BEATS)).toEqual(THEME_CHORDS[0]);
  });

  it('keeps the pad low and the music box high, so they do not fight', () => {
    for (const chord of THEME_CHORDS) for (const n of chord) expect(n).toBeLessThan(55);
    for (const n of THEME_MELODY) if (n !== null) expect(n).toBeGreaterThanOrEqual(70);
  });

  it('is sparse: the rests are where the room answers back', () => {
    const rests = THEME_MELODY.filter((n) => n === null).length;
    expect(rests / THEME_MELODY.length).toBeGreaterThanOrEqual(0.4);
    // But it is not silent either.
    expect(THEME_MELODY.some((n) => n !== null)).toBe(true);
  });

  it('is in A minor, with one borrowed note: the G sharp of the dominant', () => {
    const aMinor = new Set([9, 11, 0, 2, 4, 5, 7]); // A B C D E F G as pitch classes
    const foreign = new Set<number>();
    for (const n of THEME_MELODY) if (n !== null && !aMinor.has(n % 12)) foreign.add(n % 12);
    // Only G# (pitch class 8), which belongs to the E chord and is the point.
    expect([...foreign]).toEqual([8]);
  });

  it('gets one note wrong on every third pass, and only then (OVERHAUL 6.3)', () => {
    const wrong = (pass: number): number[] => {
      const out: number[] = [];
      for (let b = 0; b < THEME_BEATS; b++) {
        const first = melodyAt(b);
        const now = melodyAt(b + THEME_BEATS * pass);
        if (first !== now) out.push(b);
      }
      return out;
    };
    expect(wrong(1)).toEqual([]);
    expect(wrong(2)).toEqual([WRONG_NOTE_BEAT]);
    expect(wrong(3)).toEqual([]);
    expect(wrong(5)).toEqual([WRONG_NOTE_BEAT]);
    // A semitone sharp: close enough to be the same tune, wrong enough to notice.
    expect(melodyAt(WRONG_NOTE_BEAT + THEME_BEATS * 2)).toBe((melodyAt(WRONG_NOTE_BEAT) ?? 0) + 1);
  });

  it('is deterministic - the same beat is always the same note', () => {
    for (let b = 0; b < THEME_BEATS * 3; b++) expect(melodyAt(b)).toBe(melodyAt(b));
  });

  it('converts MIDI to the right frequencies', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
  });
});
