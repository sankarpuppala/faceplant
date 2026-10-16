/**
 * THE WATCHER - the jump scare for losing half the roster.
 *
 * Every other scare in the game is scheduled by a level. This one is *earned*:
 * the moment more than half the Wicks are gone, something that has been
 * watching the whole time comes to look at you properly.
 *
 * ## Why it is built in four beats
 *
 * The first version was a horned silhouette that scaled up, and it was not
 * frightening - it arrived fully formed and all at once, so there was nothing
 * to dread and nothing to resolve. A scare is a shape in time, not a picture:
 *
 *   1. **stare**   - two eyes, far off, in a dark that has swallowed the level.
 *                    You can tell something is there. You cannot tell what.
 *   2. **approach** - it closes the distance, and the face assembles out of the
 *                    dark as it comes: form, then sockets, then teeth.
 *   3. **hold**    - it fills the frame and screams, jaw juddering, close
 *                    enough that the mouth covers the bottom of the screen.
 *   4. **leave**   - it withdraws rather than cutting, so the quiet afterwards
 *                    belongs to it too.
 *
 * ## Why it is drawn the way it is
 *
 * The second version had the right four beats and still looked bad, for two
 * measurable reasons worth recording so they do not come back:
 *
 *   - **It was framed wrong.** The head was scaled to 2.1x the viewport height
 *     and centred on the skull's geometric middle, which put the crown, the
 *     horns, the jaw, the chin *and the screaming mouth* outside the frame. On
 *     a 1280x720 viewport the mouth began 33px below the bottom edge. At the
 *     climax of the scare the player was looking at two glowing dots and two
 *     nose slits on a black screen. `watcherComposition` now derives the scale
 *     from the frame, and a test asserts it keeps the eyes and the whole mouth
 *     on screen at any viewport shape.
 *   - **It had no values.** The skull was filled near-black on a near-black
 *     veil, so it had no silhouette and no form - only a hairline ember
 *     outline, which was itself off-screen. It is now a *lit* face: a gradient
 *     from warm bone at the centre down to the veil at the rim, with the brow
 *     ridges, cheekbones and nose bridge picked out, and the sockets and mouth
 *     cut out as true black. Horror reads as value contrast, so the brightest
 *     things in the frame (the teeth) sit directly against the darkest (the
 *     throat behind them).
 *
 * It is drawn from the game's own motifs so it reads as *this* game's monster:
 * wax running from the eye sockets like the Wicks' own melt, and ember light
 * in the cracks, as though something is burning inside it.
 *
 * ## Safety (CLAUDE.md invariants 4 and 6) - all of it still holds
 *
 *   - **No flashing.** Every movement is a continuous ramp. The only periodic
 *     motions are a 2 Hz eye pulse and a 2.5 Hz jaw judder, both under the
 *     WCAG 2.3.1 ceiling of 3 Hz, and both are *motion*, not luminance steps.
 *   - **Reduced effects** stretches the approach, removes the shake and the
 *     judder, and keeps the face: being told you failed is not optional.
 *   - **Scares off** means none of this runs. The tape simply ends.
 *   - The shout is limited and attacked in `sound.ts`, not here.
 */

import { Container, FillGradient, Graphics } from 'pixi.js';
import { config } from '../config.ts';
import type { Viewport } from '../terrain/mapping.ts';
import { tokens, watcherTokens } from './tokens.ts';

export type WatcherPhase = 'staring' | 'approaching' | 'holding' | 'leaving' | 'gone';

export interface WatcherState {
  phase: WatcherPhase;
  /** 0..1 through the approach, after the stare. */
  approach: number;
  /** 0..1 overall opacity. */
  alpha: number;
  /** 0..1 through the hold, for the scream. */
  scream: number;
}

function phaseTimes(reducedEffects: boolean): { stare: number; approach: number; hold: number; leave: number } {
  // Reduced effects stretches the approach so it looms instead of lunging.
  return {
    stare: config.watcher.stareMs,
    approach: config.watcher.approachMs * (reducedEffects ? 1.9 : 1),
    hold: config.watcher.holdMs,
    leave: config.watcher.leaveMs,
  };
}

export function watcherTotalMs(reducedEffects: boolean): number {
  const t = phaseTimes(reducedEffects);
  return t.stare + t.approach + t.hold + t.leave;
}

