/**
 * Dead ends, quake spam, and the shop items that answer them.
 *
 * All three came out of playing the game headlessly for a long time with four
 * different kinds of player, which is the only way any of them would have
 * been found - every one of them is invisible to a test that holds the face
 * still, and none of them crash, corrupt state or fail an assertion. They
 * just quietly ruin the run.
 *
 *   - **The jaw is a basin.** A Wick turns around timidly at an edge it
 *     cannot step off (decision D5). Under the chin that is a loop: up one
 *     side, turn, slide back, up the other, turn, forever. A player swaying
 *     their head by a couple of centimetres put six of seven Wicks in there,
 *     where they turned back 306 times and finished the level still walking -
 *     scoring nothing, dying of nothing, explaining nothing. Tilting the head
 *     frees them (6/7 saved instead of 1/7), so the mechanic is sound and the
 *     bug was that the player is never told.
 *   - **A quake is one event.** It was reported once per stumbling Wick per
 *     physics step: sustained head movement fired it 2,453 times across three
 *     levels, about thirteen a second, each adding screen shake and asking
 *     for a line of dialogue.
 *   - **The shop sold insurance against things that do not happen.** Measured
 *     over fifteen levels, five of seven items saved exactly zero Wicks.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { defaultCalibration } from '../../src/face/calibration.ts';
import { neutralPose, sampleSyntheticFace, type SyntheticPose } from '../../src/face/syntheticSource.ts';
import { World, type WorldEvent } from '../../src/physics/world.ts';
import { parseLevel, type Level } from '../../src/game/levelSchema.ts';
import { buildFaceData } from '../../src/terrain/contours.ts';
import type { FaceFrame } from '../../src/face/types.ts';

const ASPECT = config.render.aspect;
const CAL = defaultCalibration(ASPECT);
const STEP = 1000 / config.physics.stepHz;

function level(id: string): Level {
  const p = join(import.meta.dirname, '..', '..', 'public', 'levels', `${id}.json`);
  return parseLevel(JSON.parse(readFileSync(p, 'utf8')), id);
}

function frameAt(t: number, pose: Partial<SyntheticPose>): FaceFrame {
  const raw = sampleSyntheticFace({ ...neutralPose(), size: 0.46, ...pose }, ASPECT);
  return { t, faces: [buildFaceData(raw, CAL, ASPECT)] };
}

/** A head that sways smoothly from side to side, like a person fidgeting. */
function sway(amplitude: number, hz: number, tilt = 0) {
  return (tMs: number): Partial<SyntheticPose> => {
    const tS = tMs / 1000;
    return {
      cx: 0.5 + Math.sin(tS * hz * Math.PI * 2) * amplitude,
      tilt: Math.sin(tS * 0.35 * Math.PI * 2) * tilt,
    };
  };
}

function play(
  lvl: Level,
  seconds: number,
  poseAt: (tMs: number) => Partial<SyntheticPose>,
  tune: Partial<ReturnType<typeof defaultTunables>> = {},
): { world: World; events: WorldEvent[] } {
  const world = new World({ level: lvl, tunables: { ...defaultTunables(), ...tune }, seed: 11 });
  const events: WorldEvent[] = [];
  let nextTracker = 0;
  for (let t = 0; t <= seconds * 1000; t += STEP) {
    if (t >= nextTracker) {
      nextTracker += 1000 / 30;
      world.setFace(frameAt(t, poseAt(t)));
    }
    world.step(STEP);
    events.push(...world.drain());
    if (world.snapshot().over) break;
  }
  return { world, events };
}

const count = (events: readonly WorldEvent[], kind: WorldEvent['kind']): number =>
  events.filter((e) => e.kind === kind).length;

describe('a Wick that cannot get anywhere says so', () => {
  const LVL = '02-1';

  it('stays quiet when nothing is stuck', () => {
    const lvl = level(LVL);
    const { world, events } = play(lvl, lvl.timeLimitS + 3, () => ({}));
    expect(count(events, 'stuck'), 'warned about a trap on a still face').toBe(0);
    expect(world.snapshot().alive, 'stranded somebody on a still face').toBe(0);
  });

  it('warns when a swaying head drops them into the jaw', () => {
    const lvl = level(LVL);
    const { world, events } = play(lvl, lvl.timeLimitS + 3, sway(0.04, 0.6));
    // The pathology: Wicks pacing a dead end, hundreds of turn-backs.
    expect(count(events, 'turn')).toBeGreaterThan(50);
    // The fix: the player is told, in words that say what to do about it.
    expect(count(events, 'stuck'), 'trapped Wicks said nothing').toBeGreaterThan(0);
    expect(world.snapshot().alive).toBeGreaterThan(0);
  });

  it('is answered by tilting the head, which is the whole premise', () => {
    // If this stops being true the hint is a lie, and a hint that tells the
    // player to do something that does not work is worse than silence.
    const lvl = level(LVL);
    const flat = play(lvl, lvl.timeLimitS + 3, sway(0.04, 0.6));
    const tilted = play(lvl, lvl.timeLimitS + 3, sway(0.04, 0.6, 0.45));

    expect(tilted.world.snapshot().saved).toBeGreaterThan(flat.world.snapshot().saved);
    expect(tilted.world.snapshot().alive).toBeLessThan(flat.world.snapshot().alive);
    expect(count(tilted.events, 'stuck')).toBeLessThan(count(flat.events, 'stuck'));
  });

  it('eventually stops refusing the edge, rather than pacing for ever', () => {
    expect(config.trapped.sayAfterTurnCount).toBeLessThan(config.trapped.turnsAllowed);
    expect(config.trapped.turnsAllowed).toBeGreaterThan(1);
    // A turn streak has to be able to lapse, or one awkward ledge early on
    // would make a Wick reckless for the rest of the level.
    expect(config.trapped.turnWindowMs).toBeGreaterThan(1000);
  });
});

describe('a quake is one event, however many it knocks over', () => {
  it('does not fire once per Wick per physics step', () => {
    const lvl = level('02-1');
    const seconds = 20;
    // Hard enough to be over the quake threshold for most of the run.
    const { events } = play(lvl, seconds, sway(0.2, 2));
    const quakes = count(events, 'quake');

    expect(quakes, 'no quake at all from a violently moving head').toBeGreaterThan(0);
    // Each quake shakes the screen and asks for a line, so the rate matters:
    // it used to run at roughly 13 a second.
    const perSecond = quakes / seconds;
    expect(perSecond, `quake fired ${perSecond.toFixed(1)} times a second`).toBeLessThanOrEqual(
      1000 / config.quake.eventCooldownMs + 0.2,
    );
    // And under the ceiling the rest of the game's repeating effects are held
    // to, since every one of them shakes the screen.
    expect(perSecond).toBeLessThanOrEqual(3);
  });
});

