/**
 * The world: everything that moves, stepped at a fixed rate.
 *
 * Timing is the subtle part. Tracking arrives at 20-30 Hz, physics runs at 120
 * (SPEC section 6.2 / config.physics.stepHz). So the world keeps the two most
 * recent tracker frames and, for every physics substep, interpolates the
 * terrain between them - and remembers the previous substep's interpolated
 * pose. That pair is what the swept test consumes, which is why a fast-moving
 * face cannot flick a Wick through a brow.
 *
 * Rendering and audio never read entity internals; they read `drain()`ed
 * events. That keeps the Pixi layer replaceable and lets the headless tests run
 * the real world with no renderer at all.
 */

import { config, type Tunables } from '../config.ts';
import type { Blendshapes, ContourMap, FaceFrame } from '../face/types.ts';
import { emptyContourMap } from '../face/types.ts';
import { EyeDetector } from '../terrain/eyes.ts';
import {
  buildFaceTerrain,
  buildStaticTerrain,
  cloneContours,
  lerpContours,
  type Segment,
} from '../terrain/build.ts';
import {
  MawDetector,
  pointInPolygon,
  polygonArea,
  polygonCentre,
  swallowPolygon,
  type MawState,
} from '../terrain/maw.ts';
import { segmentUpwardSpeed } from '../terrain/walkable.ts';
import { Composure, type ComposureState } from '../game/composure.ts';
import { Procession, type ProcessionState } from '../game/procession.ts';
import { NameDealer, titleForRunsSurvived } from '../game/names.ts';
import type { Level } from '../game/levelSchema.ts';
import type { Reactions } from '../face/reactions.ts';
import { noReactions } from '../face/reactions.ts';
import {
  flickBody,
  groundNear,
  makeCrawler,
  makeDark,
  makeDrip,
  makeMoth,
  stepCrawler,
  stepDark,
  stepDrip,
  stepMoth,
  stepWickDarkness,
  type Crawler,
  type DarkState,
  type Drip,
  type DripEmitter,
  type Moth,
} from './hazards.ts';
import { SegmentIndex } from './solver.ts';
import { Rng } from './vec.ts';
import { makeWick, resetWickIds, stepWick, type LostCause, type Wick } from './wick.ts';

export type WorldEvent =
  | { kind: 'spawn'; wick: Wick }
  | { kind: 'save'; wick: Wick }
  | { kind: 'lost'; wick: Wick; cause: LostCause }
  | { kind: 'offering'; what: 'crawler' | 'moth'; x: number; y: number }
  | { kind: 'flick'; x: number; y: number }
  | { kind: 'land'; x: number; y: number }
  | { kind: 'rail'; x: number; y: number }
  | { kind: 'quake' }
  | { kind: 'yawn' }
  | { kind: 'procession'; multiple: number }
  | { kind: 'processionBroken' }
  | { kind: 'turn'; x: number; y: number }
  | { kind: 'wave'; n: number };

export interface WorldOptions {
  level: Level;
  tunables: Tunables;
  seed: number;
  /** U7 - name to runs-survived, so veterans come back with titles. */
  survivors?: ReadonlyMap<string, number>;
  /** U4 - endless mode keeps spawning waves instead of a fixed roster. */
  endless?: boolean;
}

export interface WorldSnapshot {
  elapsedMs: number;
  timeLeftS: number;
  spawned: number;
  saved: number;
  lost: number;
  alive: number;
  score: number;
  offerings: number;
  mawWokeCount: number;
  lossesByCause: Record<LostCause, number>;
  composure: ComposureState;
  procession: ProcessionState;
  maw: MawState;
  wave: number;
  over: boolean;
  /** Per-Wick outcome in spawn order, for the share string (SPEC section 16). */
  outcomes: ('saved' | LostCause | 'alive')[];
}

export class World {
  readonly wicks: Wick[] = [];
  readonly crawlers: Crawler[] = [];
  readonly drips: Drip[] = [];
  readonly moths: Moth[] = [];

  readonly composure = new Composure();
  readonly procession = new Procession();
  readonly maw = new MawDetector();
  readonly eyes = new EyeDetector();