export function watcherStateAt(elapsedMs: number, reducedEffects: boolean): WatcherState {
  const t = phaseTimes(reducedEffects);
  const total = watcherTotalMs(reducedEffects);
  if (elapsedMs < 0 || elapsedMs >= total) return { phase: 'gone', approach: 0, alpha: 0, scream: 0 };

  if (elapsedMs < t.stare) {
    // Only the eyes, and the dark arriving with them.
    return { phase: 'staring', approach: 0, alpha: elapsedMs / t.stare, scream: 0 };
  }

  const afterStare = elapsedMs - t.stare;
  if (afterStare < t.approach) {
    const k = afterStare / t.approach;
    // Ease-in: slow at the edge of the dark, then fast. This is what makes it
    // read as something closing distance rather than a fade-in.
    return { phase: 'approaching', approach: k * k, alpha: 1, scream: 0 };
  }

  const afterApproach = afterStare - t.approach;
  if (afterApproach < t.hold) {
    return { phase: 'holding', approach: 1, alpha: 1, scream: afterApproach / t.hold };
  }

  const k = (afterApproach - t.hold) / t.leave;
  return { phase: 'leaving', approach: 1, alpha: 1 - k, scream: 1 };
}

// ------------------------------------------------------------- the anatomy ---

/**
 * The face, in head-relative units: `u` is a fraction of the half-width, `v` a
 * fraction of the head height, both measured from the face origin, which sits
 * just below the nose.
 *
 * Declaring the anatomy as data rather than burying it in the draw call is
 * what makes `watcherComposition` - and therefore the framing test - possible,
 * and it keeps the drawing and the framing arithmetic reading the same
 * numbers. They disagreed once, and the result was a mouth drawn past the
 * bottom of a frame the test believed it fitted inside.
 *
 * It is a *skull*, so it is widest across the temples and narrows to the jaw.
 * The first attempt had that backwards - a narrow crown over a wide chin -
 * and read as an upside-down egg rather than a head.
 */
export const FACE = {
  /** Head width as a fraction of head height. A skull, not an egg. */
  widthRatio: 0.84,

  // --- cranium, down to the upper lip ---
  crownU: 0.44,
  crownV: -0.52,
  /** The widest point of a skull is the temples, not the cheekbones. */
  templeU: 0.98,
  templeV: -0.22,
  cheekU: 0.86,
  cheekV: 0.06,
  maxillaU: 0.54,
  maxillaV: 0.17,
  /** Bottom edge of the upper skull: where the top teeth hang from. */
  upperLipV: 0.21,

  // --- mandible, which drops as the mouth opens ---
  lowerLipV: 0.235,
  jawU: 0.74,
  jawV: 0.34,
  chinV: 0.52,
  /** How far the whole lower jaw falls at a full scream. */
  jawDropV: 0.17,
  /** Longest tooth, for the framing budget. */
  toothV: 0.055,

  eyeU: 0.46,
  eyeV: -0.17,
  socketU: 0.3,
  socketV: 0.125,

  noseTopV: -0.05,
  noseV: 0.09,
  noseU: 0.13,

  mouthU: 0.56,
} as const;

export interface WatcherComposition {
  /** Head size at the climax, px. */
  headHeightPx: number;
  headWidthPx: number;
  /** Face origin on screen, px. */
  originX: number;
  originY: number;
  /** Key features, px, for the framing test. */
  eyesY: number;
  eyeLeftX: number;
  eyeRightX: number;
  mouthTopY: number;
  /** The tip of the lowest tooth at a full scream - the real bottom edge. */
  mouthBottomY: number;
  chinY: number;
  crownY: number;
}

/**
 * How big the Watcher gets, and where its face lands.
 *
 * The scale is taken from *both* frame dimensions, so a narrow phone viewport
 * gets a smaller head rather than a head whose mouth is off the bottom of the
 * screen. The lift pushes the origin above centre, which crops the crown and
 * the chin - being too close to see the whole head is the point - while
 * keeping the two features the scare cannot work without, the eyes and the
 * mouth, inside the frame.
 */
export function watcherComposition(vp: Viewport): WatcherComposition {
  const h = Math.min(
    vp.height * config.watcher.finalHeightFraction,
    (vp.width * config.watcher.finalWidthFraction) / FACE.widthRatio,
  );
  const w = h * FACE.widthRatio;
  const halfW = w / 2;
  const originX = vp.offsetX + vp.width / 2;
  const originY = vp.offsetY + vp.height / 2 - h * config.watcher.faceLiftFraction;

  return {
    headHeightPx: h,
    headWidthPx: w,
    originX,
    originY,
    eyesY: originY + FACE.eyeV * h,
    eyeLeftX: originX - FACE.eyeU * halfW,
    eyeRightX: originX + FACE.eyeU * halfW,
    mouthTopY: originY + FACE.upperLipV * h,
    mouthBottomY: originY + (FACE.lowerLipV + FACE.jawDropV + FACE.toothV) * h,
    chinY: originY + (FACE.chinV + FACE.jawDropV) * h,
    crownY: originY + FACE.crownV * h,
  };
}

