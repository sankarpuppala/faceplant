/**
 * The webcam tracker. **The only file in the project that imports MediaPipe**
 * (CLAUDE.md section 6), so the rest of the game cannot accidentally depend on it.
 *
 * Privacy (CLAUDE.md invariant 1): the wasm runtime and the model are served
 * from `public/mediapipe/`, same-origin, copied there by
 * `npm run setup:mediapipe`. Nothing is fetched from a CDN and no frame, no
 * landmark and no blendshape leaves this process. `npm run check:privacy`
 * enforces that on the built bundle.
 *
 * API verified against the installed `@mediapipe/tasks-vision@1.1.0`:
 *   FilesetResolver.forVisionTasks(basePath)
 *   FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath,
 *     delegate }, runningMode: 'VIDEO', numFaces, outputFaceBlendshapes })
 *   landmarker.detectForVideo(video, timestampMs) -> { faceLandmarks,
 *     faceBlendshapes }
 */

import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { config } from '../config.ts';
import { buildFaceData } from '../terrain/contours.ts';
import { defaultCalibration, type Calibration } from './calibration.ts';
import { BLENDSHAPE_SOURCES } from './landmarks.ts';
import { Ema, LandmarkSmoother } from './oneEuro.ts';
import type { Blendshapes, FaceFrame, FaceSource, FaceSourceInfo, RawFrame, Vec2 } from './types.ts';

/** Where the wasm and the model live. Relative, so it works from any base path. */
const MEDIAPIPE_BASE = 'mediapipe';
const WASM_PATH = `${MEDIAPIPE_BASE}/wasm`;
const MODEL_PATH = `${MEDIAPIPE_BASE}/face_landmarker.task`;

export class CameraError extends Error {
  readonly reason: 'denied' | 'missing' | 'model' | 'insecure' | 'unknown';

  constructor(message: string, reason: 'denied' | 'missing' | 'model' | 'insecure' | 'unknown') {
    super(message);
    this.reason = reason;
    this.name = 'CameraError';
  }
}

export interface WebcamOptions {
  numFaces?: number;
  lowPower?: boolean;
}

export class WebcamFaceSource implements FaceSource {
  private landmarker: FaceLandmarker | null = null;
  private stream: MediaStream | null = null;
  private readonly videoEl: HTMLVideoElement;
  private raf = 0;
  private vfc = 0;
  private lastVideoCallbackMs = -Infinity;
  private frame: FaceFrame | null = null;
  private rawFrame: RawFrame | null = null;
  private lastVideoTime = -1;
  private hz = 0;
  private lastTickMs = 0;
  private meanDtMs = 0;
  /** Smoothed wall time of one `detectForVideo` call, ms. For the debug overlay. */
  detectMs = 0;
  private running = false;
  private cal: Calibration;
  private aspectValue = config.render.aspect;

  private readonly smoothers: LandmarkSmoother[] = [];
  private readonly smoothed: Vec2[][] = [];
  private readonly emas: Map<string, Ema>[] = [];

  private readonly opts: WebcamOptions;

  constructor(opts: WebcamOptions = {}, cal?: Calibration) {
    this.opts = opts;
    this.cal = cal ?? defaultCalibration();
    const v = document.createElement('video');
    v.playsInline = true;
    v.muted = true;
    v.autoplay = true;
    // The element is never attached to the page by this class; the renderer
    // samples it as a texture. Keeping it detached means nothing can style a
    // raw, unflattering camera feed into view by accident (SPEC 3.4).
    this.videoEl = v;
  }

  setCalibration(cal: Calibration): void {
    this.cal = cal;
  }

  get calibration(): Calibration {
    return this.cal;
  }

