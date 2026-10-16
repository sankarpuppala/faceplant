/**
 * Hazards (SPEC section 8.2, plus U6).
 *
 * Each one is countered by a *different* part of the face, which is the point:
 *   - Crawler: swallow it, or flick it off a brow.
 *   - Drip:    tilt so a brow or the nose shelters whoever is below.
 *   - Dark:    move, and lean in to carry the light.
 *   - Moth:    hold your mouth open and blow it away (U6) - which is also the
 *              most dangerous thing you can do. That squeeze is the whole
 *              reason Moths exist.
 */

import { config } from '../config.ts';
import { canWalkOn, downhillTangent } from '../terrain/walkable.ts';
import {
  advanceAlong,
  attach,
  detach,
  findContinuation,
  makeBody,
  placeOnSegment,
  stepAirborne,
  stepAttached,
  type Body,
  type SegmentIndex,
} from './solver.ts';
import { clamp, type Rng } from './vec.ts';
import type { Wick } from './wick.ts';

// ---------------------------------------------------------------- Crawler ---

export interface Crawler {
  id: number;
  body: Body;
  dir: 1 | -1;
  targetWickId: number | null;
  retargetAtMs: number;
  alive: boolean;
  /**
   * Continuous contact with the Wick it is touching, ms, and which one. A
   * Crawler used to extinguish a flame the instant the circles overlapped,
   * which gave the player no window at all to swallow or flick it away - so a
   * death by Crawler read as arbitrary rather than earned.
   */
  touchingWickId: number | null;
  touchMs: number;
  /**
   * It has had its flame and will not take another.
   *
   * Killing the Crawler outright after its kill was the obvious move and it
   * was wrong: a Crawler meets its first Wick on the *approach ledge*, so it
   * died before ever crossing the mouth - which made the Offering (U2)
   * unperformable on 02-2, the level that teaches it. Sated instead: harmless,
   * still walking, and still very much swallowable.
   */
  sated: boolean;
  /**
   * Where a sated Crawler heads for. Hunting the nearest Wick after being
   * sated sent it back toward the lantern - where new Wicks keep appearing -
   * so it loitered at the spawn point for the rest of the level and never
   * crossed the mouth, which quietly broke the Offering. A sated Crawler
   * leaves instead, across the face, where it can still be swallowed.
   */
  leaveToX: number;
  /**
   * Warding Salt (shop) drives each Crawler off the first flame it reaches.
   * This records that it has had its one refusal, so the item is a reprieve
   * rather than immunity.
   */
  warded: boolean;
  /**
   * While this is in the future the Crawler is backing away from the salt and
   * will not hunt. Flipping its direction for one retarget interval was not
   * enough - it simply turned round again and ate the same Wick a second
   * later, so the item reported a save the player then watched not happen.
   */
  retreatUntilMs: number;
}

let nextHazardId = 1;

export function resetHazardIds(): void {
  nextHazardId = 1;
}

export function makeCrawler(x: number, y: number): Crawler {
  return {
    id: nextHazardId++,
    body: makeBody(x, y, config.crawler.radiusFh),
    dir: 1,
    targetWickId: null,
    retargetAtMs: 0,
    alive: true,
    touchingWickId: null,
    touchMs: 0,
    sated: false,
    leaveToX: 0,
    warded: false,
    retreatUntilMs: -Infinity,
  };
}

