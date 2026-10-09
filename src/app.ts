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
 */

import { config, defaultTunables, type Tunables } from './config.ts';
import { buildCalibration, CalibrationCollector, defaultCalibration, type Calibration } from './face/calibration.ts';
import { ReactionDetector } from './face/reactions.ts';
import { AssistInput, SyntheticFaceSource } from './face/syntheticSource.ts';
import type { FaceFrame, FaceSource, RawFrame } from './face/types.ts';
import { CameraError, WebcamFaceSource } from './face/webcamSource.ts';
import { dayNumber, generateDaily, generateEndless } from './game/daily.ts';
import { isStoryFinale, loadLevel, nextLevelId, nextUnplayedLevelId, TAPES } from './game/levelLoader.ts';
import type { Level } from './game/levelSchema.ts';
import { LineDirector } from './game/lineDirector.ts';
import { displayName } from './game/names.ts';
import { buildResult, type RunResult } from './game/rules.ts';
import { FaceLooksBack, finaleBlendOverride, ScareDirector, type ActiveScare } from './game/scares.ts';
import { World } from './physics/world.ts';
import { Stage } from './render/stage.ts';
import { sound } from './audio/sound.ts';
import { PortraitCanvas } from './share/portraitCanvas.ts';
import { ClipRecorder, downloadBlob } from './share/recorder.ts';
import { cardFilename, downloadCanvas, drawResultCard } from './share/resultCard.ts';
import { copyToClipboard, shareText } from './share/shareText.ts';
import {
  addCoins,
  buyRite,
  completedLevelIds,
  hasProgress,
  loadProgress,
  recordDaily,
  recordRun,
  resetProgress,
  saveProgress,
  survivorMap,
  totalCandles,
  type Progress,
  type RiteName,
} from './storage/progress.ts';
import { applySystemPreferences, loadSettings, saveSettings, storageAvailable, type Settings } from './storage/settings.ts';
import { copy } from './ui/copy.ts';
import { el, focusFirst, toast, trapFocus } from './ui/dom.ts';
import {
  calibrationScreen,
  cameraScreen,
  clipPreviewScreen,
  endingScreen,
  howToPlayScreen,
  hud,
  levelIntro,
  noticeScreen,
  ossuaryScreen,
  pauseScreen,
  resultsScreen,
  shopScreen,
  settingsScreen,
  shelfScreen,
  titleScreen,
  type HudView,
} from './ui/screens.ts';
import { worldToScreen } from './terrain/mapping.ts';

type Phase = 'boot' | 'notice' | 'title' | 'camera' | 'calibrate' | 'shelf' | 'playing' | 'paused' | 'results' | 'ending' | 'menu';

export class App {
  private readonly host: HTMLElement;
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
  private tunables: Tunables = defaultTunables();

  private readonly recorder = new ClipRecorder();
  private readonly portrait = new PortraitCanvas();
  private recordingThisRun = false;
  private crashAtMs = 0;
  private lowestSeen = 1;

  private phase: Phase = 'boot';
  private currentScreen: HTMLElement | null = null;
  private releaseTrap: (() => void) | null = null;
  private hudView: HudView | null = null;
  private introNode: HTMLElement | null = null;

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

  constructor(host: HTMLElement) {
    this.host = host;
    this.stageHost = el('div', { id: 'stage-host' });
    this.uiHost = el('div', { id: 'ui-host' });
    host.appendChild(this.stageHost);
    host.appendChild(this.uiHost);

    this.settings = applySystemPreferences(loadSettings());
    this.progress = loadProgress();
    this.applyBodyClasses();
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
    this.running = true;
    this.lastFrameMs = performance.now();
    requestAnimationFrame(this.loop);

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
    if (node === null) return;
    this.uiHost.appendChild(node);
    this.releaseTrap = trapFocus(node, onEscape);
    focusFirst(node);
  }

  private applyBodyClasses(): void {
    document.body.classList.toggle('reduced-effects', this.settings.reducedEffects);
  }

