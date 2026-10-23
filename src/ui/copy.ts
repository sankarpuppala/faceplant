/**
 * All UI text (CLAUDE.md section 6: copy never lives inline).
 *
 * Tone (docs/OVERHAUL.md section 4): short, quiet, wrong. No jokes, no
 * exclamation marks. The OSD speaks in camcorder capitals, the interface in
 * plain sentence case, and the Wicks whisper in lowercase (src/game/lines.ts).
 * The Watcher never speaks in text at all.
 */

import type { Stamp } from '../game/rules.ts';

export const copy = {
  title: {
    wordmark: 'FACEPLANT',
    tagline: "Don't open your mouth.",
    insertFace: '▶ Insert face',
    playNoCamera: 'Play without camera',
    settings: 'Settings',
    leave: 'Leave',
    footer: 'The camera never leaves this device.',
    /** Shown when localStorage is unavailable - private windows, blocked site data. */
    notSaved: 'This browser keeps nothing. Progress ends when the tab does.',
  },

  notice: {
    heading: 'Before the tape',
    items: [
      'Ages 13 and up. There are startling moments.',
      'Nothing flashes more than three times a second.',
      'The camera stays on this device. Nothing is sent anywhere.',
    ],
    scares: 'Scares',
    scaresHint: 'Off means no scares, no sudden sounds and no sudden images. Anywhere.',
    continue: 'Continue',
  },

  camera: {
    heading: 'The camera',
    body: 'It looks for the shape of your face. The picture stays here.',
    allow: 'Turn on camera',
    noCamera: 'Play without camera',
    back: 'Back',
    denied: 'The camera was refused. Everything can be played without it.',
    missing: 'There is no camera. Everything can be played without it.',
    insecure: 'A camera needs https or localhost. Everything can be played without it.',
    model: 'The face model is missing. Run `npm run setup:mediapipe`, then reload.',
    unknown: 'The camera would not start. Everything can be played without it.',
  },

  calibration: {
    heading: 'Calibration',
    hold: 'Hold still. Look at the candle.',
    open: 'Open your mouth.',
    done: 'Done.',
    noFace: 'I cannot see you. More light on your face.',
    jitter: 'Too much movement. Again.',
    again: 'Again',
    skip: 'Skip',
    back: 'Back',
  },

  shelf: {
    heading: 'The shelf',
    play: 'Play',
    back: 'Back',
    locked: 'Locked',
    daily: 'today',
    endless: 'the long tape',
    dailyBlurb: 'One tape a day. The same tape for everyone.',
    dailyDone: 'Today is recorded. Playing it again is practice.',
    endlessBlurb: 'It does not end.',
    candles: (n: number, of: number): string => `${n}/${of} candles`,
    best: (score: number): string => `best ${score.toLocaleString('en-US')}`,
  },

  insert: {
    tracking: 'TRACKING…',
    sp: 'SP',
    /** The whole of the instructions (OVERHAUL 8): the diagram, and this. */
    howTo: 'Small candles cross your face to reach the door. Keep your mouth shut.',
    pressKey: 'Press any key',
    objective: (spawned: number): string =>
      `${spawned} Wick${spawned === 1 ? '' : 's'}. Lose more than half and the tape is lost.`,
    /**
     * Assist controls. tests/face/assistControls.test.ts checks every key here
     * against the real bindings in AssistInput.
     */
    assistKeys:
      'Mouse moves your face · Space opens the Maw · Shift raises brows · B blinks · L smiles · ' +
      '↑↓ lean, ←→ or wheel tilt · P or Esc pauses',
  },

  hud: {
    tracking: 'TRACKING…',
    pause: 'Pause',
  },

  rewind: '◀◀ REW',

  pause: {
    heading: 'PAUSE ‖',
    resume: 'Resume',
    restart: 'Restart',
    settings: 'Settings',
    mainMenu: 'Main menu',
  },

  results: {
    saved: 'TAPE SAVED',
    lost: 'TAPE LOST',
    next: 'Next tape',
    retry: 'Try again',
    replay: 'Again',
    shelf: 'Tape shelf',
    mainMenu: 'Main menu',
    clip: 'Save clip',
    discard: 'Discard',
    save: 'Save',
    practice: 'Practice. The first attempt is the one that counts.',
    newBest: 'New best.',
    score: 'score',
    savedOf: (saved: number, spawned: number): string => `${saved} of ${spawned} saved`,
  },

  /** The one line under the stamp, by how the run went. */
  stampLine: {
    'TAPE LOST': 'you let it in.',
    'KEPT STILL': 'it did not notice you.',
    'THE MAW AWOKE': 'your mouth opened. they saw it.',
    'LIGHTS OUT': 'every light went out.',
    COMPOSED: 'not one of them lost. not a sound.',
    CRACKED: 'all of them, and you nearly broke.',
  } satisfies Record<Stamp, string>,

  /** A second loss line, for variety: the tape remembers. */
  lostLines: ['you let it in.', 'the tape remembers.', 'it has your face now.'],

  settings: {
    heading: 'Settings',
    volume: 'Volume',
    music: 'Music',
    sfx: 'Sound',
    scares: 'Scares',
    scaresHint: 'Off means no scares, no sudden sounds and no sudden images. Anywhere.',
    effects: 'Reduce effects',
    effectsHint: 'No flicker, colour split, wobble or shake.',
    filter: 'Camera filter',
    filterHint: 'INK draws no picture of you. Contour lines only.',
    thermalLocked: 'THERMAL unlocks at 12 candles.',
    recording: 'Clip recording',
    recordingHint: 'Off unless you turn it on. Kept in memory, shown to you first, saved only if you choose.',
    recordingUnsupported: 'Not available in this browser.',
    back: 'Back',
    on: 'On',
    off: 'Off',
    reset: 'Erase progress',
    resetConfirm: 'Erase every tape? This is the only copy.',
    resetYes: 'Erase',
    resetNo: 'Keep',
    resetDone: 'Erased.',
  },

  ending: {
    line: 'thank you for keeping still.',
    credits: 'FACEPLANT · no servers · no accounts · nothing uploaded',
    mainMenu: 'Main menu',
  },

  credits: {
    lines: [
      'FACEPLANT',
      'a found tape',
      'type: IM Fell English SC, VT323, Inter',
      'face tracking: MediaPipe, on this device',
      'every sound made for this tape',
    ],
    back: 'Back',
  },
} as const;
