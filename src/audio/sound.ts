/**
 * Audio (SPEC section 14, CLAUDE.md invariant 6).
 *
 * **Every sound is synthesised in Web Audio.** No audio files ship at all.
 * That was a deliberate change from SPEC v1.0's "CC0 sounds in public/audio":
 * it removes the whole licence-audit surface, removes a megabyte of assets,
 * removes any possibility of a fetch at runtime, and lets the Wick squeaks be
 * pitched per Wick so a crowd sounds like a crowd rather than one clip
 * retriggered.
 *
 * Safety (invariant 6), enforced by construction rather than by care:
 *   - everything routes through a master limiter set to -6 dBFS;
 *   - no envelope has an attack under 30 ms for scare sounds;
 *   - nothing plays at all until the player's first gesture, because browsers
 *     require that and because a game that makes noise before you touch it is
 *     rude.
 */

import { config } from '../config.ts';
import {
  BEATS_PER_CHORD,
  THEME_BEAT_S,
  chordAt,
  chordStartsAt,
  melodyAt,
  midiToHz,
  whisperAt,
  windSwellAt,
} from './theme.ts';

/**
 * Every layer of the Watcher's sequence attacks at least this slowly, in
 * seconds. Invariant 6 sets the floor at 30 ms; this is past it. Exported so a
 * test can hold every scare sound to it.
 */
export const WATCHER_ATTACK_S = Math.max(config.audio.scareMinAttackMs, 40) / 1000;

export type SoundName =
  | 'squeak'
  | 'gulp'
  | 'flameOut'
  | 'gateChime'
  | 'skitter'
  | 'flick'
  | 'thud'
  | 'slide'
  | 'candleTone'
  | 'offering'
  | 'processionStep'
  | 'yawn'
  | 'stinger'
  | 'uiMove'
  | 'uiPick'
  | 'watcherShout'
  | 'tapeStop';