  private showNotice(): void {
    this.setScreen(
      noticeScreen((scares) => {
        this.settings = { ...this.settings, scares, noticeSeen: true };
        saveSettings(this.settings);
        void sound.resume().then(() => sound.setVolume(this.settings.volume));
        // The very first thing a brand-new player sees after the safety notice
        // is How to Play, not the title screen - a title screen with no
        // instructions on it is not usable by someone who has never played.
        if (!this.settings.howToPlaySeen) this.showHowToPlay(() => this.showTitle());
        else this.showTitle();
      }),
      'notice',
    );
  }

  private showHowToPlay(onClose: () => void): void {
    this.settings = { ...this.settings, howToPlaySeen: true };
    saveSettings(this.settings);
    this.setScreen(howToPlayScreen(onClose), 'menu', onClose);
  }

  /** Removes the in-game overlay. The HUD lives outside `currentScreen`. */
  private clearPlayUi(): void {
    this.hudView?.node.remove();
    this.hudView = null;
    this.introNode?.remove();
    this.introNode = null;
  }

  private showTitle(): void {
    this.clearPlayUi();
    this.stage.setOsdVisible(false);

    const returning = hasProgress(this.progress);

    this.setScreen(
      titleScreen(
        {
          // U10 - for a new player the primary button plays immediately, with
          // no permission prompt between a stranger and the first Wick landing
          // on a face. For a returning player it resumes instead: it used to
          // restart 01-1 and silently discard their place in the story.
          play: () => (returning ? void this.continueStory() : void this.beginFirstRun(true)),
          playNoCamera: () => void this.beginFirstRun(false),
          shelf: () => this.showShelf(),
          settings: () => this.showSettings(() => this.showTitle()),
          ossuary: () => this.setScreen(ossuaryScreen(this.progress, () => this.showTitle()), 'menu', () => this.showTitle()),
          shop: () => this.showShop(),
          howToPlay: () => this.showHowToPlay(() => this.showTitle()),
        },
        {
          hasCamera: this.webcam !== null,
          reducedEffects: this.settings.reducedEffects,
          returning,
          candles: totalCandles(this.progress),
          coins: this.progress.coins,
          canSave: storageAvailable(),
        },
      ),
      'title',
    );
  }

  /**
   * CONTINUE: pick up at the first level the player has not finished. Once the
   * whole story is done there is nothing to resume, so the shelf - with the
   * Daily Tape, the Long Tape and anything left to three-candle - is the right
   * destination instead.
   */
  private async continueStory(): Promise<void> {
    void sound.resume().then(() => {
      sound.setVolume(this.settings.volume);
      sound.startBed();
    });
    this.ensureSynthetic();

    const next = nextUnplayedLevelId(completedLevelIds(this.progress));
    if (next === null) {
      this.showShelf();
      return;
    }
    await this.playStory(next);
  }

  private showShop(): void {
    const render = (): void => {
      this.setScreen(
        shopScreen(
          this.progress,
          (item: RiteName) => {
            const before = this.progress.coins;
            this.progress = buyRite(this.progress, item);
            // Only treat it as a purchase if coins actually moved, so a
            // double-click or an unaffordable item cannot bank a free item.
            if (this.progress.coins !== before) {
              saveProgress(this.progress);
              sound.play('gateChime');
            }
            render();
          },
          () => this.showTitle(),
        ),
        'menu',
        () => this.showTitle(),
      );
    };
    render();
  }

  private showSettings(onClose: () => void): void {
    const render = (): void => {
      this.setScreen(
        settingsScreen(
          this.settings,
          {
            change: (next) => {
              this.settings = { ...this.settings, ...next };
              saveSettings(this.settings);
              sound.setVolume(this.settings.volume);
              this.applyBodyClasses();
              if (next.controls !== undefined) void this.switchControls(next.controls, onClose);
              this.scares?.setOptions({
                enabled: this.settings.scares,
                reducedEffects: this.settings.reducedEffects,
                segmentationAvailable: false,
              });
              render();
            },
            recalibrate: () => void this.runCalibration(() => onClose()),
            resetProgress: () => {
              this.progress = resetProgress();
              toast(this.uiHost, copy.settings.resetDone);
              sound.play('tapeStop');
              render();
            },
            close: onClose,
          },
          totalCandles(this.progress),
          this.recorder.available,
        ),
        'menu',
        onClose,
      );
    };
    render();
  }

