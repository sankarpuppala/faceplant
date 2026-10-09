/**
 * The line director (SPEC section 12.7, extended by U1).
 *
 * Rules: at most one line on screen; a minimum gap between lines; reaction
 * lines outrank scripted level lines; no line repeats inside a level.
 *
 * U1's addition is the important one. The gap *shrinks* while the player is
 * cracking, and mood-gated lines unlock, so the Wicks get faster and more
 * personal exactly when the player is closest to laughing. The game is not
 * neutral - it is hunting your composure, and this is the weapon.
 */

import { config } from '../config.ts';
import type { ComposureMood } from './composure.ts';
import { fillLine, LINES, type Line, type LineTrigger } from './lines.ts';
import { Rng } from '../physics/vec.ts';

export interface ActiveLine {
  text: string;
  /** World position to anchor the speech bubble near, or null for frame-edge. */
  at: { x: number; y: number } | null
  startedMs: number;
  expiresMs: number;
  trigger: LineTrigger;
}

export interface LineRequest {
  trigger: LineTrigger;
  /** Higher beats a lower-priority line that is already showing. */
  priority?: number;
  at?: { x: number; y: number };
  name?: string;
  full?: string;
  /** Overrides the line table entirely, for scripted level lines. */
  text?: string;
}

/** Reaction triggers outrank scripted ones (SPEC section 12.7). */
const PRIORITY: Partial<Record<LineTrigger, number>> = {
  // THE WATCHER outranks everything: nothing else matters while it is here.
  watcher: 120,
  finale: 100,
  yawn: 90,
  swallowed: 80,
  mawOpen: 70,
  laughing: 70,
  gasp: 65,
  offering: 60,
  procession: 50,
  saved: 45,
  lostOther: 45,
  quake: 40,
  flick: 35,
  browsUp: 30,
  smiling: 30,
  rail: 25,
  crawler: 25,
  moth: 25,
  blinkBridge: 25,
  leaningIn: 20,
  dark: 20,
  mawClosed: 15,
  spawn: 15,
  turn: 8,
  idle: 1,
};

export class LineDirector {
  private active: ActiveLine | null = null;
  private lastShownMs = -Infinity;
  private activePriority = 0;
  private readonly used = new Set<string>();
  private readonly rng: Rng;
  private mood: ComposureMood = 'steady';

  constructor(seed = 1) {
    this.rng = new Rng(seed);
  }

  setMood(mood: ComposureMood): void {
    this.mood = mood;
  }

  get current(): ActiveLine | null {
    return this.active;
  }

  /** The gap between lines, which U1 tightens as composure falls. */
  private get gapMs(): number {
    return this.mood === 'steady' ? config.lines.minGapMs : config.lines.crackingGapMs;
  }

  request(req: LineRequest, nowMs: number): ActiveLine | null {
    const priority = req.priority ?? PRIORITY[req.trigger] ?? 10;

    // A higher-priority line interrupts; an equal or lower one waits its turn.
    if (this.active !== null && nowMs < this.active.expiresMs && priority <= this.activePriority) return null;
    if (nowMs - this.lastShownMs < this.gapMs && priority < 60) return null;

    const text = req.text ?? this.pick(req.trigger);
    if (text === null) return null;

    const name = req.name ?? 'someone';
    const full = req.full ?? name;
    const line: ActiveLine = {
      text: fillLine(text, name, full),
      at: req.at ?? null,
      startedMs: nowMs,
      expiresMs: nowMs + config.lines.displayMs,
      trigger: req.trigger,
    };

    this.active = line;
    this.activePriority = priority;
    this.lastShownMs = nowMs;
    if (req.text === undefined) this.used.add(text);
    return line;
  }

  /** Clears the line once it has expired. Call once per frame. */
  tick(nowMs: number): void {
    if (this.active !== null && nowMs >= this.active.expiresMs) {
      this.active = null;
      this.activePriority = 0;
    }
  }

  /**
   * Chooses an unused line for a trigger, honouring mood gating. Returns null
   * when the trigger has no eligible lines left, which is better than repeating
   * - a repeated joke is worse than silence.
   */
  private pick(trigger: LineTrigger): string | null {
    const eligible: Line[] = [];
    for (const l of LINES) {
      if (l.trigger !== trigger) continue;
      if (this.used.has(l.text)) continue;
      if (l.mood !== 'any' && l.mood !== this.mood) continue;
      eligible.push(l);
    }
    if (eligible.length === 0) return null;

    let total = 0;
    for (const l of eligible) total += l.weight ?? 1;
    let roll = this.rng.next() * total;
    for (const l of eligible) {
      roll -= l.weight ?? 1;
      if (roll <= 0) return l.text;
    }
    return eligible[eligible.length - 1]?.text ?? null;
  }

  reset(): void {
    this.active = null;
    this.activePriority = 0;
    this.lastShownMs = -Infinity;
    this.used.clear();
    this.mood = 'steady';
  }
}