  async start(): Promise<void> {
    if (!window.isSecureContext) {
      throw new CameraError('A camera needs https or localhost.', 'insecure');
    }
    if (navigator.mediaDevices?.getUserMedia === undefined) {
      throw new CameraError('This browser does not expose a camera API.', 'missing');
    }

    const low = this.opts.lowPower === true;
    const width = low ? config.face.lowPowerCameraWidth : config.face.cameraWidth;
    const height = low ? config.face.lowPowerCameraHeight : config.face.cameraHeight;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
        audio: false, // never. CLAUDE.md invariant 3, SPEC 5.3.
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        throw new CameraError('Camera permission was declined.', 'denied');
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        throw new CameraError('No camera was found.', 'missing');
      }
      throw new CameraError('The camera could not be started.', 'unknown');
    }

    this.videoEl.srcObject = this.stream;
    await this.videoEl.play();
    await this.waitForMetadata();
    this.aspectValue = this.videoEl.videoWidth / Math.max(1, this.videoEl.videoHeight);

    this.landmarker = await this.createLandmarker();
    this.running = true;
    this.schedule();
  }

  private async waitForMetadata(): Promise<void> {
    if (this.videoEl.readyState >= 2 && this.videoEl.videoWidth > 0) return;
    await new Promise<void>((resolve) => {
      const done = (): void => {
        this.videoEl.removeEventListener('loadeddata', done);
        resolve();
      };
      this.videoEl.addEventListener('loadeddata', done);
    });
  }

  /** GPU first, CPU as a fallback - some integrated drivers refuse the GPU delegate. */
  private async createLandmarker(): Promise<FaceLandmarker> {
    let fileset;
    try {
      fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    } catch {
      throw new CameraError(
        'The MediaPipe runtime is missing. Run `npm run setup:mediapipe`.',
        'model',
      );
    }

    const base = {
      runningMode: 'VIDEO' as const,
      numFaces: this.opts.numFaces ?? 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: false,
    };

    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await FaceLandmarker.createFromOptions(fileset, {
          ...base,
          baseOptions: { modelAssetPath: MODEL_PATH, delegate },
        });
      } catch (err) {
        if (delegate === 'CPU') {
          const msg = err instanceof Error ? err.message : String(err);
          throw new CameraError(
            `The face model could not be loaded (${msg}). Run \`npm run setup:mediapipe\`.`,
            'model',
          );
        }
      }
    }
    throw new CameraError('The face model could not be loaded.', 'model');
  }

  /**
   * Detection is driven by the video, not by the renderer (docs/OVERHAUL.md
   * section 7.5): `requestVideoFrameCallback` fires once per *new camera
   * frame*, so the landmarker never runs twice on one frame and never waits on
   * the game's render. Some browsers never call it back for a video that is not
   * in the page (and older Firefox lacks it), so a light animation-frame
   * watchdog takes over whenever no video callback has arrived for a while -
   * the v1 behaviour, as a floor rather than the design.
   */
  private schedule(): void {
    const v = this.videoEl as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    };
    if (typeof v.requestVideoFrameCallback === 'function') {
      const onFrame = (_now: number, meta: { mediaTime: number }): void => {
        if (!this.running) return;
        this.lastVideoCallbackMs = performance.now();
        this.detect(meta.mediaTime);
        this.vfc = v.requestVideoFrameCallback?.(onFrame) ?? 0;
      };
      this.vfc = v.requestVideoFrameCallback(onFrame);
    }
    const watchdog = (): void => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(watchdog);
      if (performance.now() - this.lastVideoCallbackMs < config.face.videoCallbackTimeoutMs) return;
      this.detect(this.videoEl.currentTime);
    };
    this.raf = requestAnimationFrame(watchdog);
  }

  /** Which clock drove the last detection, for the debug overlay. */
  get drivenByVideo(): boolean {
    return performance.now() - this.lastVideoCallbackMs < config.face.videoCallbackTimeoutMs;
  }

  private detect(videoTime: number): void {
    if (!this.running) return;
    const lm = this.landmarker;
    if (lm === null) return;
    // detectForVideo throws if handed the same timestamp twice.
    if (videoTime === this.lastVideoTime) return;
    this.lastVideoTime = videoTime;

    const now = performance.now();
    let result;
    try {
      result = lm.detectForVideo(this.videoEl, now);
    } catch {
      return;
    }
    const spent = performance.now() - now;
    this.detectMs = this.detectMs === 0 ? spent : this.detectMs * 0.9 + spent * 0.1;

    // Smooth the interval, then invert. Averaging 1000/dt instead (v1) reads
    // high whenever frame timing jitters.
    const dt = now - this.lastTickMs;
    if (this.lastTickMs > 0 && dt > 0) {
      this.meanDtMs = this.meanDtMs === 0 ? dt : this.meanDtMs * 0.9 + dt * 0.1;
      this.hz = 1000 / this.meanDtMs;
    }
    this.lastTickMs = now;

    const faces = result.faceLandmarks ?? [];
    const rawFaces: RawFrame['faces'] = [];

    for (let f = 0; f < faces.length; f++) {
      const points = faces[f];
      if (points === undefined) continue;

      let smoother = this.smoothers[f];
      if (smoother === undefined) {
        smoother = new LandmarkSmoother();
        this.smoothers[f] = smoother;
        this.smoothed[f] = [];
        this.emas[f] = new Map();
      }
      const out = this.smoothed[f] ?? [];
      smoother.smooth(points as readonly Vec2[], now, out);
      this.smoothed[f] = out;

      rawFaces.push({
        landmarks: out,
        blend: this.readBlend(f, result.faceBlendshapes?.[f]?.categories),
      });
    }

    this.rawFrame = { t: now, faces: rawFaces, aspect: this.aspectValue };
    this.frame = {
      t: now,
      faces: rawFaces.map((rf) => buildFaceData(rf, this.cal, this.aspectValue)),
    };
  }

  /**
   * Collapses MediaPipe's 52 blendshape categories into our five, averaging
   * left/right pairs so a lopsided grin still reads as a grin, then smoothing
   * each with an EMA (SPEC section 6.2).
   */
  private readBlend(faceIndex: number, categories: readonly { categoryName: string; score: number }[] | undefined): Blendshapes {
    const out: Blendshapes = { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 };
    if (categories === undefined) return out;

    const byName = new Map<string, number>();
    for (const c of categories) byName.set(c.categoryName, c.score);

    let emas = this.emas[faceIndex];
    if (emas === undefined) {
      emas = new Map();
      this.emas[faceIndex] = emas;
    }

    for (const key of Object.keys(BLENDSHAPE_SOURCES) as (keyof typeof BLENDSHAPE_SOURCES)[]) {
      const names = BLENDSHAPE_SOURCES[key];
      let sum = 0;
      let n = 0;
      for (const name of names) {
        const v = byName.get(name);
        if (v !== undefined) {
          sum += v;
          n++;
        }
      }
      const mean = n > 0 ? sum / n : 0;
      let ema = emas.get(key);
      if (ema === undefined) {
        ema = new Ema(config.face.blendEmaAlpha);
        emas.set(key, ema);
      }
      out[key] = ema.filter(mean);
    }

    return out;
  }

  stop(): void {
    this.running = false;
    if (this.raf !== 0) cancelAnimationFrame(this.raf);
    this.raf = 0;
    const v = this.videoEl as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
    if (this.vfc !== 0) v.cancelVideoFrameCallback?.(this.vfc);
    this.vfc = 0;
    this.landmarker?.close();
    this.landmarker = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.videoEl.srcObject = null;
  }

  latest(): FaceFrame | null {
    return this.frame;
  }

  latestRaw(): RawFrame | null {
    return this.rawFrame;
  }

  info(): FaceSourceInfo {
    return {
      kind: 'webcam',
      trackingHz: this.hz,
      video: this.running ? this.videoEl : null,
      aspect: this.aspectValue,
    };
  }
}
