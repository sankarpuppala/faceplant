/**
 * One Watcher face per tape.
 *
 * Players asked for different faces on different levels. A single monster that
 * arrives every time is familiar by the third loss, and familiar is not
 * frightening. There are five, each procedurally drawn - no photographs, which
 * the project could not licence and does not need - and these tests hold them
 * to being genuinely different from each other and each one actually legible.
 */

import { describe, expect, it } from 'vitest';
import { watcherVariants } from '../../src/render/tokens.ts';
import { watcherVariantFor } from '../../src/render/watcher.ts';

const lum = (c: number): number =>
  (0.2126 * ((c >> 16) & 0xff) + 0.7152 * ((c >> 8) & 0xff) + 0.0722 * (c & 0xff)) / 255;

describe('the five faces', () => {
  it('there are five, and every tape from 1 to 5 gets a different one', () => {
    expect(watcherVariants).toHaveLength(5);
    const names = [1, 2, 3, 4, 5].map((t) => watcherVariantFor(t).name);
    expect(new Set(names).size).toBe(5);
  });

  it('is stable: a tape always gets the same face', () => {
    for (let t = 1; t <= 5; t++) expect(watcherVariantFor(t)).toBe(watcherVariantFor(t));
  });

  it('wraps for the Daily and the Long Tape, and never returns nothing', () => {
    expect(watcherVariantFor(6)).toBe(watcherVariantFor(1));
    expect(watcherVariantFor(0)).toBe(watcherVariantFor(5));
    for (let t = -12; t <= 60; t += 0.5) expect(watcherVariantFor(t)).toBeDefined();
  });

  it('differ in more than colour - shape and voice change too', () => {
    const horns = new Set(watcherVariants.map((v) => v.horns));
    expect(horns.has('none')).toBe(true);
    expect(horns.has('devil')).toBe(true);
    expect(horns.has('ram')).toBe(true);
    expect(horns.has('many')).toBe(true);
    expect(watcherVariants.some((v) => v.hood)).toBe(true);
    expect(watcherVariants.some((v) => v.hair)).toBe(true);
    expect(watcherVariants.some((v) => v.gore)).toBe(true);
    expect(new Set(watcherVariants.map((v) => v.eyes)).size).toBeGreaterThanOrEqual(3);
    // Each one screams in its own register.
    expect(new Set(watcherVariants.map((v) => v.voicePitch)).size).toBe(5);
  });

  it('keeps every voice in a range the sequence is safe at', () => {
    for (const v of watcherVariants) {
      expect(v.voicePitch).toBeGreaterThanOrEqual(0.5);
      expect(v.voicePitch).toBeLessThanOrEqual(1.5);
    }
  });

  it('has a lit face, a dark face and a visible eye on every one', () => {
    for (const v of watcherVariants) {
      // Lit ramps from bright to dark, or there is no form.
      expect(lum(v.lit), `${v.name}: lit vs shadow`).toBeGreaterThan(lum(v.shadow) * 2);
      expect(lum(v.shadow)).toBeGreaterThan(lum(v.rim) - 1e-9);
      // The eye has to be the bright thing in a dark socket.
      expect(lum(v.eye), `${v.name}: eye`).toBeGreaterThan(0.45);
      expect(lum(v.eye)).toBeGreaterThan(lum(v.shadow));
      // Teeth are the brightest thing against the throat.
      expect(lum(v.tooth), `${v.name}: teeth`).toBeGreaterThan(0.6);
      expect(v.teeth).toBeGreaterThanOrEqual(8);
      expect(v.socketScale).toBeGreaterThan(0.8);
    }
  });

  it('gives the tape-1 face the look players first meet: ghost behind her hair', () => {
    const first = watcherVariantFor(1);
    expect(first.hair).toBe(true);
    expect(first.eyes).toBe('hollow');
    expect(first.horns).toBe('none');
  });
});
