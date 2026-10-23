/**
 * Every tunable number in FACEPLANT lives here (CLAUDE.md section 6, SPEC section 17).
 *
 * Naming rule: a key either carries its unit in the name (`walkSpeedFhPerS`,
 * `minStateMs`, `maxWalkSlopeDeg`) or is a dimensionless 0..1 fraction whose
 * comment says so. `tests/game/config.test.ts` enforces this mechanically, so
 * a new key without a unit fails the test run.
 *
 * FH = face height, the world unit (SPEC section 7).
 */

export const config = {
  face: {
    cameraWidth: 1280, // px, requested
    cameraHeight: 720, // px, requested
    lowPowerCameraWidth: 640, // px
    lowPowerCameraHeight: 480, // px
    /** One Euro filter on every landmark (SPEC 6.2). */
    oneEuro: { minCutoffHz: 1.2, beta: 0.02, dCutoffHz: 1.0 },
    /** Exponential moving average on blendshapes; 0..1 fraction, higher = less smoothing. */
    blendEmaAlpha: 0.5,
    lostTrackingPauseMs: 2000,
    /** With no video-frame callback for this long, an animation-frame loop drives detection instead, ms. */
    videoCallbackTimeoutMs: 250,
    /** Tracking below this rate switches on low-power defaults. */
    lowPowerTrackingHz: 14,
  },

  calibration: {
    holdMs: 2000,
    /** Reject the neutral hold if the face centre moves more than this, in FH. */
    maxJitterFh: 0.03,
    /** Floor on the measured jawOpen range, so a shy aah cannot make the Maw hair-trigger. 0..1 fraction. */
    minJawRange: 0.25,
    /** Floor on the measured brow range. 0..1 fraction. */
    minBrowRange: 0.08,
    /** Floor on the measured blink range. 0..1 fraction. */
    minBlinkRange: 0.3,
  },

  terrain: {
    /** A segment is walkable only if its up-normal is within this of straight up. */
    maxWalkableAngleDeg: 80,
    /** Segments shorter than this are dropped as tracker noise. */
    minSegmentLengthFh: 0.004,
  },

  maw: {
    /** Fractions of the calibrated neutral..wide jawOpen range. 0..1 (SPEC 6.4). */
    openFraction: 0.45,
    closeFraction: 0.3,
    minStateMs: 80,
  },

  eyes: {
    /** Blink above this fraction of the calibrated range closes the lid into a bridge (U5). 0..1. */
    closeFraction: 0.55,
    openFraction: 0.4,
    minStateMs: 70,
  },

  wick: {
    radiusFh: 0.035,
    walkSpeedFhPerS: 0.35,
    maxStepDownFh: 0.22,
    maxGapFh: 0.14,
    maxStepUpFh: 0.1,
    /**
     * Steeper than this and a Wick slides instead of walking. Raised from 50 to
     * 60 because the corners of a mouth measure about 55 deg: at 50 a Wick could
     * step onto the lip and then slide straight back off it, so the mouth route
     * was uncrossable. At 60 the nose (90) and the cheeks (70-78) still slide,
     * which is what those are for.
     */
    maxWalkSlopeDeg: 60,
    /** Wicks this close to an open Maw turn and walk away (SPEC 6.4). */
    mawFearRadiusFh: 0.4,
    /** How fast a feared Wick walks away, as a multiple of walkSpeedFhPerS. */
    fleeSpeedMultiple: 1.7,
    /** A Wick below this world y has fallen out of the world. */
    voidYFh: 2.6,
    /** Terminal fall speed, so a long drop stays solvable. */
    maxFallSpeedFhPerS: 6,
    /** Sideways drift a Wick leaves the lantern with. */
    spawnDriftFhPerS: 0.1,
    /** How close a Wick centre must get to the Gate rect to count as saved. */
    gateReachPadFh: 0.01,
  },

  flick: {
    minBrowSpeedFhPerS: 1.2,
    gain: 1.6,
    maxImpulseFhPerS: 3,
    /** A flicked Wick stays airborne at least this long before it can re-ground. */
    airborneMs: 120,
  },

  /**
   * Getting out of a dead end.
   *
   * A Wick turns around timidly at any edge it cannot step off (decision D5),
   * which is right almost everywhere and catastrophic in a concave one. The
   * jaw is a U: anything knocked into it walks up one side, turns, slides
   * back, walks up the other, turns, forever. A player swaying their head by
   * a couple of centimetres put six of seven Wicks in there, where they
   * turned back 306 times and finished the level still walking - scoring
   * nothing, dying of nothing, and never explaining themselves.
   *
   * So timidity now runs out. A Wick that has genuinely gone nowhere for this
   * long stops refusing the edge and takes the step, which either lands it
   * somewhere new or drops it into the void. Both are outcomes the player can
   * see and understand; being quietly stuck is not.
   */
  hud: {
    /**
     * How long the Assist control reminder stays on screen at the start of a
     * level, ms.
     *
     * It used to only exist on the pause screen - a player using the mouse
     * and keyboard (the default for a first-time player, U10) had nothing on
     * screen telling them Space opens the Maw or that the wheel tilts, and
     * would have had to stop and pause to find out. Shown for a few seconds
     * and then it gets out of the way.
     */
    assistHintMs: 7000,
  },

  trapped: {
    /**
     * Turn-backs in a row before a Wick stops refusing the edge.
     *
     * Counted rather than measuring displacement: pacing a jaw end to end
     * covers plenty of distance and arrives nowhere, so a displacement test
     * misses exactly the case it is for. Turning round is itself the symptom
     * - a Wick making progress does it once or twice, a trapped one did it
     * 306 times in a single level.
     */
    turnsAllowed: 6,
    /** Turns more than this far apart are not the same trap, ms. */
    turnWindowMs: 6000,
    /** Turn-backs before the Wick says so, which is the cue to tilt. */
    sayAfterTurnCount: 3,
  },

  quake: {
    speedFhPerS: 2.5,
    stumbleMs: 300,
    lateralImpulseFhPerS: 0.3,
    /**
     * Minimum gap between quake *events*, ms.
     *
     * A quake is one thing happening to the whole level, but it was reported
     * once per stumbling Wick per physics step: a sustained head movement
     * fired it 2,453 times across three levels, roughly thirteen times a
     * second. Each one adds screen shake and asks for a line of dialogue, so
     * the screen juddered continuously and the Wicks talked over themselves.
     * 450 ms also keeps the shake under the 3 Hz ceiling the rest of the
     * game's effects are held to.
     */
    eventCooldownMs: 450,
  },

  physics: {
    stepHz: 120,
    gravityFhPerS2: 4,
    /** Cap on steps per frame, so a stalled tab cannot run thousands of steps. */
    maxStepsPerFrame: 12,
    /** Restitution when a Wick lands; 0..1 fraction, low so they do not bounce away. */
    landingRestitution: 0.05,
    /** Tangential speed kept on landing; 0..1 fraction. */
    groundFriction: 0.72,
  },

  light: {
    wickRadiusFh: 0.35,
    lanternRadiusFh: 0.55,
    gateRadiusFh: 0.6,
    /** Darkness overlay opacity; 0..1 fraction. */
    darknessAlpha: 0.86,
    flickerHz: 2,
    /** Flicker depth as a fraction of radius; 0..1. Raised from 0.08 - the old value was barely perceptible. */
    flickerDepth: 0.18,
  },

  dark: {
    /** A Wick outside the safe radius this long goes out (SPEC 8.2). */
    graceMs: 1000,
  },

  drip: {
    radiusFh: 0.028,
    fallSpeedFhPerS: 1.4,
    /** A drip that has fallen past this y is removed. */
    despawnYFh: 2.8,
  },

  crawler: {
    /**
     * Size was raised from 0.04 so a Crawler reads as a threat rather than
     * background furniture, and that stands.
     *
     * Speed went 0.26 -> 0.44 at the same time, and that was too far: at 0.44,
     * against a Wick's 0.35, a Crawler caught every Wick on the road and a
     * still player had no answer. A headless sweep had it wiping 13 of 13 on
     * 05-3 and 7 of 8 on 02-2, which is the second level that even has one.
     * 0.38 still runs a Wick down, but slowly enough to be answered.
     */
    radiusFh: 0.056,
    walkSpeedFhPerS: 0.38,
    /**
     * Contact time before the flame goes out, the same courtesy the Moth
     * already had. Instant death on overlap gave the player no window to
     * swallow or flick the Crawler away, so a touch read as arbitrary.
     */
    touchMs: 320,
    /** A Crawler keeps hunting the same Wick for at least this long. */
    retargetMs: 900,
  },

  /** U6 - Moths fly at the brightest flame; an open Maw blows them away. */
  moth: {
    /**
     * Raised from 0.03/0.5 for the same reason as the Crawler: a moth barely
     * bigger than a Wick and only a third faster read as decoration. It is now
     * unmistakably larger and noticeably quicker than anything it is hunting.
     */
    radiusFh: 0.05,
    /**
     * This is the moth's actual cruising speed, now that `stepMoth` steers
     * toward a velocity instead of accelerating into damping. It must stay
     * clearly above `wick.walkSpeedFhPerS` or a moth can never close on a Wick
     * that is walking away from it.
     */
    flySpeedFhPerS: 0.9,
    /** How quickly it swings onto its chosen heading. Higher is more darting. */
    steerHz: 7,
    /** Ceiling as a multiple of flySpeedFhPerS, so a Maw gust can overshoot. */
    maxSpeedMultiple: 2.4,
    /** Wander added to the beeline. */
    wanderFhPerS: 0.34,
    wanderHz: 1.6,
    /**
     * Inside this distance the moth has found the flame and stops wandering so
     * much - otherwise the wobble is wider than the contact circle and it
     * shakes itself out of range before `snuffMs` elapses.
     */
    settleRadiusFh: 0.22,
    settleWanderMultiple: 0.25,
    /**
     * An open Maw repels moths within this radius. The face is only about
     * 0.6 FH from mouth to forehead, so this covers all of it - U6 only works
     * as a counter if the gust can reach a moth that is on a brow Wick.
     */
    draftRadiusFh: 1.1,
    /**
     * Outward wind speed at full blast. This must exceed `flySpeedFhPerS` or
     * the moth simply flies back in and opening your mouth achieves nothing.
     */
    draftFhPerS: 1.8,
    /** Mouth area, FH^2, counted as a full-strength "haaah". */
    draftFullAreaFh2: 0.022,
    /** How much the wind spoils its aim. 1 means a full blast blinds it. */
    draftBlindMultiple: 1,
    /** Draft strength (0..1) above which a moth can no longer hold an attack. */
    draftBreaksContactThreshold: 0.35,
    /**
     * A moth only hunts flames this close to the nose, so every attack happens
     * somewhere the Maw's draft can reach. Must stay below `draftRadiusFh`
     * plus roughly half a face, or moths go back to picking off Wicks out on
     * the ruins where the player has no counter.
     */
    huntRadiusFh: 0.8,
    /** Where it waits when nothing on the face is lit. */
    loiterRadiusFh: 0.75,
    loiterTurnMultiple: 0.35,
    /**
     * Contact time before a moth snuffs a flame.
     *
     * 260 ms was unanswerable. The counter to a moth is to open your mouth,
     * and a quarter of a second is less time than it takes a person to see
     * the moth land, decide, and move their jaw - so the hazard read as an
     * arbitrary death rather than one the player had failed to prevent. At
     * three quarters of a second the moth visibly settles on the flame and
     * worries at it, and there is time to answer.
     */
    snuffMs: 700,
    /** How fast held contact bleeds away once broken, per ms of no contact. */
    contactDecayMultiple: 1.5,
  },

  /** U1 - COMPOSURE: the hook as a system. Drains are per second. */
  composure: {
    maxUnits: 100,
    startUnits: 100,
    /** Regained per second while the face is still and the mouth shut. */
    regainPerS: 7,
    /** Nothing regains for this long after the last tell. */
    regainDelayMs: 900,
    drainPerS: {
      laughing: 34,
      gasp: 26,
      smiling: 9,
      browsUp: 6,
      flinch: 14,
      /** Charged every second the Maw is held open - U2's cost. */
      mawOpen: 11,
    },
    /** THE YAWN: at zero composure the Maw opens on its own. */
    yawn: { durationMs: 1200, cooldownMs: 4000, refundUnits: 32 },
    /** Below this fraction of max the line director escalates its comedy (U1). 0..1. */
    crackingFraction: 0.45,
    /** Below this fraction the Wicks openly panic. 0..1. */
    panicFraction: 0.2,
  },

  /** U3 - PROCESSION: a combo you can see, because it is made of light. */
  procession: {
    maxMultiple: 8,
    /** Saves needed to climb one step of the multiplier. */
    savesPerStep: 2,
    /** Extra light radius per multiplier step, in FH. */
    lightBonusFhPerStep: 0.055,
    /** A loss drops the multiplier by this many steps, not to zero. */
    stepsLostOnLoss: 3,
  },

  /** U2 - THE OFFERING: deliberately swallowing a hazard. */
  offering: {
    scorePerCrawler: 250,
    scorePerMoth: 150,
    /** Composure handed back for a clean offering. */
    composureRefundUnits: 18,
    flareFh: 0.5,
    flareMs: 700,
  },

  score: {
    perSavedWick: 100,
    /** Bonus for finishing with every Wick saved. */
    flawlessBonus: 1000,
    /** Multiplied by composure remaining as a fraction of max. */
    composureBonus: 600,
    perSecondRemaining: 10,
  },

  /**
   * Failing a level. Until now every run ended in a result and you could always
   * walk on to the next level, which meant the game had no teeth: losing
   * eleven of twelve Wicks and losing none led to the same place.
   */
  rules: {
    /**
     * Lose more than this fraction of the roster and the tape is lost. The
     * threshold is also what summons THE WATCHER, so the two read as one event:
     * the moment you have failed, something notices.
     */
    failLossFraction: 0.5,
    /** The run keeps running this long after failing, so the scare can land. */
    failHoldMs: 2200,
  },

  /**
   * THE WATCHER - the jump scare for losing half the roster. The only scare in
   * the game that is earned by playing badly rather than scheduled by a level.
   *
   * It is loud and it is close, and it still obeys every safety rule: the
   * approach is one smooth ramp rather than a flash (declared at 0 Hz in
   * render.effects), the shout goes through the same -6 dBFS limiter as
   * everything else with a 40 ms attack, and with Scares off it does not
   * happen at all - the level simply ends.
   */
  watcher: {
    /**
     * A scare needs anticipation or it is just a loud picture. The sequence is
     * stare -> rush -> scream -> linger, and the first beat is the one the
     * original version was missing: a moment where you can tell something is
     * out there, and not yet what.
     */
    /** Two eyes, far off in the dark. Nothing else is visible yet. */
    stareMs: 500,
    /** It closes the distance. */
    approachMs: 620,
    /** In your face, screaming. */
    holdMs: 1100,
    /** Fade out. */
    leaveMs: 500,
    /**
     * How much of the frame the head fills at its closest, as fractions of the
     * frame's height and width. Both are applied and the smaller wins, so a
     * narrow viewport gets a smaller head rather than one whose mouth is off
     * the bottom of the screen.
     *
     * This used to be a single 2.1 of the frame height, which made the head
     * taller than the screen *and* wider than it - so the crown, the horns,
     * the jaw, the chin and the screaming mouth were all outside the frame and
     * the climax of the scare was two glowing dots on black. Just over 1 is
     * right: the crown and chin crop, which reads as being too close, and
     * everything that carries the scare stays in shot. `watcherComposition`
     * does the arithmetic and a test holds it to this.
     */
    finalHeightFraction: 1.15,
    finalWidthFraction: 1.2,
    /**
     * How far above the frame's centre the face sits, as a fraction of head
     * height. Pushes the eyes into the upper third and brings the whole open
     * mouth into the lower half, which is the normal composition for a face
     * this close to a camera.
     */
    faceLiftFraction: 0.08,
    /** How far past its final size it lunges before settling; 0..1 fraction. */
    overshootFraction: 0.12,
    /** Screen shake while it is in your face, FH. Clamped by render.maxShakeFh. */
    shakeFh: 0.14,
    /** Eye glow pulse, Hz. Well under the 3 Hz flash ceiling. */
    eyePulseHz: 2,
    /** Jaw judder while screaming, Hz. Motion, not luminance, and still under 3. */
    jawJudderHz: 2.5,
    /** Wax tears: how many run from each eye. */
    tearCount: 2,
  },

  /** U4 - THE LONG TAPE (endless). */
  endless: {
    waveIntervalMs: 22_000,
    baseWickCount: 4,
    wickGrowthPerWave: 1,
    maxWickCount: 14,
    /** Spawn interval shrinks by this factor each wave; 0..1 fraction. */
    spawnIntervalDecay: 0.92,
    minSpawnIntervalMs: 650,
    crawlerFromWave: 2,
    dripFromWave: 3,
    mothFromWave: 4,
    darkFromWave: 6,
    /** The run ends when this many Wicks have been lost. */
    lossesAllowed: 12,
  },

  /**
   * Coins: the shop currency, earned by finishing levels.
   *
   * Separate from candles on purpose. Candles are a *rating* - how well you
   * played a given level, like stars - and spending them would mean your score
   * going down when you bought something. Coins are earnings, so they can be
   * spent without erasing the record of how you did.
   */
  coins: {
    /** Just for finishing a level without losing the tape. */
    perClear: 20,
    perSavedWick: 5,
    /** Per candle earned, so playing well pays better. */
    perCandle: 15,
    /** Nobody lost at all. */
    flawlessBonus: 40,
    /** Multiplied by composure remaining as a fraction of max. */
    composureBonus: 30,
    /** U2 - rewarding the risky play. */
    perOffering: 10,
    /** A first clear pays more than a replay, so grinding one easy level is poor. */
    replayMultiple: 0.35,
    /** The Long Tape pays per wave survived. */
    perEndlessWave: 25,
  },

  /** U9 - RITES: candles spent on small permanent help. */
  /**
   * What the shop sells.
   *
   * These were measured, and six of the seven items changed *nothing*: a
   * headless sweep of fifteen levels found that over a whole playthrough,
   * owning any of Steady Feet, Lantern Oil, Warding Salt, The Wider Door or
   * Iron Nerve saved exactly zero extra Wicks. They were insurance against
   * failures that do not happen - falling in a gap, going out in the dark,
   * missing the Gate by a hair - while 94% of real deaths were Crawlers and
   * Drips, which only one item touched and that one imperceptibly.
   *
   * Every item now counters something that actually kills, and does so
   * visibly: `world.riteSaves` counts the flames each one saved, and the
   * results screen reports it, because a permanent passive buff you cannot
   * see is indistinguishable from an item that does nothing.
   */
  rites: {
    costCandles: { steadyWicks: 6, mawSense: 10, tallowShell: 14, secondChance: 20 },
    /** steadyWicks multiplies maxStepDownFh and maxGapFh... */
    steadyWicksMultiple: 1.45,
    /** ...and how fast they walk, which is the part the player can see. */
    steadyWicksSpeedMultiple: 1.18,
    /**
     * mawSense multiplies how far out a Wick notices an open Maw.
     *
     * This replaces "Rite of Patience", which spaced out the spawns. Measured,
     * that item was not merely useless but actively harmful: spreading the
     * roster out left each Wick alone with the hazards for longer, and owning
     * it cost four extra Wicks over a playthrough. Selling the player a
     * downgrade is worse than selling them nothing.
     */
    mawSenseRadiusMultiple: 1.7,
    /** tallowShell: how many Drips each Wick survives. */
    tallowShellCount: 1,
    /** secondChance returns this many lost Wicks per run to the lantern. */
    secondChanceCount: 1,
    /** lanternOil: multiplies every light radius... */
    lanternOilMultiple: 1.25,
    /** ...and how long a Moth or the Dark needs to put that flame out. */
    lanternOilSnuffMultiple: 2,
    /** ironNerve: multiplies composure drain; below 1 is a benefit. */
    ironNerveMultiple: 0.45,
    /** wardingSalt: slows Crawlers and lengthens their time-to-kill... */
    wardingSaltSpeedMultiple: 0.7,
    wardingSaltTouchMultiple: 1.8,
    /** ...and turns each one back this many times before it can feed... */
    wardingSaltWardCount: 1,
    /** ...sending it back across the face for this long when it does. */
    wardingSaltRetreatMs: 7000,
  },

  lines: {
    minGapMs: 2500,
    displayMs: 2600,
    /** While cracking (U1) lines come faster - the game piles on. */
    crackingGapMs: 1500,
  },

  scares: {
    flickerMs: 1100,
    figureMs: 1500,
    whisperMs: 2200,
    segmentWindowMs: 1200,
    /**
     * Lowered from 8000. At 8s between scares a level under 90s could only
     * ever fire a handful, and ten of the twelve levels shipped with none
     * scheduled at all - which is the entire reason the game read as "not
     * scary". Levels now schedule scares throughout (see make-levels.ts); this
     * is just the floor that stops two from landing on top of each other.
     */
    minGapMs: 5000,
  },

  render: {
    /** Target aspect of the stage; the camera frame is cropped to it. */
    aspect: 16 / 9,
    /** Resolution of the full-screen tape post-process passes, as a multiple of CSS pixels, independent of devicePixelRatio. */
    postfxResolutionMultiple: 1,
    /**
     * Tracking comes first (docs/OVERHAUL.md section 7.5). While the camera is
     * live and the tracker is below this rate, Hz, the stage is redrawn on
     * every other animation frame; physics still steps every frame.
     */
    trackerPriorityHz: 25,
    /** Only throttle while rendering above this rate, fps, so it never drops below 30. */
    throttleAboveFps: 50,
    /** Declared maximum flash rate per effect, in Hz. WCAG 2.3.1 requires <= 3. */
    effects: {
      scanlines: { maxFlashHz: 0 },
      grain: { maxFlashHz: 0 },
      vignette: { maxFlashHz: 0 },
      aberration: { maxFlashHz: 0 },
      wobble: { maxFlashHz: 1 },
      flicker: { maxFlashHz: 3 },
      recDot: { maxFlashHz: 1 },
      shake: { maxFlashHz: 2 },
      processionFlare: { maxFlashHz: 0 },
      /**
       * THE WATCHER approaches on one smooth ramp and its eyes pulse at 2 Hz.
       * Nothing about it flashes, so it is safe to leave on in reduced effects
       * - only its screen shake is suppressed, via the `shake` entry.
       */
      watcher: { maxFlashHz: 2 },
    },
    /**
     * Effects that "Reduce effects" disables entirely. Every effect with a
     * non-zero maxFlashHz must appear here; `npm run check:flash` enforces it.
     * The REC dot is held solid rather than removed, which is why it is listed.
     */
    reducedEffectsDisables: ['flicker', 'aberration', 'wobble', 'shake', 'scanlines', 'recDot', 'watcher'],
    shakeDecayPerS: 6,
    maxShakeFh: 0.06,
  },

  audio: {
    limiterCeilingDbfs: -6,
    scareMinAttackMs: 30,
    /** 0..1 fraction. */
    defaultVolume: 0.7,
    squeakMinHz: 520,
    squeakMaxHz: 1180,
  },

  clip: {
    width: 720, // px, portrait
    height: 1280, // px
    fps: 30,
    /** U8 - rolling buffer length; only this many seconds are ever held in memory. */
    bufferSeconds: 24,
    /** Length of the auto-cut highlight around the composure crash. */
    highlightSeconds: 6,
    /** How much of the highlight sits before the crash moment. */
    highlightLeadSeconds: 3.5,
    resultTailMs: 2000,
  },

  daily: {
    /**
     * The Daily Tape epoch (SPEC Q5). Day number = whole days since this
     * date, UTC, so this is the launch date and Day 1 is the day it ships.
     */
    epochDate: '2026-10-16',
    templates: 4,
  },

  share: {
    /**
     * Appended to share text (SPEC 16, Q2) when the game cannot work out
     * where it is - see `gameUrl()` in `src/share/shareText.ts`, which reads
     * the real address at runtime and only falls back to this.
     *
     * It is empty on purpose. This used to be `https://faceplant.game`, a
     * domain nobody owns, and every result anyone shared would have pointed
     * at a dead site. A placeholder URL is worse than no URL: it is wrong
     * silently, and only in other people's hands.
     */
    fallbackUrl: '',
  },
} as const;

