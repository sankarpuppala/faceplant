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

export function shareText(result: RunResult, url: string = config.share.canonicalUrl): string {
  const lines: string[] = [shareHeader(result), outcomeRow(result.outcomes)];

  if (result.mode === 'endless') {
    lines.push(`wave ${result.wave} · saved ${result.saved} · ${result.score.toLocaleString('en-US')} pts`);
  } else {
    lines.push(`saved ${result.saved}/${result.spawned} · the maw woke ${result.mawWokeCount}×`);
  }

  // U1 - composure is the thing the game is about, so it goes in the share text.
  lines.push(`composure ${Math.round(result.composureLeft * 100)}% · ${result.stamp.toLowerCase()}`);
  lines.push(url);
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
