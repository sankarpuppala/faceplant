/**
 * Audio (docs/OVERHAUL.md section 6, SPEC section 14, CLAUDE.md invariant 6).
 *
 * Mixing structure (OVERHAUL 6.1):
 *
 *   ambient bus --+
 *   music bus ----+--> master gain --> compressor --> limiter --> ceiling --> out
 *   sfx bus ------+                                   (-6 dBFS)   (-6 dBFS
 *   scare bus ----+                                               hard clip)
 *
 * The scare bus is muted outright with Scares off (invariant 5). `duckFor`
 * pulls the other buses down so a scare has room. Volume sliders: master,
 * music (the music and ambient buses) and sound (sfx and scare).
 *
 * The identity of the game is in `samples.ts` - breathing, creaks, whispers,
 * the scream - rendered once into buffers. The small oscillator helpers here
 * (`blip`, `noise`) are glue for the Wicks' tiny gameplay sounds.
 *
 * Safety (invariant 6), by construction: everything passes the limiter and
 * then a hard ceiling at -6 dBFS, so nothing can leave louder than that;
 * every sample peaks at -6 dBFS or under; scare sounds attack over 30 ms or
 * more; nothing plays until the player's first gesture.
 */

import { config } from '../config.ts';
import { fromDb } from './dsp.ts';
import { renderSample, SAMPLE_NAMES, SAMPLES, type Bus, type SampleName } from './samples.ts';
import { BEATS_PER_CHORD, THEME_BEAT_S, chordAt, chordStartsAt, melodyAt, midiToHz } from './theme.ts';


export type SoundName =
  | 'squeak'
  | 'gulp'
  | 'flameOut'
  | 'gateChime'
  | 'skitter'
  | 'flick'
  | 'thud'
  | 'slide'
  | 'offering'
  | 'processionStep'
  | 'yawn'
  | 'stinger'
  | 'mawOpen'
  | 'watcherShout'
  | 'tapeStop'
  | 'tapeRewind'
  | 'tapeInsert'
  | 'resultsNote'
  | 'uiFocus'
  | 'uiConfirm';

const db = fromDb;

export interface Volumes {
  master: number;
  music: number;
  sfx: number;
}

export interface PlayOptions {
  bus?: Bus;
  /** dB relative to the sample's own level. */
  gainDb?: number;
  /** Playback rate: pitch and speed together, like tape. */
  rate?: number;
  /** -1 left .. 1 right. */
  pan?: number;
  /** Seconds from now. */
  delayS?: number;
  /** A low-pass over this one sound, Hz, for muffled versions. */
  lowpassHz?: number;
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ceiling: WaveShaperNode | null = null;
  private readonly buses = new Map<Bus, GainNode>();
  private readonly buffers = new Map<SampleName, AudioBuffer>();
  private noiseBuffer: AudioBuffer | null = null;
  private volumes: Volumes = { master: config.audio.defaultVolume, music: 0.8, sfx: 0.9 };
  private scaresOn = true;
  private muted = false;
  private started = false;

  // The level bed (OVERHAUL 6.3): drone, room tone and hiss, and the layers
  // composure brings in.
  private bed: { drone: AudioBufferSourceNode; droneFilter: BiquadFilterNode; droneGain: GainNode; roomGain: GainNode; hiss: AudioBufferSourceNode; room: AudioBufferSourceNode } | null = null;
  private bedTimer: ReturnType<typeof setInterval> | null = null;
  private composure = 1;
  private nextHeartbeatAt = 0;
  private nextWhisperAt = 0;
  private ducked = false;

  // The title (OVERHAUL 6.3): music box over the drone, a creak now and then.
  private themeGain: GainNode | null = null;
  private themeDrone: AudioBufferSourceNode | null = null;
  private themeTimer: ReturnType<typeof setInterval> | null = null;
  private themeBeat = 0;
  private themeNextAt = 0;
  private nextCreakAt = 0;
  /** The menus asked for music before a click let the browser allow it. */
  private themeWanted = false;

