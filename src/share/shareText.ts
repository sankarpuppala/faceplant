/**
 * Share text (SPEC section 16, decision D11).
 *
 * Wordle proved a text block is enough, and a text block has a property no
 * image has: it is readable in a chat without opening anything. One emoji per
 * Wick in spawn order, so the shape of the line tells the story - a run of
 * candles with one mouth in the middle is a joke everyone understands.
 */

import { config } from '../config.ts';
import type { RunResult } from '../game/rules.ts';

export const EMOJI = {
  saved: '🕯',
  maw: '👄',
  other: '💨',
  alive: '·',
} as const;

export function outcomeEmoji(outcome: RunResult['outcomes'][number]): string {
  if (outcome === 'saved') return EMOJI.saved;
  if (outcome === 'maw') return EMOJI.maw;
  if (outcome === 'alive') return EMOJI.alive;
  return EMOJI.other;
}

export function outcomeRow(outcomes: readonly RunResult['outcomes'][number][]): string {
  return outcomes.map(outcomeEmoji).join('');
}

/** Header line: "FACEPLANT · TAPE 02-3" or "FACEPLANT · DAILY #017". */
export function shareHeader(result: RunResult): string {
  if (result.mode === 'daily') return `FACEPLANT · ${result.label}`;
  if (result.mode === 'endless') return `FACEPLANT · THE LONG TAPE`;
  return `FACEPLANT · TAPE ${result.levelId.toUpperCase()}`;
}

/**
 * Where the game actually is, for the share text.
 *
 * Read at runtime rather than configured, because a configured URL is a
 * promise the build makes about where it will be deployed, and that promise
 * was wrong: it said `https://faceplant.game`, a domain nobody owns, so every
 * result a player shared would have sent their friends to a dead site. Nobody
 * would have found out until somebody clicked one.
 *
 * Taking it from `location` means the link is correct on GitHub Pages, on
 * itch.io, behind a custom domain, and on whatever it is moved to next, with
 * nothing to remember at deploy time. A local or `file://` run has no address
 * worth sharing, so those get no URL at all.
 */
export interface AddressLike {
  protocol: string;
  hostname: string;
  origin: string;
  pathname: string;
}

/**
 * The pure half, so it can be tested against every shape of address the game
 * can be served from without needing a DOM.
 */
export function shareUrlFor(loc: AddressLike): string {
  if (loc.protocol !== 'http:' && loc.protocol !== 'https:') return config.share.fallbackUrl;
  // A local run has no address worth giving to anybody else.
  const local =
    loc.hostname === '' ||
    loc.hostname === 'localhost' ||
    loc.hostname === '127.0.0.1' ||
    loc.hostname === '[::1]' ||
    loc.hostname.endsWith('.local');
  if (local) return config.share.fallbackUrl;
  // Drop the filename, so the link is to the game and not to `/index.html`.
  return `${loc.origin}${loc.pathname.replace(/[^/]*$/, '')}`;
}

export function gameUrl(): string {
  try {
    return shareUrlFor(window.location);
  } catch {
    return config.share.fallbackUrl;
  }
}

export function shareText(result: RunResult, url: string = gameUrl()): string {
  const lines: string[] = [shareHeader(result), outcomeRow(result.outcomes)];

  if (result.mode === 'endless') {
    lines.push(`wave ${result.wave} · saved ${result.saved} · ${result.score.toLocaleString('en-US')} pts`);
  } else {
    lines.push(`saved ${result.saved}/${result.spawned} · the maw woke ${result.mawWokeCount}×`);
  }

  // U1 - composure is the thing the game is about, so it goes in the share text.
  lines.push(`composure ${Math.round(result.composureLeft * 100)}% · ${result.stamp.toLowerCase()}`);
  // No line at all rather than a blank one, when there is no address to give.
  if (url !== '') lines.push(url);
  return lines.join('\n');
}

/** Copies to the clipboard, falling back to a hidden textarea on older browsers. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
