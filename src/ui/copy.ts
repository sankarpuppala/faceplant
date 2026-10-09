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
    rites: 'Rites',
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
    intro:
      'Tiny candle creatures - Wicks - walk out of a lantern and cross your face to reach a glowing Gate. ' +
      'Your own expressions are the terrain. Here is what each part of your face does, and where everything in the menus fits.',
    faceMapTitle: 'Your face is the level',
    flowTitle: 'The loop',
    goalTitle: 'The goal',
    goal:
      'Get as many Wicks to the Gate as you can before time runs out. Candles (1-3) are awarded per level by how ' +
      'many you saved. The more composed you stay, the better you do - and the game is built to make that hard.',
    mawTitle: 'The Maw: your biggest risk and your only weapon',
    maw:
      'Opening your mouth removes the lip bridge and can swallow any Wick standing on it - but it also lets you ' +
      "swallow Crawlers and Moths on purpose for bonus score and composure back (an Offering). Holding it open costs " +
      'composure the whole time it is open, so it is never a free move.',
    composureTitle: 'Composure: the real enemy',
    composure:
      'The bar at the top of the screen. Laughing, gasping, flinching and holding the Maw open all drain it. ' +
      'At zero your mouth opens on its own for a moment, whatever your real jaw is doing - the game punishes losing ' +
      'control, not having a mouth.',
    ossuaryTitle: 'The Ossuary',
    ossuaryExplain:
      'A memorial, not a level. Every Wick you lose is recorded here by name, with what killed it and its last ' +
      'words. Nothing to do here but look - it exists so losing one means something.',
    ritesTitle: 'Rites',
    ritesExplain:
      'A shop, not a level. Spend candles you have already earned on small permanent help for every future run: ' +
      'steadier footing, slower spawns, a wider Gate, or one lost Wick returned per run. Visit it from the title ' +
      'screen whenever you have candles to spend.',
    controlsTitle: 'Controls (Assist mode)',
    close: 'Got it',
    again: 'You can reopen this anytime from the title screen.',
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
    noFace: 'No face yet — press P for Assist, or move into the light.',
    assistHint:
      'Mouse moves your face · Space opens the Maw · Shift raises brows · B blinks · ↑↓ lean · wheel tilts · P or Esc pauses',
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
    newBest: 'New best.',
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

  rites: {
    heading: 'Rites',
    blurb: 'Candles can be spent on small, permanent help. The Wicks insist it is not cheating.',
    owned: 'Observed',
    buy: 'Observe',
    cost: (n: number): string => `${n} candles`,
    available: (n: number): string => `${n} candles to spend`,
    names: {
      steadyWicks: 'Rite of Steady Feet',
      slowSpawn: 'Rite of Patience',
      wideGate: 'Rite of the Wider Door',
      secondChance: 'Rite of the Second Flame',
    },
    descriptions: {
      steadyWicks: 'They will risk slightly longer steps and wider gaps.',
      slowSpawn: 'They leave the lantern less often, so there are fewer at once.',
      wideGate: 'The Gate counts a near miss as an arrival.',
      secondChance: 'One lost Wick per run returns to the lantern. The Maw is exempt.',
    },
    back: 'Back',
  },

  ending: {
    line: 'thank you for keeping still.',
    credits: 'FACEPLANT · a browser game · no servers, no accounts, no uploads',
    again: 'Back to the shelf',
  },

  stampBlurb: {
    'KEPT STILL': 'You held it together. Mostly.',
    'THE MAW AWOKE': 'Your mouth opened. They noticed.',
    'LIGHTS OUT': 'Every flame went out.',
    COMPOSED: 'Not one of them lost, and barely a flinch.',
    CRACKED: 'You saved them all and nearly died laughing.',
  },
} as const;
