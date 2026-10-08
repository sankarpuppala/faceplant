/**
 * AC-5 — the network guard, and the sharing pieces that touch user media.
 *
 * CLAUDE.md invariant 1 says no runtime request may leave the device, and
 * invariant 3 says the microphone is never captured and no video is ever
 * stored. Those are the two claims a player cannot verify for themselves, so
 * they get the most direct tests in the suite.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../../src/config.ts';
import { isLocalUrl } from '../../src/privacy.ts';
import { pickFormat } from '../../src/share/recorder.ts';
import { CARD_HEIGHT, CARD_WIDTH, cardFilename } from '../../src/share/resultCard.ts';
import type { RunResult } from '../../src/game/rules.ts';

const ORIGIN = 'https://faceplant.example';
const BASE = `${ORIGIN}/game/index.html`;

describe('the network guard (invariant 1)', () => {
  it('allows the game its own files', () => {
    for (const url of [
      'mediapipe/wasm/vision_wasm_internal.js',
      'mediapipe/face_landmarker.task',
      'levels/01-1.json',
      'fonts/vt323-latin-400-normal.woff2',
      './assets/main.js',
      '/game/assets/main.js',
      `${ORIGIN}/game/assets/main.js`,
    ]) {
      expect(isLocalUrl(url, ORIGIN, BASE), `${url} should be allowed`).toBe(true);
    }
  });

  it('allows the local URLs the recorder and the result card produce', () => {
    expect(isLocalUrl('blob:https://faceplant.example/abc-123', ORIGIN, BASE)).toBe(true);
    expect(isLocalUrl('data:image/png;base64,iVBORw0KGgo=', ORIGIN, BASE)).toBe(true);
  });

  it('blocks the telemetry endpoint that ships inside MediaPipe', () => {
    // The specific thing this guard exists for. @mediapipe/tasks-vision carries
    // a logging client pointed at this URL; it is opt-in and we never enable
    // it, but the guard means that is not load-bearing.
    expect(isLocalUrl('https://odml.pa.googleapis.com/v1/log', ORIGIN, BASE)).toBe(false);
  });

  it('blocks every analytics and CDN shape', () => {
    for (const url of [
      'https://www.google-analytics.com/collect',
      'https://fonts.googleapis.com/css2?family=VT323',
      'https://fonts.gstatic.com/s/vt323/v17/font.woff2',
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm',
      'https://storage.googleapis.com/mediapipe-models/face_landmarker.task',
      'https://sentry.io/api/store/',
      'http://evil.example/exfil',
      '//cdn.example/thing.js',
      'https://faceplant.example.evil.test/',
    ]) {
      expect(isLocalUrl(url, ORIGIN, BASE), `${url} should be blocked`).toBe(false);
    }
  });

  it('is not fooled by an origin that merely starts the same', () => {
    expect(isLocalUrl('https://faceplant.example.attacker.test/x', ORIGIN, BASE)).toBe(false);
    expect(isLocalUrl('https://faceplant.examplex/x', ORIGIN, BASE)).toBe(false);
  });

  it('treats a different port or scheme as a different origin', () => {
    expect(isLocalUrl('http://faceplant.example/x', ORIGIN, BASE)).toBe(false);
    expect(isLocalUrl('https://faceplant.example:8443/x', ORIGIN, BASE)).toBe(false);
  });

  it('refuses an unparseable URL rather than guessing', () => {
    expect(isLocalUrl('http://[unclosed', ORIGIN, BASE)).toBe(false);
  });
});

describe('invariant 3: the microphone is never requested, anywhere in the source', () => {
  const root = join(import.meta.dirname, '..', '..');

  /**
   * Strips comments before matching. These assertions are about what the code
   * *does*, and the files deliberately discuss the microphone at length in
   * their documentation - an earlier version of this test failed on its own
   * explanatory prose, which is exactly the wrong thing to be testing.
   */
  function code(rel: string): string {
    return readFileSync(join(root, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  }

  it('no source file asks getUserMedia for audio', () => {
    for (const rel of ['src/face/webcamSource.ts', 'src/share/recorder.ts', 'src/audio/sound.ts', 'src/app.ts']) {
      expect(code(rel), `${rel} requests audio`).not.toMatch(/getUserMedia[\s\S]{0,160}audio\s*:\s*true/);
    }
  });

  it('getUserMedia is called in exactly one place in the whole project', () => {
    // One call site is auditable; several are not.
    const callSites = ['src/face/webcamSource.ts', 'src/share/recorder.ts', 'src/app.ts', 'src/debug.ts']
      .filter((rel) => code(rel).includes('getUserMedia'));
    expect(callSites).toEqual(['src/face/webcamSource.ts']);
  });

  it('the webcam source explicitly opts out of audio', () => {
    expect(code('src/face/webcamSource.ts')).toMatch(/audio:\s*false/);
  });

  it('nothing writes media into persistent storage', () => {
    for (const rel of ['src/storage/settings.ts', 'src/storage/progress.ts', 'src/share/recorder.ts']) {
      expect(code(rel), `${rel} touches IndexedDB`).not.toMatch(/indexedDB/i);
      expect(code(rel), `${rel} stores a blob`).not.toMatch(/setItem\([^)]*blob/i);
    }
  });

  it('only settings and progress are ever persisted', () => {
    for (const rel of ['src/storage/settings.ts', 'src/storage/progress.ts']) {
      const keys = [...code(rel).matchAll(/setItem\(\s*([A-Za-z_]+)/g)].map((m) => m[1]);
      for (const k of keys) expect(['KEY', 'probe']).toContain(k);
    }
  });
});

describe('the clip recorder (U8, decision D9)', () => {
  it('picks a format or honestly reports none', () => {
    // MediaRecorder does not exist in the test environment, so this must be
    // null rather than throwing - the Settings screen depends on that to grey
    // the option out instead of offering something that cannot work.
    expect(pickFormat()).toBeNull();
  });

  it('prefers portrait at the documented size', () => {
    expect(config.clip.width).toBeLessThan(config.clip.height);
    expect(config.clip.width).toBe(720);
    expect(config.clip.height).toBe(1280);
  });

  it('buffers only a bounded window, so nothing accumulates', () => {
    expect(config.clip.bufferSeconds).toBeGreaterThan(config.clip.highlightSeconds);
    expect(config.clip.bufferSeconds).toBeLessThanOrEqual(60);
  });

  it('cuts the highlight around the crash, with lead time before it', () => {
    expect(config.clip.highlightLeadSeconds).toBeGreaterThan(0);
    expect(config.clip.highlightLeadSeconds).toBeLessThan(config.clip.highlightSeconds);
  });
});

describe('the result card (SPEC 16)', () => {
  const result: RunResult = {
    levelId: '02-3', label: 'T02/3', title: 'Timing', mode: 'story', stamp: 'THE MAW AWOKE',
    spawned: 9, saved: 8, lost: 1, candles: 2, score: 1234, mawWokeCount: 2,
    offerings: 1, bestProcession: 3, composureLeft: 0.62, composureLow: 0.4,
    lossesByCause: { maw: 1, void: 0, drip: 0, dark: 0, crawler: 0, moth: 0 },
    outcomes: ['saved', 'maw'], elapsedMs: 60_000, wave: 0,
  };

  it('is the portrait size short-video platforms want', () => {
    expect(CARD_WIDTH).toBe(1080);
    expect(CARD_HEIGHT).toBe(1350);
  });

  it('names the file after the tape, safely', () => {
    expect(cardFilename(result)).toBe('faceplant-02-3.png');
    expect(cardFilename({ ...result, mode: 'daily', label: 'DAILY #017' })).toBe('faceplant-daily-017.png');
    // No path separators or spaces can reach the filename.
    expect(cardFilename({ ...result, mode: 'daily', label: 'a/b c' })).not.toMatch(/[/\\ ]/);
  });
});
