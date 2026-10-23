/**
 * The application: one state machine, one loop.
 *
 * Owns the face source, the world, the renderer, the screens and the save
 * file, and nothing else owns any of those. The loop is deliberately simple:
 *
 *   rAF -> pull the newest face frame -> detect reactions -> world.step()
 *       -> drain world events into sound and Wick lines -> render
 *
 * Physics runs on its own fixed clock inside `World.step`, so a dropped frame
 * slows the picture rather than the simulation.
 *
 * The flow is docs/OVERHAUL.md section 3:
 *
 *   notice -> title -+-> camera -> calibration -+-> shelf -> tape insert -> play
 *                    +-> without camera --------+            |   Esc -> pause
 *                    +-> settings                           win / loss -> results
 *                    +-> leave (credits)        after the last tape -> ending
 *
 * Every screen has an exit, Main menu is never more than two inputs away, and
 * Esc always does something.
 */

import { config, defaultTunables } from './config.ts';
import { buildCalibration, CalibrationCollector, defaultCalibration, type Calibration } from './face/calibration.ts';
import { ReactionDetector } from './face/reactions.ts';
import { AssistInput, SyntheticFaceSource } from './face/syntheticSource.ts';
import type { FaceFrame, FaceSource, RawFrame } from './face/types.ts';
import { CameraError, WebcamFaceSource } from './face/webcamSource.ts';
import { dayNumber, generateDaily, generateEndless } from './game/daily.ts';
import { isStoryFinale, loadLevel, nextLevelId } from './game/levelLoader.ts';
import type { Level } from './game/levelSchema.ts';
import { LineDirector } from './game/lineDirector.ts';
import { WHISPER_LINE } from './game/lines.ts';
import { displayName } from './game/names.ts';
import { buildResult, filterUnlocked, type RunResult } from './game/rules.ts';
import { FaceLooksBack, finaleBlendOverride, ScareDirector, type ActiveScare } from './game/scares.ts';
import { World, type WorldSnapshot } from './physics/world.ts';
import { tapeMark } from './render/osd.ts';
import { Stage } from './render/stage.ts';
import { sound } from './audio/sound.ts';
import { PortraitCanvas } from './share/portraitCanvas.ts';
import { ClipRecorder, downloadBlob } from './share/recorder.ts';
import { loadProgress, recordDaily, recordRun, resetProgress, saveProgress, survivorMap, totalCandles, type Progress } from './storage/progress.ts';
import { applySystemPreferences, loadSettings, saveSettings, storageAvailable, type Settings } from './storage/settings.ts';
import { requestPersistent } from './storage/durability.ts';
import { copy } from './ui/copy.ts';
import { el, focusFirst, toast, trapFocus } from './ui/dom.ts';
import { installGrain } from './ui/grain.ts';
import {
  calibrationScreen,
  cameraScreen,
  clipPreviewScreen,
  creditsScreen,
  endingScreen,
  hud,
  noticeScreen,
  pauseScreen,
  resultsScreen,
  rewindOverlay,
  settingsScreen,
  shelfScreen,
  tapeInsert,
  titleScreen,
  type HudView,
} from './ui/screens.ts';
import { imageToWorld, worldToScreen } from './terrain/mapping.ts';
import { DebugOverlay, debugEnabled } from './ui/debugOverlay.ts';

/** MediaPipe face-mesh index of the nose tip, the debug overlay's alignment probe. */
const NOSE_TIP_INDEX = 1;

type Phase =
  | 'boot'
  | 'notice'
  | 'title'
  | 'camera'
  | 'calibrate'
  | 'shelf'
  | 'inserting'
  | 'playing'
  | 'paused'
  | 'rewinding'
  | 'results'
  | 'ending'
  | 'credits'
  | 'menu';

export class App {
  private readonly stageHost: HTMLElement;
  private readonly uiHost: HTMLElement;

  private readonly stage = new Stage();
  private settings: Settings;
  private progress: Progress;

  private source: FaceSource | null = null;
  private webcam: WebcamFaceSource | null = null;
  private readonly assistInput = new AssistInput();
  private synthetic: SyntheticFaceSource | null = null;
  private cal: Calibration = defaultCalibration();

  private readonly reactions = new ReactionDetector();
  private readonly lines = new LineDirector(Date.now() & 0xffff);
  private world: World | null = null;
  private level: Level | null = null;
  private scares: ScareDirector | null = null;
  private finale: FaceLooksBack | null = null;

  private readonly recorder = new ClipRecorder();
  private readonly portrait = new PortraitCanvas();
  private recordingThisRun = false;
  private crashAtMs = 0;
  private lowestSeen = 1;

  private phase: Phase = 'boot';
  private currentScreen: HTMLElement | null = null;
  private releaseTrap: (() => void) | null = null;
  private hudView: HudView | null = null;
  /** The tape insert card or the rewind bands, whichever is up. */
  private overlay: HTMLElement | null = null;

