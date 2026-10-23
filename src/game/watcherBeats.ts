/**
 * THE WATCHER's timeline (docs/OVERHAUL.md section 5), as data.
 *
 * About six seconds, beat by beat:
 *
 *   dying     0.0-1.2 s  the last Wick snuffs; the candlelight dies one flame
 *                        at a time and the picture goes grey. Heartbeat.
 *   behind    1.2-2.6 s  something tall at the edge of the frame, almost
 *                        missable. Its eyes catch the light once. Breathing.
 *   silence   2.6-3.1 s  hard cut to black and to nothing. Only "● REC".
 *                        This is the scare.
 *   lunge     3.1-4.4 s  the face fills the frame in 250 ms and screams.
 *   tapeDies  4.4-6.0 s  freeze-frame, then the tape eats itself: a tear, a
 *                        roll, and NO SIGNAL. Tape stop, hiss, nothing.
 *
 * With Scares off, beats 3 to 5 never happen, nor does the figure in beat 2:
 * the light dies, the picture fades to black under a soft low tone, and the
 * results come up.
 *
 * Kept free of rendering and audio so the picture, the sound and the app all
 * read one clock - and so a test can hold the sequence to the brief.
 */

import { config } from '../config.ts';

export type WatcherBeat = 'dying' | 'behind' | 'silence' | 'lunge' | 'tapeDies' | 'done';

export interface BeatState {
  beat: WatcherBeat;
  /** 0..1 through the current beat. */
  t: number;
  /** ms since the beat began. */
  intoMs: number;
}

/** When each beat ends, ms from the loss. */
export function beatEnds(): Record<Exclude<WatcherBeat, 'done'>, number> {
  const b = config.watcher.beatsMs;
  return { dying: b.dyingUntilMs, behind: b.behindUntilMs, silence: b.silenceUntilMs, lunge: b.lungeUntilMs, tapeDies: b.endMs };
}

/** The whole sequence's length, ms. Shorter with Scares off: the fade only. */
export function watcherTotalMs(scares: boolean): number {
  return scares ? config.watcher.beatsMs.endMs : config.watcher.scaresOffFadeMs;
}

export function watcherBeatAt(elapsedMs: number, scares: boolean): BeatState {
  if (elapsedMs < 0) return { beat: 'dying', t: 0, intoMs: 0 };
  if (!scares) {
    const total = config.watcher.scaresOffFadeMs;
    if (elapsedMs >= total) return { beat: 'done', t: 1, intoMs: elapsedMs - total };
    return { beat: 'dying', t: elapsedMs / total, intoMs: elapsedMs };
  }
  const ends = beatEnds();
  let start = 0;
  for (const beat of ['dying', 'behind', 'silence', 'lunge', 'tapeDies'] as const) {
    const end = ends[beat];
    if (elapsedMs < end) return { beat, t: (elapsedMs - start) / (end - start), intoMs: elapsedMs - start };
    start = end;
  }
  return { beat: 'done', t: 1, intoMs: elapsedMs - start };
}

/**
 * The face's size during the lunge, as a fraction of its final size: from
 * `lungeStartFraction` to full in `lungeMs`, ease-out with an overshoot past
 * full that settles back. (0.4 to 1.25 of a frame-filling head, in the
 * brief's terms; the final size is the one the framing test holds on screen.)
 */
export function lungeScale(intoMs: number): number {
  const w = config.watcher;
  const k = Math.min(1, Math.max(0, intoMs / w.lungeMs));
  // easeOutBack: overshoots by about `overshootFraction` and returns.
  const c1 = w.lungeOvershootMultiple;
  const e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
  return w.lungeStartFraction + (1 - w.lungeStartFraction) * e;
}

/** How much of the light has died, 0..1: the dying beat, or the whole fade with Scares off. */
export function lightDied(st: BeatState, scares: boolean): number {
  if (st.beat === 'dying') return scares ? st.t : Math.min(1, st.t * 1.6);
  return 1;
}

/** A per-loss variation, so the scare is never the same twice (OVERHAUL 5). */
export interface WatcherLook {
  /** Head tilt, radians; the sign is the direction. */
  tiltRad: number;
  /** Mouth width, as a multiple of the face's own. */
  mouthWidthMultiple: number;
  /** -1: it stands at the left edge in beat 2; 1: the right. */
  side: -1 | 1;
  /** One eye sits this much lower than the other, fraction of head height. */
  eyeSkewFraction: number;
}

export function rollLook(rand: () => number): WatcherLook {
  const w = config.watcher;
  const [lo, hi] = w.tiltDeg;
  const deg = lo + rand() * (hi - lo);
  const [mlo, mhi] = w.mouthWidthMultiple;
  return {
    tiltRad: ((rand() < 0.5 ? -1 : 1) * deg * Math.PI) / 180,
    mouthWidthMultiple: mlo + rand() * (mhi - mlo),
    side: rand() < 0.5 ? -1 : 1,
    eyeSkewFraction: w.eyeSkewFraction * (0.5 + rand()),
  };
}
