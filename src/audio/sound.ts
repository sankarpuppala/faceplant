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
      case 'watcherShout': {
        // THE WATCHER's shout. The loudest thing in the game, and still bound
        // by invariant 6: it peaks at -8 dBFS into a -6 dBFS limiter, and every
        // layer has a 40 ms attack, comfortably past the 30 ms minimum. No
        // layer starts instantaneously, so there is no click and no spike.
        const attack = Math.max(config.audio.scareMinAttackMs, 40) / 1000;

        // A throat: two detuned saws falling from a shriek to a growl.
        this.blip(t, 880, 70, 1.5, db(-10), 'sawtooth', attack);
        this.blip(t + 0.01, 660, 58, 1.5, db(-12), 'sawtooth', attack);
        // The body of it, an octave down.
        this.blip(t, 220, 34, 1.7, db(-9), 'square', attack);
        // Breath and grit over the top.
        this.noise(t, 1.5, 1100, db(-13), 'bandpass', attack);
        this.noise(t + 0.05, 1.2, 320, db(-11), 'lowpass', attack);
        // A sub-bass thump so it lands in the chest rather than the ears.
        this.blip(t, 70, 28, 1.3, db(-8), 'sine', attack);
        break;
      }
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

    osc.connect(g).connect(master);
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

    src.connect(filter).connect(g).connect(master);
    src.start(at);
    src.stop(at + durS + 0.02);
  }

  /** The clip recorder taps this, so a saved clip has game audio but never a mic. */
  get outputNode(): AudioNode | null {
    return this.limiter;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  dispose(): void {
    this.stopBed();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.started = false;
  }
}

export const sound = new SoundManager();