  /** Terrain for the current substep. Rendering reads this. */
  segments: Segment[] = [];
  index = new SegmentIndex([]);
  swallow: { x: number; y: number }[] = [];

  elapsedMs = 0;
  score = 0;
  offerings = 0;
  mawWokeCount = 0;
  wave = 0;
  over = false;
  reactions: Reactions = noReactions();
  mawState: MawState = { open: false, openness: 0, heldMs: 0, justOpened: false, justClosed: false };
  composureState: ComposureState;
  faceSpeedFhPerS = 0;
  /** True when no face has ever been delivered; the renderer shows a hint. */
  faceSeen = false;

  private readonly level: Level;
  private readonly tunables: Tunables;
  private readonly rng: Rng;
  private readonly names: NameDealer;
  private readonly survivors: ReadonlyMap<string, number>;
  private readonly endless: boolean;
  private readonly staticSegments: Segment[];
  private readonly emitters: DripEmitter[] = [];
  private readonly dark: DarkState;
  private readonly events: WorldEvent[] = [];
  private readonly pendingHazards: Level['hazards'];
  private readonly spawnOrder: Wick[] = [];

  /** Tracker frame interpolation state. */
  private frameA: ContourMap | null = null;
  private frameB: ContourMap | null = null;
  private frameAtA = 0;
  private frameAtB = 0;
  private blendA: Blendshapes | null = null;
  private blendB: Blendshapes | null = null;
  private centreA = { x: 0, y: 0 };
  private centreB = { x: 0, y: 0 };
  /** Face scale from the newest frame; the renderer uses it for lean cues. */
  faceScale = 1;

  /** Scratch buffers, reused so the step loop does not allocate. */
  private readonly curContours = emptyContourMap();
  private prevContours = emptyContourMap();

  private spawned = 0;
  private savedCount = 0;
  private lostCount = 0;
  private nextSpawnAtMs = 0;
  private spawnIntervalMs: number;
  private accumulatorMs = 0;
  private nextWaveAtMs: number;
  private secondChancesLeft: number;
  private readonly lossesByCause: Record<LostCause, number> = {
    maw: 0,
    void: 0,
    drip: 0,
    dark: 0,
    crawler: 0,
    moth: 0,
  };

  constructor(opts: WorldOptions) {
    this.level = opts.level;
    this.tunables = opts.tunables;
    this.rng = new Rng(opts.seed);
    this.names = new NameDealer(opts.seed);
    this.survivors = opts.survivors ?? new Map();
    this.endless = opts.endless ?? false;
    this.staticSegments = buildStaticTerrain(this.level.ruins, this.level.walls);
    this.dark = makeDark(this.level.dark.startRadiusFh, this.level.dark.shrinkFhPerS);
    this.pendingHazards = [...this.level.hazards];
    this.spawnIntervalMs = this.level.spawn.intervalMs * this.tunables.spawnIntervalMultiple;
    this.nextWaveAtMs = config.endless.waveIntervalMs;
    this.secondChancesLeft = this.tunables.secondChanceCount;
    this.composureState = this.composure.update(noReactions(), false, 0, 0);
    resetWickIds();
  }

  get currentLevel(): Level {
    return this.level;
  }

  get darkState(): DarkState {
    return this.dark;
  }

  /** Called whenever the face source produces a new frame. */
  setFace(frame: FaceFrame): void {
    const face = frame.faces[0];
    if (face === undefined) return;
    this.faceSeen = true;

    this.frameA = this.frameB;
    this.frameAtA = this.frameAtB;
    this.blendA = this.blendB;
    this.centreA = this.centreB;

    this.frameB = cloneContours(face.points);
    this.frameAtB = frame.t;
    this.blendB = { ...face.blend };
    this.centreB = { x: face.center.x, y: face.center.y };
    this.faceScale = face.scale;

    // Face-centre speed is measured between tracker frames, not between physics
    // substeps: the interpolated path is a straight line, so sampling it faster
    // would report the same speed with more noise.
    //
    // The first frame has nothing to compare against. Measuring it against the
    // zeroed initial centre over a near-zero span reported tens of FH per
    // second and fired a quake the instant every level started, knocking the
    // first Wicks over before the player had done anything.
    if (this.frameA === null) {
      this.faceSpeedFhPerS = 0;
    } else {
      const spanS = Math.max(1e-3, (this.frameAtB - this.frameAtA) / 1000);
      this.faceSpeedFhPerS = Math.hypot(this.centreB.x - this.centreA.x, this.centreB.y - this.centreA.y) / spanS;
    }

    if (this.frameA === null) {
      this.frameA = cloneContours(face.points);
      this.frameAtA = frame.t - 1;
      this.blendA = { ...face.blend };
      this.centreA = this.centreB;
      lerpContours(this.frameA, this.frameB, 1, this.prevContours);
    }
  }