export function stepCrawler(
  c: Crawler,
  wicks: readonly Wick[],
  index: SegmentIndex,
  dtS: number,
  nowMs: number,
  /** Warding Salt (shop) slows them down. 1 is unmodified. */
  speedMultiple = 1,
): void {
  if (!c.alive) return;

  const ground = index.get(c.body.groundId);
  if (ground === undefined) {
    stepAirborne(c.body, index, dtS, nowMs);
    return;
  }
  stepAttached(c.body, ground, dtS);

  // A sated Crawler - or one backing away from Warding Salt - stops hunting
  // and walks for the far side, which takes it across the face, and across
  // the Maw, on its way out.
  const leaving = c.sated || nowMs < c.retreatUntilMs;
  if (leaving) {
    const segPointsRight = ground.bx >= ground.ax;
    c.dir = c.leaveToX > c.body.x === segPointsRight ? 1 : -1;
  }

  // Re-target on a timer rather than every step, so it does not jitter between
  // two equidistant Wicks.
  if (!leaving && nowMs >= c.retargetAtMs) {
    c.retargetAtMs = nowMs + config.crawler.retargetMs;
    let best: Wick | null = null;
    let bestD = Infinity;
    for (const w of wicks) {
      if (w.state === 'saved' || w.state === 'lost' || !w.lit) continue;
      const d = Math.hypot(w.body.x - c.body.x, w.body.y - c.body.y);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    c.targetWickId = best?.id ?? null;
  }

  const target = leaving ? undefined : wicks.find((w) => w.id === c.targetWickId);
  if (target !== undefined) {
    const towardTarget = target.body.x > c.body.x;
    const segPointsRight = ground.bx >= ground.ax;
    c.dir = towardTarget === segPointsRight ? 1 : -1;
  }

  if (!canWalkOn(ground)) {
    const tan = downhillTangent(ground);
    const towardB = (ground.bx - ground.ax) * tan.x + (ground.by - ground.ay) * tan.y >= 0;
    c.dir = towardB ? 1 : -1;
  }

  const moved = advanceAlong(c.body, ground, config.crawler.walkSpeedFhPerS * speedMultiple * c.dir, dtS);
  if (moved.kind !== 'ranOff') return;

  // Crawlers cross gaps the same way Wicks do - otherwise they can never leave
  // the ruin they start on, so they never reach anybody and can never be
  // swallowed, which makes the Offering (U2) unperformable. They are given a
  // longer reach than a Wick, because a Crawler is the thing that is *not*
  // afraid of your face.
  const cont = findContinuation(
    index,
    ground,
    moved.pastEnd,
    config.wick.maxGapFh * 1.5,
    config.wick.maxStepUpFh * 1.5,
    config.wick.maxStepDownFh * 1.5,
  );

  if (cont !== null) {
    attach(c.body, cont.seg, cont.t, dtS);
    const headingRight = moved.pastEnd === 'b' ? ground.bx >= ground.ax : ground.ax > ground.bx;
    const segPointsRight = cont.seg.bx >= cont.seg.ax;
    c.dir = headingRight === segPointsRight ? 1 : -1;
    return;
  }

  // Nothing to step onto. Unlike a Wick, a Crawler does not turn back - it
  // walks off, which is also how a rising brow flings one.
  detach(c.body, nowMs);
  c.body.vx = (moved.pastEnd === 'b' ? 1 : -1) * config.crawler.walkSpeedFhPerS;
  c.body.vy = 0;
}

// ------------------------------------------------------------------- Drip ---

export interface Drip {
  id: number;
  body: Body;
  alive: boolean;
}

export interface DripEmitter {
  x: number;
  y: number;
  intervalMs: number;
  nextAtMs: number;
}

export function makeDrip(x: number, y: number): Drip {
  const d: Drip = { id: nextHazardId++, body: makeBody(x, y, config.drip.radiusFh), alive: true };
  d.body.vy = config.drip.fallSpeedFhPerS;
  return d;
}

/** Drips are blocked by terrain, which is what makes a brow a useful umbrella. */
export function stepDrip(d: Drip, index: SegmentIndex, dtS: number, nowMs: number): void {
  if (!d.alive) return;
  const landing = stepAirborne(d.body, index, dtS, nowMs);
  if (landing !== null || d.body.y > config.drip.despawnYFh) d.alive = false;
}

// ------------------------------------------------------------------- Moth ---

/** U6 - flies at the brightest flame; an open Maw blows it away. */
export interface Moth {
  id: number;
  body: Body;
  /** Wick it is hunting. */
  targetWickId: number | null;
  /** Continuous contact time with its target, ms. */
  contactMs: number;
  /**
   * This attack has already lasted longer than an unprotected flame would
   * have survived, so if the moth is driven off now it was Lantern Oil that
   * made the difference. Used only to report what the shop item did.
   */
  pastBaseSnuff: boolean;
  phase: number;
  alive: boolean;
}

export function makeMoth(x: number, y: number, rng: Rng): Moth {
  return {
    id: nextHazardId++,
    body: makeBody(x, y, config.moth.radiusFh),
    targetWickId: null,
    contactMs: 0,
    pastBaseSnuff: false,
    phase: rng.next() * Math.PI * 2,
    alive: true,
  };
}

export interface MothStepResult {
  snuffedWickId: number | null;
  /** An attack that only failed because the flame was oiled. */
  oiledSaveWickId: number | null;
}

/** A slow orbit of the face, for a moth with nothing to hunt. */
function loiterPoint(faceCentre: { x: number; y: number }, phase: number): { x: number; y: number } {
  const r = config.moth.loiterRadiusFh;
  return {
    x: faceCentre.x + Math.cos(phase * config.moth.loiterTurnMultiple) * r,
    y: faceCentre.y + Math.sin(phase * config.moth.loiterTurnMultiple) * r * 0.6,
  };
}

export function stepMoth(
  m: Moth,
  wicks: readonly Wick[],
  /** Anchor for "on the face" - the nose, in world FH. */
  faceCentre: { x: number; y: number },
  mawCentre: { x: number; y: number } | null,
  mawArea: number,
  dtS: number,
  /** Lantern Oil (shop) makes a flame take longer to put out. 1 is unmodified. */
  snuffTimeMultiple = 1,
): MothStepResult {
  const out: MothStepResult = { snuffedWickId: null, oiledSaveWickId: null };
  if (!m.alive) return out;

  // Hunt the brightest lit flame *on the face*, which in practice is the
  // nearest one.
  //
  // The restriction to the face is the point. Left to hunt anything, a moth
  // flew straight past the face to the stone ruins beside the head - where
  // Wicks queue up after spawning - and picked them off at x ~ 1.2, a full
  // face-width outside the Maw's draft. Those deaths were unpreventable: the
  // player's only counter to a moth is to breathe on it, and you cannot
  // breathe on something that far off your own cheek. A moth now only preys
  // where it can be driven off, which is the same rule the Crawler follows by
  // walking.
  let target: Wick | null = null;
  let bestD = Infinity;
  for (const w of wicks) {
    if (w.state === 'saved' || w.state === 'lost' || !w.lit) continue;
    if (Math.hypot(w.body.x - faceCentre.x, w.body.y - faceCentre.y) > config.moth.huntRadiusFh) continue;
    const d = Math.hypot(w.body.x - m.body.x, w.body.y - m.body.y);
    if (d < bestD) {
      bestD = d;
      target = w;
    }
  }
  m.targetWickId = target?.id ?? null;

  m.phase += dtS * config.moth.wanderHz * Math.PI * 2;

  // A moth *flies*: it picks a velocity and holds it. The first version of this
  // treated `flySpeedFhPerS` as an acceleration and then damped the result by
  // 0.96 every step - at 120 Hz that is a terminal speed of 0.19 FH/s, which is
  // half a Wick's walking pace, so a moth could never actually reach a flame
  // and the max-speed clamp was unreachable. Moths killed nothing at all.
  // Now the speed in config is the speed on screen.
  // The draft from an open Maw (U6), measured first because it does two things
  // and the chase has to know about one of them.
  //
  // This is the counter the whole hazard is built around, and it did not work:
  // the gust was a 7 FH/s^2 acceleration against a steering flight, so the
  // moth's own course correction cancelled it within a frame and it kept
  // closing on the flame regardless of how wide the mouth was open. A player
  // doing exactly the right thing saw no effect at all.
  //
  // `draft` is now how hard the wind is hitting this moth, 0..1, and a moth in
  // the wind is both pushed away *and* unable to aim.
  let draft = 0;
  let driftX = 0;
  let driftY = 0;
  if (mawCentre !== null) {
    const dx = m.body.x - mawCentre.x;
    const dy = m.body.y - mawCentre.y;
    const d = Math.hypot(dx, dy);
    if (d < config.moth.draftRadiusFh && d > 1e-4) {
      // Square-rooted so the falloff is gentle across the face rather than
      // nearly spent by the brow - the face is only ~0.6 FH mouth-to-forehead.
      const falloff = Math.sqrt(1 - d / config.moth.draftRadiusFh);
      draft = falloff * clamp(mawArea / config.moth.draftFullAreaFh2, 0, 1.4);
      driftX = dx / d;
      driftY = dy / d;
    }
  }

  // With no flame on the face to hunt, it circles the face waiting for one,
  // which keeps it on screen and legible as a threat instead of parking
  // off-frame where the player forgets it exists.
  const aimAt = target !== null ? target.body : loiterPoint(faceCentre, m.phase);

  const dx = aimAt.x - m.body.x;
  const dy = aimAt.y - m.body.y;
  const distToTarget = Math.hypot(dx, dy) || 1;
  // Blown off course: it cannot hold a heading in a gale.
  const aim = Math.max(0, 1 - draft * config.moth.draftBlindMultiple);
  const dvx0 = (dx / distToTarget) * config.moth.flySpeedFhPerS * aim;
  const dvy0 = (dy / distToTarget) * config.moth.flySpeedFhPerS * aim;
  let dvx = dvx0;
  let dvy = dvy0;

  // And blown *away*, hard enough to beat its cruising speed - otherwise the
  // moth simply flies back in and nothing the player did mattered.
  dvx += driftX * draft * config.moth.draftFhPerS;
  dvy += driftY * draft * config.moth.draftFhPerS;

  // Wander, so a moth reads as an insect rather than a missile - but it settles
  // once it is on the flame. At full strength the wobble is wider than the
  // contact circle, so a wandering moth kept knocking itself out of range and
  // resetting its own contact timer before it could ever snuff anything.
  const settle =
    target !== null && distToTarget < config.moth.settleRadiusFh ? config.moth.settleWanderMultiple : 1;
  dvx += Math.cos(m.phase) * config.moth.wanderFhPerS * settle;
  dvy += Math.sin(m.phase * 1.7) * config.moth.wanderFhPerS * settle;

  m.body.px = m.body.x;
  m.body.py = m.body.y;

  // Steer toward the flight velocity rather than accumulating acceleration.
  const steer = 1 - Math.exp(-config.moth.steerHz * dtS);
  m.body.vx += (dvx - m.body.vx) * steer;
  m.body.vy += (dvy - m.body.vy) * steer;

  const speed = Math.hypot(m.body.vx, m.body.vy);
  const maxSpeed = config.moth.flySpeedFhPerS * config.moth.maxSpeedMultiple;
  if (speed > maxSpeed) {
    m.body.vx = (m.body.vx / speed) * maxSpeed;
    m.body.vy = (m.body.vy / speed) * maxSpeed;
  }

  m.body.x += m.body.vx * dtS;
  m.body.y += m.body.vy * dtS;

  // Measured *after* moving. This used to test `bestD`, the distance from
  // before the step, so contact was always judged one frame stale.
  const touching =
    target !== null &&
    draft < config.moth.draftBreaksContactThreshold &&
    Math.hypot(target.body.x - m.body.x, target.body.y - m.body.y) < m.body.r + target.body.r;

  if (touching && target !== null) {
    m.contactMs += dtS * 1000;
    if (m.contactMs >= config.moth.snuffMs) m.pastBaseSnuff = true;
    if (m.contactMs >= config.moth.snuffMs * snuffTimeMultiple) {
      out.snuffedWickId = target.id;
      m.pastBaseSnuff = false;
    }
  } else {
    // Losing contact for a moment cools the moth off rather than erasing its
    // progress, so a single wingbeat of drift does not undo a held attack.
    m.contactMs = Math.max(0, m.contactMs - dtS * 1000 * config.moth.contactDecayMultiple);
    if (m.contactMs === 0 && m.pastBaseSnuff) {
      m.pastBaseSnuff = false;
      // The attack is over and the flame is still lit, having been held for
      // longer than an unoiled one would have lasted.
      if (snuffTimeMultiple > 1 && m.targetWickId !== null) out.oiledSaveWickId = m.targetWickId;
    }
  }

  return out;
}

// ------------------------------------------------------------------- Dark ---

export interface DarkState {
  /** Current safe radius around the light anchors, FH. */
  radiusFh: number;
  shrinkFhPerS: number;
  enabled: boolean;
}

export function makeDark(startRadiusFh: number, shrinkFhPerS: number): DarkState {
  return { radiusFh: startRadiusFh, shrinkFhPerS, enabled: shrinkFhPerS > 0 || startRadiusFh < 90 };
}

export function stepDark(d: DarkState, dtS: number): void {
  if (!d.enabled) return;
  d.radiusFh = Math.max(0.35, d.radiusFh - d.shrinkFhPerS * dtS);
}

/**
 * Advances a Wick's time-in-the-dark. Returns true when it goes out.
 * The grace period exists so that passing through a shadow is survivable and
 * only *staying* in one is fatal.
 */
export function stepWickDarkness(
  w: Wick,
  anchors: readonly { x: number; y: number }[],
  dark: DarkState,
  dtS: number,
  /** Lantern Oil (shop) buys longer in the dark. 1 is unmodified. */
  snuffTimeMultiple = 1,
): boolean {
  if (!dark.enabled || !w.lit || w.state === 'saved' || w.state === 'lost') return false;

  let nearest = Infinity;
  for (const a of anchors) {
    nearest = Math.min(nearest, Math.hypot(w.body.x - a.x, w.body.y - a.y));
  }

  if (nearest <= dark.radiusFh) {
    w.darkMs = 0;
    return false;
  }

  w.darkMs += dtS * 1000;
  return w.darkMs >= config.dark.graceMs * snuffTimeMultiple;
}

/** Placing a Crawler needs a surface; this finds one near a requested point. */
export function groundNear(index: SegmentIndex, x: number, y: number, body: Body): boolean {
  let best: { id: string; t: number; d: number } | null = null;
  for (const seg of index.segments) {
    if (seg.kind === 'rail' || !canWalkOn(seg)) continue;
    const t = clamp(
      ((x - seg.ax) * (seg.bx - seg.ax) + (y - seg.ay) * (seg.by - seg.ay)) / Math.max(1e-9, seg.len * seg.len),
      0,
      1,
    );
    const cx = seg.ax + (seg.bx - seg.ax) * t;
    const cy = seg.ay + (seg.by - seg.ay) * t;
    const d = Math.hypot(cx - x, cy - y);
    if (best === null || d < best.d) best = { id: seg.id, t, d };
  }
  if (best === null) return false;
  const seg = index.get(best.id);
  if (seg === undefined) return false;
  body.groundId = seg.id;
  body.groundT = best.t;
  placeOnSegment(body, seg);
  return true;
}

/** Used by the world to fling a Crawler off a rising brow, same as a Wick. */
export function flickBody(body: Body, impulseFhPerS: number, nowMs: number): void {
  detach(body, nowMs, config.flick.airborneMs);
  body.vy = -Math.min(impulseFhPerS, config.flick.maxImpulseFhPerS);
}

export { attach as attachBody };
