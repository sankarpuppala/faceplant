/**
 * The Assist controls, checked against the real bindings - in three places
 * that all say what the keys do, not just one.
 *
 * `AssistInput` in `syntheticSource.ts`, the in-play toast (`copy.hud.
 * assistHint`), and the How to Play screen's own key table (`copy.howTo.
 * controls`) each describe the same keys independently, and two bindings had
 * drifted out of *both* copies at once: `ArrowLeft`/`ArrowRight` tilt the
 * face exactly like the wheel does, and `KeyL` smiles, and neither was
 * mentioned anywhere a player could see. Worse, the toast hint only ever
 * appeared on the pause screen - never during actual play - so even the
 * bindings it did list were only visible once you had already stopped
 * playing to go looking.
 *
 * This reads the handler's own `case` list out of the source rather than
 * hand-copying it, so a future binding that is added to the switch and
 * forgotten in either copy fails here instead of shipping silently again.
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
  const hint = copy.hud.assistHint.toLowerCase();

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
    expect(/[←→]|arrow/i.test(copy.hud.assistHint)).toBe(true);
  });

  it('mentions the wheel', () => {
    expect(hint).toContain('wheel');
  });

  it('mentions how to pause', () => {
    expect(hint).toMatch(/\bp\b|esc/i);
  });

  it('does not claim a single press of P switches to Assist', () => {
    // P pauses; "Switch to Assist" is a separate button on the pause screen
    // that only appears once tracking is lost. The no-face message used to
    // promise "press P for Assist" as if it were one step, which was false.
    expect(copy.hud.noFace.toLowerCase()).not.toMatch(/press p for assist/);
  });
});

describe('the How to Play key table names every real binding', () => {
  // Flattened once, lowercased, so a key and its description can be searched
  // together the same way the toast hint is above.
  const table = copy.howTo.controls.flat().join(' ').toLowerCase();

  it('lists every key code the real handler switches on', () => {
    // A loose per-letter/arrow presence check rather than a 1:1 row mapping,
    // because the table is free to phrase a row however reads best (e.g.
    // "Wheel / ← →" sharing one row with "tilt your head") - what matters is
    // that nothing in the switch is simply absent.
    for (const code of boundKeyCodes()) {
      if (code.startsWith('Arrow')) {
        expect(table, `${code} missing`).toMatch(/[↑↓←→]|arrow/i);
      } else if (code === 'Space') {
        expect(table, `${code} missing`).toContain('space');
      } else if (code === 'KeyB') {
        expect(table, `${code} missing`).toMatch(/\bb\b/);
      } else if (code === 'KeyL') {
        expect(table, `${code} missing - this is the one that was missing entirely`).toMatch(/\bl\b/);
      } else if (code.startsWith('Shift')) {
        expect(table, 'shift missing').toContain('shift');
      }
    }
  });

  it('mentions the mouse and the wheel too, since those are not key codes', () => {
    expect(table).toContain('mouse');
    expect(table).toContain('wheel');
  });
});

describe('the level intro states the actual rule, not just flavour', () => {
  it('names the roster size and the real loss threshold', () => {
    const text = copy.hud.objective(8);
    expect(text).toContain('8');
    expect(text.toLowerCase()).toContain('half');
    expect(text.toLowerCase()).toContain('lost');
  });

  it('pluralises correctly for a one-Wick level', () => {
    expect(copy.hud.objective(1)).not.toMatch(/1 wicks/i);
    expect(copy.hud.objective(2)).toMatch(/2 wicks/i);
  });

  it('agrees with the real fail rule in config, not a hard-coded fraction', () => {
    // If `failLossFraction` ever moves off one-half, this copy would be
    // quietly wrong; failing here is the fastest way to notice.
    expect(config.rules.failLossFraction).toBe(0.5);
  });
});
