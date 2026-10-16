/**
 * Where the share text says the game is.
 *
 * This existed as a constant, `https://faceplant.game`, which is a domain
 * nobody owns. The old test asserted the share text contained that constant,
 * so it passed for the life of the project while guaranteeing that every
 * result anyone shared pointed their friends at a dead site. Nothing would
 * have caught it before somebody clicked one.
 *
 * It is now read off `location` at deploy time, which is correct wherever the
 * game ends up and needs nothing remembered at release. These check the cases
 * that actually occur.
 */

import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { shareText, shareUrlFor, type AddressLike } from '../../src/share/shareText.ts';
import type { RunResult } from '../../src/game/rules.ts';

function at(url: string): AddressLike {
  const u = new URL(url);
  return { protocol: u.protocol, hostname: u.hostname, origin: u.origin, pathname: u.pathname };
}

describe('the address in the share text', () => {
  it('uses the GitHub Pages project path the game is served from', () => {
    expect(shareUrlFor(at('https://someone.github.io/faceplant/index.html'))).toBe(
      'https://someone.github.io/faceplant/',
    );
  });

  it('works unchanged behind a custom domain or on itch.io', () => {
    expect(shareUrlFor(at('https://faceplant.example/index.html'))).toBe('https://faceplant.example/');
    expect(shareUrlFor(at('https://v6p9d9t4.ssl.hwcdn.net/html/123/index.html'))).toBe(
      'https://v6p9d9t4.ssl.hwcdn.net/html/123/',
    );
  });

  it('links to the directory, not to index.html', () => {
    // A URL ending in the filename works but reads like a broken link when
    // pasted into a chat window.
    expect(shareUrlFor(at('https://x.github.io/g/index.html'))).not.toContain('index.html');
    // A path that is already a directory is left alone.
    expect(shareUrlFor(at('https://x.github.io/g/'))).toBe('https://x.github.io/g/');
  });

  it('gives no address for a local run, rather than a useless one', () => {
    for (const url of [
      'http://localhost:5173/index.html',
      'http://127.0.0.1:4173/',
      'http://mymachine.local/faceplant/',
    ]) {
      expect(shareUrlFor(at(url)), url).toBe(config.share.fallbackUrl);
    }
  });

  it('gives no address when opened straight off disk', () => {
    expect(shareUrlFor({ protocol: 'file:', hostname: '', origin: 'null', pathname: '/c/g/index.html' })).toBe(
      config.share.fallbackUrl,
    );
  });

  it('never ships a hard-coded domain as the fallback', () => {
    // The whole point: an address that is wrong everywhere is worse than no
    // address at all, because it is wrong silently and in other people's
    // hands. If somebody sets this to a real domain later, they have to mean
    // it - and they will have to delete this test to do it.
    expect(config.share.fallbackUrl).toBe('');
  });
});

describe('the share text around it', () => {
  const result = {
    levelId: '02-3',
    label: 'TAPE 02 - 3',
    title: 'LANTERN LIGHT',
    mode: 'story',
    spawned: 9,
    saved: 6,
    lost: 3,
    candles: 2,
    stamp: 'THE MAW AWOKE',
    score: 4820,
    mawWokeCount: 3,
    offerings: 1,
    bestProcession: 4,
    composureLeft: 0.42,
    composureLow: 0.18,
    lossesByCause: { maw: 1, void: 0, drip: 0, dark: 0, crawler: 1, moth: 1 },
    outcomes: ['saved', 'saved', 'maw', 'saved', 'crawler', 'saved', 'moth', 'saved', 'saved'],
    elapsedMs: 72_400,
    wave: 0,
    failed: false,
    coins: 185,
    riteSaves: { wardingSalt: 2, ironNerve: 0, tallowShell: 1, secondChance: 1, lanternOil: 0 },
  } as unknown as RunResult;

  it('ends on the address when there is one', () => {
    const lines = shareText(result, 'https://someone.github.io/faceplant/').split('\n');
    expect(lines.at(-1)).toBe('https://someone.github.io/faceplant/');
  });

  it('ends on the result, with no trailing blank line, when there is not', () => {
    const lines = shareText(result, '').split('\n');
    expect(lines.at(-1)).toContain('composure');
    expect(lines.every((l) => l.trim() !== '')).toBe(true);
  });
});