// -------------------------------------------------------------- the render ---

/**
 * A soft blob of light, built from concentric rings.
 *
 * Pixi's gradients cannot fade to transparent without alpha colour stops, and
 * these are glows laid *over* already-drawn form, so they have to. Rings of
 * constant alpha compose into a smooth falloff and render identically on every
 * driver, which a blur filter would not.
 */
function softBlob(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
  peakAlpha: number,
  rings = BLOB_RINGS,
): void {
  for (let i = rings; i >= 1; i--) {
    const k = i / rings;
    g.ellipse(cx, cy, rx * k, ry * k).fill({ color, alpha: peakAlpha / rings });
  }
}

/**
 * Enough rings that the falloff reads as a gradient. Six was not: the steps
 * showed as concentric outlines, which made every glow look like a target.
 */
const BLOB_RINGS = 16;

/** The face. Built from primitives so it scales to any resolution. */
export class Watcher extends Container {
  private readonly veil = new Graphics();
  private readonly halo = new Graphics();
  private readonly form = new Graphics();
  private readonly lit = new Graphics();
  private readonly cavity = new Graphics();
  private readonly inner = new Graphics();
  private readonly detail = new Graphics();
  private readonly frame = new Graphics();
  /**
   * Clips the highlights to the head. Without it the soft blobs that pick out
   * the cheekbones hang outside the silhouette as grey smudges in the dark,
   * which was the single most obvious thing wrong with the previous face.
   */
  private readonly faceMask = new Graphics();

  constructor() {
    super();
    // Back to front: the dark it brings, a halo so the head separates from it,
    // the face, the light on the face, the holes in the face, the light inside
    // those holes, the teeth, and the frame closing in around all of it.
    this.addChild(
      this.veil,
      this.halo,
      this.form,
      this.faceMask,
      this.lit,
      this.cavity,
      this.inner,
      this.detail,
      this.frame,
    );
    this.lit.mask = this.faceMask;
    this.visible = false;
  }

  private get layers(): readonly Graphics[] {
    return [
      this.veil,
      this.halo,
      this.form,
      this.faceMask,
      this.lit,
      this.cavity,
      this.inner,
      this.detail,
      this.frame,
    ];
  }

  hide(): void {
    this.visible = false;
    for (const g of this.layers) g.clear();
  }