  /** Safe to call repeatedly; the first user gesture is what actually starts it. */
  async resume(): Promise<void> {
    if (this.ctx === null) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor === undefined) return;
      this.ctx = new Ctor();
      this.build();
      this.renderAll();
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.started = true;
    if (this.themeWanted && this.themeTimer === null) this.beginTheme();
  }

  private build(): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    // The ceiling: a hard clip at -6 dBFS, the true brick wall. The limiter
    // before it does the musical work; this guarantees the number.
    const ceiling = ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    const top = db(config.audio.limiterCeilingDbfs);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.max(-top, Math.min(top, x));
    }
    ceiling.curve = curve;
    ceiling.connect(ctx.destination);
    this.ceiling = ceiling;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = config.audio.limiterCeilingDbfs;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ceiling);

    // A gentle glue compressor ahead of the limiter.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 8;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    comp.connect(limiter);

    const master = ctx.createGain();
    master.connect(comp);
    this.master = master;

    for (const bus of ['ambient', 'music', 'sfx', 'scare'] as const) {
      const g = ctx.createGain();
      g.connect(master);
      this.buses.set(bus, g);
    }
    this.applyVolumes();

    // Noise buffer, reused by the small gameplay sounds.
    const len = Math.floor(ctx.sampleRate * 2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  /**
   * Renders the library in a worker, so the half second of synthesis never
   * lands on the title screen or the face tracker. The UI and the ambience
   * come first because they are needed first. Without workers (old browsers,
   * the test runner) it falls back to one sound per task on this thread.
   */
  private renderAll(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const order: SampleName[] = ['uiClick', 'uiClunk', 'musicBox', 'drone', 'creak', 'roomTone', 'tapeHiss', 'vhsInsert'];
    for (const n of SAMPLE_NAMES) if (!order.includes(n)) order.push(n);

    if (typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (ev: MessageEvent<{ name: SampleName; data: Float32Array }>): void => {
          const c = this.ctx;
          if (c === null || this.buffers.has(ev.data.name)) return;
          const buf = c.createBuffer(1, ev.data.data.length, c.sampleRate);
          buf.getChannelData(0).set(ev.data.data);
          this.buffers.set(ev.data.name, buf);
          if (this.buffers.size === SAMPLE_NAMES.length) worker.terminate();
        };
        for (const name of order) worker.postMessage({ name, rate: ctx.sampleRate });
        return;
      } catch {
        /* fall through to the main thread */
      }
    }
    const next = (): void => {
      const name = order.shift();
      if (name === undefined || this.ctx === null) return;
      this.buffer(name);
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }

  /** The buffer for a sound, rendering it now if the background pass has not reached it. */
  private buffer(name: SampleName): AudioBuffer | null {
    const ctx = this.ctx;
    if (ctx === null) return null;
    const have = this.buffers.get(name);
    if (have !== undefined) return have;
    const data = renderSample(name, ctx.sampleRate);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);
    this.buffers.set(name, buf);
    return buf;
  }

  // ------------------------------------------------------------- volumes

  setVolumes(v: Volumes): void {
    this.volumes = {
      master: Math.min(1, Math.max(0, v.master)),
      music: Math.min(1, Math.max(0, v.music)),
      sfx: Math.min(1, Math.max(0, v.sfx)),
    };
    this.applyVolumes();
  }

  /** Master only, for callers that do not know about buses. */
  setVolume(v: number): void {
    this.setVolumes({ ...this.volumes, master: v });
  }

  /** Scares off mutes the scare bus entirely (invariant 5). */
  setScaresEnabled(on: boolean): void {
    this.scaresOn = on;
    this.applyVolumes();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyVolumes();
  }

  private busLevel(bus: Bus): number {
    const v = this.volumes;
    switch (bus) {
      case 'ambient':
        return v.music * (this.ducked ? db(-12) : 1);
      case 'music':
        return v.music * (this.ducked ? db(-12) : 1);
      case 'sfx':
        return v.sfx;
      case 'scare':
        return this.scaresOn ? v.sfx : 0;
    }
  }

  private applyVolumes(): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    this.master?.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, ctx.currentTime, 0.02);
    for (const [bus, g] of this.buses) g.gain.setTargetAtTime(this.busLevel(bus), ctx.currentTime, 0.05);
  }

  /**
   * Pulls the buses other than `keep` down by `dropDb` over `fadeS`, holds,
   * and brings them back after `holdS`. The ducking helper OVERHAUL 6.1 asks
   * for: a scare clears the room for itself.
   */
  duckFor(dropDb: number, fadeS: number, holdS: number, keep: Bus = 'scare'): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    for (const [bus, g] of this.buses) {
      if (bus === keep) continue;
      const level = this.busLevel(bus);
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.linearRampToValueAtTime(level * db(dropDb), t + fadeS);
      g.gain.setValueAtTime(level * db(dropDb), t + fadeS + holdS);
      g.gain.linearRampToValueAtTime(level, t + fadeS + holdS + 1.2);
    }
  }

  /** Pause and Results: the room falls back. */
  duck(): void {
    this.ducked = true;
    this.applyVolumes();
  }

  unduck(): void {
    this.ducked = false;
    this.applyVolumes();
  }

  // ------------------------------------------------------------ samples

  /** Plays one sound from the library. Returns its source, for anything that must stop it. */
  playSample(name: SampleName, o: PlayOptions = {}): AudioBufferSourceNode | null {
    if (!this.started || this.muted) return null;
    const ctx = this.ctx;
    const spec = SAMPLES[name];
    const bus = this.buses.get(o.bus ?? spec.bus);
    const buf = this.buffer(name);
    if (ctx === null || bus === undefined || buf === null) return null;
    if ((o.bus ?? spec.bus) === 'scare' && !this.scaresOn) return null;

    const at = ctx.currentTime + (o.delayS ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = spec.loop;
    src.playbackRate.value = o.rate ?? 1;
    let node: AudioNode = src;
    if (o.lowpassHz !== undefined) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpassHz;
      node.connect(lp);
      node = lp;
    }
    const g = ctx.createGain();
    g.gain.value = db(o.gainDb ?? 0);
    node.connect(g);
    node = g;
    if (o.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      node.connect(p);
      node = p;
    }
    node.connect(bus);
    src.start(at);
    return src;
  }

  // ------------------------------------------------------------ the level bed

  /** Drone, room tone and tape hiss; composure changes all three (OVERHAUL 6.3). */
  startBed(): void {
    const ctx = this.ctx;
    const ambient = this.buses.get('ambient');
    if (ctx === null || ambient === undefined || this.bed !== null) return;
    const drone = this.loopSource('drone');
    const room = this.loopSource('roomTone');
    const hiss = this.loopSource('tapeHiss');
    if (drone === null || room === null || hiss === null) return;

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.Q.value = 2;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    drone.connect(droneFilter).connect(droneGain).connect(ambient);
    droneGain.gain.setTargetAtTime(db(-8), ctx.currentTime, 1.5);

    const roomGain = ctx.createGain();
    roomGain.gain.value = 0;
    room.connect(roomGain).connect(ambient);
    roomGain.gain.setTargetAtTime(db(-10), ctx.currentTime, 2);

    const hissGain = ctx.createGain();
    hissGain.gain.value = db(-24);
    hiss.connect(hissGain).connect(ambient);

    for (const s of [drone, room, hiss]) s.start();
    this.bed = { drone, droneFilter, droneGain, roomGain, hiss, room };
    this.composure = 1;
    this.applyComposure();
    this.nextHeartbeatAt = 0;
    this.nextWhisperAt = ctx.currentTime + 4;
    this.bedTimer = setInterval(() => this.tickBed(), 200);
  }

  private loopSource(name: SampleName): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    const buf = this.buffer(name);
    if (ctx === null || buf === null) return null;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    return s;
  }

  stopBed(): void {
    const ctx = this.ctx;
    if (this.bedTimer !== null) clearInterval(this.bedTimer);
    this.bedTimer = null;
    const bed = this.bed;
    this.bed = null;
    if (ctx === null || bed === null) return;
    bed.droneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    bed.roomGain.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    for (const s of [bed.drone, bed.room, bed.hiss]) {
      try {
        s.stop(ctx.currentTime + 1.5);
      } catch {
        /* already stopped */
      }
    }
  }

  /**
   * Composure 0..1 (OVERHAUL 6.3). As it falls the drone's filter opens and
   * it rises; a heartbeat comes in below 40 %, whispers below 25 %, and the
   * room tone goes away below 15 % - the silence is the warning.
   */
  setComposure(fraction: number): void {
    this.composure = Math.min(1, Math.max(0, fraction));
    this.applyComposure();
  }

  private applyComposure(): void {
    const ctx = this.ctx;
    const bed = this.bed;
    if (ctx === null || bed === null) return;
    const c = config.audio.composure;
    const strain = 1 - this.composure;
    bed.droneFilter.frequency.setTargetAtTime(c.droneFilterHz[0] + (c.droneFilterHz[1] - c.droneFilterHz[0]) * strain, ctx.currentTime, 0.4);
    bed.droneGain.gain.setTargetAtTime(db(-8 + c.droneRiseGainDb * strain), ctx.currentTime, 0.6);
    const roomFade = Math.min(1, this.composure / c.roomGoneBelowFraction);
    bed.roomGain.gain.setTargetAtTime(db(-10) * roomFade, ctx.currentTime, 0.8);
  }

  private tickBed(): void {
    const ctx = this.ctx;
    if (ctx === null || this.bed === null) return;
    const c = config.audio.composure;
    const now = ctx.currentTime;
    if (this.composure < c.heartbeatBelowFraction && now >= this.nextHeartbeatAt) {
      const depth = 1 - this.composure / c.heartbeatBelowFraction;
      this.playSample('heartbeat', { gainDb: -14 + 8 * depth });
      this.nextHeartbeatAt = now + 1.15 - 0.5 * depth;
    }
    if (this.composure < c.whispersBelowFraction && now >= this.nextWhisperAt) {
      const depth = 1 - this.composure / c.whispersBelowFraction;
      this.playSample('whisper', { gainDb: -20 + 6 * depth, pan: Math.random() < 0.5 ? -0.85 : 0.85, rate: 0.9 + Math.random() * 0.2 });
      this.nextWhisperAt = now + 3 + Math.random() * 4;
    }
  }

  /**
   * At most once a level (the app decides when): a creak far to one side and
   * a breath, and nothing after. No picture. On the scare bus, so Scares off
   * means no fake-out either.
   */
  fakeOut(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.playSample('creak', { bus: 'scare', gainDb: -6, pan: side * 0.95 });
    this.playSample('breath', { gainDb: -12, pan: side * 0.7, delayS: 1.1 });
  }

  // ------------------------------------------------------------ game sounds

  /**
   * @param variation 0..1, used to pitch per-Wick sounds so a crowd of them is
   *   a crowd and not one sample played eight times.
   */
  play(name: SoundName, variation = 0.5): void {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    if (ctx === null) return;

    const t = ctx.currentTime;
    const v = Math.min(1, Math.max(0, variation));
    const sfx = this.buses.get('sfx');

    switch (name) {
      case 'squeak': {
        const lo = config.audio.squeakMinHz;
        const hi = config.audio.squeakMaxHz;
        const f = lo + (hi - lo) * v;
        this.blip(t, f, f * 1.4, 0.09, db(-26), 'triangle', 0.006, sfx);
        this.blip(t + 0.07, f * 0.86, f * 0.7, 0.07, db(-30), 'triangle', 0.006, sfx);
        break;
      }
      case 'gulp':
        // Swallowed: the gulp, and the flame going out inside, muffled.
        this.playSample('gulp', { gainDb: -2 });
        this.playSample('candleSnuff', { gainDb: -8, lowpassHz: 700, delayS: 0.25 });
        break;
      case 'flameOut':
        this.playSample('candleSnuff', { gainDb: -4, rate: 0.9 + v * 0.2 });
        break;
      case 'gateChime':
        // Saved: a soft bell, warm but sad.
        this.playSample('bell', { gainDb: -4, rate: 0.97 + v * 0.06 });
        break;
      case 'mawOpen':
        this.playSample('mawGroan', { gainDb: -12 });
        break;
      case 'skitter':
        for (let i = 0; i < 5; i++) this.noise(t + i * 0.035, 0.02, 5200, db(-32), 'highpass', 0.006, sfx);
        break;
      case 'flick':
        this.blip(t, 180, 900, 0.16, db(-22), 'sine', 0.006, sfx);
        break;
      case 'thud':
        this.blip(t, 150, 60, 0.1, db(-28), 'sine', 0.006, sfx);
        break;
      case 'slide':
        this.noise(t, 0.26, 1600 + v * 1200, db(-30), 'bandpass', 0.006, sfx);
        break;
      case 'offering':
        this.blip(t, 110, 330, 0.5, db(-22), 'triangle', 0.02, sfx);
        break;
      case 'processionStep': {
        const f = 196 * Math.pow(2, Math.round(v * 7) / 12);
        this.blip(t, f, f, 0.4, db(-26), 'sine', 0.01, sfx);
        break;
      }
      case 'yawn':
        // U1 - THE YAWN. Slow and inevitable, never a jump-scare.
        this.playSample('mawGroan', { gainDb: -4, rate: 0.8 });
        break;
      case 'stinger': {
        // Scheduled scares: a breath close by and a low swell, never a bang.
        const scare = this.buses.get('scare');
        this.playSample('breath', { gainDb: -10, pan: Math.random() < 0.5 ? -0.8 : 0.8 });
        this.blip(t, 70, 46, 1.4, db(-16), 'sine', config.audio.scareMinAttackMs / 1000 + 0.1, scare);
        break;
      }
      case 'watcherShout':
        this.scream(t, 1);
        break;
      case 'tapeStop':
        this.playSample('tapeStop');
        break;
      case 'tapeRewind':
        this.playSample('tapeRewind');
        break;
      case 'tapeInsert':
        this.playSample('vhsInsert');
        break;
      case 'resultsNote':
        this.playSample('pianoLow', { delayS: 0.3 });
        break;
      case 'uiFocus':
        this.playSample('uiClick');
        break;
      case 'uiConfirm':
        this.playSample('uiClunk');
        break;
    }
  }

  /** A pitched blip with an exponential frequency sweep. */
  private blip(at: number, fromHz: number, toHz: number, durS: number, peak: number, type: OscillatorType, attackS = 0.006, dest?: AudioNode): void {
    const ctx = this.ctx;
    const out = dest ?? this.buses.get('sfx');
    if (ctx === null || out === undefined) return;

    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, fromHz), at);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, toHz), at + durS);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attackS);
    g.gain.exponentialRampToValueAtTime(0.0001, at + durS);

    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + durS + 0.02);
  }

  private noise(at: number, durS: number, filterHz: number, peak: number, filterType: BiquadFilterType, attackS = 0.006, dest?: AudioNode): void {
    const ctx = this.ctx;
    const buf = this.noiseBuffer;
    const out = dest ?? this.buses.get('sfx');
    if (ctx === null || buf === null || out === undefined) return;

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

    src.connect(filter).connect(g).connect(out);
    src.start(at);
    src.stop(at + durS + 0.02);
  }

  // ------------------------------------------------------------ the Watcher

  /**
   * THE WATCHER, to the beat sheet of OVERHAUL 5, scheduled on the audio
   * clock so it lands on the picture (`src/game/watcherBeats.ts`):
   *
   *   0.0  the room ducks 18 dB over a second; a heartbeat, then a slower one
   *   1.2  breathing close in the right ear, a long creak, reversed whispers
   *   2.6  silence - every bus, nothing at all, half a second
   *   3.1  the scream: three layers, a 40 Hz boom, a metal scrape
   *   4.4  the tape stops and winds down; hiss; then nothing
   *
   * Everything from beat 2 on is on the scare bus. With Scares off none of it
   * plays: the room fades out under one soft low tone instead.
   *
   * @param pitch the face's own register (`voicePitch`).
   */
  watcherSequence(pitch = 1, scares = this.scaresOn): void {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    if (ctx === null) return;
    const t = ctx.currentTime;
    const b = config.watcher.beatsMs;
    const s = (ms: number): number => ms / 1000;

    if (!scares) {
      const fade = s(config.watcher.scaresOffFadeMs);
      this.automateRoom(t, [
        [0, 1],
        [fade, 0],
        [fade + 2, 1],
      ]);
      this.blip(t + 0.1, 55, 52, fade, db(-20), 'sine', 0.4, this.buses.get('sfx'));
      return;
    }

    // Beat 1: the room drops away; the heart.
    this.automateRoom(t, [
      [0, 1],
      [1, db(-18)],
      [s(b.behindUntilMs) - 0.06, db(-18)],
      [s(b.behindUntilMs), 0],
      [s(b.endMs) + 0.4, 0],
      [s(b.endMs) + 2, 1],
    ]);
    const before: (AudioBufferSourceNode | null)[] = [];
    before.push(this.playSample('heartbeat', { bus: 'scare', gainDb: -2 }));
    before.push(this.playSample('heartbeat', { bus: 'scare', gainDb: -4, rate: 0.82, delayS: 0.8 }));

    // Beat 2: something is behind you.
    const behind = s(b.dyingUntilMs);
    before.push(this.playSample('breath', { gainDb: -3, pan: 0.85, delayS: behind }));
    before.push(this.playSample('creak', { bus: 'scare', gainDb: -4, rate: 0.7, pan: -0.4, delayS: behind + 0.1 }));
    before.push(this.playSample('whisperRev', { gainDb: -8, pan: -0.8, delayS: behind + 0.25 }));

    // Beat 3: the silence. Everything above is cut dead at its start, and
    // the room is already at zero. Then beat 4: the lunge.
    const cut = t + s(b.behindUntilMs);
    for (const src of before) {
      try {
        src?.stop(cut + 0.03);
      } catch {
        /* already stopped */
      }
    }
    // A 30 ms fade into the cut, so it is silence and not a click.
    const scare = this.buses.get('scare');
    if (scare !== undefined) {
      const level = this.busLevel('scare');
      scare.gain.cancelScheduledValues(t);
      scare.gain.setValueAtTime(level, cut - 0.03);
      scare.gain.linearRampToValueAtTime(0, cut);
      scare.gain.setValueAtTime(0, t + s(b.silenceUntilMs) - 0.05);
      scare.gain.linearRampToValueAtTime(level, t + s(b.silenceUntilMs) - 0.01);
    }
    const hit = s(b.silenceUntilMs);
    for (const [name, gainDb, at] of [
      ['screamA', 0, 0],
      ['shriekB', -6, 0],
      ['subBoom', 0, 0],
      ['metalScrape', -8, 0],
      ['screamTail', -5, 0.5],
    ] as const) {
      this.playSample(name, { gainDb, rate: pitch, delayS: hit + at });
    }

    // Beat 5: the tape dies.
    const dies = s(b.lungeUntilMs);
    this.playSample('tapeStop', { bus: 'scare', delayS: dies });
    this.noise(t + dies + 1.0, 0.55, 4200, db(-24), 'highpass', 0.08, this.buses.get('scare'));
  }

  /**
   * Automates every bus but the scare bus through `[seconds from now, level]`
   * points (levels as fractions of the bus's set volume), for the Watcher's
   * duck, its silence and the room coming back.
   */
  private automateRoom(at: number, points: readonly (readonly [number, number])[]): void {
    for (const [bus, g] of this.buses) {
      if (bus === 'scare') continue;
      const level = this.busLevel(bus);
      g.gain.cancelScheduledValues(at);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), at);
      for (const [dt, k] of points) g.gain.linearRampToValueAtTime(Math.max(0, level * k), at + dt);
    }
  }

  /** A lone shout, for anything that asks for one: the lunge's layers on their own. */
  private scream(at: number, pitch: number): void {
    const ctx = this.ctx;
    if (ctx === null) return;
    for (const [name, gainDb] of [
      ['screamA', 0],
      ['shriekB', -6],
      ['subBoom', 0],
      ['metalScrape', -8],
    ] as const) {
      this.playSample(name, { gainDb, rate: pitch, delayS: Math.max(0, at - ctx.currentTime) });
    }
  }

  // ----------------------------------------------------------- the title

  /** Starts the title music, or queues it until the browser allows sound. */
  startTheme(): void {
    this.themeWanted = true;
    if (this.themeTimer !== null) return;
    if (!this.started || this.ctx === null) return;
    this.beginTheme();
  }

  private beginTheme(): void {
    const ctx = this.ctx;
    const music = this.buses.get('music');
    if (ctx === null || music === undefined || this.themeTimer !== null) return;

    const bus = ctx.createGain();
    bus.gain.value = 0;
    bus.connect(music);
    bus.gain.setTargetAtTime(1, ctx.currentTime, 1.6);
    this.themeGain = bus;

    // The drone under the music box, closed right down.
    const drone = this.loopSource('drone');
    if (drone !== null) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 240;
      const g = ctx.createGain();
      g.gain.value = db(-12);
      drone.connect(lp).connect(g).connect(bus);
      drone.start();
      this.themeDrone = drone;
    }

    this.themeBeat = 0;
    this.themeNextAt = ctx.currentTime + 0.1;
    this.nextCreakAt = ctx.currentTime + this.creakGapS();
    this.tickTheme();
    this.themeTimer = setInterval(() => this.tickTheme(), 400);
  }

  private creakGapS(): number {
    const [lo, hi] = config.audio.titleCreakGapSeconds;
    return lo + Math.random() * (hi - lo);
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
    // A creak somewhere in the house, far to one side, every 20-40 s.
    if (ctx.currentTime >= this.nextCreakAt) {
      this.playSample('creak', { gainDb: -10, pan: Math.random() < 0.5 ? -0.95 : 0.95, rate: 0.85 + Math.random() * 0.3 });
      this.nextCreakAt = ctx.currentTime + this.creakGapS();
    }
  }

  private scheduleThemeBeat(beat: number, at: number, bus: GainNode): void {
    const ctx = this.ctx;
    if (ctx === null) return;

    // A low pad that changes on the first beat of each chord.
    if (chordStartsAt(beat)) {
      const lengthS = BEATS_PER_CHORD * THEME_BEAT_S;
      const root = chordAt(beat)[0];
      if (root !== undefined) this.blip(at, midiToHz(root - 12), midiToHz(root - 12), lengthS + 1, db(-30), 'sine', 2.2, bus);
    }

    // The music box: one tine sample, pitched to the note and detuned by up
    // to 30 cents either way, so it is never quite in tune with itself.
    const note = melodyAt(beat);
    const buf = this.buffer('musicBox');
    if (note === null || buf === null) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const cents = (((beat * 7919) % 61) - 30);
    src.playbackRate.value = (midiToHz(note) / 880) * Math.pow(2, cents / 1200);
    const g = ctx.createGain();
    g.gain.value = db(-6);
    src.connect(g).connect(bus);
    src.start(at);
  }

  stopTheme(): void {
    this.themeWanted = false;
    if (this.themeTimer !== null) {
      clearInterval(this.themeTimer);
      this.themeTimer = null;
    }
    const ctx = this.ctx;
    const bus = this.themeGain;
    const drone = this.themeDrone;
    this.themeGain = null;
    this.themeDrone = null;
    if (ctx !== null && bus !== null) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.35);
      try {
        drone?.stop(ctx.currentTime + 2);
      } catch {
        /* already stopped */
      }
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
    return this.ceiling;
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
    this.ceiling = null;
    this.buses.clear();
    this.buffers.clear();
    this.started = false;
  }
}

export const sound = new SoundManager();
