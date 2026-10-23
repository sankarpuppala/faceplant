/**
 * `AssistInput` must be attached to the game canvas, never to the element
 * that also hosts the DOM menus.
 *
 * `AssistInput.attach(el)`'s wheel handler calls `e.preventDefault()`
 * unconditionally (it is how the wheel tilts the face). Wheel events bubble
 * up the DOM tree from wherever the pointer actually is, so if `el` is an
 * ancestor shared with the UI screens - `app.ts` used to pass `this.host`,
 * the parent of *both* `#stage-host` (the canvas) and `#ui-host` (How to
 * Play, Shop, Settings, the Ossuary, Results) - then scrolling with the
 * mouse wheel over any menu got silently eaten the moment Assist mode had
 * run once. Confirmed directly: dispatching a real `WheelEvent` at a menu
 * panel in a live browser came back `defaultPrevented: true` with the old
 * wiring and `false` once `attach()` targets `this.stageHost` instead.
 *
 * U10 starts *every* first-time player in Assist regardless of whether they
 * have a camera, so this was not an edge case - it broke scrolling for
 * everyone, on every long screen, from their very first session onward.
 *
 * There is no DOM in this project's test environment (`environment: 'node'`
 * in vitest.config.ts) to reproduce the actual bubbling live, so this checks
 * the one fact that matters structurally: the call site passes the scoped
 * canvas host, not the shared parent.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = readFileSync(join(import.meta.dirname, '..', '..', 'src', 'app.ts'), 'utf8');

describe('AssistInput is scoped to the canvas, not the shared menu/canvas parent', () => {
  it('attaches to stageHost', () => {
    expect(SRC).toMatch(/assistInput\.attach\(this\.stageHost\)/);
  });

  it('never attaches to a broader shared-parent field again', () => {
    // Specifically the old call site - `this.host` was the constructor
    // parameter stored as a field and passed straight to both
    // `#stage-host` and `#ui-host`'s `appendChild`. If a future refactor
    // reintroduces a shared-ancestor field and wires it in here, this is the
    // line that should catch it.
    const calls = [...SRC.matchAll(/assistInput\.attach\(([^)]+)\)/g)].map((m) => m[1]);
    expect(calls).toEqual(['this.stageHost']);
  });
});