  /**
   * @param elapsedMs since the Watcher was summoned.
   * @returns the shake to apply this frame, in FH, or 0.
   */
  draw(elapsedMs: number, vp: Viewport, reducedEffects: boolean, timeMs: number): number {
    const st = watcherStateAt(elapsedMs, reducedEffects);
    if (st.phase === 'gone') {
      this.hide();
      return 0;
    }

    this.visible = true;
    const { veil, halo, form, lit, cavity, inner, detail, frame, faceMask } = this;
    for (const g of this.layers) g.clear();

    const comp = watcherComposition(vp);
    const a = st.alpha;

    // --- the dark it brings with it --------------------------------------
    // Deeper than the game's own darkness, so the level is gone, not dimmed.
    veil.rect(vp.offsetX, vp.offsetY, vp.width, vp.height).fill({ color: watcherTokens.cavity, alpha: a * 0.97 });

    // The eye pulse, 2 Hz, declared as the Watcher's flash budget.
    const pulse = 0.7 + 0.3 * Math.sin((timeMs / 1000) * config.watcher.eyePulseHz * Math.PI * 2);

    // --- the stare: eyes only, nothing else legible ----------------------
    // Small, far off, and low in the frame, as though it is looking up at you.
    if (st.phase === 'staring') {
      const r = vp.height * 0.006;
      const dx = vp.height * 0.052;
      const ex = comp.originX;
      const ey = vp.offsetY + vp.height * 0.46;
      // A hint of a brow, barely above the veil: enough to know the eyes
      // belong to something, not enough to know what.
      softBlob(halo, ex, ey, dx * 3.4, dx * 1.7, watcherTokens.shadow, a * 0.5, 8);
      for (const side of [-1, 1] as const) {
        softBlob(halo, ex + side * dx, ey, r * 9, r * 7, tokens.ember, a * 0.22 * pulse);
        detail.circle(ex + side * dx, ey, r).fill({ color: tokens.candle, alpha: a * 0.95 * pulse });
      }
      return 0;
    }

    // --- size -------------------------------------------------------------
    // It lunges slightly past its final size and settles back, which is what
    // sells the last few inches of the approach.
    const startH = vp.height * 0.22;
    let h: number;
    if (st.phase === 'approaching') {
      h = startH + (comp.headHeightPx - startH) * st.approach;
    } else {
      const settle = Math.min(1, st.scream * 6);
      h = comp.headHeightPx * (1 + config.watcher.overshootFraction * (1 - settle));
    }
    const halfW = (h * FACE.widthRatio) / 2;

    // A head tilt that grows as it arrives: a face that is level is a portrait,
    // a face that is tilted is looking at you.
    const tilt = reducedEffects ? 0 : 0.055 * st.approach;
    const sway = reducedEffects ? 0 : Math.sin(timeMs / 260) * h * 0.006;
    const ox = comp.originX + sway;
    // The lift arrives with the face, so the approach is something coming
    // closer rather than a picture being scaled in place.
    const oy = vp.offsetY + vp.height / 2 - h * config.watcher.faceLiftFraction * st.approach;

    /** Head-relative (u, v) to screen px, through the tilt. */
    const pt = (u: number, v: number): [number, number] => {
      const dx = u * halfW;
      const dy = v * h;
      const c = Math.cos(tilt);
      const s = Math.sin(tilt);
      return [ox + dx * c - dy * s, oy + dx * s + dy * c];
    };
    /** A pixel offset back into head-relative v, for the jaw drop. */
    const vOf = (px: number): number => px / h;

    // --- how wide the scream is -------------------------------------------
    const judder =
      reducedEffects || st.phase !== 'holding'
        ? 0
        : Math.sin((timeMs / 1000) * config.watcher.jawJudderHz * Math.PI * 2) * 0.05;
    const openness = st.phase === 'approaching' ? st.approach * st.approach : 1;
    /**
     * The whole lower jaw falls, rather than a hole being punched in a fixed
     * face. The previous version grew a mouth-shaped hole downward out of a
     * rigid skull, so at full scream the black of the mouth ran out past the
     * chin and the bottom row of teeth hung in empty space below the head.
     */
    const jawDrop = (FACE.jawDropV * openness + judder) * h;

    // --- the two halves of the head --------------------------------------
    // The cranium, from the crown round to the upper lip.
    const cranium = (g: Graphics): void => {
      g.moveTo(...pt(0, FACE.upperLipV));
      g.lineTo(...pt(FACE.maxillaU, FACE.maxillaV));
      g.quadraticCurveTo(...pt(0.76, 0.14), ...pt(FACE.cheekU, FACE.cheekV));
      g.quadraticCurveTo(...pt(0.98, -0.06), ...pt(FACE.templeU, FACE.templeV));
      g.quadraticCurveTo(...pt(0.88, -0.46), ...pt(FACE.crownU, FACE.crownV));
      g.quadraticCurveTo(...pt(0, -0.63), ...pt(-FACE.crownU, FACE.crownV));
      g.quadraticCurveTo(...pt(-0.88, -0.46), ...pt(-FACE.templeU, FACE.templeV));
      g.quadraticCurveTo(...pt(-0.98, -0.06), ...pt(-FACE.cheekU, FACE.cheekV));
      g.quadraticCurveTo(...pt(-0.76, 0.14), ...pt(-FACE.maxillaU, FACE.maxillaV));
      g.lineTo(...pt(0, FACE.upperLipV));
      g.closePath();
    };

    // The mandible, hinged up by the ears and falling as it screams.
    const d = vOf(jawDrop);
    const mandible = (g: Graphics): void => {
      g.moveTo(...pt(-0.8, FACE.lowerLipV - 0.1 + d * 0.2));
      g.lineTo(...pt(-0.54, FACE.lowerLipV + d));
      g.quadraticCurveTo(...pt(0, FACE.lowerLipV + 0.03 + d), ...pt(0.54, FACE.lowerLipV + d));
      g.lineTo(...pt(0.8, FACE.lowerLipV - 0.1 + d * 0.2));
      g.quadraticCurveTo(...pt(0.86, FACE.jawV - 0.06 + d * 0.7), ...pt(FACE.jawU, FACE.jawV + d));
      g.quadraticCurveTo(...pt(0.34, FACE.chinV + 0.01 + d), ...pt(0, FACE.chinV + d));
      g.quadraticCurveTo(...pt(-0.34, FACE.chinV + 0.01 + d), ...pt(-FACE.jawU, FACE.jawV + d));
      g.quadraticCurveTo(...pt(-0.86, FACE.jawV - 0.06 + d * 0.7), ...pt(-0.8, FACE.lowerLipV - 0.1 + d * 0.2));
      g.closePath();
    };

    // Lit from below, by the same candles the Wicks carry. Global space so the
    // cranium and the mandible share one light instead of each getting its own
    // copy of the ramp mapped to its own bounding box.
    const skin = new FillGradient({
      type: 'radial',
      center: { x: ox, y: oy + h * 0.14 },
      innerRadius: 0,
      outerCenter: { x: ox, y: oy + h * 0.1 },
      // Wide enough to still reach the mandible once it has fallen - a jaw
      // that drops out of the light leaves the lower teeth hanging in void.
      outerRadius: h * 0.66,
      colorStops: [
        { offset: 0, color: watcherTokens.litBone },
        { offset: 0.3, color: watcherTokens.midBone },
        { offset: 0.58, color: watcherTokens.shadow },
        { offset: 1, color: watcherTokens.rim },
      ],
      textureSpace: 'global',
    });

    // --- horns ------------------------------------------------------------
    // Drawn before the head so they read as growing out of it. Asymmetric,
    // because symmetry looks designed and this should not. At the climax they
    // are cropped by the top of the frame, which is correct: you are too close.
    for (const [side, len, curl] of [
      [-1, 0.52, 0.5],
      [1, 0.43, 0.38],
    ] as const) {
      const baseU = side * 0.74;
      form.moveTo(...pt(baseU, -0.34));
      form.quadraticCurveTo(...pt(side * 1.52, -0.3 - len * 0.6), ...pt(side * (0.96 + curl), -0.3 - len));
      form.quadraticCurveTo(...pt(side * 1.12, -0.34 - len * 0.34), ...pt(baseU * 0.78, -0.44));
      form.closePath();
      form.fill({ color: watcherTokens.shadow, alpha: a });
      form.stroke({ width: Math.max(1, h * 0.004), color: tokens.ember, alpha: a * 0.34 });
    }

    // A dull halo behind the head, so the silhouette reads against the veil
    // even where the skin gradient has fallen all the way into shadow.
    softBlob(halo, ox, oy - h * 0.04, halfW * 1.24, h * 0.72, watcherTokens.shadow, a * 0.55, 22);

    // --- the head ---------------------------------------------------------
    for (const piece of [cranium, mandible]) {
      piece(form);
      form.fill({ fill: skin, alpha: a });
      piece(form);
      form.stroke({ width: Math.max(1, h * 0.003), color: tokens.ember, alpha: a * 0.1 });
      // The same two shapes are the clip for every highlight below.
      piece(faceMask);
      faceMask.fill({ color: 0xffffff });
    }

    // --- the light on it --------------------------------------------------
    // The planes that make a skull read as a skull rather than a mask. Clipped
    // to the head by `faceMask`, so nothing hangs in the dark beside it.
    for (const side of [-1, 1] as const) {
      // Brow ridge, outward and above the socket like a real orbital rim.
      softBlob(lit, ...pt(side * FACE.eyeU * 1.02, FACE.eyeV - 0.115), halfW * 0.44, h * 0.045, watcherTokens.litBone, a * 0.34);
      // Cheekbone: the widest lit plane on the face.
      softBlob(lit, ...pt(side * 0.72, FACE.cheekV - 0.02), halfW * 0.3, h * 0.07, watcherTokens.litBone, a * 0.28);
      // Temple, hollowed rather than lit - a skull is concave here.
      softBlob(lit, ...pt(side * 0.88, -0.3), halfW * 0.3, h * 0.12, watcherTokens.rim, a * 0.7);
      // The hollow under the cheekbone, which is most of what makes a face
      // look starved rather than smooth.
      softBlob(lit, ...pt(side * 0.6, 0.13), halfW * 0.26, h * 0.06, watcherTokens.rim, a * 0.5);
      // And a shadow beside the nose, so the middle of the face has a front.
      softBlob(lit, ...pt(side * 0.26, 0.02), halfW * 0.12, h * 0.08, watcherTokens.shadow, a * 0.45);
    }
    // Nose bridge and the brow between the sockets: the front of the face.
    softBlob(lit, ...pt(0, -0.06), halfW * 0.11, h * 0.15, watcherTokens.litBone, a * 0.34);
    softBlob(lit, ...pt(0, -0.32), halfW * 0.4, h * 0.07, watcherTokens.litBone, a * 0.2);
    // The jaw, lit wherever the jaw now is. Without these the mandible falls
    // out of the gradient as it drops and the bottom row of teeth reads as
    // floating in the dark with nothing holding them up.
    softBlob(lit, ...pt(0, FACE.chinV - 0.06 + d), halfW * 0.34, h * 0.055, watcherTokens.litBone, a * 0.3);
    for (const side of [-1, 1] as const) {
      softBlob(lit, ...pt(side * 0.44, FACE.chinV - 0.1 + d), halfW * 0.26, h * 0.045, watcherTokens.litBone, a * 0.22);
      // The ramus, running up to the hinge by the ear.
      softBlob(lit, ...pt(side * 0.7, FACE.jawV - 0.08 + d * 0.8), halfW * 0.14, h * 0.09, watcherTokens.midBone, a * 0.35);
    }

    // --- cracks, lit from inside -----------------------------------------
    // Something is burning in there. Fixed offsets, so they do not crawl, and
    // clipped to the head so they do not read as scratches on the lens.
    const cracks: readonly (readonly [number, number, number, number, number, number])[] = [
      [-0.8, -0.26, -0.56, -0.06, -0.66, 0.1],
      [0.74, -0.3, 0.5, -0.1, 0.62, 0.04],
      [-0.2, -0.44, -0.1, -0.3, -0.26, -0.22],
      [0.26, -0.4, 0.14, -0.3, 0.3, -0.24],
    ];
    for (const [ax, ay, bx, by, cx, cy] of cracks) {
      lit.moveTo(...pt(ax, ay));
      lit.lineTo(...pt(bx, by));
      lit.lineTo(...pt(cx, cy));
    }
    lit.stroke({ width: Math.max(1, h * 0.0045), color: tokens.ember, alpha: a * 0.45 * pulse });

    // --- eye sockets ------------------------------------------------------
    // Angled almonds, not circles. A round socket reads as a cartoon eye; the
    // outer corner has to sit higher than the inner one or the face has no
    // expression at all.
    const socketRx = halfW * FACE.socketU;
    const socketRy = h * FACE.socketV;
    for (const side of [-1, 1] as const) {
      /** Socket-local coordinates: +su is outward, +sv is down. */
      const sp = (su: number, sv: number): [number, number] =>
        pt(side * (FACE.eyeU + su * (socketRx / halfW)), FACE.eyeV + sv * (socketRy / h));

      cavity.moveTo(...sp(-0.92, 0.2));
      cavity.quadraticCurveTo(...sp(-0.55, 1.05), ...sp(0.35, 0.92));
      cavity.quadraticCurveTo(...sp(1.1, 0.78), ...sp(1.05, -0.2));
      cavity.quadraticCurveTo(...sp(0.5, -1.05), ...sp(-0.45, -0.85));
      cavity.quadraticCurveTo(...sp(-1.1, -0.6), ...sp(-0.92, 0.2));
      cavity.closePath();
      cavity.fill({ color: watcherTokens.cavity, alpha: a });

      // The light in the hollow, and a slit of a pupil inside that. On the
      // `inner` layer, so it sits in the socket rather than under it.
      const [ex, ey] = sp(0.05, 0.18);
      softBlob(inner, ex, ey, socketRx * 0.6, socketRy * 0.5, tokens.ember, a * 0.5 * pulse, 20);
      inner.circle(ex, ey, socketRx * 0.13).fill({ color: tokens.candle, alpha: a * 0.9 * pulse });
      inner
        .ellipse(ex, ey, socketRx * 0.04, socketRy * 0.19)
        .fill({ color: watcherTokens.cavity, alpha: a * 0.94 });

      // --- wax tears ----------------------------------------------------
      // The Wicks' own melt, running out of it. Ties the monster to the game.
      for (let i = 0; i < config.watcher.tearCount; i++) {
        const t = (i + 1) / (config.watcher.tearCount + 1);
        const u = side * (FACE.eyeU + (t - 0.62) * 0.9 * (socketRx / halfW));
        const run = (0.08 + 0.24 * st.approach) * (0.55 + 0.45 * Math.sin(i * 2.3 + 1));
        const topV = FACE.eyeV + FACE.socketV * 0.72;
        // Tapered almost to nothing, and barely lighter than the face. Drawn
        // as straight-sided rods at any real opacity they read as grey plastic
        // pipes hanging off the skull, which is a very hard look to recover
        // from. A wax run is mostly a change in sheen, not a shape.
        const wx = Math.max(1, h * 0.006);
        const [p0x, p0y] = pt(u, topV);
        const [pmx, pmy] = pt(u, topV + run * 0.6);
        const [p1x, p1y] = pt(u, topV + run);
        detail.moveTo(p0x - wx, p0y);
        detail.quadraticCurveTo(pmx - wx * 0.7, pmy, p1x - wx * 0.22, p1y);
        detail.lineTo(p1x + wx * 0.22, p1y);
        detail.quadraticCurveTo(pmx + wx * 0.7, pmy, p0x + wx, p0y);
        detail.closePath();
        detail.fill({ color: tokens.wax, alpha: a * 0.07 });
        // The bead at the end, which is the only part that reads as wet.
        detail.circle(p1x, p1y, wx * 0.62).fill({ color: tokens.wax, alpha: a * 0.16 });
      }
    }

    // --- the nose ---------------------------------------------------------
    // A skull's piriform aperture: an upside-down heart with a spine of bone
    // down the middle. Two round holes read as a snowman.
    const nu = FACE.noseU;
    cavity.moveTo(...pt(0, FACE.noseTopV));
    cavity.quadraticCurveTo(...pt(nu * 0.7, FACE.noseTopV + 0.05), ...pt(nu, FACE.noseV));
    cavity.quadraticCurveTo(...pt(nu * 0.72, FACE.noseV + 0.022), ...pt(nu * 0.26, FACE.noseV + 0.012));
    cavity.lineTo(...pt(0, FACE.noseV - 0.035));
    cavity.lineTo(...pt(-nu * 0.26, FACE.noseV + 0.012));
    cavity.quadraticCurveTo(...pt(-nu * 0.72, FACE.noseV + 0.022), ...pt(-nu, FACE.noseV));
    cavity.quadraticCurveTo(...pt(-nu * 0.7, FACE.noseTopV + 0.05), ...pt(0, FACE.noseTopV));
    cavity.closePath();
    cavity.fill({ color: watcherTokens.cavity, alpha: a });

    // --- the mouth --------------------------------------------------------
    // The gap the dropped jaw opens, and the whole reason the framing matters.
    const mouthW = halfW * FACE.mouthU;
    const gapTop = FACE.upperLipV;
    const gapBottom = FACE.lowerLipV + vOf(jawDrop);

    if (gapBottom > gapTop + 0.01) {
      // The dark between the jaws, closed off at the sides by the corners of
      // the mouth so it never spills past the cheeks.
      cavity.moveTo(...pt(-mouthW / halfW, gapTop + 0.012));
      cavity.quadraticCurveTo(...pt(0, gapTop - 0.016), ...pt(mouthW / halfW, gapTop + 0.012));
      cavity.quadraticCurveTo(
        ...pt((mouthW / halfW) * 0.74, (gapTop + gapBottom) / 2),
        ...pt((mouthW / halfW) * 0.8, gapBottom - 0.01),
      );
      cavity.quadraticCurveTo(...pt(0, gapBottom + 0.022), ...pt((-mouthW / halfW) * 0.8, gapBottom - 0.01));
      cavity.quadraticCurveTo(
        ...pt((-mouthW / halfW) * 0.74, (gapTop + gapBottom) / 2),
        ...pt(-mouthW / halfW, gapTop + 0.012),
      );
      cavity.closePath();
      cavity.fill({ color: watcherTokens.cavity, alpha: a });

      // The throat, burning somewhere behind the teeth. On `inner`, so it is
      // in the hole rather than hidden behind it - which is where the previous
      // version put it, with the result that the mouth was simply a black gap.
      softBlob(
        inner,
        ...pt(0, (gapTop + gapBottom) / 2 + 0.03),
        mouthW * 0.86,
        (gapBottom - gapTop) * h * 0.3,
        tokens.ember,
        a * 0.3 * openness,
        24,
      );
    }

    // Teeth: irregular, uneven, hanging from the maxilla and standing on the
    // mandible so they separate as it drops. The brightest thing in the frame,
    // set directly against the darkest.
    if (openness > 0.05) {
      const ta = a * Math.min(1, openness * 3);
      const n = 11;
      const root = Math.max(1, h * 0.004);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const tx = (-mouthW + mouthW * 2 * t) / halfW;
        // Narrow toward the corners, so each row follows the mouth's curve.
        const edge = Math.max(0.3, 1 - Math.abs(t - 0.5) * 1.4);
        // Width and length both wander, and the canines are nearly twice the
        // length of their neighbours - an even row reads as a pumpkin.
        const fang = i === 2 || i === 8 ? 1.75 : 1;
        const tw = (mouthW * 0.085 * edge * (0.72 + 0.5 * Math.abs(Math.cos(i * 3.1)))) / halfW;

        // Upper row, hanging down from the upper lip.
        const th = FACE.toothV * (0.5 + 0.5 * Math.abs(Math.sin(i * 2.7))) * edge * fang;
        const upTop = gapTop - 0.004;
        detail.moveTo(...pt(tx - tw, upTop));
        detail.lineTo(...pt(tx - tw * 0.26, upTop + th));
        detail.lineTo(...pt(tx + tw * 0.26, upTop + th));
        detail.lineTo(...pt(tx + tw, upTop));
        detail.closePath();
        detail.fill({ color: watcherTokens.tooth, alpha: ta * 0.92 });

        // Lower row, offset by half a tooth so the two rows interlock, and
        // standing on the jaw wherever the jaw has fallen to.
        const b = (i + 1) / n;
        const bx = (-mouthW + mouthW * 2 * b) / halfW;
        const bEdge = Math.max(0.3, 1 - Math.abs(b - 0.5) * 1.4);
        const bFang = i === 1 || i === 7 ? 1.5 : 1;
        const bw = (mouthW * 0.085 * bEdge * (0.72 + 0.5 * Math.abs(Math.sin(i * 2.2)))) / halfW;
        const bh = FACE.toothV * (0.6 + 0.4 * Math.abs(Math.cos(i * 1.9))) * bEdge * bFang;
        const loBase = gapBottom + 0.004;
        detail.moveTo(...pt(bx - bw, loBase));
        detail.lineTo(...pt(bx - bw * 0.26, loBase - bh));
        detail.lineTo(...pt(bx + bw * 0.26, loBase - bh));
        detail.lineTo(...pt(bx + bw, loBase));
        detail.closePath();
        detail.fill({ color: watcherTokens.tooth, alpha: ta * 0.88 });
      }
      // A soft shadow just inside each lip, where the teeth meet the gum. A
      // straight stroke here read as a metal bar laid across the mouth.
      softBlob(inner, ...pt(0, gapTop + 0.012), mouthW * 0.95, h * 0.022, watcherTokens.toothRoot, ta * 0.55, 10);
      softBlob(inner, ...pt(0, gapBottom - 0.012), mouthW * 0.85, h * 0.018, watcherTokens.toothRoot, ta * 0.45, 10);
      void root;
    }