  /** Reactions are computed by the app (it owns the detector) and handed in. */
  setReactions(r: Reactions): void {
    this.reactions = r;
  }

  drain(): WorldEvent[] {
    const out = this.events.slice();
    this.events.length = 0;
    return out;
  }

  /**
   * Advances the world by a wall-clock delta. Runs as many fixed substeps as
   * fit, capped so a backgrounded tab does not resume with a thousand steps.
   */
  step(deltaMs: number): void {
    if (this.over) return;

    const stepMs = 1000 / config.physics.stepHz;
    this.accumulatorMs = Math.min(this.accumulatorMs + deltaMs, stepMs * config.physics.maxStepsPerFrame);

    while (this.accumulatorMs >= stepMs) {
      this.accumulatorMs -= stepMs;
      this.substep(stepMs);
      if (this.over) break;
    }
  }

  private substep(dtMs: number): void {
    const dtS = dtMs / 1000;
    this.elapsedMs += dtMs;

    // --- terrain for this substep ------------------------------------------
    const blend = this.interpolateFace();

    // --- the Maw, composure and THE YAWN ----------------------------------
    // Composure is evaluated first, because its yawn overrides the real jaw.
    const preMaw = this.maw.isOpen;
    this.composureState = this.composure.update(this.reactions, preMaw, dtMs, this.elapsedMs);
    if (this.composureState.justYawned) this.events.push({ kind: 'yawn' });

    this.mawState = this.maw.update(blend.jawOpen, dtMs, this.composureState.yawning);
    if (this.mawState.justOpened) this.mawWokeCount++;

    const lids = this.eyes.update(blend.blinkL, blend.blinkR, dtMs);

    this.segments = [
      ...buildFaceTerrain({
        current: this.curContours,
        previous: this.prevContours,
        bridgeIntact: !this.mawState.open,
        lidLShut: lids.left.shut,
        lidRShut: lids.right.shut,
      }),
      ...this.staticSegments,
    ];
    this.index = new SegmentIndex(this.segments);

    this.swallow = this.mawState.open ? swallowPolygon(this.curContours) : [];
    const mawCentre = this.swallow.length >= 3 ? polygonCentre(this.swallow) : null;
    const mawArea = this.swallow.length >= 3 ? polygonArea(this.swallow) : 0;

    // --- spawning ----------------------------------------------------------
    this.doSpawning();
    this.releaseHazards();
    if (this.endless) this.doWaves();

    // --- entities ----------------------------------------------------------
    stepDark(this.dark, dtS);
    const anchors = this.lightAnchors();

    for (const w of this.wicks) {
      if (w.state === 'saved' || w.state === 'lost') continue;

      const r = stepWick(w, {
        index: this.index,
        dtS,
        nowMs: this.elapsedMs,
        mawCentre,
        faceSpeedFhPerS: this.faceSpeedFhPerS,
        tunables: { maxStepDownFh: this.tunables.wickMaxStepDownFh, maxGapFh: this.tunables.wickMaxGapFh },
        rng: this.rng,
      });

      if (r.flicked) this.events.push({ kind: 'flick', x: w.body.x, y: w.body.y });
      if (r.landed) this.events.push({ kind: 'land', x: w.body.x, y: w.body.y });
      if (r.startedRail) this.events.push({ kind: 'rail', x: w.body.x, y: w.body.y });
      if (r.stumbled) this.events.push({ kind: 'quake' });
      if (r.turnedAtEdge) this.events.push({ kind: 'turn', x: w.body.x, y: w.body.y });

      // The Maw (SPEC 6.4).
      if (this.swallow.length >= 3 && pointInPolygon(w.body, this.swallow)) {
        this.lose(w, 'maw');
        continue;
      }
      // The void.
      if (w.body.y > config.wick.voidYFh) {
        this.lose(w, 'void');
        continue;
      }
      // The Dark (SPEC 8.2).
      if (stepWickDarkness(w, anchors, this.dark, dtS)) {
        this.lose(w, 'dark');
        continue;
      }
      // The Gate.
      if (this.inGate(w)) this.save(w);
    }

    this.stepCrawlers(dtS, mawCentre);
    this.stepDrips(dtS);
    this.stepMoths(dtS, mawCentre, mawArea);

    // Flick hazards off a rising brow too, which is the Crawler's other counter.
    this.flickHazardsFromBrows(dtS);

    const ps = this.procession.state;
    if (ps.justStepped) this.events.push({ kind: 'procession', multiple: ps.multiple });
    if (ps.justBroken) this.events.push({ kind: 'processionBroken' });
    this.procession.clearFlags();

    this.checkEnd();
  }

