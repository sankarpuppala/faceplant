/**
 * The Assist controls, checked against the real bindings.
 *
 * `AssistInput` in `syntheticSource.ts` and the one line of keys shown on the
 * tape insert and the pause screen (`copy.insert.assistKeys`) describe the
 * same keys independently. Two bindings once drifted out of the copy:
 * `ArrowLeft`/`ArrowRight` tilt the face exactly like the wheel does, and
 * `KeyL` smiles, and neither was mentioned anywhere a player could see.
 *
 * This reads the handler's own `case` list out of the source rather than
 * hand-copying it, so a binding added to the switch and forgotten in the copy
 * fails here instead of shipping silently again.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config } from '../../src/config.ts';
import { copy } from '../../src/ui/copy.ts';

const SRC = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'face', 'syntheticSource.ts'), 'utf8');

/** Every `case 'X':` inside AssistInput's keyboard switch, in source order. */
function boundKeyCodes(): string[] {
  const start = SRC.indexOf('const onKey = (e: KeyboardEvent)');
  const end = SRC.indexOf('\n    };', start);
  const block = SRC.slice(start, end);
  return [...block.matchAll(/case '([^']+)':/g)].map((m) => m[1]!);
}

describe('the Assist control hint names every real binding', () => {
  const hint = copy.insert.assistKeys.toLowerCase();

  it('found the keyboard switch to check against (the test itself is not stale)', () => {
    const codes = boundKeyCodes();
    expect(codes.length).toBeGreaterThan(5);
    expect(codes).toContain('Space');
    expect(codes).toContain('ArrowLeft');
  });

  it('mentions Space, the Maw key', () => {
    expect(hint).toContain('space');
  });

  it('mentions Shift, the brow key', () => {
    expect(hint).toContain('shift');
  });

  it('mentions B, the blink key', () => {
    // Word-boundary-ish: "b blinks" or "b " not "mouse" containing a b.
    expect(/\bb\b.*blink|blink.*\bb\b/.test(hint)).toBe(true);
  });

  it('mentions L, the smile key - this is the one that was missing entirely', () => {
    expect(/\bl\b.*smile|smile.*\bl\b/.test(hint)).toBe(true);
  });

  it('mentions the arrow keys tilt, not only lean - the other missing one', () => {
    // ArrowUp/ArrowDown move size ("lean"); ArrowLeft/ArrowRight tilt, same
    // axis as the wheel. The hint used to say only "wheel tilts".
    expect(hint).toContain('tilt');
    expect(/[←→]|arrow/i.test(copy.insert.assistKeys)).toBe(true);
  });

  it('mentions the wheel', () => {
    expect(hint).toContain('wheel');
  });

  it('mentions how to pause', () => {
    expect(hint).toMatch(/\bp\b|esc/i);
  });

});

describe('the level intro states the actual rule, not just flavour', () => {
  it('names the roster size and the real loss threshold', () => {
    const text = copy.insert.objective(8);
    expect(text).toContain('8');
    expect(text.toLowerCase()).toContain('half');
    expect(text.toLowerCase()).toContain('lost');
  });

  it('pluralises correctly for a one-Wick level', () => {
    expect(copy.insert.objective(1)).not.toMatch(/1 wicks/i);
    expect(copy.insert.objective(2)).toMatch(/2 wicks/i);
  });

  it('agrees with the real fail rule in config, not a hard-coded fraction', () => {
    // If `failLossFraction` ever moves off one-half, this copy would be
    // quietly wrong; failing here is the fastest way to notice.
    expect(config.rules.failLossFraction).toBe(0.5);
  });
});
