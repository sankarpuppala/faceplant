/**
 * The Pixi stage: the render stack from SPEC section 12.4, assembled.
 *
 *   app.stage
 *   +- taped          <- post-process (CRT, RGB split, grain) and screen shake
 *   |   +- videoLayer <- mirrored camera frame, graded, darkened by candlelight
 *   |   +- faceLayer  <- the chalk contour line (the face itself, in INK mode)
 *   |   +- worldLayer <- ruins, lantern, Gate, Wicks, hazards
 *   |   +- bubble     <- the one Wick line allowed on screen
 *   +- osd            <- camcorder display, deliberately *outside* the tape fx
 *
 * Why the darkness is only on the video layer: SPEC's own layer order puts
 * contours and the world above it. That is not a shortcut, it is the right
 * read - the Wicks and the Gate are the light sources, so they should never be
 * dimmed by their own darkness.
 */

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { SimpleLightmapFilter } from 'pixi-filters';
import { config } from '../config.ts';
import type { Calibration } from '../face/calibration.ts';
import type { ActiveLine } from '../game/lineDirector.ts';
import type { Level } from '../game/levelSchema.ts';
import type { ActiveScare } from '../game/scares.ts';
import type { World, WorldSnapshot } from '../physics/world.ts';
import { computeViewport, worldToScreen, type Viewport } from '../terrain/mapping.ts';
import type { Settings } from '../storage/settings.ts';
import { LightMap, type LightSource } from './lighting.ts';
import { Osd } from './osd.ts';
import { isEffectEnabled, TapeFx, VideoGrade } from './postfx.ts';
import {
  drawContours,
  drawCrawler,
  drawDrip,
  drawGate,
  drawLantern,
  drawMoth,
  drawStatic,
  drawWick,
  makeDrawContext,
  SpeechBubble,
} from './sprites.ts';
import { tokens } from './tokens.ts';

export interface RenderInput {
  world: World;
  snapshot: WorldSnapshot;
  level: Level;
  cal: Calibration;
  settings: Settings;
  line: ActiveLine | null;
  scare: ActiveScare | null;
  video: HTMLVideoElement | null;
  /** Monotonic ms, for animation. */
  timeMs: number;
  dtMs: number;
  gateBonusFh: number;
  /** Shown when no face has been seen yet. */
  showNoFaceHint: boolean;
}

export class Stage {
  readonly app = new Application();

  private readonly taped = new Container();
  private readonly videoLayer = new Container();
  private readonly faceLayer = new Container();
  private readonly worldLayer = new Container();
  private readonly osd = new Osd();
  private readonly bubble = new SpeechBubble();

  private videoSprite: Sprite | null = null;
  private readonly darkSprite = new Sprite();
  private readonly contourG = new Graphics();
  private readonly staticG = new Graphics();
  private readonly lanternG = new Graphics();
  private readonly gateG = new Graphics();
  private readonly bodiesG = new Graphics();
  private readonly flareG = new Graphics();
  private readonly figureG = new Graphics();

  private readonly grade = new VideoGrade();
  private readonly fx = new TapeFx();
  private lightMap: LightMap | null = null;
  private lightmapFilter: SimpleLightmapFilter | null = null;

  private vp: Viewport = computeViewport(1600, 900, config.render.aspect);
  private flickerPhase = 0;
  private staticKey = '';
  private lastLevelId = '';
  /** U2 - offering flares, drawn and faded out. */
  private readonly flares: { x: number; y: number; untilMs: number }[] = [];

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: tokens.void,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
      resizeTo: host,
      // WebGL rather than WebGPU: every filter we use has a tested GL program,
      // and WebGL is the path with the widest working support today.
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    host.appendChild(this.app.canvas);

    this.videoLayer.addChild(this.darkSprite);
    this.faceLayer.addChild(this.contourG);
    this.worldLayer.addChild(this.staticG, this.lanternG, this.gateG, this.flareG, this.bodiesG, this.figureG);
    this.taped.addChild(this.videoLayer, this.faceLayer, this.worldLayer, this.bubble);
    this.app.stage.addChild(this.taped, this.osd);