  /** Builds this substep's contours and returns the interpolated blendshapes. */
  private interpolateFace(): Blendshapes {
    const a = this.frameA;
    const b = this.frameB;
    const ba = this.blendA;
    const bb = this.blendB;

    if (a === null || b === null || ba === null || bb === null) {
      // No face yet: terrain is empty, and only the static geometry exists.
      this.prevContours = cloneContours(this.curContours);
      return { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
    }

    const span = Math.max(1, this.frameAtB - this.frameAtA);
    const alpha = Math.min(1, Math.max(0, (this.elapsedMs - this.frameAtA) / span));

    // The previous substep's pose becomes this substep's "previous".
    this.prevContours = cloneContours(this.curContours);
    lerpContours(a, b, alpha, this.curContours);

    const mix = (k: keyof Blendshapes): number => (ba[k] ?? 0) + ((bb[k] ?? 0) - (ba[k] ?? 0)) * alpha;
    return {
      jawOpen: mix('jawOpen'),
      smile: mix('smile'),
      browUp: mix('browUp'),
      blinkL: mix('blinkL'),
      blinkR: mix('blinkR'),
    };
  }

  private doSpawning(): void {
    if (this.elapsedMs < this.nextSpawnAtMs) return;
    if (!this.endless && this.spawned >= this.level.spawn.count) return;

    const name = this.names.next();
    const runs = this.survivors.get(name) ?? 0;
    const w = makeWick(
      this.level.spawn.x,
      this.level.spawn.y,
      name,
      titleForRunsSurvived(runs + 1),
      this.level.spawn.dir,
    );
    w.body.vx = this.level.spawn.dir * config.wick.spawnDriftFhPerS;
    this.wicks.push(w);
    this.spawnOrder.push(w);
    this.spawned++;
    this.nextSpawnAtMs = this.elapsedMs + this.spawnIntervalMs;
    this.events.push({ kind: 'spawn', wick: w });
  }

  private releaseHazards(): void {
    for (let i = this.pendingHazards.length - 1; i >= 0; i--) {
      const h = this.pendingHazards[i];
      if (h === undefined || this.elapsedMs < h.atMs) continue;
      this.pendingHazards.splice(i, 1);

      if (h.type === 'crawler') {
        const c = makeCrawler(h.x, h.y);
        groundNear(this.index, h.x, h.y, c.body);
        this.crawlers.push(c);
      } else if (h.type === 'moth') {
        this.moths.push(makeMoth(h.x, h.y, this.rng));
      } else {
        this.emitters.push({ x: h.x, y: h.y, intervalMs: h.intervalMs, nextAtMs: this.elapsedMs });
      }
    }
  }

  /** U4 - endless waves. Difficulty arrives as new hazard *kinds*, not more numbers. */
  private doWaves(): void {
    if (this.elapsedMs < this.nextWaveAtMs) return;
    this.wave++;
    this.nextWaveAtMs = this.elapsedMs + config.endless.waveIntervalMs;
    this.spawnIntervalMs = Math.max(
      config.endless.minSpawnIntervalMs,
      this.spawnIntervalMs * config.endless.spawnIntervalDecay,
    );

    const w = this.wave;
    if (w >= config.endless.crawlerFromWave) {
      const c = makeCrawler(this.rng.range(-1.6, 1.6), -1.0);
      groundNear(this.index, c.body.x, c.body.y, c.body);
      this.crawlers.push(c);
    }
    if (w >= config.endless.dripFromWave) {
      this.emitters.push({
        x: this.rng.range(-1.2, 1.2),
        y: -1.5,
        intervalMs: this.rng.range(1800, 3200),
        nextAtMs: this.elapsedMs,
      });
    }
    if (w >= config.endless.mothFromWave) {
      this.moths.push(makeMoth(this.rng.range(-1.8, 1.8), this.rng.range(-1.4, -0.6), this.rng));
    }
    if (w >= config.endless.darkFromWave) {
      this.dark.enabled = true;
      this.dark.radiusFh = Math.min(this.dark.radiusFh, 2.4);
      this.dark.shrinkFhPerS = 0.012;
    }

    this.events.push({ kind: 'wave', n: this.wave });
  }

  private stepCrawlers(dtS: number, mawCentre: { x: number; y: number } | null): void {
    void mawCentre;
    for (const c of this.crawlers) {
      if (!c.alive) continue;
      stepCrawler(c, this.wicks, this.index, dtS, this.elapsedMs);

      // U2 - THE OFFERING: a Crawler that crosses the open Maw is swallowed,
      // and that is worth doing on purpose.
      if (this.swallow.length >= 3 && pointInPolygon(c.body, this.swallow)) {
        c.alive = false;
        this.offering('crawler', c.body.x, c.body.y, config.offering.scorePerCrawler);
        continue;
      }
      if (c.body.y > config.wick.voidYFh) {
        c.alive = false;
        continue;
      }

      for (const w of this.wicks) {
        if (w.state === 'saved' || w.state === 'lost') continue;
        if (Math.hypot(w.body.x - c.body.x, w.body.y - c.body.y) < w.body.r + c.body.r) {
          this.lose(w, 'crawler');
        }
      }
    }
  }

  private stepDrips(dtS: number): void {
    for (const e of this.emitters) {
      if (this.elapsedMs < e.nextAtMs) continue;
      e.nextAtMs = this.elapsedMs + e.intervalMs;
      this.drips.push(makeDrip(e.x, e.y));
    }

    for (const d of this.drips) {
      if (!d.alive) continue;
      stepDrip(d, this.index, dtS, this.elapsedMs);
      for (const w of this.wicks) {
        if (w.state === 'saved' || w.state === 'lost') continue;
        if (Math.hypot(w.body.x - d.body.x, w.body.y - d.body.y) < w.body.r + d.body.r) {
          d.alive = false;
          this.lose(w, 'drip');
        }
      }
    }
    if (this.drips.length > 64) this.drips.splice(0, this.drips.length - 64);
  }

  private stepMoths(dtS: number, mawCentre: { x: number; y: number } | null, mawArea: number): void {
    for (const m of this.moths) {
      if (!m.alive) continue;
      const r = stepMoth(m, this.wicks, mawCentre, mawArea, dtS);

      if (this.swallow.length >= 3 && pointInPolygon(m.body, this.swallow)) {
        m.alive = false;
        this.offering('moth', m.body.x, m.body.y, config.offering.scorePerMoth);
        continue;
      }
      if (r.snuffedWickId !== null) {
        const victim = this.wicks.find((w) => w.id === r.snuffedWickId);
        if (victim !== undefined) this.lose(victim, 'moth');
        m.contactMs = 0;
      }
      if (m.body.y > config.wick.voidYFh + 1) m.alive = false;
    }
  }

  private flickHazardsFromBrows(dtS: number): void {
    for (const c of this.crawlers) {
      if (!c.alive) continue;
      const seg = this.index.get(c.body.groundId);
      if (seg === undefined) continue;
      if (seg.contour !== 'browL' && seg.contour !== 'browR') continue;
      const up = segmentUpwardSpeed(seg, c.body.groundT, dtS);
      if (up > config.flick.minBrowSpeedFhPerS) {
        flickBody(c.body, up * config.flick.gain, this.elapsedMs);
        this.events.push({ kind: 'flick', x: c.body.x, y: c.body.y });
      }
    }
  }

  private lightAnchors(): { x: number; y: number }[] {
    const out: { x: number; y: number }[] = [
      { x: this.level.spawn.x, y: this.level.spawn.y },
      { x: this.level.gate.x + this.level.gate.w / 2, y: this.level.gate.y + this.level.gate.h / 2 },
    ];
    for (const w of this.wicks) {
      if (w.lit && w.state !== 'saved' && w.state !== 'lost') out.push({ x: w.body.x, y: w.body.y });
    }
    return out;
  }

  private inGate(w: Wick): boolean {
    const g = this.level.gate;
    const pad = this.tunables.gateBonusFh + config.wick.gateReachPadFh;
    return (
      w.body.x >= g.x - pad &&
      w.body.x <= g.x + g.w + pad &&
      w.body.y >= g.y - pad &&
      w.body.y <= g.y + g.h + pad
    );
  }

  private save(w: Wick): void {
    w.state = 'saved';
    this.savedCount++;
    this.procession.save();
    this.score += config.score.perSavedWick * this.procession.multiple;
    this.events.push({ kind: 'save', wick: w });
  }

  private lose(w: Wick, cause: LostCause): void {
    // U9 - a Rite can hand one Wick back per run, which turns a bad run into a
    // recoverable one instead of a write-off.
    if (this.secondChancesLeft > 0 && cause !== 'maw') {
      this.secondChancesLeft--;
      w.body.x = this.level.spawn.x;
      w.body.y = this.level.spawn.y;
      w.body.vx = 0;
      w.body.vy = 0;
      w.body.groundId = null;
      w.body.railId = null;
      w.state = 'falling';
      w.darkMs = 0;
      w.lit = true;
      return;
    }

    w.state = 'lost';
    w.cause = cause;
    w.lit = false;
    this.lostCount++;
    this.lossesByCause[cause]++;
    this.procession.loss();
    this.events.push({ kind: 'lost', wick: w, cause });
  }

  private offering(what: 'crawler' | 'moth', x: number, y: number, score: number): void {
    this.offerings++;
    this.score += score * this.procession.multiple;
    this.composure.reward(config.offering.composureRefundUnits);
    this.events.push({ kind: 'offering', what, x, y });
  }

  private checkEnd(): void {
    const timeUp = this.elapsedMs >= this.level.timeLimitS * 1000;

    if (this.endless) {
      if (this.lostCount >= config.endless.lossesAllowed) this.over = true;
      return;
    }

    const allResolved = this.spawned >= this.level.spawn.count && this.wicks.every((w) => w.state === 'saved' || w.state === 'lost');
    if (timeUp || allResolved) this.over = true;
  }

  /** Final score, including the end-of-run bonuses. Call once the run is over. */
  finalScore(): number {
    let total = this.score;
    if (this.savedCount === this.level.spawn.count && !this.endless) total += config.score.flawlessBonus;
    total += Math.round(config.score.composureBonus * this.composure.fraction);
    const leftS = Math.max(0, this.level.timeLimitS - this.elapsedMs / 1000);
    if (!this.endless) total += Math.round(config.score.perSecondRemaining * leftS);
    return total;
  }

  snapshot(): WorldSnapshot {
    return {
      elapsedMs: this.elapsedMs,
      timeLeftS: Math.max(0, this.level.timeLimitS - this.elapsedMs / 1000),
      spawned: this.spawned,
      saved: this.savedCount,
      lost: this.lostCount,
      alive: this.wicks.filter((w) => w.state !== 'saved' && w.state !== 'lost').length,
      score: this.score,
      offerings: this.offerings,
      mawWokeCount: this.mawWokeCount,
      lossesByCause: { ...this.lossesByCause },
      composure: this.composureState,
      procession: this.procession.state,
      maw: this.mawState,
      wave: this.wave,
      over: this.over,
      outcomes: this.spawnOrder.map((w) =>
        w.state === 'saved' ? 'saved' : w.state === 'lost' ? (w.cause ?? 'void') : 'alive',
      ),
    };
  }

  /** The Wicks in spawn order, for the result card and the Ossuary. */
  get roster(): readonly Wick[] {
    return this.spawnOrder;
  }
}