export type Config = typeof config;

/** Live overrides applied by Rites (U9) and by low-power mode. */
export interface Tunables {
  wickMaxStepDownFh: number;
  wickMaxGapFh: number;
  /** Steady Feet: multiplies walking speed, so they are exposed for less time. */
  wickSpeedMultiple: number;
  /** The Warning: multiplies how far out a Wick notices an open Maw. */
  mawFearRadiusMultiple: number;
  secondChanceCount: number;
  /** Lantern Oil: multiplies every light radius. */
  lightRadiusMultiple: number;
  /** Lantern Oil: multiplies how long it takes to put a flame out. */
  snuffTimeMultiple: number;
  /** Iron Nerve: multiplies every composure drain. Below 1 is a benefit. */
  composureDrainMultiple: number;
  /** Iron Nerve: THE YAWN never takes your mouth. */
  blocksYawn: boolean;
  /** Warding Salt: multiplies Crawler speed and their time-to-kill. */
  crawlerSpeedMultiple: number;
  crawlerTouchMultiple: number;
  /** Warding Salt: how many times each Crawler is turned back before it feeds. */
  crawlerWardCount: number;
  /** Tallow Shell: how many falling drips each Wick shrugs off. */
  dripShieldCount: number;
}

export function defaultTunables(): Tunables {
  return {
    wickMaxStepDownFh: config.wick.maxStepDownFh,
    wickMaxGapFh: config.wick.maxGapFh,
    wickSpeedMultiple: 1,
    mawFearRadiusMultiple: 1,
    secondChanceCount: 0,
    lightRadiusMultiple: 1,
    snuffTimeMultiple: 1,
    composureDrainMultiple: 1,
    blocksYawn: false,
    crawlerSpeedMultiple: 1,
    crawlerTouchMultiple: 1,
    crawlerWardCount: 0,
    dripShieldCount: 0,
  };
}