  private lastFrameMs = 0;
  private running = false;
  private lastFaceAtMs = 0;
  /** Timestamp of the last face frame actually pushed into the world. */
  private lastConsumedFrameT = -1;
  /**
   * When THE WATCHER was summoned, on the render clock, or -1. Set by the
   * world's `watcher` event and cleared when the animation is done. Stays -1
   * with Scares off, so the fail still happens - just quietly.
   */
  private watcherStartedMs = -1;
  private practiceRun = false;
  private frameTimes: number[] = [];
  private readonly debug = debugEnabled() ? new DebugOverlay() : null;
  private renderParity = false;
  private lastRenderMs = 0;
  /** The tape insert ends at this render time; `Infinity` while it waits for a key. */
  private insertUntilMs = 0;
  /**
   * Bumped whenever calibration is abandoned. Calibration is a chain of awaits,
   * and without this a player who pressed Back halfway through would be thrown
   * onto the shelf a few seconds later when the abandoned run finished.
   */
  private calibrationRun = 0;
  /** The current screen's Esc. Also run from the window, so Esc works wherever focus is. */
  private escape: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.stageHost = el('div', { id: 'stage-host' });
    this.uiHost = el('div', { id: 'ui-host' });
    host.appendChild(this.stageHost);
    host.appendChild(this.uiHost);
    if (this.debug !== null) host.appendChild(this.debug.node);

