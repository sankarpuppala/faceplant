/**
 * Every sound in the game, rendered and measured (OVERHAUL 6.1, invariant 6).
 *
 * The brief's import rule was "normalised to -14 LUFS before import"; the
 * invariant is "no sound above -6 dBFS peak, scare sounds attack over 30 ms or
 * more". These sounds are synthesised rather than imported, so the rule is
 * checked on what is actually rendered - at the two sample rates browsers
 * actually run at.
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { attackMs, loudness, peak, toDb } from '../../src/audio/dsp.ts';
import { PEAK_DBFS, renderSample, SAMPLE_NAMES, SAMPLES, TARGET_LUFS } from '../../src/audio/samples.ts';

const RATES = [48_000, 44_100];

describe('the sound library', () => {
  it('has every sound the brief lists', () => {
    for (const name of [
      'drone',
      'roomTone',
      'creak',
      'breath',
      'whisper',
      'whisperRev',
      'heartbeat',
      'screamA',
      'shriekB',
      'screamTail',
      'subBoom',
      'metalScrape',
      'tapeStop',
      'tapeRewind',
      'vhsInsert',
      'tapeHiss',
      'candleSnuff',
      'gulp',
      'musicBox',
      'pianoLow',
      'uiClick',
      'uiClunk',
    ]) {
      expect(SAMPLE_NAMES, `${name} is missing`).toContain(name);
    }
  });

  for (const rate of RATES) {
    describe(`at ${rate} Hz`, () => {
      const rendered = SAMPLE_NAMES.map((name) => ({ name, data: renderSample(name, rate), spec: SAMPLES[name] }));

      it('renders something audible and finite for every sound', () => {
        for (const { name, data } of rendered) {
          expect(data.length, name).toBeGreaterThan(rate * 0.03);
          expect(data.every((v) => Number.isFinite(v)), `${name} has NaN`).toBe(true);
          expect(peak(data), `${name} is silent`).toBeGreaterThan(0.001);
        }
      });

      it('keeps every sound at or under -6 dBFS peak', () => {
        for (const { name, data } of rendered) {
          expect(toDb(peak(data)), name).toBeLessThanOrEqual(PEAK_DBFS + 0.01);
        }
      });

      it('normalises to -14 LUFS, or quieter where the peak ceiling wins', () => {
        for (const { name, data } of rendered) {
          expect(loudness(data, rate), name).toBeLessThanOrEqual(TARGET_LUFS + 0.5);
        }
      });

      it('gives every scare sound an attack of 30 ms or more (invariant 6)', () => {
        const scares = rendered.filter((r) => r.spec.scare);
        expect(scares.length).toBeGreaterThanOrEqual(6);
        for (const { name, data } of scares) {
          expect(attackMs(data, rate), name).toBeGreaterThanOrEqual(config.audio.scareMinAttackMs);
        }
      });

      it('loops without a click at the seam', () => {
        // A click is a step at the seam far bigger than the signal's own
        // sample-to-sample movement. Noise moves a lot between samples, a
        // drone very little, so the seam is judged against each loop's own.
        for (const { name, data, spec } of rendered.filter((r) => r.spec.loop)) {
          let sq = 0;
          for (let i = 1; i < data.length; i++) sq += ((data[i] ?? 0) - (data[i - 1] ?? 0)) ** 2;
          const typicalStep = Math.sqrt(sq / (data.length - 1));
          const seam = Math.abs((data[0] ?? 0) - (data[data.length - 1] ?? 0));
          expect(seam, `${name} jumps at its loop point`).toBeLessThanOrEqual(typicalStep * 4);
          expect(spec.scare, `${name}: a loop cannot be a scare`).toBe(false);
        }
      });
    });
  }

  it('is deterministic: the same sound twice is the same samples', () => {
    const a = renderSample('whisper', 48_000);
    const b = renderSample('whisper', 48_000);
    expect(Array.from(a.slice(0, 2000))).toEqual(Array.from(b.slice(0, 2000)));
  });

  it('puts every scare sound on the scare bus, which Scares off mutes', () => {
    for (const name of SAMPLE_NAMES) {
      if (SAMPLES[name].scare) expect(SAMPLES[name].bus, name).toBe('scare');
    }
  });
});