  private showShelf(): void {
    this.clearPlayUi();
    this.stage.setOsdVisible(false);
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

  // ------------------------------------------------------------ face sources

  /**
   * U10 - the first run always starts in Assist, instantly. If the player
   * asked for the camera we start it *in parallel* and swap it in when it is
   * ready, so the permission prompt never blocks the first Wick.
   */
  private async beginFirstRun(wantCamera: boolean): Promise<void> {
    void sound.resume().then(() => {
      sound.setVolume(this.settings.volume);
      sound.startBed();
    });

    this.ensureSynthetic();
    if (wantCamera) {
      this.showCameraExplainer();
      return;
    }
    this.settings = { ...this.settings, controls: 'assist' };
    saveSettings(this.settings);
    await this.playStory(TAPES[0]?.levelIds[0] ?? '01-1');
  }

  private showCameraExplainer(error?: string): void {
    this.setScreen(
      cameraScreen(
        () => void this.enableCamera(),
        () => {
          this.settings = { ...this.settings, controls: 'assist' };
          saveSettings(this.settings);
          void this.playStory(TAPES[0]?.levelIds[0] ?? '01-1');
        },
        error,
      ),
      'camera',
      () => this.showTitle(),
    );
  }

  /**
   * @param onDone where to go once the camera is live and calibrated. Defaults
   *   to the first level, which is right for the opening funnel (U10) and wrong
   *   for the Settings screen - turning the camera on from Settings used to
   *   restart the game.
   */
  private async enableCamera(onDone?: () => void): Promise<void> {
    const cam = new WebcamFaceSource({ lowPower: this.settings.lowPower }, this.cal);
    try {
      await cam.start();
    } catch (err) {
      const reason = err instanceof CameraError ? err.reason : 'unknown';
      this.showCameraExplainer(copy.camera[reason] ?? copy.camera.unknown);
      return;
    }
    this.webcam = cam;
    this.source = cam;
    this.settings = { ...this.settings, controls: 'face' };
    saveSettings(this.settings);
    this.stage.setVideo(cam.info().video);
    await this.runCalibration(onDone ?? (() => void this.playStory(TAPES[0]?.levelIds[0] ?? '01-1')));
  }

  private ensureSynthetic(): void {
    if (this.synthetic !== null) return;
    this.assistInput.attach(this.host);
    this.synthetic = new SyntheticFaceSource(this.assistInput, config.render.aspect, this.cal);
    void this.synthetic.start();
    if (this.source === null) this.source = this.synthetic;
  }

  private async switchControls(mode: 'face' | 'assist', onDone?: () => void): Promise<void> {
    this.lastConsumedFrameT = -1;
    this.watcherStartedMs = -1;
    if (mode === 'assist') {
      this.ensureSynthetic();
      this.source = this.synthetic;
      this.stage.setVideo(null);
      return;
    }
    if (this.webcam !== null) {
      this.source = this.webcam;
      this.stage.setVideo(this.webcam.info().video);
      return;
    }
    await this.enableCamera(onDone);
  }

  // ------------------------------------------------------------- calibration

  /**
   * Four steps (SPEC section 7), run against whichever source is live. In Assist
   * the synthetic face simply holds each pose, so the same code calibrates both
   * and the maths is exercised either way.
   */
  private async runCalibration(onDone: () => void): Promise<void> {
    const cam = this.webcam;
    if (cam === null) {
      // Assist needs no calibration: the canonical face *is* the calibration.
      this.cal = defaultCalibration();
      this.synthetic?.setCalibration(this.cal);
      onDone();
      return;
    }

    const view = calibrationScreen(
      () => {
        this.cal = defaultCalibration(cam.info().aspect);
        cam.setCalibration(this.cal);
        onDone();
      },
      () => void this.runCalibration(onDone),
    );
    this.setScreen(view.node, 'calibrate');

    const steps = [
      { prompt: copy.calibration.sit, ms: config.calibration.holdMs },
      { prompt: copy.calibration.wide, ms: 1800 },
      { prompt: copy.calibration.brows, ms: 1500 },
      { prompt: copy.calibration.blink, ms: 1500 },
    ] as const;

    const collectors = [new CalibrationCollector(), new CalibrationCollector(), new CalibrationCollector(), new CalibrationCollector()];
    const aspect = cam.info().aspect;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const collector = collectors[i];
      if (step === undefined || collector === undefined) continue;
      view.setPrompt(step.prompt);
      view.setError(null);

      const ok = await this.collectFor(collector, step.ms, aspect, view.setProgress, view.setError);
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
      browPeak: collectors[2]?.peakBlend() ?? neutral.blend,
      blinkPeak: collectors[3]?.peakBlend() ?? neutral.blend,
      aspect,
    });
    cam.setCalibration(this.cal);
    this.synthetic?.setCalibration(this.cal);
    view.setPrompt(copy.calibration.done);
    sound.play('gateChime');
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
    return new Promise((resolve) => {
      const started = performance.now();
      let sawFace = false;
      let lastT = -1;

      const tick = (): void => {
        const now = performance.now();
        const elapsed = now - started;
        onProgress(elapsed / durationMs);

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

  private riteTunables(): Tunables {
    const t = defaultTunables();
    const r = this.progress.rites;
    if (r.includes('steadyWicks')) {
      t.wickMaxStepDownFh *= config.rites.steadyWicksMultiple;
      t.wickMaxGapFh *= config.rites.steadyWicksMultiple;
    }
    if (r.includes('slowSpawn')) t.spawnIntervalMultiple = config.rites.slowSpawnMultiple;
    if (r.includes('wideGate')) t.gateBonusFh = config.rites.wideGateBonusFh;
    if (r.includes('secondChance')) t.secondChanceCount = config.rites.secondChanceCount;
    // The three newer items. These were briefly purchasable and inert, which
    // is worse than not selling them at all - `tests/game/game.test.ts` now
    // asserts every shop item changes at least one tunable.
    if (r.includes('lanternOil')) t.lightRadiusMultiple = config.rites.lanternOilMultiple;
    if (r.includes('ironNerve')) t.composureDrainMultiple = config.rites.ironNerveMultiple;
    if (r.includes('wardingSalt')) {
      t.crawlerSpeedMultiple = config.rites.wardingSaltSpeedMultiple;
      t.crawlerTouchMultiple = config.rites.wardingSaltTouchMultiple;
    }
    return t;
  }

  private async playStory(id: string): Promise<void> {
    try {
      this.startLevel(await loadLevel(id), false);
    } catch (err) {
      toast(this.uiHost, `Could not load tape ${id}.`);
      // eslint-disable-next-line no-console
      console.error(err);
      this.showShelf();
    }
  }

  private async playDaily(): Promise<void> {
    this.startLevel(generateDaily(dayNumber()), false);
  }

  private async playEndless(): Promise<void> {
    this.startLevel(generateEndless(), true);
  }

  private startLevel(level: Level, endless: boolean): void {
    this.ensureSynthetic();
    this.clearPlayUi();

    // Every route into a level has to start the audio, not just the title
    // button. A returning player who went title -> shelf -> level got a
    // completely silent game, because the only `resume()` calls were on the
    // paths through the notice and the play button. Both calls are idempotent.
    void sound.resume().then(() => {
      sound.setVolume(this.settings.volume);
      sound.startBed();
    });

    this.level = level;
    // Decision D12: the first daily attempt is the one that counts, so a replay
    // is practice. Derived here rather than set by the caller, because setting
    // it before `startLevel` left it stale if a run was abandoned.
    this.practiceRun = level.mode === 'daily' && this.progress.daily?.day === dayNumber();
    this.tunables = this.riteTunables();
    this.reactions.reset();
    this.lines.reset();
    this.lastConsumedFrameT = -1;
    this.lowestSeen = 1;
    this.crashAtMs = performance.now();

    this.world = new World({
      level,
      tunables: this.tunables,
      // Daily runs share a seed so everyone gets the same cast of Wicks.
      seed: level.mode === 'daily' ? level.index * 7919 + 13 : (Date.now() & 0xffff) + 1,
      survivors: survivorMap(this.progress),
      endless,
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

    this.hudView = hud();
    this.uiHost.appendChild(this.hudView.node);

    this.introNode = levelIntro(level);
    this.uiHost.appendChild(this.introNode);
    setTimeout(() => {
      this.introNode?.remove();
      this.introNode = null;
    }, 2600);

    // U8 - start the rolling buffer only if the player opted in.
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

  // -------------------------------------------------------------------- loop

  private loop = (now: number): void => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);

    const dtMs = Math.min(100, now - this.lastFrameMs);
    this.lastFrameMs = now;
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.frameTimes.push(dtMs);

    // Assist produces a frame on demand; the webcam pushes them asynchronously.
    if (this.source === this.synthetic && this.synthetic !== null) this.synthetic.tick(now);

    if (this.phase !== 'playing') {
      // Still render, so menus sit over a live stage rather than a frozen one.
      if (this.world !== null && this.level !== null) this.renderFrame(now, 0);
      return;
    }

    const world = this.world;
    const level = this.level;
    if (world === null || level === null) return;

    // `latest()` returns the same frame object until the tracker produces a new
    // one, and tracking runs at 20-30 Hz against a 60 Hz render loop. Pushing
    // the same frame repeatedly would collapse `frameA` onto `frameB`, which
    // destroys the terrain interpolation and - worse - makes the measured
    // face-centre speed permanently zero, disabling the quake entirely.
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

    this.hudView?.update(world.composureState.fraction, world.composureState.mood);
    this.hudView?.setLossBudget(world.snapshot().lossesRemaining);
    this.hudView?.setHint(this.hintText(world, now));

    this.renderFrame(now, dtMs);
    if (this.recordingThisRun) this.capturePortrait(now);

    if (world.snapshot().over) this.finishRun();
  };

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
    this.reactions.update(
      face.blend,
      face.scale,
      world.faceSpeedFhPerS,
      now,
      config.quake.speedFhPerS,
    );
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

  private hintText(world: World, now: number): string | null {
    if (!world.faceSeen) return copy.hud.noFace;
    if (this.source === this.webcam && now - this.lastFaceAtMs > config.face.lostTrackingPauseMs) {
      return copy.pause.lostTracking;
    }
    return null;
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
        case 'lost': {
          sound.play(e.cause === 'maw' ? 'gulp' : 'flameOut');
          // The Ossuary (U7) keeps a Wick's last words, so record what it said.
          const line = this.say(e.cause === 'maw' ? 'swallowed' : 'lostOther', e.wick, now);
          e.wick.lastWords = line;
          this.stage.addShake(e.cause === 'maw' ? 0.02 : 0.01, this.cal);
          break;
        }
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
        case 'crawlerSated':
          sound.play('skitter');
          break;
        case 'watcher':
          // Earned, not scheduled: more than half the roster is gone. Honours
          // Scares off completely - no sound, no face, the tape just ends.
          if (this.settings.scares) {
            this.watcherStartedMs = now;
            sound.play('watcherShout');
            this.lines.request({ trigger: 'watcher', priority: 120 }, now);
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

  /** Says a line about a specific Wick, and returns the text for the Ossuary. */
  private say(trigger: 'spawn' | 'saved' | 'swallowed' | 'lostOther', wick: { name: string; title: string | null; body: { x: number; y: number } }, now: number): string | null {
    const line = this.lines.request(
      {
        trigger,
        at: { x: wick.body.x, y: wick.body.y },
        name: wick.name,
        full: displayName(wick.name, wick.title),
      },
      now,
    );
    return line?.text ?? null;
  }

  private onScare(scare: ActiveScare): void {
    if (!this.settings.scares) return;
    if (scare.type === 'stinger' || scare.type === 'figure' || scare.type === 'behindYou') {
      sound.play('stinger');
      // A small physical jolt alongside the sting - `TapeFx` clamps this to
      // `config.render.maxShakeFh` and "Reduce effects" disables it outright,
      // so it never becomes disorienting.
      this.stage.addShake(0.045, this.cal);
    }
    if (scare.type === 'whisper') {
      this.lines.request({ trigger: 'idle', text: 'it can see us.', priority: 75 }, performance.now());
    }
  }

  private renderFrame(now: number, dtMs: number): void {
    const world = this.world;
    const level = this.level;
    if (world === null || level === null) return;

    this.stage.render({
      world,
      snapshot: world.snapshot(),
      level,
      cal: this.cal,
      settings: this.settings,
      line: this.lines.current,
      scare: this.scares?.current ?? null,
      video: this.webcam?.info().video ?? null,
      timeMs: now,
      dtMs,
      gateBonusFh: this.tunables.gateBonusFh,
      watcherElapsedMs: this.watcherElapsed(now),
      showNoFaceHint: !world.faceSeen,
    });
  }

  private capturePortrait(now: number): void {
    const world = this.world;
    if (world === null) return;
    const centre = worldToScreen({ x: 0, y: 0 }, this.cal, this.stage.viewport);
    const dpr = this.stage.canvas.width / Math.max(1, this.stage.canvas.clientWidth || 1);
    this.portrait.draw({
      source: this.stage.canvas,
      faceScreenX: centre.x * dpr,
      faceScreenY: centre.y * dpr,
      snapshot: world.snapshot(),
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
    // Replaying an already-cleared level pays reduced coins, so grinding the
    // easiest level is not the most efficient way to earn.
    const alreadyCleared = (this.progress.levels[level.id]?.candles ?? 0) > 0;
    const result = buildResult(level, snap, world.finalScore(), alreadyCleared);

    const beforeBest = this.progress.endlessBest.score;
    this.progress = recordRun(
      this.progress,
      result,
      world.roster.map((w) => ({
        name: w.name,
        title: w.title,
        state: w.state,
        cause: w.cause,
        lastWords: w.lastWords,
      })),
    );
    if (level.mode === 'daily' && !this.practiceRun) {
      this.progress = recordDaily(this.progress, dayNumber(), result);
    }
    // Coins are banked here, which is also the only place they are created.
    // A failed tape pays nothing (`coinsFor` returns 0), so there is no need
    // to special-case failure.
    if (result.coins > 0) this.progress = addCoins(this.progress, result.coins);
    saveProgress(this.progress);

    const newBest = level.mode === 'endless' && result.score > beforeBest;

    sound.play('tapeStop');
    sound.duck();
    void this.recorder.stop();

    this.clearPlayUi();

    // A lost tape offers no way forward at all - retry or leave. That is the
    // entire point of there now being a way to lose.
    const next = result.failed ? null : level.mode === 'story' ? nextLevelId(level.id) : null;
    // The ending card belongs to the narrative finale, not to whatever happens
    // to be last on disk. Adding Tape 05 as post-game content moved the credits
    // onto a bonus level until this was made explicit: finish 04-2 and the
    // story ends, then Tape 05 is waiting on the shelf.
    const endsStory = !result.failed && level.mode === 'story' && isStoryFinale(level.id);

    this.setScreen(
      resultsScreen(
        result,
        {
          next: endsStory
            ? () => this.showEnding()
            : next !== null
              ? () => void this.playStory(next)
              : null,
          retry: () => this.startLevel(level, level.mode === 'endless'),
          shelf: () => this.showShelf(),
          copyResult: () => {
            void copyToClipboard(shareText(result)).then((ok) => {
              if (ok) toast(this.uiHost, copy.results.copied);
            });
          },
          saveCard: () => {
            const card = drawResultCard({ result, frame: this.stage.canvas });
            downloadCanvas(card, cardFilename(result));
          },
          saveClip: this.recordingThisRun ? () => this.previewClip(result) : null,
        },
        { practice: this.practiceRun, newBest, recordingOn: this.settings.recording },
      ),
      'results',
      () => this.showShelf(),
    );
  }

  /** U8 - preview before saving, and discard everything on close (invariant 3). */
  private previewClip(result: RunResult): void {
    const blob = this.recorder.buildHighlight(this.crashAtMs);
    if (blob === null) {
      toast(this.uiHost, 'Nothing was recorded.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const close = (): void => {
      URL.revokeObjectURL(url);
      this.recorder.discard();
      this.finishRunScreenAgain(result);
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

  /** Re-shows results after the clip dialog, without re-recording the run. */
  private finishRunScreenAgain(result: RunResult): void {
    const level = this.level;
    if (level === null) return;
    const next = level.mode === 'story' ? nextLevelId(level.id) : null;
    const endsStory = level.mode === 'story' && isStoryFinale(level.id);
    this.setScreen(
      resultsScreen(
        result,
        {
          next: endsStory
            ? () => this.showEnding()
            : next !== null
              ? () => void this.playStory(next)
              : null,
          retry: () => this.startLevel(level, level.mode === 'endless'),
          shelf: () => this.showShelf(),
          copyResult: () => void copyToClipboard(shareText(result)),
          saveCard: () => downloadCanvas(drawResultCard({ result, frame: this.stage.canvas }), cardFilename(result)),
          saveClip: null,
        },
        { practice: false, newBest: false, recordingOn: this.settings.recording },
      ),
      'results',
      () => this.showShelf(),
    );
  }

  private showEnding(): void {
    this.progress = { ...this.progress, endingSeen: true };
    saveProgress(this.progress);
    this.stage.setOsdVisible(false);
    this.setScreen(endingScreen(() => this.showShelf()), 'ending', () => this.showShelf());
  }

  // ------------------------------------------------------------------- pause

  private onGlobalKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' && e.key !== 'p' && e.key !== 'P') return;

    if (this.phase === 'playing') {
      e.preventDefault();
      this.pause();
    } else if (this.phase === 'paused') {
      e.preventDefault();
      this.resume();
    }
  };

  private pause(): void {
    const lost = this.source === this.webcam && performance.now() - this.lastFaceAtMs > config.face.lostTrackingPauseMs;
    sound.duck();
    this.setScreen(
      pauseScreen(
        {
          resume: () => this.resume(),
          restart: () => {
            if (this.level !== null) this.startLevel(this.level, this.level.mode === 'endless');
          },
          settings: () => this.showSettings(() => this.pause()),
          shelf: () => this.showShelf(),
          // An explicit way out. The abandoned run is simply not scored;
          // everything already earned was written to storage when it was
          // earned, so there is nothing to lose by leaving.
          exit: () => {
            sound.play('tapeStop');
            this.showTitle();
          },
          howToPlay: () => this.showHowToPlay(() => this.pause()),
          switchAssist: () => {
            void this.switchControls('assist');
            this.settings = { ...this.settings, controls: 'assist' };
            saveSettings(this.settings);
            this.resume();
          },
        },
        lost,
      ),
      'paused',
      () => this.resume(),
    );
  }

  private resume(): void {
    sound.unduck();
    this.setScreen(null, 'playing');
    if (this.hudView !== null && !this.uiHost.contains(this.hudView.node)) {
      this.uiHost.appendChild(this.hudView.node);
    }
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