/** dBFS to linear gain. */
function db(x: number): number {
  return Math.pow(10, x / 20);
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private bedGain: GainNode | null = null;
  private bedNodes: AudioScheduledSourceNode[] = [];
  private noiseBuffer: AudioBuffer | null = null;
  private volume: number = config.audio.defaultVolume;
  private muted = false;
  private started = false;
  private themeGain: GainNode | null = null;
  private themeTimer: ReturnType<typeof setInterval> | null = null;
  private themeBeat = 0;
  private themeNextAt = 0;
  /** The menus asked for music before a click let the browser allow it. */
  private themeWanted = false;

  /** Safe to call repeatedly; the first user gesture is what actually starts it. */
  async resume(): Promise<void> {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      this.ctx = new Ctor();
      this.build();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.started = true;
    // The title can ask for its music before the browser will let anything
    // play (autoplay policy needs a click first). It is held until now.
    if (this.themeWanted && this.themeTimer === null) this.beginTheme();
  }

  private build(): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    // The limiter is the last thing before the destination, and nothing may
    // bypass it. threshold is the configured ceiling; a high ratio and a fast
    // release make it a limiter rather than a compressor.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = config.audio.limiterCeilingDbfs;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.limiter = limiter;

    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(limiter);
    this.master = master;

    // Noise buffer, reused by every hiss, skitter and gulp.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master !== null && this.ctx !== null) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.setVolume(this.volume);
  }

  /** The tape bed: hiss plus a slow drone (SPEC section 14). */
  startBed(): void {
    const ctx = this.ctx;
    const master = this.master;
    const noise = this.noiseBuffer;
    if (ctx === null || master === null || noise === null || this.bedGain !== null) return;

    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(master);
    bed.gain.setTargetAtTime(db(-26), ctx.currentTime, 1.5);
    this.bedGain = bed;

    // Tape hiss: white noise through a gentle band-pass so it sits under
    // everything instead of on top of it.
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hissFilter = ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 3200;
    hissFilter.Q.value = 0.5;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.5;
    hiss.connect(hissFilter).connect(hissGain).connect(bed);
    hiss.start();
    this.bedNodes.push(hiss);

    // A low drone, two detuned oscillators so it beats slowly.
    for (const freq of [55, 55.7]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.34;
      osc.connect(g).connect(bed);
      osc.start();
      this.bedNodes.push(osc);
    }

    // A fifth above, very quiet, to keep it from sounding like a test tone.
    const air = ctx.createOscillator();
    air.type = 'triangle';
    air.frequency.value = 82.5;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.06;
    air.connect(airGain).connect(bed);
    air.start();
    this.bedNodes.push(air);
  }

  stopBed(): void {
    const ctx = this.ctx;
    if (ctx !== null && this.bedGain !== null) {
      this.bedGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    }
    for (const n of this.bedNodes) {
      try {
        n.stop(ctx === null ? 0 : ctx.currentTime + 0.8);
      } catch {
        /* already stopped */
      }
    }
    this.bedNodes = [];
    this.bedGain = null;
  }

  /** Ducks the bed, used while a results screen is up. */
  duck(amount = 0.35): void {
    const ctx = this.ctx;
    if (ctx === null || this.bedGain === null) return;
    this.bedGain.gain.setTargetAtTime(db(-26) * amount, ctx.currentTime, 0.2);
  }

  unduck(): void {
    const ctx = this.ctx;
    if (ctx === null || this.bedGain === null) return;
    this.bedGain.gain.setTargetAtTime(db(-26), ctx.currentTime, 0.4);
  }

  /**
   * @param variation 0..1, used to pitch per-Wick sounds so a crowd of them is
   *   a crowd and not one sample played eight times.
   */
  play(name: SoundName, variation = 0.5): void {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;

    const t = ctx.currentTime;
    const v = Math.min(1, Math.max(0, variation));

    switch (name) {
      case 'squeak': {
        // A tiny pitched babble, the closest thing to a voice the Wicks get.
        const lo = config.audio.squeakMinHz;
        const hi = config.audio.squeakMaxHz;
        const f = lo + (hi - lo) * v;
        this.blip(t, f, f * 1.4, 0.09, db(-20), 'triangle');
        this.blip(t + 0.07, f * 0.86, f * 0.7, 0.07, db(-24), 'triangle');
        break;
      }
      case 'gulp': {
        // Pitch *down* fast, then a soft noise burst: swallowing, not splatting.
        this.blip(t, 300, 70, 0.22, db(-12), 'sine');
        this.noise(t + 0.03, 0.1, 480, db(-20), 'lowpass');
        break;
      }
      case 'flameOut':
        this.noise(t, 0.3, 2200, db(-18), 'bandpass');
        this.blip(t, 520, 180, 0.14, db(-26), 'sine');
        break;
      case 'gateChime': {
        // A small perfect fifth: the only unambiguously nice sound in the game.
        this.blip(t, 784, 784, 0.5, db(-16), 'sine');
        this.blip(t + 0.04, 1176, 1176, 0.42, db(-20), 'sine');
        break;
      }
      case 'skitter':
        for (let i = 0; i < 5; i++) this.noise(t + i * 0.035, 0.02, 5200, db(-28), 'highpass');
        break;
      case 'flick':
        this.blip(t, 180, 900, 0.16, db(-16), 'sine');
        break;
      case 'thud':
        this.blip(t, 150, 60, 0.1, db(-24), 'sine');
        break;
      case 'slide':
        this.noise(t, 0.26, 1600 + v * 1200, db(-26), 'bandpass');
        break;
      case 'candleTone': {
        // Results screen: candles light one by one, each a step up the scale.
        const steps = [523.25, 659.25, 783.99];
        const f = steps[Math.min(2, Math.round(v * 2))] ?? 523.25;
        this.blip(t, f, f, 0.6, db(-16), 'sine');
        break;
      }
      case 'offering':
        // U2 - the reward sound for using your mouth on purpose. Rises.
        this.blip(t, 220, 660, 0.3, db(-14), 'triangle');
        this.blip(t + 0.1, 660, 990, 0.35, db(-18), 'sine');
        break;
      case 'processionStep': {
        // U3 - climbs with the multiplier, so you hear the combo build.
        const f = 392 * Math.pow(2, Math.round(v * 7) / 12);
        this.blip(t, f, f, 0.4, db(-18), 'sine');
        break;
      }
      case 'yawn':
        // U1 - THE YAWN. Slow and inevitable, never a jump-scare.
        this.blip(t, 110, 48, 0.9, db(-14), 'sine', 0.12);
        this.noise(t + 0.05, 0.6, 700, db(-22), 'lowpass', 0.12);
        break;
      case 'stinger':
        // Invariant 6: scare sounds get a 30 ms minimum attack. No clicks.
        this.blip(t, 320, 120, 0.7, db(-12), 'sawtooth', config.audio.scareMinAttackMs / 1000);
        this.noise(t, 0.5, 1800, db(-18), 'bandpass', config.audio.scareMinAttackMs / 1000);
        break;
      case 'watcherShout':
        this.scream(t, 1);
        break;
      case 'uiMove':
        this.blip(t, 440, 440, 0.04, db(-30), 'square');
        break;
      case 'uiPick':
        this.blip(t, 660, 880, 0.1, db(-24), 'square');
        break;
      case 'tapeStop':
        this.noise(t, 0.4, 900, db(-20), 'lowpass');
        this.blip(t, 90, 40, 0.5, db(-22), 'sine');
        break;
    }
  }

  /** A pitched blip with an exponential frequency sweep. */
  private blip(
    at: number,
    fromHz: number,
    toHz: number,
    durS: number,
    peak: number,
    type: OscillatorType,
    attackS = 0.006,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, fromHz), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + durS);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS);

    osc.connect(g).connect(dest ?? master);
    osc.start(at);
    osc.stop(at + durS + 0.02);
  }

  private noise(
    at: number,
    durS: number,
    filterHz: number,
    peak: number,
    filterType: BiquadFilterType,
    attackS = 0.006,
    dest?: AudioNode,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    const buf = this.noiseBuffer;
    if (ctx === null || master === null || buf === null) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterHz;
    filter.Q.value = 1;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS);

    src.connect(filter).connect(g).connect(dest ?? master);
    src.start(at);
    src.stop(at + durS + 0.02);
  }

  // ------------------------------------------------------------ the Watcher

  /**
   * The whole of THE WATCHER, scheduled against the audio clock so that it
   * lands on the picture instead of drifting off it.
   *
   * It used to be a single shout fired the instant the event arrived - which
   * was half a second *before* the face showed up, so the scream had finished
   * its attack by the time there was anything to scream at. A scare is a shape
   * in time: dread first, then the hit.
   *
   *   - a heartbeat that quickens, from the moment the dark falls;
   *   - a drone built on a minor second and a tritone, its filter opening
   *     as the face approaches;
   *   - whispers that arrive faster and faster;
   *   - a hole of near-silence just before the hit, because the jolt is the
   *     contrast, not the volume;
   *   - then the scream.
   *
   * @param leadMs how long until the face is on screen: the stare plus the
   *   approach, which is longer with Reduce effects on.
   * @param pitch the face's own register (`voicePitch`): each Watcher is a
   *   different creature and does not sound like the last one.
   */
  watcherSequence(leadMs: number, pitch = 1): void {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;

    const t = ctx.currentTime;
    const riseS = Math.max(0.4, leadMs / 1000);
    const hitAt = t + riseS;
    const attack = WATCHER_ATTACK_S;

    // Heartbeat, quickening: two thumps, a gap, two thumps, a shorter gap.
    let beatAt = t;
    let gap = 0.62;
    while (beatAt < hitAt - 0.2) {
      this.blip(beatAt, 62, 38, 0.24, db(-12), 'sine', attack);
      this.blip(beatAt + 0.17, 56, 34, 0.22, db(-14), 'sine', attack);
      beatAt += gap;
      gap = Math.max(0.3, gap * 0.86);
    }

    // The drone. Minor second for the beating, tritone for the wrongness.
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, t);
    droneGain.gain.linearRampToValueAtTime(db(-17), hitAt - 0.1);
    // The hole: gone just before the hit, so the hit has something to land on.
    droneGain.gain.linearRampToValueAtTime(0.0001, hitAt - 0.04);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.Q.value = 3;
    droneFilter.frequency.setValueAtTime(150, t);
    droneFilter.frequency.exponentialRampToValueAtTime(2400, hitAt - 0.06);
    droneFilter.connect(droneGain).connect(master);
    for (const hz of [98, 103.8, 138.6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz * pitch;
      o.connect(droneFilter);
      o.start(t);
      o.stop(hitAt);
    }

    // Whispers, closer together each time.
    for (const f of [0.08, 0.3, 0.5, 0.66, 0.78, 0.87, 0.93]) {
      this.noise(t + riseS * f, 0.45, 3400 + f * 1800, db(-26), 'bandpass', 0.12);
    }

    this.scream(hitAt, pitch);
  }

  /** A soft-clipping curve, for grit on the voice. */
  private gritCurve(): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 3.2);
    }
    return curve;
  }

  /**
   * One voice with a throat in it: a sawtooth with vibrato, pushed through a
   * soft clipper and two formant filters. Two formants are what turn a buzz
   * into something that sounds like it is shaped by a mouth.
   */
  private voice(
    at: number,
    durS: number,
    fromHz: number,
    toHz: number,
    peak: number,
    attackS: number,
    vibratoHz: number,
    vibratoDepth: number,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(Math.max(20, fromHz), at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + durS);

    const lfo = ctx.createOscillator();
    lfo.frequency.value = vibratoHz;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = vibratoDepth;
    lfo.connect(lfoGain).connect(osc.frequency);

    const grit = ctx.createWaveShaper();
    grit.curve = this.gritCurve();

    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 780;
    f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1400, at);
    f2.frequency.exponentialRampToValueAtTime(1000, at + durS);
    f2.Q.value = 7;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS);

    osc.connect(grit);
    grit.connect(f1).connect(g);
    grit.connect(f2).connect(g);
    g.connect(master);

    osc.start(at);
    lfo.start(at);
    osc.stop(at + durS + 0.05);
    lfo.stop(at + durS + 0.05);
  }

  /**
   * The scream itself. Every layer's attack is `WATCHER_ATTACK_S`, past the
   * 30 ms floor of invariant 6, and everything runs into the limiter - which
   * is the actual guarantee, not any one gain here.
   */
  private scream(at: number, pitch: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null) return;
    const attack = WATCHER_ATTACK_S;

    // Two detuned throats falling from a shriek, and a shriek above them.
    this.voice(at, 1.8, 560 * pitch, 330 * pitch, db(-10), attack, 5.5, 22 * pitch);
    this.voice(at + 0.012, 1.8, 568 * pitch * 1.015, 322 * pitch, db(-12), attack, 6.1, 26 * pitch);
    this.voice(at, 1.2, 1120 * pitch, 700 * pitch, db(-16), attack, 7.2, 40 * pitch);

    // A growl underneath, chopped at 22 Hz so it rasps.
    const growl = ctx.createOscillator();
    growl.type = 'square';
    growl.frequency.setValueAtTime(92 * pitch, at);
    growl.frequency.exponentialRampToValueAtTime(48 * pitch, at + 1.9);
    const growlLow = ctx.createBiquadFilter();
    growlLow.type = 'lowpass';
    growlLow.frequency.value = 420;
    const trem = ctx.createGain();
    trem.gain.value = 0.6;
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 22;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.4;
    tremLfo.connect(tremDepth).connect(trem.gain);
    const growlEnv = ctx.createGain();
    growlEnv.gain.setValueAtTime(0, at);
    growlEnv.gain.linearRampToValueAtTime(db(-9), at + attack);
    growlEnv.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);
    growl.connect(growlLow).connect(trem).connect(growlEnv).connect(master);
    growl.start(at);
    tremLfo.start(at);
    growl.stop(at + 1.95);
    tremLfo.stop(at + 1.95);

    // The wail: a ghost's voice rising over the top, with a cluster of sines
    // a semitone apart behind it. Close intervals beat against each other and
    // the ear reads the beating as something being wrong.
    const wail = ctx.createOscillator();
    wail.type = 'sine';
    wail.frequency.setValueAtTime(880 * pitch, at);
    wail.frequency.exponentialRampToValueAtTime(1480 * pitch, at + 0.9);
    wail.frequency.exponentialRampToValueAtTime(760 * pitch, at + 2.4);
    const wailLfo = ctx.createOscillator();
    wailLfo.frequency.value = 6.5;
    const wailDepth = ctx.createGain();
    wailDepth.gain.value = 28 * pitch;
    wailLfo.connect(wailDepth).connect(wail.frequency);
    const wailEnv = ctx.createGain();
    wailEnv.gain.setValueAtTime(0, at);
    wailEnv.gain.linearRampToValueAtTime(db(-19), at + 0.25);
    wailEnv.gain.exponentialRampToValueAtTime(0.0001, at + 2.4);
    wail.connect(wailEnv).connect(master);
    wail.start(at);
    wailLfo.start(at);
    wail.stop(at + 2.45);
    wailLfo.stop(at + 2.45);
    for (const hz of [330, 349.2, 466.2]) {
      this.blip(at, hz * pitch, hz * pitch * 0.96, 2.6, db(-24), 'sine', 0.4);
    }

    // The hit: sub-bass in the chest, a crack, a rumble that outlasts the voice.
    this.blip(at, 64, 26, 1.4, db(-8), 'sine', attack);
    this.noise(at, 0.5, 1500, db(-13), 'bandpass', attack);
    this.noise(at, 2.4, 260, db(-14), 'lowpass', attack);
    // And breath, after, because it has not finished.
    this.noise(at + 1.0, 2.8, 2200, db(-24), 'bandpass', 0.8);
  }

  // ----------------------------------------------------------- menu theme

  /** Starts the menu music, or queues it until the browser allows sound. */
  startTheme(): void {
    this.themeWanted = true;
    if (this.themeTimer !== null) return;
    if (!this.started || this.ctx === null || this.master === null) return;
    this.beginTheme();
  }

  private beginTheme(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (ctx === null || master === null || this.themeTimer !== null) return;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(master);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 1.6);
    this.themeGain = bus;
    this.themeBeat = 0;
    this.themeNextAt = ctx.currentTime + 0.1;

    this.tickTheme();
    this.themeTimer = setInterval(() => this.tickTheme(), 400);
  }

  /** Schedules whatever beats fall inside the next second and a half. */
  private tickTheme(): void {
    const ctx = this.ctx;
    const bus = this.themeGain;
    if (ctx === null || bus === null) return;
    if (this.themeNextAt < ctx.currentTime) this.themeNextAt = ctx.currentTime + 0.05;
    while (this.themeNextAt < ctx.currentTime + 1.5) {
      this.scheduleThemeBeat(this.themeBeat, this.themeNextAt, bus);
      this.themeBeat++;
      this.themeNextAt += THEME_BEAT_S;
    }
  }

  private scheduleThemeBeat(beat: number, at: number, bus: GainNode): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    // The pad changes on the first beat of a chord and rings across the next.
    if (chordStartsAt(beat)) {
      const lengthS = BEATS_PER_CHORD * THEME_BEAT_S;
      const chord = chordAt(beat);
      for (const note of chord) {
        const hz = midiToHz(note);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, at);
        env.gain.linearRampToValueAtTime(db(-33), at + 2.6);
        env.gain.setValueAtTime(db(-33), at + lengthS - 0.4);
        env.gain.linearRampToValueAtTime(0.0001, at + lengthS + 3);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 640;
        lp.connect(env).connect(bus);
        for (const detune of [-7, 7]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz;
          o.detune.value = detune;
          o.connect(lp);
          o.start(at);
          o.stop(at + lengthS + 3.1);
        }
      }
      // The root, an octave down, felt more than heard.
      const root = chord[0];
      if (root !== undefined) this.blip(at, midiToHz(root - 12), midiToHz(root - 12), lengthS + 1, db(-26), 'sine', 2.2, bus);
    }

    // The music box.
    const note = melodyAt(beat);
    if (note !== null) {
      const hz = midiToHz(note);
      this.blip(at, hz, hz, 2.6, db(-23), 'sine', 0.006, bus);
      // Partials that are not whole multiples are what make a bell a bell
      // instead of a flute.
      this.blip(at, hz * 2.756, hz * 2.756, 1.3, db(-34), 'sine', 0.004, bus);
      this.blip(at, hz * 5.404, hz * 5.404, 0.5, db(-42), 'sine', 0.003, bus);
    }

    if (windSwellAt(beat)) this.noise(at, 6.5, 700, db(-36), 'bandpass', 3, bus);
    if (whisperAt(beat)) this.noise(at + 0.2, 2.6, 4600, db(-40), 'bandpass', 0.8, bus);
  }

  stopTheme(): void {
    this.themeWanted = false;
    if (this.themeTimer !== null) {
      clearInterval(this.themeTimer);
      this.themeTimer = null;
    }
    const ctx = this.ctx;
    const bus = this.themeGain;
    this.themeGain = null;
    if (ctx !== null && bus !== null) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      // Anything already scheduled finishes silently; the bus is cut after the
      // fade so nothing is left connected.
      setTimeout(() => {
        try {
          bus.disconnect();
        } catch {
          /* already gone */
        }
      }, 2500);
    }
  }

  /** The clip recorder taps this, so a saved clip has game audio but never a mic. */
  get outputNode(): AudioNode | null {
    return this.limiter;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  dispose(): void {
    this.stopTheme();
    this.stopBed();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.started = false;
  }
}

export const sound = new SoundManager();
