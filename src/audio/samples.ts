/**
 * The sound library (docs/OVERHAUL.md section 6.2), rendered from nothing.
 *
 * The brief asked for CC0 recordings from Freesound, OpenGameArt and Kenney.
 * None of those sites could be reached from the machine this was built on,
 * and no encoder (ffmpeg, opusenc, lame) was installed to convert them if
 * they could. So every entry in the table is synthesised here instead -
 * breathing from shaped noise, wood creaks from stick-slip pulses through
 * resonant bands, whispers from noise pushed through moving vowel formants,
 * the scream from a formant-filtered throat pitched down four semitones.
 * They are original work, so CC0 holds trivially, nothing ships as a file and
 * nothing is fetched. A real CC0 recording can replace any of them later: the
 * mixer only ever asks this module for a buffer by name.
 *
 * Every sound is normalised to -14 LUFS, or quieter where its peak would
 * otherwise pass -6 dBFS; scare sounds attack over 50 ms or more. Both are
 * measured by tests/audio/samples.test.ts.
 */

import {
  biquad,
  brown,
  envelope,
  fadeEnds,
  makeLoop,
  mixInto,
  normalise,
  osc,
  resample,
  reverse,
  rng,
  saturate,
  shape,
  silence,
  white,
  type Signal,
} from './dsp.ts';

export type Bus = 'ambient' | 'music' | 'sfx' | 'scare';

export type SampleName =
  | 'drone'
  | 'roomTone'
  | 'tapeHiss'
  | 'creak'
  | 'breath'
  | 'whisper'
  | 'whisperRev'
  | 'heartbeat'
  | 'screamA'
  | 'shriekB'
  | 'screamTail'
  | 'subBoom'
  | 'metalScrape'
  | 'tapeStop'
  | 'tapeRewind'
  | 'vhsInsert'
  | 'candleSnuff'
  | 'gulp'
  | 'mawGroan'
  | 'bell'
  | 'pianoLow'
  | 'uiClick'
  | 'uiClunk'
  | 'musicBox';

export interface SampleSpec {
  bus: Bus;
  loop: boolean;
  /** Scare sounds: muted with Scares off, and held to the slow-attack rule. */
  scare: boolean;
  render: (rate: number) => Signal;
}

/** The loudness every sound is normalised to (OVERHAUL 6.1), LUFS. */
export const TARGET_LUFS = -14;
/** No sound's own peak passes this, dBFS (invariant 6). */
export const PEAK_DBFS = -6;
/** Scare layers ramp up over at least this long, seconds. Invariant 6 floor is 30 ms. */
export const SCARE_ATTACK_S = 0.06;

const ST = (n: number): number => Math.pow(2, n / 12);

/** A breath of noise through a band that moves: inhale rises, exhale falls. */
function breathOnce(rate: number, seconds: number, fromHz: number, toHz: number, seed: number): Signal {
  const n = white(rate, seconds, seed);
  biquad(n, rate, 'bandpass', (t) => fromHz + (toHz - fromHz) * (t / seconds), 1.4);
  const body = brown(rate, seconds, seed + 1);
  biquad(body, rate, 'lowpass', 420);
  mixInto(n, body, rate, 0, 1.6);
  return envelope(n, rate, seconds * 0.35, seconds * 0.15, seconds * 0.5);
}

/** Vowel formants (F1, F2) for the whisper's syllables. */
const VOWELS: readonly (readonly [number, number])[] = [
  [730, 1090],
  [530, 1840],
  [270, 2290],
  [570, 840],
  [440, 1020],
  [300, 870],
];

function whisperRaw(rate: number, seconds: number, seed: number): Signal {
  const r = rng(seed);
  const out = silence(rate, seconds);
  let t = 0.05;
  while (t < seconds - 0.2) {
    const syl = 0.12 + r() * 0.16;
    const v = VOWELS[Math.floor(r() * VOWELS.length)] ?? [500, 1500];
    const a = white(rate, syl, seed + Math.floor(t * 1000));
    const b = a.slice();
    biquad(a, rate, 'bandpass', v[0], 6);
    biquad(b, rate, 'bandpass', v[1], 8);
    mixInto(a, b, rate, 0, 0.8);
    envelope(a, rate, syl * 0.3, syl * 0.2, syl * 0.5);
    mixInto(out, a, rate, t, 1);
    // An "s" or "sh" now and then.
    if (r() < 0.35) {
      const s = white(rate, 0.09, seed + 7 + Math.floor(t * 100));
      biquad(s, rate, 'highpass', 4200 + r() * 1800, 0.9);
      envelope(s, rate, 0.02, 0.02, 0.05);
      mixInto(out, s, rate, t + syl * 0.8, 0.5);
    }
    t += syl + (r() < 0.2 ? 0.18 : 0.03);
  }
  return out;
}

