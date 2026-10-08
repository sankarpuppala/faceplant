/**
 * Scares (SPEC section 10, CLAUDE.md invariants 4, 5 and 6).
 *
 * The safety rules are not advice, they are the contract:
 *   - With "Scares off", **nothing** fires. Not a flicker, not a stinger, not
 *     the finale's independent face. `tests/game/scares.test.ts` runs every
 *     shipped level's script with scares off and asserts the event list is
 *     empty (AC-9).
 *   - No effect may flash more than 3 times a second. The flash budget is
 *     declared per effect in config and checked by `npm run check:flash`.
 *   - "Reduce effects" disables flicker outright, everywhere.
 *   - Scares never stack: a minimum gap is enforced between them.
 */

import { config } from '../config.ts';
import type { Level, ScareSpec, ScareType } from './levelSchema.ts';

export interface ActiveScare {
  type: ScareType;
  startedMs: number;
  endsMs: number;
}

export interface ScareOptions {
  /** Settings.scares. When false, this director is inert. */
  enabled: boolean;
  /** Settings.reducedEffects. Suppresses flicker specifically (invariant 4). */
  reducedEffects: boolean;
  /** False when the segmentation path is too slow; `behindYou` degrades to `figure`. */
  segmentationAvailable: boolean;
}

export function scareDurationMs(type: ScareType): number {
  switch (type) {
    case 'flicker':
      return config.scares.flickerMs;
    case 'figure':
      return config.scares.figureMs;
    case 'whisper':
      return config.scares.whisperMs;
    case 'behindYou':
      return config.scares.segmentWindowMs;
    case 'stinger':
      return 600;
    case 'faceLooksBack':
      return 2000;
  }
}

export class ScareDirector {
  private readonly pending: ScareSpec[];
  private active: ActiveScare | null = null;
  private lastFiredMs = -Infinity;
  private readonly fired: ScareType[] = [];

  private opts: ScareOptions;

  constructor(level: Level, opts: ScareOptions) {
    this.opts = opts;
    this.pending = [...level.scares].sort((a, b) => a.atMs - b.atMs);
  }

  setOptions(opts: ScareOptions): void {
    this.opts = opts;
    if (!opts.enabled) this.active = null;
  }

  /** Every scare this director has fired. The AC-9 test reads it. */
  get firedTypes(): readonly ScareType[] {
    return this.fired;
  }

  get current(): ActiveScare | null {
    return this.active;
  }

  /** True while a flicker is dimming the candlelight and effects allow it. */
  get flickering(): boolean {
    return this.active?.type === 'flicker' && !this.opts.reducedEffects;
  }

  /**
   * Advances the script. Returns a scare if one started this step.
   *
   * The ordering here is deliberate: the pending entry is consumed whether or
   * not it fires, so turning scares off does not leave a backlog that all goes
   * off at once if the player turns them back on mid-level.
   */
  update(elapsedMs: number): ActiveScare | null {
    if (this.active !== null && elapsedMs >= this.active.endsMs) this.active = null;

    while (this.pending.length > 0) {
      const next = this.pending[0];
      if (next === undefined || elapsedMs < next.atMs) break;
      this.pending.shift();

      // Invariant 5: with scares off, the event is dropped, not deferred.
      if (!this.opts.enabled) continue;
      // Invariant 4: reduced effects removes flicker everywhere.
      if (next.type === 'flicker' && this.opts.reducedEffects) continue;
      if (elapsedMs - this.lastFiredMs < config.scares.minGapMs) continue;
      if (this.active !== null) continue;

      const type = this.resolveType(next.type);
      const scare: ActiveScare = {
        type,
        startedMs: elapsedMs,
        endsMs: elapsedMs + scareDurationMs(type),
      };
      this.active = scare;
      this.lastFiredMs = elapsedMs;
      this.fired.push(type);
      return scare;
    }

    return null;
  }

  /** SPEC 10.2: if segmentation is not fast enough, fall back to a flat figure. */
  private resolveType(type: ScareType): ScareType {
    if (type === 'behindYou' && !this.opts.segmentationAvailable) return 'figure';
    return type;
  }
}

/**
 * SPEC 10.3 - the finale. For two seconds the terrain stops matching the
 * player: the contours smile and wink on their own. **The video is untouched**;
 * only the landmarks that feed terrain building are modified, so the player's
 * actual image never lies to them.
 *
 * With scares off, `active` is always false and the finale plays straight.
 */
export class FaceLooksBack {
  private startedMs = -1;

  private readonly atMs: number;
  private readonly enabled: boolean;

  constructor(atMs: number, enabled: boolean) {
    this.atMs = atMs;
    this.enabled = enabled;
  }

  update(elapsedMs: number): boolean {
    if (!this.enabled) return false;
    if (this.startedMs < 0 && elapsedMs >= this.atMs) this.startedMs = elapsedMs;
    if (this.startedMs < 0) return false;
    return elapsedMs - this.startedMs < scareDurationMs('faceLooksBack');
  }

  /** 0..1 through the effect, for easing the expression in and out. */
  progress(elapsedMs: number): number {
    if (this.startedMs < 0) return 0;
    return Math.min(1, (elapsedMs - this.startedMs) / scareDurationMs('faceLooksBack'));
  }
}

/**
 * The blendshape override the finale applies: a smile and a wink that the
 * player did not make. Eased in and out so the face does not snap.
 */
export function finaleBlendOverride(progress: number): { smile: number; blinkL: number } {
  const ease = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
  return { smile: ease * 0.85, blinkL: ease > 0.45 ? 1 : 0 };
}
