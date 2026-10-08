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

  quake: {
    speedFhPerS: 2.5,
    stumbleMs: 300,
    lateralImpulseFhPerS: 0.3,
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
    /** Flicker depth as a fraction of radius; 0..1. */
    flickerDepth: 0.08,
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
    radiusFh: 0.04,
    walkSpeedFhPerS: 0.26,
    /** A Crawler keeps hunting the same Wick for at least this long. */
    retargetMs: 900,
  },

  /** U6 - Moths fly at the brightest flame; an open Maw blows them away. */
  moth: {
    radiusFh: 0.03,
    flySpeedFhPerS: 0.5,
    /** Wander added to the beeline. */
    wanderFhPerS: 0.22,
    wanderHz: 1.3,
    /** An open Maw repels moths within this radius. */
    draftRadiusFh: 0.9,
    draftFhPerS2: 7,
    /** Contact time before a moth snuffs a flame. */
    snuffMs: 260,
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

  /** U9 - RITES: candles spent on small permanent help. */
  rites: {
    costCandles: { steadyWicks: 6, slowSpawn: 10, wideGate: 14, secondChance: 20 },
    /** steadyWicks multiplies maxStepDownFh and maxGapFh. */
    steadyWicksMultiple: 1.3,
    /** slowSpawn multiplies the level spawn interval. */
    slowSpawnMultiple: 1.2,
    /** wideGate adds this to gate width and height, in FH. */
    wideGateBonusFh: 0.06,
    /** secondChance returns this many lost Wicks per run to the lantern. */
    secondChanceCount: 1,
  },

  lines: {
    minGapMs: 2500,
    displayMs: 2600,
    /** While cracking (U1) lines come faster - the game piles on. */
    crackingGapMs: 1500,
  },

  scares: {
    flickerMs: 900,
    figureMs: 1400,
    whisperMs: 2200,
    segmentWindowMs: 1200,
    /** Scares never fire within this long of each other. */
    minGapMs: 8000,
  },

  render: {
    /** Target aspect of the stage; the camera frame is cropped to it. */
    aspect: 16 / 9,
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
    },
    /**
     * Effects that "Reduce effects" disables entirely. Every effect with a
     * non-zero maxFlashHz must appear here; `npm run check:flash` enforces it.
     * The REC dot is held solid rather than removed, which is why it is listed.
     */
    reducedEffectsDisables: ['flicker', 'aberration', 'wobble', 'shake', 'scanlines', 'recDot'],
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
    /** The Daily Tape epoch (SPEC Q5). Day number = whole days since this date, UTC. */
    epochDate: '2026-10-07',
    templates: 4,
  },

  share: {
    /** Appended to share text (SPEC 16, Q2). */
    canonicalUrl: 'https://faceplant.game',
  },
} as const;

export type Config = typeof config;

/** Live overrides applied by Rites (U9) and by low-power mode. */
export interface Tunables {
  wickMaxStepDownFh: number;
  wickMaxGapFh: number;
  spawnIntervalMultiple: number;
  gateBonusFh: number;
  secondChanceCount: number;
}

export function defaultTunables(): Tunables {
  return {
    wickMaxStepDownFh: config.wick.maxStepDownFh,
    wickMaxGapFh: config.wick.maxGapFh,
    spawnIntervalMultiple: 1,
    gateBonusFh: 0,
    secondChanceCount: 0,
  };
}