/** A throat: a buzzing source through vowel formants, with vibrato and grit. */
function throat(rate: number, seconds: number, hz: (t: number) => number, formants: readonly number[], drive: number, seed: number): Signal {
  const r = rng(seed);
  const jitter = (t: number): number => 1 + 0.012 * Math.sin(t * 2 * Math.PI * 6.3) + 0.006 * Math.sin(t * 2 * Math.PI * (11 + r()));
  const src = osc(rate, seconds, 'saw', (t) => hz(t) * jitter(t));
  const breath = white(rate, seconds, seed + 3);
  biquad(breath, rate, 'highpass', 900);
  mixInto(src, breath, rate, 0, 0.25);
  saturate(src, drive);
  const out = silence(rate, seconds);
  formants.forEach((f, i) => {
    const band = src.slice();
    biquad(band, rate, 'bandpass', f, 5 + i * 2);
    mixInto(out, band, rate, 0, 1 / (i + 1));
  });
  return out;
}

export const SAMPLES: Record<SampleName, SampleSpec> = {
  // --- ambience ------------------------------------------------------------

  /**
   * The level drone: a minor second beating against itself and a tritone
   * above, so it is never at rest. Every frequency is a whole number of
   * cycles in 16 s, so the loop point is invisible. Left bright: the mixer
   * closes a low-pass over it and opens it as composure falls.
   */
  drone: {
    bus: 'ambient',
    loop: true,
    scare: false,
    render: (rate) => {
      const len = 16;
      // Rendered 2 s long and crossfaded back into its own start.
      const out = silence(rate, len + 2);
      for (const [hz, g] of [
        [41.25, 1],
        [43.5, 0.8],
        [58.25, 0.45],
        [82.5, 0.25],
      ] as const) {
        mixInto(out, osc(rate, len + 2, 'saw', hz), rate, 0, g);
      }
      biquad(out, rate, 'lowpass', 1400, 0.9);
      const rumble = brown(rate, len + 2, 11);
      biquad(rumble, rate, 'lowpass', 110);
      mixInto(out, rumble, rate, 0, 3);
      // Two slow swells per loop.
      shape(out, rate, (t) => 0.75 + 0.25 * Math.sin((t / len) * 4 * Math.PI));
      return normalise(makeLoop(out, rate, 2), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Room tone with wind somewhere in the house: under everything. */
  roomTone: {
    bus: 'ambient',
    loop: true,
    scare: false,
    render: (rate) => {
      const len = 12;
      const room = brown(rate, len + 2, 21);
      biquad(room, rate, 'lowpass', 380);
      const wind = white(rate, len + 2, 22);
      biquad(wind, rate, 'bandpass', (t) => 420 + 160 * Math.sin(t * 0.7), 2.2);
      shape(wind, rate, (t) => 0.4 + 0.6 * Math.pow(Math.sin(t * 0.45) * 0.5 + 0.5, 2));
      mixInto(room, wind, rate, 0, 0.5);
      return normalise(makeLoop(room, rate, 2), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Tape hiss, for under the OSD. */
  tapeHiss: {
    bus: 'ambient',
    loop: true,
    scare: false,
    render: (rate) => {
      const h = white(rate, 5, 31);
      biquad(h, rate, 'highpass', 2600, 0.6);
      biquad(h, rate, 'peak', 6000, 1, 3);
      return normalise(makeLoop(h, rate, 1), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** A long wood creak: stick-slip pulses ringing through the boards. */
  creak: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 1.7;
      const r = rng(41);
      const pulses = silence(rate, len);
      let t = 0.05;
      while (t < len - 0.2) {
        const i = Math.round(t * rate);
        pulses[i] = 0.6 + r() * 0.4;
        // Stick-slip: the pulse rate wanders between about 25 and 70 per second.
        const hz = 25 + 45 * (0.5 + 0.5 * Math.sin(t * 3.1)) + r() * 8;
        t += 1 / hz;
      }
      const out = silence(rate, len);
      for (const [f, q, g] of [
        [420, 14, 1],
        [1130, 10, 0.6],
        [2380, 8, 0.3],
      ] as const) {
        const b = pulses.slice();
        biquad(b, rate, 'bandpass', f, q);
        mixInto(out, b, rate, 0, g);
      }
      envelope(out, rate, 0.18, 0.9, 0.6);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Heavy breathing, close: in, out. */
  breath: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const out = silence(rate, 3.4);
      mixInto(out, breathOnce(rate, 1.2, 900, 1700, 51), rate, 0.05, 0.8);
      mixInto(out, breathOnce(rate, 1.7, 1300, 500, 52), rate, 1.35, 1);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS - 2, PEAK_DBFS);
    },
  },

  /** Unintelligible whispering. */
  whisper: {
    bus: 'ambient',
    loop: false,
    scare: false,
    render: (rate) => {
      const w = whisperRaw(rate, 2.6, 61);
      biquad(w, rate, 'lowpass', 6000);
      envelope(w, rate, 0.25, 1.6, 0.7);
      return normalise(fadeEnds(w, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Whispers in reverse, filtered, for the thing behind you. */
  whisperRev: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const w = reverse(whisperRaw(rate, 2.8, 71));
      biquad(w, rate, 'bandpass', 1400, 0.8);
      envelope(w, rate, 0.4, 1.6, 0.8);
      return normalise(fadeEnds(w, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** One heartbeat: lub, dub. */
  heartbeat: {
    bus: 'ambient',
    loop: false,
    scare: false,
    render: (rate) => {
      const out = silence(rate, 0.9);
      const lub = osc(rate, 0.2, 'sine', (t) => 58 - 90 * t);
      envelope(lub, rate, 0.012, 0.03, 0.15);
      const dub = osc(rate, 0.18, 'sine', (t) => 66 - 100 * t);
      envelope(dub, rate, 0.012, 0.02, 0.14);
      const thump = brown(rate, 0.2, 81);
      biquad(thump, rate, 'lowpass', 150);
      envelope(thump, rate, 0.01, 0.02, 0.15);
      mixInto(out, lub, rate, 0.02, 1);
      mixInto(out, thump, rate, 0.02, 2);
      mixInto(out, dub, rate, 0.27, 0.75);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  // --- the Watcher (OVERHAUL 5) ----------------------------------------------

  /** Scream, layer A: a human-ish throat, pitched down four semitones. */
  screamA: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const len = 2.3;
      const raw = throat(rate, len, (t) => 640 + 140 * Math.sin(Math.min(1, t / 0.5) * Math.PI * 0.5) - 120 * t, [820, 1250, 2650], 2.6, 91);
      envelope(raw, rate, SCARE_ATTACK_S, 1.3, 0.9);
      const down = resample(raw, ST(-4), rate);
      return normalise(fadeEnds(down, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Scream, layer B: a short animal shriek, pitched up. */
  shriekB: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const len = 0.95;
      const raw = throat(rate, len, (t) => 1100 + 700 * Math.sin(t * 9) - 400 * t, [2200, 3400], 4.5, 101);
      envelope(raw, rate, SCARE_ATTACK_S, 0.35, 0.5);
      const up = resample(raw, ST(5), rate);
      return normalise(fadeEnds(up, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Scream, layer C: a distorted scream tail, reversed, so it swells instead of dying. */
  screamTail: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const len = 1.9;
      const raw = throat(rate, len, (t) => 520 - 160 * t, [700, 1150, 2400], 5, 111);
      envelope(raw, rate, 0.005, 0.1, len - 0.2);
      const rev = reverse(raw);
      envelope(rev, rate, SCARE_ATTACK_S * 3, len, 0.15);
      return normalise(fadeEnds(rev, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** The sub boom under the lunge, at 40 Hz, felt more than heard. */
  subBoom: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const len = 2.2;
      const out = osc(rate, len, 'sine', (t) => 40 + 24 * Math.exp(-t * 6));
      const body = brown(rate, len, 121);
      biquad(body, rate, 'lowpass', 90);
      mixInto(out, body, rate, 0, 2);
      envelope(out, rate, SCARE_ATTACK_S, 0.25, 1.8);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** Metal dragged over metal: inharmonic rings driven by friction. */
  metalScrape: {
    bus: 'scare',
    loop: false,
    scare: true,
    render: (rate) => {
      const len = 1.7;
      const r = rng(131);
      const drive = white(rate, len, 132);
      // Friction: the drive stutters at an irregular rate.
      shape(drive, rate, (t) => 0.5 + 0.5 * Math.sin(t * 2 * Math.PI * (34 + 9 * Math.sin(t * 5))) * (0.7 + 0.3 * r()));
      const out = silence(rate, len);
      for (const [f, q, g] of [
        [1820, 30, 1],
        [2710, 34, 0.8],
        [3930, 40, 0.6],
        [5170, 44, 0.45],
      ] as const) {
        const b = drive.slice();
        biquad(b, rate, 'bandpass', (t) => f * (1 + 0.03 * t), q);
        mixInto(out, b, rate, 0, g);
      }
      envelope(out, rate, SCARE_ATTACK_S, 0.8, 0.8);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  // --- the tape --------------------------------------------------------------

  /** The tape stopping: everything slows and drops in pitch, then nothing. */
  tapeStop: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const src = osc(rate, 3, 'saw', 196);
      mixInto(src, osc(rate, 3, 'saw', 233), rate, 0, 0.6);
      biquad(src, rate, 'lowpass', 900);
      const hiss = white(rate, 3, 141);
      biquad(hiss, rate, 'highpass', 3000);
      mixInto(src, hiss, rate, 0, 0.3);
      // Winds down to nothing over about 1.2 s, the way a deck's capstan does.
      const slowed = resample(src, (t) => Math.max(0.03, 1 - t / 1.25), rate, 1.5);
      envelope(slowed, rate, 0.02, 0.35, Math.max(0.2, slowed.length / rate - 0.4));
      return normalise(fadeEnds(slowed, rate), rate, TARGET_LUFS - 4, PEAK_DBFS);
    },
  },

  /** Rewinding: the high chatter of tape running backwards, 0.8 s. */
  tapeRewind: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 0.85;
      const n = white(rate, len, 151);
      biquad(n, rate, 'bandpass', (t) => 1800 + 5200 * (t / len), 3);
      shape(n, rate, (t) => 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 38));
      const motor = osc(rate, len, 'saw', (t) => 700 + 800 * (t / len));
      biquad(motor, rate, 'lowpass', 2000);
      mixInto(n, motor, rate, 0, 0.2);
      envelope(n, rate, 0.03, len - 0.15, 0.1);
      return normalise(fadeEnds(n, rate), rate, TARGET_LUFS - 4, PEAK_DBFS);
    },
  },

  /** A VHS cassette going in: the clunk, the motor, the latch. */
  vhsInsert: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const out = silence(rate, 1.4);
      const clunk = osc(rate, 0.25, 'sine', (t) => 110 - 160 * t);
      envelope(clunk, rate, 0.004, 0.02, 0.2);
      const click = white(rate, 0.03, 161);
      biquad(click, rate, 'highpass', 2500);
      envelope(click, rate, 0.002, 0.005, 0.02);
      const motor = osc(rate, 0.8, 'saw', (t) => 90 + 40 * t);
      biquad(motor, rate, 'lowpass', 500);
      shape(motor, rate, (t) => 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 14));
      envelope(motor, rate, 0.1, 0.5, 0.2);
      mixInto(out, clunk, rate, 0.01, 1);
      mixInto(out, click, rate, 0.01, 0.6);
      mixInto(out, motor, rate, 0.2, 0.35);
      mixInto(out, click, rate, 1.1, 0.8);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS - 3, PEAK_DBFS);
    },
  },

  // --- the Wicks and the Maw --------------------------------------------------

  /** A candle snuffed: a small puff and a fizz. */
  candleSnuff: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const puff = white(rate, 0.5, 171);
      biquad(puff, rate, 'bandpass', 1200, 1.2);
      envelope(puff, rate, 0.01, 0.03, 0.3);
      const fizz = white(rate, 0.5, 172);
      biquad(fizz, rate, 'highpass', 5500);
      shape(fizz, rate, (t) => (Math.sin(t * 2 * Math.PI * 47) > 0.6 ? 1 : 0.15) * Math.exp(-t * 6));
      mixInto(puff, fizz, rate, 0, 0.4);
      return normalise(fadeEnds(puff, rate), rate, TARGET_LUFS - 4, PEAK_DBFS);
    },
  },

  /** A wet swallow. */
  gulp: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 0.7;
      const throatSweep = osc(rate, len, 'sine', (t) => 260 * Math.exp(-t * 2.6) + 60);
      envelope(throatSweep, rate, 0.02, 0.1, 0.45);
      const wet = white(rate, len, 181);
      biquad(wet, rate, 'bandpass', (t) => 520 - 250 * t, 6);
      shape(wet, rate, (t) => (0.5 + 0.5 * Math.sin(t * 2 * Math.PI * 23)) * Math.exp(-t * 4));
      mixInto(throatSweep, wet, rate, 0, 1.4);
      return normalise(fadeEnds(throatSweep, rate), rate, TARGET_LUFS - 2, PEAK_DBFS);
    },
  },

  /** The Maw opening: a wet, low groan. Kept quiet by the mixer. */
  mawGroan: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 1.6;
      const g = throat(rate, len, (t) => 72 - 12 * t, [300, 640], 1.6, 191);
      biquad(g, rate, 'lowpass', 900);
      envelope(g, rate, 0.25, 0.6, 0.7);
      return normalise(fadeEnds(g, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  /** A Wick saved: a soft bell, warm but sad - its partials sit slightly flat. */
  bell: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 2.6;
      const out = silence(rate, len);
      const f = 392;
      for (const [m, g, d] of [
        [1, 1, 1.6],
        [2.38, 0.45, 0.9],
        [2.76, 0.3, 0.7],
        [5.4, 0.12, 0.3],
      ] as const) {
        const p = osc(rate, len, 'sine', f * m);
        shape(p, rate, (t) => Math.exp(-t / d));
        mixInto(out, p, rate, 0, g);
      }
      envelope(out, rate, 0.006, 0, len - 0.01);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS - 4, PEAK_DBFS);
    },
  },

  /** One low piano note, for the results: A1, with a little hammer and string stretch. */
  pianoLow: {
    bus: 'music',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 4.5;
      const f = 55;
      const out = silence(rate, len);
      for (let n = 1; n <= 9; n++) {
        const stretch = n * Math.sqrt(1 + 0.0004 * n * n);
        const p = osc(rate, len, 'sine', f * stretch);
        shape(p, rate, (t) => Math.exp(-t * (0.6 + n * 0.25)));
        mixInto(out, p, rate, 0, 1 / n);
      }
      const hammer = white(rate, 0.05, 201);
      biquad(hammer, rate, 'lowpass', 1500);
      envelope(hammer, rate, 0.002, 0.005, 0.04);
      mixInto(out, hammer, rate, 0, 0.3);
      envelope(out, rate, 0.004, 0, len - 0.01);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS, PEAK_DBFS);
    },
  },

  // --- the interface ----------------------------------------------------------

  /** Focus: a soft tape-counter click. */
  uiClick: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const c = white(rate, 0.05, 211);
      biquad(c, rate, 'bandpass', 2600, 2);
      envelope(c, rate, 0.001, 0.002, 0.03);
      return normalise(fadeEnds(c, rate, 1), rate, TARGET_LUFS - 10, PEAK_DBFS - 10);
    },
  },

  /** Confirm: a heavy mechanical clunk, like a deck's play key. */
  uiClunk: {
    bus: 'sfx',
    loop: false,
    scare: false,
    render: (rate) => {
      const out = silence(rate, 0.4);
      const body = osc(rate, 0.3, 'sine', (t) => 95 - 120 * t);
      envelope(body, rate, 0.003, 0.02, 0.22);
      const latch = white(rate, 0.04, 221);
      biquad(latch, rate, 'bandpass', 1800, 1.5);
      envelope(latch, rate, 0.001, 0.004, 0.03);
      const rattle = white(rate, 0.12, 222);
      biquad(rattle, rate, 'bandpass', 3200, 4);
      envelope(rattle, rate, 0.002, 0.01, 0.09);
      mixInto(out, body, rate, 0.005, 1);
      mixInto(out, latch, rate, 0, 0.7);
      mixInto(out, rattle, rate, 0.03, 0.25);
      return normalise(fadeEnds(out, rate, 1), rate, TARGET_LUFS - 6, PEAK_DBFS - 4);
    },
  },

  /** One music-box tine at A5; the mixer pitches it, detuned ±30 cents. */
  musicBox: {
    bus: 'music',
    loop: false,
    scare: false,
    render: (rate) => {
      const len = 2.8;
      const out = silence(rate, len);
      const f = 880;
      for (const [m, g, d] of [
        [1, 1, 1.4],
        [2.756, 0.32, 0.5],
        [5.404, 0.12, 0.2],
      ] as const) {
        const p = osc(rate, len, 'sine', f * m);
        shape(p, rate, (t) => Math.exp(-t / d));
        mixInto(out, p, rate, 0, g);
      }
      envelope(out, rate, 0.003, 0, len - 0.01);
      return normalise(fadeEnds(out, rate), rate, TARGET_LUFS - 6, PEAK_DBFS);
    },
  },
};

export const SAMPLE_NAMES = Object.keys(SAMPLES) as SampleName[];

/** Renders one sound. Pure: the same name and rate always give the same samples. */
export function renderSample(name: SampleName, rate: number): Signal {
  return SAMPLES[name].render(rate);
}
