/**
 * All UI text (CLAUDE.md section 6: copy never lives inline).
 *
 * Voice split, from SPEC section 12.6: the OSD shouts in camcorder capitals, the
 * Wicks whisper in lowercase, and the interface itself is plain and short -
 * because a player reading a menu is a player not playing.
 */

export const copy = {
  title: {
    wordmark: 'FACEPLANT',
    tagline: "Don't open your mouth.",
    play: '▶ INSERT FACE',
    playNoCamera: 'Play without a camera',
    footer: 'The camera never leaves this device.',
    settings: 'Settings',
    ossuary: 'The Ossuary',
    shop: 'Shop',
    howToPlay: 'How to Play',
    /** Shown instead of "INSERT FACE" once there is something to come back to. */
    continueLabel: '▶ CONTINUE',
    shelf: 'Tape shelf',
    saved: 'Progress saves itself. You can close the tab whenever you like.',
    /** Shown instead when localStorage is unavailable - private windows, blocked site data. */
    notSaved: 'This browser is blocking site data, so progress will not be kept after you close the tab.',
    candles: (n: number): string => `${n} candle${n === 1 ? '' : 's'} earned`,
  },

  howTo: {
    heading: 'How to Play',
    /** Three lines. If someone reads only this much, they can still play. */
    inOneLine: 'Tiny candles walk across your face. Get them to the door. Keep your mouth shut.',
    steps: [
      { n: '1', title: 'They walk on you', body: 'Wicks drop from the lantern and cross your face to reach the glowing Gate on the far side.' },
      { n: '2', title: 'Your face is the bridge', body: 'Hold still and the road holds. Move, tilt or open your mouth and it changes under their feet.' },
      { n: '3', title: 'Lose half and you lose the tape', body: 'Save more than half of them to pass. Lose more than half and something comes to look at you.' },
    ],
    faceMapTitle: 'What each part of your face does',
    mapLegend: 'Bright parts are floors. The nose and cheeks are slides. Your mouth is the Maw.',
    twoRulesTitle: 'The two things that decide a run',
    mawTitle: 'The Maw',
    maw: 'Your open mouth. It deletes the lip bridge and eats anyone standing on it - but it is also the only way to swallow a Crawler or blow a Moth away, which pays well.',
    composureTitle: 'Composure',
    composure: 'The bar at the top. Laughing, gasping and flinching drain it. At zero your mouth opens on its own. The game is built to make you laugh.',
    hazardsTitle: 'What is trying to stop you',
    hazardCrawler: 'Crawler — walks your face and snuffs a flame. Swallow it, or flick it off a brow.',
    hazardMoth: 'Moth — flies at the brightest flame. Open your mouth and the draught blows it away.',
    hazardDrip: 'Falling wax — tilt so a brow shelters whoever is below.',
    elsewhereTitle: 'Everything else',
    shopTitle: 'Shop',
    shopExplain: 'A shop. Finish levels to earn coins, spend them here on permanent help.',
    ossuaryTitle: 'The Ossuary',
    ossuaryExplain: 'A memorial. Every Wick you lose is listed here by name. Nothing to do but look.',
    tapesTitle: 'The Shelf',
    tapesExplain: 'Five tapes of levels, a new Daily Tape each day, and the endless Long Tape.',
    controlsTitle: 'Controls without a camera',
    controls: [
      ['Mouse', 'move your face'],
      ['Space', 'open the Maw'],
      ['Shift', 'raise your brows (flings them)'],
      ['B', 'blink (an eyelid is a bridge)'],
      ['↑ ↓', 'lean in and out'],
      ['Wheel', 'tilt your head'],
      ['P / Esc', 'pause'],
    ] as const,
    close: 'Got it',
    again: 'Reopen this anytime from the title screen or the pause menu.',
  },

  notice: {
    heading: 'Before you start',
    items: [
      'Ages 13+. Contains startling moments.',
      'All flashing effects are limited to 3 flashes per second.',
      'Your camera stays on this device. Nothing is uploaded, ever.',
      'The game is trying to make you laugh. That is how you lose.',
    ],
    continue: 'Continue',
    continueNoScares: 'Continue with scares off',
  },

  camera: {
    heading: 'About the camera',
    body:
      'FACEPLANT uses your webcam to find the shape of your face, so tiny candle creatures can walk on it. ' +
      'The video is processed on this device and never sent anywhere. There is no server, no account and no analytics.',
    allow: 'Turn on the camera',
    skip: 'Keep playing without it',
    denied: 'The camera was declined. You can still play everything in Assist mode.',
    missing: 'No camera was found. You can still play everything in Assist mode.',
    insecure: 'Cameras need https or localhost. Assist mode works anywhere.',
    model:
      'The face model is missing. Run `npm run setup:mediapipe` to copy it into public/mediapipe, then reload. ' +
      'Assist mode works without it.',
    unknown: 'The camera could not start. Assist mode works without it.',
  },

  calibration: {
    heading: 'Calibration',
    sit: "Sit where you'll play. Look at the candle, and hold still.",
    wide: 'Now open wide. Say "aah".',
    brows: 'Now raise your eyebrows.',
    blink: 'Now close your eyes for a moment.',
    practice: 'One of them is going to walk on you. Hold still.',
    jitter: 'That was a bit wobbly. Try once more, and keep your head still.',
    noFace: 'No face found yet. More light on your face usually fixes it.',
    done: 'Calibrated.',
    skip: 'Skip calibration',
    again: 'Try again',
  },

  shelf: {
    heading: 'Pick a tape',
    locked: 'Locked',
    daily: 'daily',
    endless: 'the long tape',
    endlessBlurb: 'It does not end. See how long you can keep a straight face.',
    dailyDone: 'Today’s tape is recorded. You can replay it, but it counts as practice.',
    back: 'Back',
    play: 'Play',
  },

  hud: {
    composure: 'COMPOSURE',
    lossBudget: (n: number): string =>
      n === 0 ? 'ONE MORE AND THE TAPE IS LOST' : `${n} MORE CAN BE LOST`,
    // P does not switch to Assist by itself - it pauses, and Switch to Assist
    // is a button on the pause screen. This used to say "press P for Assist",
    // which was one step short of true and sent a stuck player looking for a
    // key that does not exist.
    noFace: 'No face yet — pause (P) and Switch to Assist, or move into the light.',
    // Every real binding, including the two that had drifted out of this
    // string entirely: ←→ also tilts (not just the wheel), and L smiles.
    // Both existed in the input code with nothing on screen ever naming them.
    assistHint:
      'Mouse moves your face · Space opens the Maw · Shift raises brows · B blinks · L smiles · ' +
      '↑↓ lean, ←→ or wheel tilt · P or Esc pauses',
    /**
     * A tape's actual win/lose rule, stated in numbers, for the level intro
     * card. The card used to show only flavour text ("hold still, your
     * forehead is the bridge") and never the rule itself - a new player had
     * no way to know what they were trying to do beyond "not lose", which is
     * a mood, not a goal.
     */
    objective: (spawned: number): string =>
      `${spawned} Wick${spawned === 1 ? '' : 's'}. Lose more than half and the tape is lost.`,
  },

  pause: {
    heading: 'PAUSE ‖',
    resume: 'Resume',
    restart: 'Restart',
    settings: 'Settings',
    shelf: 'Tape shelf',
    exit: 'Exit to title',
    /** Leaving mid-run scores nothing, so say so rather than letting it surprise anyone. */
    exitHint: 'Leaving mid-tape: this run will not be scored. Everything you have already earned is saved.',
    lostTracking: 'Your face went out of frame. Carry on, or switch to Assist.',
    switchAssist: 'Switch to Assist',
  },

  results: {
    next: 'Next level',
    retry: 'Retry',
    shelf: 'Shelf',
    copy: 'Copy result',
    copied: 'Copied.',
    card: 'Save card',
    clip: 'Save clip',
    clipHint: 'Six seconds around the moment you cracked.',
    clipOff: 'Turn on clip recording in Settings to keep the moment you cracked.',
    discard: 'Discard',
    save: 'Save',
    practice: 'Practice run — your first attempt is the one that counts.',
    coins: (n: number): string => `+${n} coins`,
    noCoins: 'A lost tape pays nothing.',
    failed: 'Lose more than half and the tape is lost. Try again.',
    retryFailed: 'Try again',
    newBest: 'New best.',
    /**
     * What the things you bought actually did, this run.
     *
     * The shop's items are permanent and passive, which meant that even the
     * ones that worked were invisible - you bought something and the game
     * looked exactly the same afterwards. Naming the flames they saved is
     * most of what makes them feel worth the coins.
     */
    ritesTitle: 'What you bought did this',
    rosterTitle: 'The roster',
    shareTitle: 'Share',
    riteSaves: {
      wardingSalt: (n: number): string => `Warding Salt drove a Crawler off ${n === 1 ? 'a flame' : `${n} flames`}`,
      tallowShell: (n: number): string => `Tallow Shell took ${n === 1 ? 'a Drip' : `${n} Drips`} for them`,
      lanternOil: (n: number): string => `Lantern Oil outlasted ${n === 1 ? 'a Moth' : `${n} Moths`}`,
      ironNerve: (n: number): string => `Iron Nerve swallowed ${n === 1 ? 'a yawn' : `${n} yawns`}`,
      secondChance: (n: number): string => `The Second Flame brought ${n} back`,
    },
  },

  settings: {
    heading: 'Settings',
    scares: 'Scares',
    scaresHint: 'Flicker, whispers, figures and the finale.',
    effects: 'Effects',
    effectsHint: 'Reduced turns off flicker, aberration, wobble and shake.',
    filter: 'Filter',
    hideFace: 'Hide my face',
    hideFaceHint: 'Draws you as glowing contour lines only. Good for streaming.',
    controls: 'Controls',
    recalibrate: 'Recalibrate',
    recording: 'Clip recording',
    recordingHint: 'Off by default. Kept in memory, previewed, saved only if you choose.',
    volume: 'Volume',
    lowPower: 'Low power',
    lowPowerHint:
      'Requests a smaller camera frame, applied next time the camera starts. Pair it with reduced effects on a slow machine.',
    close: 'Close',
    thermalLocked: 'THERMAL unlocks at 12 candles.',
    saveTitle: 'Your save',
    exportSave: 'Export save to a file',
    importSave: 'Import a save file',
    exportHint:
      'Your progress lives in this browser on this device only - nothing is uploaded. Export a file if you want to keep it somewhere safe or move it to another browser.',
    durabilityPersistent: 'Storage is marked persistent: this browser will not clear your save to free up space.',
    durabilityBestEffort:
      'Storage is best-effort: your save survives closing the tab, but a browser low on disk space may clear it. Safari also deletes it after 7 days without a visit. Export a file if you want it guaranteed.',
    durabilityUnavailable: 'This browser is blocking site data, so nothing will be saved at all.',
    importDone: 'Save imported.',
    importFailed: 'That file could not be read as a FACEPLANT save.',
    resetProgress: 'Reset progress',
    resetHint:
      'Deletes your candles, Rites, the Ossuary and your Long Tape best. This is the only copy - it lives on this device and nowhere else.',
    resetConfirm: 'Delete everything?',
    resetConfirmYes: 'Yes, delete it',
    resetConfirmNo: 'Keep my progress',
    resetDone: 'Progress deleted.',
  },

  ossuary: {
    heading: 'The Ossuary',
    blurb: 'Every candle that went out. They are remembered here.',
    empty: 'Nobody has been lost yet. Keep it that way.',
    back: 'Back',
    causes: {
      maw: 'the maw',
      void: 'fell',
      drip: 'the wax',
      dark: 'the dark',
      crawler: 'a crawler',
      moth: 'a moth',
    },
  },

  shop: {
    /** The flavour name stays as the screen's own title, where it cannot hide anything. */
    heading: 'Shop',
    blurb:
      'Coins come from finishing levels. Everything here is permanent, and the results screen tells you what it did. ' +
      'Nothing costs candles - your ratings are yours to keep.',
    owned: 'Owned',
    buy: 'Buy',
    cost: (n: number): string => `${n} coins`,
    coinsHeld: (n: number): string => `${n} coins`,
    empty: 'Finish a level to earn your first coins. A lost tape pays nothing.',
    cantAfford: 'Not enough coins',
    back: 'Back',
  },

  ending: {
    line: 'thank you for keeping still.',
    credits: 'FACEPLANT · a browser game · no servers, no accounts, no uploads',
    again: 'Back to the shelf',
  },

  stampBlurb: {
    'TAPE LOST': 'More than half of them are gone. Something came to look at you.',
    'KEPT STILL': 'You held it together. Mostly.',
    'THE MAW AWOKE': 'Your mouth opened. They noticed.',
    'LIGHTS OUT': 'Every flame went out.',
    COMPOSED: 'Not one of them lost, and barely a flinch.',
    CRACKED: 'You saved them all and nearly died laughing.',
  },
} as const;