    // --- it closes in on the edges too ------------------------------------
    // A vignette in three passes of decreasing inset, so the edge of the frame
    // is a falloff rather than a visible line drawn across the screen.
    const vig = st.phase === 'holding' || st.phase === 'leaving' ? 1 : Math.max(0, st.approach);
    if (vig > 0.01) {
      const inset = Math.min(vp.width, vp.height) * 0.3 * vig;
      // Nested frames rather than three thick bands. Three were visible as
      // hard horizontal lines ruled across the face; eighteen read as a
      // darkness that thickens toward the edge.
      const steps = 18;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * inset;
        const al = (a * 0.5) / steps;
        frame.rect(vp.offsetX, vp.offsetY, vp.width, t).fill({ color: watcherTokens.cavity, alpha: al });
        frame
          .rect(vp.offsetX, vp.offsetY + vp.height - t, vp.width, t)
          .fill({ color: watcherTokens.cavity, alpha: al });
        frame.rect(vp.offsetX, vp.offsetY, t, vp.height).fill({ color: watcherTokens.cavity, alpha: al });
        frame
          .rect(vp.offsetX + vp.width - t, vp.offsetY, t, vp.height)
          .fill({ color: watcherTokens.cavity, alpha: al });
      }
    }

    // The shake is the physical half of the startle, and the one part that
    // "Reduce effects" removes entirely.
    if (reducedEffects) return 0;
    if (st.phase === 'approaching') return config.watcher.shakeFh * st.approach;
    if (st.phase === 'holding') return config.watcher.shakeFh * (0.5 + 0.5 * Math.abs(judder) * 10);
    return 0;
  }
}