    this.lightMap = new LightMap(config.render.aspect);
    this.lightmapFilter = new SimpleLightmapFilter({
      lightMap: this.lightMap.texture,
      color: tokens.void,
      alpha: 1,
    });

    this.app.renderer.on('resize', () => this.onResize());
    this.onResize();
    // The app drives nothing itself; `render()` is called from the game loop so
    // physics and drawing stay in step.
    this.app.ticker.stop();
  }

  private onResize(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    this.vp = computeViewport(w, h, config.render.aspect);
    this.osd.layout(this.vp);
    this.lightMap?.resize(config.render.aspect);
    this.staticKey = '';
    this.fitVideo();
  }

  get viewport(): Viewport {
    return this.vp;
  }

  /** Attaches the camera frame. Passing null removes it (Assist or INK mode). */
  setVideo(video: HTMLVideoElement | null): void {
    if (video === null) {
      this.videoSprite?.destroy();
      this.videoSprite = null;
      return;
    }
    if (this.videoSprite !== null) return;
    const sprite = new Sprite(Texture.from(video));
    // Mirrored for the selfie view, which is the same mirroring `mapping.ts`
    // applies to the landmarks - so the picture and the terrain agree.
    sprite.anchor.set(0.5, 0.5);
    sprite.scale.x = -1;
    this.videoSprite = sprite;
    this.videoLayer.addChildAt(sprite, 0);
    this.fitVideo();
  }

  /** Covers the viewport with the camera frame, cropping rather than stretching. */
  private fitVideo(): void {
    const s = this.videoSprite;
    if (s === null) return;
    const tw = s.texture.width || 16;
    const th = s.texture.height || 9;
    const scale = Math.max(this.vp.width / tw, this.vp.height / th);
    s.scale.set(-scale, scale);
    s.position.set(this.vp.offsetX + this.vp.width / 2, this.vp.offsetY + this.vp.height / 2);
  }

  render(input: RenderInput): void {
    const { world, snapshot, settings, level } = input;
    const ink = settings.filter === 'ink' || settings.hideMyFace;
    const reduced = settings.reducedEffects;
    const dtS = input.dtMs / 1000;

    this.fx.update(dtS, input.timeMs, reduced);
    if (!reduced) this.flickerPhase += dtS * Math.PI * 2 * config.light.flickerHz;

    // --- post-process and shake ------------------------------------------
    this.taped.filters = this.fx.filters(reduced);
    this.taped.position.set(this.fx.shakeOffset.x, this.fx.shakeOffset.y);

    // --- video + candlelight ---------------------------------------------
    this.videoLayer.visible = !ink && this.videoSprite !== null;
    if (this.videoLayer.visible) {
      this.fitVideo();
      const filters = this.grade.forFilter(settings.filter);
      // The light map multiplies the graded picture, so the face appears only
      // where a flame reaches it (decision D7).
      const lm = this.lightmapFilter;
      this.videoLayer.filters = lm === null ? filters : [...filters, lm];
      this.updateLightMap(input, ink);
    } else if (ink) {
      // INK: no picture at all, so nothing to light - the contours are the face.
      this.updateLightMap(input, ink);
    }

    const ctx = makeDrawContext(input.cal, this.vp, input.timeMs, ink, reduced);

    // --- the face line ----------------------------------------------------
    drawContours(this.contourG, world.segments, ctx);

    // --- static geometry (redrawn only when it can have changed) ----------
    const key = `${level.id}:${this.vp.width}x${this.vp.height}:${input.cal.fhUV.toFixed(4)}:${input.gateBonusFh}`;
    if (key !== this.staticKey) {
      drawStatic(this.staticG, level, ctx);
      drawLantern(this.lanternG, level, ctx);
      this.staticKey = key;
    }
    if (level.id !== this.lastLevelId) {
      this.flares.length = 0;
      this.lastLevelId = level.id;
    }
    drawGate(this.gateG, level, ctx, input.gateBonusFh);

    // --- bodies -----------------------------------------------------------
    const g = this.bodiesG;
    g.clear();
    for (const d of world.drips) drawDrip(g, d, ctx);
    for (const c of world.crawlers) drawCrawler(g, c, ctx);
    for (const m of world.moths) drawMoth(g, m, ctx);
    for (const w of world.wicks) drawWick(g, w, ctx);

    this.drawFlares(input);
    this.drawScare(input);

    // --- the one allowed line ---------------------------------------------
    if (input.line !== null) {
      const fontPx = Math.max(11, this.vp.height * 0.026);
      if (input.line.at === null) {
        // Frame-edge whisper: used for scares and for level script lines.
        this.bubble.show(
          input.line.text,
          this.vp.offsetX + this.vp.width * 0.5,
          this.vp.offsetY + this.vp.height * 0.26,
          fontPx,
          this.vp,
        );
      } else {
        const p = worldToScreen(input.line.at, input.cal, this.vp);
        this.bubble.show(input.line.text, p.x, p.y, fontPx, this.vp);
      }
    } else {
      this.bubble.hide();
    }

    // --- OSD --------------------------------------------------------------
    // `osdVisible` is honoured here rather than set: the menus render over a
    // live stage, and an earlier version forced it true every frame, so hiding
    // it for the title screen lasted exactly one frame.
    this.osd.update(snapshot, level.label, input.timeMs, reduced, level.mode === 'endless');
    this.osd.visible = this.osdVisible;

    this.app.render();
  }

  /** Rebuilds the light map from every flame, the lantern and the Gate. */
  private updateLightMap(input: RenderInput, ink: boolean): void {
    const lm = this.lightMap;
    const lf = this.lightmapFilter;
    if (lm === null || lf === null) return;

    const { world, snapshot, level, cal, settings } = input;
    const fhPx = cal.fhUV * this.vp.height;
    // U3 - every Procession step widens every flame, so a long unbroken
    // procession literally reveals more of the player's face.
    const bonus = snapshot.procession.lightBonusFh;

    const lights: LightSource[] = [];

    for (const w of world.wicks) {
      if (!w.lit || w.state === 'saved' || w.state === 'lost') continue;
      const p = worldToScreen({ x: w.body.x, y: w.body.y }, cal, this.vp);
      lights.push({ x: p.x, y: p.y, r: (config.light.wickRadiusFh + bonus) * fhPx, intensity: 1 });
    }

    const lantern = worldToScreen({ x: level.spawn.x, y: level.spawn.y }, cal, this.vp);
    lights.push({ x: lantern.x, y: lantern.y, r: (config.light.lanternRadiusFh + bonus) * fhPx, intensity: 0.85 });

    const gate = worldToScreen(
      { x: level.gate.x + level.gate.w / 2, y: level.gate.y + level.gate.h / 2 },
      cal,
      this.vp,
    );
    lights.push({ x: gate.x, y: gate.y, r: (config.light.gateRadiusFh + bonus) * fhPx, intensity: 0.95 });

    for (const f of this.flares) {
      const left = Math.max(0, f.untilMs - input.timeMs) / config.offering.flareMs;
      if (left <= 0) continue;
      const p = worldToScreen({ x: f.x, y: f.y }, cal, this.vp);
      lights.push({ x: p.x, y: p.y, r: config.offering.flareFh * fhPx * (1.4 - left * 0.4), intensity: left });
    }

    // A flicker scare dips the ambient floor, never the whole screen to black,
    // and only at or under 3 Hz (invariant 4).
    let ambient = 1 - config.light.darknessAlpha;
    const flickerAllowed = isEffectEnabled('flicker', settings.reducedEffects);
    if (input.scare?.type === 'flicker' && flickerAllowed) {
      const hz = config.render.effects.flicker.maxFlashHz;
      const on = Math.floor((input.timeMs / 1000) * hz * 2) % 2 === 0;
      ambient *= on ? 1 : 0.25;
      for (const l of lights) l.intensity *= on ? 1 : 0.45;
    }

    lf.lightMap = lm.update(
      lights,
      this.vp,
      this.app.renderer.width,
      this.app.renderer.height,
      ink ? 0 : ambient,
      this.flickerPhase,
      settings.reducedEffects,
    );
  }

  private drawFlares(input: RenderInput): void {
    const g = this.flareG;
    g.clear();
    const fhPx = input.cal.fhUV * this.vp.height;
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      if (f === undefined) continue;
      const left = (f.untilMs - input.timeMs) / config.offering.flareMs;
      if (left <= 0) {
        this.flares.splice(i, 1);
        continue;
      }
      const p = worldToScreen({ x: f.x, y: f.y }, input.cal, this.vp);
      g.circle(p.x, p.y, config.offering.flareFh * fhPx * (1.3 - left)).fill({
        color: tokens.candle,
        alpha: left * 0.22,
      });
    }
  }

  /**
   * The visual half of a scare. `whisper` is handled by the line director.
   *
   * The original version filled the silhouette with pure black (0x000000) at
   * alpha 0.82 over a background that is itself near-black (`tokens.void`,
   * 0x07060A). The two were close enough in practice to be indistinguishable,
   * so the single most important scare in the game was effectively invisible.
   * The fix leans into the fiction instead of fighting it: you are not meant to
   * see the figure clearly in the dark - you are meant to see its eyes. A thin
   * warm rim light (the same trick the ruins use) keeps the silhouette's edge
   * legible against the void, and two small ember dots do the rest.
   */
  private drawScare(input: RenderInput): void {
    const g = this.figureG;
    g.clear();
    const scare = input.scare;
    if (scare === null || !input.settings.scares) return;
    if (scare.type !== 'figure' && scare.type !== 'behindYou') return;

    // Eased in and out so it never flashes (SPEC section 10.1: <= 1.5 s, no
    // sudden full-screen change).
    const total = Math.max(1, scare.endsMs - scare.startedMs);
    const progress = Math.min(1, Math.max(0, (input.snapshot.elapsedMs - scare.startedMs) / total));
    const alpha = Math.sin(progress * Math.PI);

    // A slow, deliberate step closer over the scare's lifetime - not a jolt,
    // a presence.
    const h = this.vp.height * (0.5 + progress * 0.08);
    const w = h * 0.36;
    const x = this.vp.offsetX + this.vp.width * (0.86 - progress * 0.05);
    const y = this.vp.offsetY + this.vp.height;

    const headCx = x;
    const headCy = y - h;
    const headRx = w * 0.42;
    const headRy = w * 0.46;

    g.ellipse(headCx, headCy, headRx, headRy).fill({ color: 0x000000, alpha: alpha * 0.88 });
    g.roundRect(x - w / 2, y - h + w * 0.34, w, h, w * 0.3).fill({ color: 0x000000, alpha: alpha * 0.88 });

    // The rim: the only reason the shape reads as a shape at all.
    g.ellipse(headCx, headCy, headRx, headRy).stroke({ width: 1.5, color: tokens.boneDim, alpha: alpha * 0.22 });
    g.roundRect(x - w / 2, y - h + w * 0.34, w, h, w * 0.3).stroke({
      width: 1.5,
      color: tokens.boneDim,
      alpha: alpha * 0.16,
    });

    // The eyes. Two embers, close together, at head height - the one thing you
    // are meant to actually see.
    const eyeDx = headRx * 0.32;
    const eyeY = headCy + headRy * 0.05;
    const eyeR = Math.max(1.4, headRx * 0.07);
    const eyeAlpha = alpha * (0.55 + 0.25 * Math.sin(input.timeMs / 90));
    g.circle(headCx - eyeDx, eyeY, eyeR).fill({ color: tokens.ember, alpha: eyeAlpha });
    g.circle(headCx + eyeDx, eyeY, eyeR).fill({ color: tokens.ember, alpha: eyeAlpha });
  }

  /** U2 - called when an offering lands, for the light flare. */
  addFlare(x: number, y: number, nowMs: number): void {
    this.flares.push({ x, y, untilMs: nowMs + config.offering.flareMs });
    if (this.flares.length > 8) this.flares.shift();
  }

  addShake(fh: number, cal: Calibration): void {
    const fhPx = cal.fhUV * this.vp.height;
    this.fx.addShake(fh * fhPx, config.render.maxShakeFh * fhPx);
  }

  private osdVisible = false;

  setOsdVisible(v: boolean): void {
    this.osdVisible = v;
    this.osd.visible = v;
  }

  /** The canvas, for the result card and the clip recorder. */
  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  destroy(): void {
    this.grade.destroy();
    this.fx.destroy();
    this.lightMap?.destroy();
    this.lightmapFilter?.destroy();
    this.app.destroy(true, { children: true });
  }
}