    this.settings = applySystemPreferences(loadSettings());
    this.progress = loadProgress();
    this.applyBodyClasses();
    installGrain();
  }

  async start(): Promise<void> {
    await this.stage.init(this.stageHost);
    // Fonts must be ready before any Pixi Text is measured, or the OSD lays
    // out against a fallback and then jumps.
    try {
      await document.fonts.ready;
    } catch {
      /* fonts are a nicety, not a requirement */
    }

    window.addEventListener('keydown', this.onGlobalKey);

    // Ask the browser not to evict the save when the device runs low on disk.
    // Granted silently on engagement; never awaited, so it cannot delay the title.
    if (storageAvailable()) void requestPersistent();

    this.running = true;
    this.lastFrameMs = performance.now();
    requestAnimationFrame(this.loop);

    // A browser will not play anything until there has been a gesture.
    const firstGesture = (): void => {
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('keydown', firstGesture);
      void sound.resume().then(() => this.applyVolume());
    };
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('keydown', firstGesture);

    if (this.settings.noticeSeen) this.showTitle();
    else this.showNotice();
  }

  // ----------------------------------------------------------------- screens

  private setScreen(node: HTMLElement | null, phase: Phase, onEscape?: () => void): void {
    this.releaseTrap?.();
    this.releaseTrap = null;
    this.currentScreen?.remove();
    this.currentScreen = node;
    this.phase = phase;
    this.escape = onEscape ?? null;
    if (node === null) return;
    this.uiHost.appendChild(node);
    this.releaseTrap = trapFocus(node, onEscape);
    focusFirst(node);
  }

  private applyBodyClasses(): void {
    document.body.classList.toggle('reduced-effects', this.settings.reducedEffects);
  }

  private applyVolume(): void {
    sound.setVolume(this.settings.volume);
  }

  private saveSettingsWith(next: Partial<Settings>): void {
    this.settings = { ...this.settings, ...next };
    saveSettings(this.settings);
  }

  private showNotice(): void {
    const go = (scares: boolean): void => {
      this.saveSettingsWith({ scares, noticeSeen: true });
      void sound.resume().then(() => this.applyVolume());
      this.showTitle();
    };
    // Esc is the same as Continue: there is nowhere else to go from here.
    this.setScreen(noticeScreen(this.settings.scares, go), 'notice', () => go(this.settings.scares));
  }

  /** Main menu. Leaves any run behind; nothing earned so far is lost. */
  private showTitle(): void {
    this.endRun();
    sound.startTheme();
    this.setScreen(
      titleScreen(
        {
          insertFace: () => {
            // Already live (a second visit this session): nothing to ask.
            if (this.webcam !== null) {
              this.useCamera();
              this.showShelf();
            } else {
              this.showCameraScreen();
            }
          },
          playNoCamera: () => {
            this.useAssist();
            this.showShelf();
          },
          settings: () => this.showSettings(() => this.showTitle()),
          leave: () => this.setScreen(creditsScreen(() => this.showTitle()), 'credits', () => this.showTitle()),
        },
        { canSave: storageAvailable() },
      ),
      'title',
    );
  }

  /** Tears down whatever was being played, so menus start clean. */
  private endRun(): void {
    this.clearPlayUi();
    this.stage.setOsdVisible(false);
    this.watcherStartedMs = -1;
    this.world = null;
    this.level = null;
    this.scares = null;
    this.finale = null;
    if (this.recordingThisRun) this.recorder.discard();
    this.recordingThisRun = false;
    sound.unduck();
  }

  private showSettings(onBack: () => void): void {
    const render = (): void => {
      this.setScreen(
        settingsScreen(
          this.settings,
          {
            change: (next) => {
              this.saveSettingsWith(next);
              this.applyVolume();
              this.applyBodyClasses();
              this.scares?.setOptions({
                enabled: this.settings.scares,
                reducedEffects: this.settings.reducedEffects,
                segmentationAvailable: false,
              });
              // A slider is mid-drag while it reports; rebuilding the screen
              // under it would drop the drag.
              const onlyVolume = Object.keys(next).every((k) => k === 'volume' || k === 'musicVolume' || k === 'sfxVolume');
              if (!onlyVolume) render();
            },
            resetProgress: () => {
              this.progress = resetProgress();
              toast(this.uiHost, copy.settings.resetDone);
            },
            back: onBack,
          },
          { thermalUnlocked: filterUnlocked('thermal', totalCandles(this.progress)), canRecord: this.recorder.available },
        ),
        'menu',
        onBack,
      );
    };
    render();
  }

  private showShelf(): void {
    this.endRun();
    sound.startTheme();
    this.setScreen(
      shelfScreen(
        this.progress,
        {
          playLevel: (id) => void this.playStory(id),
          playDaily: () => void this.playDaily(),
          playEndless: () => void this.playEndless(),
          back: () => this.showTitle(),
        },
        dayNumber(),
      ),
      'shelf',
      () => this.showTitle(),
    );
  }

  private showCameraScreen(error?: string): void {
    this.setScreen(
      cameraScreen(
        () => void this.enableCamera(() => this.showShelf()),
        () => {
          this.useAssist();
          this.showShelf();
        },
        () => this.showTitle(),
        error,
      ),
      'camera',
      () => this.showTitle(),
    );
  }

  // ------------------------------------------------------------ face sources

  private useAssist(): void {
    this.saveSettingsWith({ controls: 'assist' });
    this.ensureSynthetic();
    this.source = this.synthetic;
    this.stage.setVideo(null);
    this.lastConsumedFrameT = -1;
  }

  private useCamera(): void {
    if (this.webcam === null) return;
    this.saveSettingsWith({ controls: 'face' });
    this.source = this.webcam;
    this.stage.setVideo(this.webcam.info().video);
    this.lastConsumedFrameT = -1;
  }

  /** Starts the camera, then calibrates, then `onDone`. */
  private async enableCamera(onDone: () => void): Promise<void> {
    const cam = new WebcamFaceSource({}, this.cal);
    try {
      await cam.start();
    } catch (err) {
      const reason = err instanceof CameraError ? err.reason : 'unknown';
      this.showCameraScreen(copy.camera[reason]);
      return;
    }
    this.webcam = cam;
    this.useCamera();
    await this.runCalibration(onDone);
  }

  private ensureSynthetic(): void {
    if (this.synthetic !== null) return;
    // Scoped to the game canvas, not the shared parent of the canvas and the
    // menus: `onWheel` calls `preventDefault()`, and attaching it higher once
    // killed scrolling on every menu for the rest of the session.
    this.assistInput.attach(this.stageHost);
    this.synthetic = new SyntheticFaceSource(this.assistInput, config.render.aspect, this.cal);
    void this.synthetic.start();
    if (this.source === null) this.source = this.synthetic;
  }

  // ------------------------------------------------------------- calibration

  /**
   * Two steps (OVERHAUL 3.1): hold still while a ring fills, then open your
   * mouth. Brows and blink use their configured minimum ranges.
   */
  private async runCalibration(onDone: () => void): Promise<void> {
    const cam = this.webcam;
    if (cam === null) {
      this.cal = defaultCalibration();
      this.synthetic?.setCalibration(this.cal);
      onDone();
      return;
    }

    const run = ++this.calibrationRun;
    const back = (): void => {
      this.calibrationRun++;
      this.showTitle();
    };
    const view = calibrationScreen(
      () => {
        this.calibrationRun++;
        this.cal = defaultCalibration(cam.info().aspect);
        cam.setCalibration(this.cal);
        onDone();
      },
      () => void this.runCalibration(onDone),
      back,
    );
    this.setScreen(view.node, 'calibrate', back);

    const steps = [
      { prompt: copy.calibration.hold, ms: config.calibration.holdMs },
      { prompt: copy.calibration.open, ms: config.calibration.openMs },
    ] as const;
    const collectors = [new CalibrationCollector(), new CalibrationCollector()];
    const aspect = cam.info().aspect;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const collector = collectors[i];
      if (step === undefined || collector === undefined) continue;
      view.setPrompt(step.prompt);
      view.setError(null);
      const ok = await this.collectFor(collector, step.ms, aspect, (f) => view.setProgress((i + f) / steps.length), view.setError);
      if (run !== this.calibrationRun) return;
      if (!ok) {
        view.setError(copy.calibration.noFace);
        return;
      }
    }

    const neutral = collectors[0]?.resolveNeutral();
    if (neutral === undefined || !neutral.ok) {
      view.setError(copy.calibration.jitter);
      return;
    }

    this.cal = buildCalibration({
      neutral,
      widePeak: collectors[1]?.peakBlend() ?? neutral.blend,
      browPeak: neutral.blend,
      blinkPeak: neutral.blend,
      aspect,
    });
    cam.setCalibration(this.cal);
    this.synthetic?.setCalibration(this.cal);
    view.setPrompt(copy.calibration.done);
    onDone();
  }

  /** Samples raw frames into a collector for a duration. */
  private collectFor(
    collector: CalibrationCollector,
    durationMs: number,
    aspect: number,
    onProgress: (f: number) => void,
    onError: (t: string | null) => void,
  ): Promise<boolean> {
    const run = this.calibrationRun;
    return new Promise((resolve) => {
      const started = performance.now();
      let sawFace = false;
      let lastT = -1;

      const tick = (): void => {
        if (run !== this.calibrationRun) {
          resolve(false);
          return;
        }
        const now = performance.now();
        const elapsed = now - started;
        onProgress(Math.min(1, elapsed / durationMs));

        const raw: RawFrame | null = this.webcam?.latestRaw() ?? null;
        const face = raw?.faces[0];
        if (raw !== null && face !== undefined && raw.t !== lastT) {
          lastT = raw.t;
          collector.add(face, aspect);
          sawFace = true;
          onError(null);
        } else if (elapsed > 1200 && !sawFace) {
          onError(copy.calibration.noFace);
        }

        if (elapsed >= durationMs) {
          resolve(sawFace && collector.sampleCount > 3);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  // -------------------------------------------------------------- starting a run

  /**
   * Every route into a level honours the chosen controls: in face mode with no
   * live camera, the camera (and calibration) comes first. Without this, from
   * 0455ab0 on, a returning player went straight into a level on the
   * synthetic Assist face and the game stopped following their own face.
   */
  private needsCamera(): boolean {
    return this.settings.controls === 'face' && this.webcam === null;
  }

  private async playStory(id: string): Promise<void> {
    if (this.needsCamera()) {
      await this.enableCamera(() => void this.playStory(id));
      return;
    }
    try {
      this.startLevel(await loadLevel(id), { endless: false, insert: true });
    } catch (err) {
      toast(this.uiHost, `Could not load tape ${id}.`);
      // eslint-disable-next-line no-console
      console.error(err);
      this.showShelf();
    }
  }

  private async playDaily(): Promise<void> {
    if (this.needsCamera()) {
      await this.enableCamera(() => void this.playDaily());
      return;
    }
    this.startLevel(generateDaily(dayNumber()), { endless: false, insert: true });
  }

  private async playEndless(): Promise<void> {
    if (this.needsCamera()) {
      await this.enableCamera(() => void this.playEndless());
      return;
    }
    this.startLevel(generateEndless(), { endless: true, insert: true });
  }

  /**
   * Sets up a run. With `insert`, the tape insert plays first (2 s, or until a
   * key on the very first tape); without it - a retry - play starts at once.
   */
  private startLevel(level: Level, opts: { endless: boolean; insert: boolean }): void {
    this.ensureSynthetic();
    this.clearPlayUi();

    // Every route into a level has to start the audio, not just the title.
    void sound.resume().then(() => {
      this.applyVolume();
      sound.startBed();
    });

    this.level = level;
    this.stage.setWatcherVariant(level.tape);
    sound.stopTheme();
    // Decision D12: the first daily attempt is the one that counts.
    this.practiceRun = level.mode === 'daily' && this.progress.daily?.day === dayNumber();
    this.reactions.reset();
    this.lines.reset();
    this.lastConsumedFrameT = -1;
    this.lowestSeen = 1;
    this.watcherStartedMs = -1;

    this.world = new World({
      level,
      tunables: defaultTunables(),
      // Daily runs share a seed so everyone gets the same cast of Wicks.
      seed: level.mode === 'daily' ? level.index * 7919 + 13 : (Date.now() & 0xffff) + 1,
      survivors: survivorMap(this.progress),
      endless: opts.endless,
    });

    this.scares = new ScareDirector(level, {
      enabled: this.settings.scares,
      reducedEffects: this.settings.reducedEffects,
      segmentationAvailable: false,
    });
    const finaleAt = level.scares.find((s) => s.type === 'faceLooksBack')?.atMs ?? -1;
    this.finale = finaleAt < 0 ? null : new FaceLooksBack(finaleAt, this.settings.scares);

    this.stage.setOsdVisible(true);
    this.setScreen(null, 'playing');
    this.hudView = hud(() => this.pause());
    this.uiHost.appendChild(this.hudView.node);

    if (!opts.insert) {
      this.beginPlay();
      return;
    }
    const firstRun = !this.settings.howToPlaySeen;
    this.overlay = tapeInsert(level, { firstRun, assist: this.source === this.synthetic });
    this.uiHost.appendChild(this.overlay);
    if (firstRun) {
      this.saveSettingsWith({ howToPlaySeen: true });
      this.overlay.addEventListener('pointerdown', () => this.beginPlay());
    }
    this.insertUntilMs = firstRun ? Infinity : performance.now() + config.flow.tapeInsertMs;
    this.phase = 'inserting';
  }

  /** The insert is over (or skipped): the tape runs. */
  private beginPlay(): void {
    if (this.world === null) return;
    this.overlay?.remove();
    this.overlay = null;
    this.phase = 'playing';
    this.crashAtMs = performance.now();
    this.lastRenderMs = performance.now();

    // U8 - the rolling buffer starts only if the player opted in.
    this.recordingThisRun = false;
    if (this.settings.recording && this.recorder.available) {
      this.portrait.reset();
      this.recordingThisRun = this.recorder.start({
        canvas: this.portrait.canvas,
        audioNode: sound.outputNode,
        audioContext: sound.context,
      });
    }
    sound.unduck();
    this.frameTimes = [];
  }

  /** Retry, from the results or the pause screen: 0.8 s of rewind, then play. */
  private rewindAndRestart(): void {
    const level = this.level;
    if (level === null) return;
    this.setScreen(null, 'rewinding');
    this.clearPlayUi();
    void this.recorder.stop();
    this.recordingThisRun = false;
    sound.play('tapeStop');
    this.overlay = rewindOverlay();
    this.uiHost.appendChild(this.overlay);
    window.setTimeout(() => {
      if (this.phase !== 'rewinding') return;
      this.startLevel(level, { endless: level.mode === 'endless', insert: false });
    }, config.flow.rewindMs);
  }

  /** Removes the in-game overlays. They live outside `currentScreen`. */
  private clearPlayUi(): void {
    this.hudView?.node.remove();
    this.hudView = null;
    this.overlay?.remove();
    this.overlay = null;
  }

  // -------------------------------------------------------------------- loop

  private loop = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    const dtMs = Math.min(100, now - this.lastFrameMs);
    this.lastFrameMs = now;
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.frameTimes.push(dtMs);
    this.updateDebug(now);

    // Assist produces a frame on demand; the webcam pushes them asynchronously.
    if (this.source === this.synthetic && this.synthetic !== null) this.synthetic.tick(now);

    if (this.phase === 'inserting') {
      // The picture settles behind the label; nothing moves on the face yet.
      if (now >= this.insertUntilMs) this.beginPlay();
      else this.renderFrame(now, dtMs);
      return;
    }

    if (this.phase !== 'playing') {
      // Pause, Results and the rewind are see-through, so the stage under them
      // stays live. Every other screen is opaque: drawing the stage and its
      // post-process under it only took frame time from the tracker.
      const seeThrough = this.phase === 'paused' || this.phase === 'results' || this.phase === 'rewinding';
      if (seeThrough && this.world !== null && this.level !== null) this.renderFrame(now, 0);
      return;
    }

    const world = this.world;
    const level = this.level;
    if (world === null || level === null) return;

    // `latest()` returns the same frame until the tracker produces a new one.
    // Pushing it repeatedly would collapse the terrain interpolation.
    const frame = this.source?.latest() ?? null;
    if (frame !== null && frame.t !== this.lastConsumedFrameT) {
      this.lastConsumedFrameT = frame.t;
      this.consumeFace(frame, now, world);
    }

    world.setReactions(this.reactions.current);
    world.step(dtMs);

    const scare = this.scares?.update(world.elapsedMs) ?? null;
    if (scare !== null) this.onScare(scare);

    this.drainEvents(world, now);
    this.lines.setMood(world.composureState.mood);
    this.lines.tick(now);

    // U8 - remember when the player cracked hardest, for the clip cut.
    if (world.composureState.lowestFraction < this.lowestSeen) {
      this.lowestSeen = world.composureState.lowestFraction;
      this.crashAtMs = now;
    }

    const snap = world.snapshot();
    this.hudView?.setTracking(this.trackingLost(world, now));

    this.renderParity = !this.renderParity;
    if (!this.trackerStarved() || this.renderParity) {
      this.renderFrame(now, Math.min(100, now - this.lastRenderMs), snap);
      this.lastRenderMs = now;
      if (this.recordingThisRun) this.capturePortrait(now, snap);
    }

    if (snap.over) this.finishRun();
  };

  /** Loading, or the face left the frame: "TRACKING…" with a Pause button. */
  private trackingLost(world: World, now: number): boolean {
    if (this.source !== this.webcam) return false;
    return !world.faceSeen || now - this.lastFaceAtMs > config.face.lostTrackingPauseMs;
  }

  /** True while a live camera is being out-run by the renderer. */
  private trackerStarved(): boolean {
    if (this.source !== this.webcam || this.webcam === null) return false;
    const hz = this.webcam.info().trackingHz;
    return hz > 0 && hz < config.render.trackerPriorityHz && this.fps > config.render.throttleAboveFps;
  }

  /** `?debug=1` - the numbers docs/OVERHAUL.md section 7 is judged by. */
  private updateDebug(now: number): void {
    const d = this.debug;
    if (d === null) return;
    const recent = this.frameTimes.slice(-60);
    let offsetPx: number | null = null;
    const raw = this.source === this.webcam ? (this.webcam?.latestRaw() ?? null) : null;
    const nose = raw?.faces[0]?.landmarks[NOSE_TIP_INDEX];
    if (raw !== null && nose !== undefined) {
      const inVideo = this.stage.videoPointToScreen(nose);
      const inWorld = worldToScreen(imageToWorld(nose, this.cal, raw.aspect), this.cal, this.stage.viewport);
      if (inVideo !== null) offsetPx = Math.hypot(inVideo.x - inWorld.x, inVideo.y - inWorld.y);
    }
    d.update(now, {
      trackerHz: this.trackingHz,
      fps: this.fps,
      worstFrameMs: recent.length === 0 ? 0 : Math.max(...recent),
      detectMs: this.source === this.webcam ? (this.webcam?.detectMs ?? null) : null,
      offsetPx,
    });
  }

  /** Pushes a face frame into the world, applying the finale override if due. */
  private consumeFace(frame: FaceFrame, now: number, world: World): void {
    const face = frame.faces[0];
    if (face === undefined) return;
    this.lastFaceAtMs = now;

    // SPEC 10.3 - for two seconds the contours smile and wink on their own.
    // Only the blendshapes feeding terrain and reactions are touched; the
    // player's actual video is never altered.
    if (this.finale !== null && this.finale.update(world.elapsedMs)) {
      const o = finaleBlendOverride(this.finale.progress(world.elapsedMs));
      face.blend = { ...face.blend, smile: o.smile, blinkL: o.blinkL };
      this.lines.request({ trigger: 'finale' }, now);
    }

    world.setFace(frame);
    this.reactions.update(face.blend, face.scale, world.faceSpeedFhPerS, now, config.quake.speedFhPerS);
  }

  /** ms since the Watcher arrived, or null once it has finished. */
  private watcherElapsed(now: number): number | null {
    if (this.watcherStartedMs < 0) return null;
    const elapsed = now - this.watcherStartedMs;
    if (elapsed > this.stage.watcherDurationMs(this.settings.reducedEffects)) {
      this.watcherStartedMs = -1;
      return null;
    }
    return elapsed;
  }

  /** Turns world events into sound, Wick lines and screen effects. */
  private drainEvents(world: World, now: number): void {
    for (const e of world.drain()) {
      switch (e.kind) {
        case 'spawn':
          sound.play('squeak', (e.wick.id % 7) / 7);
          this.say('spawn', e.wick, now);
          break;
        case 'save':
          sound.play('gateChime');
          this.say('saved', e.wick, now);
          break;
        case 'lost':
          sound.play(e.cause === 'maw' ? 'gulp' : 'flameOut');
          this.say(e.cause === 'maw' ? 'swallowed' : 'lostOther', e.wick, now);
          this.stage.addShake(e.cause === 'maw' ? 0.02 : 0.01, this.cal);
          break;
        case 'offering':
          sound.play('offering');
          this.stage.addFlare(e.x, e.y, now);
          this.lines.request({ trigger: 'offering', at: { x: e.x, y: e.y } }, now);
          break;
        case 'flick':
          sound.play('flick');
          this.lines.request({ trigger: 'flick', at: { x: e.x, y: e.y } }, now);
          break;
        case 'land':
          sound.play('thud');
          break;
        case 'rail':
          sound.play('slide');
          this.lines.request({ trigger: 'rail', at: { x: e.x, y: e.y } }, now);
          break;
        case 'quake':
          this.stage.addShake(0.03, this.cal);
          this.lines.request({ trigger: 'quake' }, now);
          break;
        case 'yawn':
          sound.play('yawn');
          this.lines.request({ trigger: 'yawn' }, now);
          break;
        case 'procession':
          sound.play('processionStep', Math.min(1, e.multiple / config.procession.maxMultiple));
          this.lines.request({ trigger: 'procession' }, now);
          break;
        case 'processionBroken':
          break;
        case 'turn':
          this.lines.request({ trigger: 'turn', at: { x: e.x, y: e.y } }, now);
          break;
        case 'stuck':
          // The one line that is really an instruction: tilting frees a Wick
          // pacing a dead end, and nothing else on screen says so.
          this.lines.request({ trigger: 'stuck', at: { x: e.x, y: e.y } }, now);
          break;
        case 'warded':
          sound.play('skitter');
          break;
        case 'shielded':
          sound.play('thud');
          break;
        case 'crawlerSated':
          sound.play('skitter');
          break;
        case 'watcher':
          // Earned, not scheduled. Honours Scares off completely - no sound, no
          // face, the tape just ends.
          if (this.settings.scares) {
            this.watcherStartedMs = now;
            sound.watcherSequence(this.stage.watcherLeadMs(this.settings.reducedEffects), this.stage.watcherVoicePitch);
          }
          break;
        case 'wave':
          sound.play('processionStep', 0.8);
          break;
      }
    }

    // Reaction lines, which outrank the scripted ones (SPEC section 12.7).
    const r = this.reactions.current;
    const anchor = world.wicks.find((w) => w.state !== 'saved' && w.state !== 'lost');
    const at = anchor === undefined ? undefined : { x: anchor.body.x, y: anchor.body.y };
    const req = (trigger: Parameters<LineDirector['request']>[0]['trigger']): void => {
      this.lines.request({ trigger, ...(at === undefined ? {} : { at }) }, now);
    };
    if (world.mawState.justOpened) req('mawOpen');
    else if (world.mawState.justClosed) req('mawClosed');
    else if (r.laughing) req('laughing');
    else if (r.gasp) req('gasp');
    else if (r.browsUp) req('browsUp');
    else if (r.smiling) req('smiling');
    else if (r.leaningIn) req('leaningIn');
    else if (world.crawlers.some((c) => c.alive)) req('crawler');
    else if (world.moths.some((m) => m.alive)) req('moth');
    else req('idle');

    // Scripted level lines.
    const level = this.level;
    if (level !== null) {
      for (const l of level.lines) {
        if (world.elapsedMs >= l.atMs && world.elapsedMs < l.atMs + 120) {
          this.lines.request({ trigger: 'idle', text: l.text, priority: 20 }, now);
        }
      }
    }
  }

  /** Says a line about a specific Wick. */
  private say(
    trigger: 'spawn' | 'saved' | 'swallowed' | 'lostOther',
    wick: { name: string; title: string | null; body: { x: number; y: number } },
    now: number,
  ): void {
    this.lines.request(
      {
        trigger,
        at: { x: wick.body.x, y: wick.body.y },
        name: wick.name,
        full: displayName(wick.name, wick.title),
      },
      now,
    );
  }

  private onScare(scare: ActiveScare): void {
    if (!this.settings.scares) return;
    if (scare.type === 'stinger' || scare.type === 'figure' || scare.type === 'behindYou') {
      sound.play('stinger');
      this.stage.addShake(0.045, this.cal);
    }
    if (scare.type === 'whisper') {
      this.lines.request({ trigger: 'idle', text: WHISPER_LINE, priority: 75 }, performance.now());
    }
  }

  private renderFrame(now: number, dtMs: number, snapshot?: WorldSnapshot): void {
    const world = this.world;
    const level = this.level;
    if (world === null || level === null) return;
    const snap = snapshot ?? world.snapshot();

    this.stage.render({
      world,
      snapshot: snap,
      level,
      cal: this.cal,
      settings: this.settings,
      line: this.lines.current,
      scare: this.scares?.current ?? null,
      video: this.webcam?.info().video ?? null,
      timeMs: now,
      dtMs,
      watcherElapsedMs: this.watcherElapsed(now),
      mark: tapeMark(level.id, level.mode, snap.wave),
    });
  }

  private capturePortrait(now: number, snapshot?: WorldSnapshot): void {
    const world = this.world;
    if (world === null) return;
    const centre = worldToScreen({ x: 0, y: 0 }, this.cal, this.stage.viewport);
    const dpr = this.stage.canvas.width / Math.max(1, this.stage.canvas.clientWidth || 1);
    this.portrait.draw({
      source: this.stage.canvas,
      faceScreenX: centre.x * dpr,
      faceScreenY: centre.y * dpr,
      snapshot: snapshot ?? world.snapshot(),
      label: this.level?.label ?? '',
      timeMs: now,
    });
  }

  // ------------------------------------------------------------------ results

  private finishRun(): void {
    const world = this.world;
    const level = this.level;
    if (world === null || level === null) return;

    const snap = world.snapshot();
    const result = buildResult(level, snap, world.finalScore());

    const beforeBest = this.progress.endlessBest.score;
    this.progress = recordRun(
      this.progress,
      result,
      world.roster.map((w) => ({ name: w.name, state: w.state })),
    );
    if (level.mode === 'daily' && !this.practiceRun) {
      this.progress = recordDaily(this.progress, dayNumber(), result);
    }
    saveProgress(this.progress);

    const newBest = level.mode === 'endless' && result.score > beforeBest;

    sound.play('tapeStop');
    sound.duck();
    void this.recorder.stop();
    this.clearPlayUi();
    this.showResults(result, { newBest, clip: this.recordingThisRun });
  }

  private showResults(result: RunResult, opts: { newBest: boolean; clip: boolean }): void {
    const level = this.level;
    if (level === null) return;
    // A lost tape offers no way forward: try again, or leave.
    const next = result.failed ? null : level.mode === 'story' ? nextLevelId(level.id) : null;
    // The ending belongs to the narrative finale, not to whatever is last on disk.
    const endsStory = !result.failed && level.mode === 'story' && isStoryFinale(level.id);
    const line = result.failed
      ? (copy.lostLines[Math.floor(Math.random() * copy.lostLines.length)] ?? copy.stampLine['TAPE LOST'])
      : copy.stampLine[result.stamp];

    this.setScreen(
      resultsScreen(
        result,
        {
          next: endsStory ? () => this.showEnding() : next !== null ? () => void this.playStory(next) : null,
          retry: () => this.rewindAndRestart(),
          shelf: () => this.showShelf(),
          mainMenu: () => this.showTitle(),
          saveClip: opts.clip ? () => this.previewClip(result, opts) : null,
        },
        { practice: this.practiceRun, newBest: opts.newBest, line },
      ),
      'results',
      () => this.showTitle(),
    );
  }

  /** U8 - preview before saving, and discard everything on close (invariant 3). */
  private previewClip(result: RunResult, opts: { newBest: boolean; clip: boolean }): void {
    const blob = this.recorder.buildHighlight(this.crashAtMs);
    if (blob === null) {
      this.showResults(result, { ...opts, clip: false });
      return;
    }
    const url = URL.createObjectURL(blob);
    const close = (): void => {
      URL.revokeObjectURL(url);
      this.recorder.discard();
      this.recordingThisRun = false;
      this.showResults(result, { ...opts, clip: false });
    };
    this.setScreen(
      clipPreviewScreen(
        url,
        () => {
          downloadBlob(blob, `faceplant-${result.levelId}.${this.recorder.extension}`);
          close();
        },
        close,
      ),
      'results',
      close,
    );
  }

  private showEnding(): void {
    this.progress = { ...this.progress, endingSeen: true };
    saveProgress(this.progress);
    this.endRun();
    this.setScreen(endingScreen(() => this.showTitle()), 'ending', () => this.showTitle());
  }

  // ------------------------------------------------------------------- pause

  private onGlobalKey = (e: KeyboardEvent): void => {
    // The very first tape insert waits for any key.
    if (this.phase === 'inserting' && this.insertUntilMs === Infinity && e.key !== 'Escape') {
      e.preventDefault();
      this.beginPlay();
      return;
    }
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;
    // Already handled by the screen's own focus trap, which may have just
    // changed the phase - handling it again here would undo that (Esc from
    // Settings went back to Pause, then straight on into play).
    if (e.defaultPrevented) return;
    // The trap only hears keys while focus is inside its screen; this catches
    // Esc when focus is anywhere else.
    if (e.key === 'Escape' && this.escape !== null && this.currentScreen !== null) {
      e.preventDefault();
      this.escape();
      return;
    }
    if (this.phase === 'playing' || this.phase === 'inserting') {
      e.preventDefault();
      this.pause();
    } else if (this.phase === 'paused') {
      e.preventDefault();
      this.resume();
    }
  };

  private pause(): void {
    if (this.world === null) return;
    // Pausing during the insert ends it: the tape starts, already paused.
    if (this.phase === 'inserting') this.beginPlay();
    sound.duck();
    this.setScreen(
      pauseScreen(
        {
          resume: () => this.resume(),
          restart: () => this.rewindAndRestart(),
          settings: () => this.showSettings(() => this.pause()),
          mainMenu: () => {
            sound.play('tapeStop');
            this.showTitle();
          },
        },
        { assist: this.source === this.synthetic },
      ),
      'paused',
      () => this.resume(),
    );
  }

  private resume(): void {
    sound.unduck();
    this.setScreen(null, 'playing');
    if (this.hudView !== null && !this.uiHost.contains(this.hudView.node)) this.uiHost.appendChild(this.hudView.node);
  }

  /** Measured render rate, for AC-7. Read from the debug page and the console. */
  get fps(): number {
    if (this.frameTimes.length === 0) return 0;
    const mean = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    return mean > 0 ? 1000 / mean : 0;
  }

  get trackingHz(): number {
    return this.source?.info().trackingHz ?? 0;
  }

  destroy(): void {
    this.running = false;
    window.removeEventListener('keydown', this.onGlobalKey);
    this.assistInput.detach();
    this.recorder.discard();
    this.webcam?.stop();
    this.synthetic?.stop();
    sound.dispose();
    this.stage.destroy();
  }
}
