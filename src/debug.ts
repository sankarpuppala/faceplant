/**
 * The developer page (`/debug.html`, SPEC section 19).
 *
 * Shows the landmarks, the named contours, the walkable/ignored split,
 * blendshape bars, the Maw and lid states, fps and tracking Hz - and records
 * fixtures.
 *
 * The walkable/ignored colouring is the single most useful thing here: it is
 * the only way to see *why* a Wick refused to cross your own nose.
 */

import { config } from './config.ts';
import { buildCalibration, CalibrationCollector, defaultCalibration, type Calibration } from './face/calibration.ts';
import { newFixtureFile, packFixtureFrame, type FixtureFile } from './face/fixtureSource.ts';
import { USED_INDICES } from './face/landmarks.ts';
import { ReactionDetector } from './face/reactions.ts';
import { AssistInput, SyntheticFaceSource } from './face/syntheticSource.ts';
import type { ContourName, RawFrame } from './face/types.ts';
import { contourNames } from './face/types.ts';
import { CameraError, WebcamFaceSource } from './face/webcamSource.ts';
import { buildContours, normaliseBlend } from './terrain/contours.ts';
import { buildFaceTerrain, cloneContours, type Segment } from './terrain/build.ts';
import { EyeDetector } from './terrain/eyes.ts';
import { MawDetector, swallowPolygon } from './terrain/maw.ts';
import { classify, slopeDeg } from './terrain/walkable.ts';
import { computeViewport, worldToScreen } from './terrain/mapping.ts';
import { hex, tokens } from './render/tokens.ts';
import { el } from './ui/dom.ts';

const CONTOUR_COLORS: Record<ContourName, string> = {
  forehead: '#FFB547',
  browL: '#FF6A2B',
  browR: '#FF6A2B',
  nose: '#5FD0FF',
  lipUpper: '#E0322B',
  lipLower: '#E07A2B',
  lipInnerUpper: '#FF9BD0',
  lipInnerLower: '#FF9BD0',
  cheekL: '#9E968A',
  cheekR: '#9E968A',
  jaw: '#C9BFA8',
  eyeLidL: '#8FFF9B',
  eyeLidR: '#8FFF9B',
  eyeRingL: '#4F7A55',
  eyeRingR: '#4F7A55',
};

/** Narrowing a module-level `const` does not survive into the closures below. */
function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(what);
  return value;
}

const view = must(document.getElementById('view'), 'debug.html is missing #view');
const panel = must(document.getElementById('panel'), 'debug.html is missing #panel');

const canvas = document.createElement('canvas');
view.appendChild(canvas);
const ctx = must(canvas.getContext('2d'), 'A 2D canvas is required.');

let cal: Calibration = defaultCalibration();
let webcam: WebcamFaceSource | null = null;
let synthetic: SyntheticFaceSource | null = null;
const assist = new AssistInput();
const maw = new MawDetector();
const eyes = new EyeDetector();
const reactions = new ReactionDetector();

let prevContours = cloneContours(buildContours({ landmarks: [], blend: { jawOpen: 0, smile: 0, browUp: 0, blinkL: 0, blinkR: 0 } }, cal, config.render.aspect));
let fixture: FixtureFile | null = null;
let showLandmarks = true;
let showIgnored = true;
let lastT = 0;
let fps = 0;

// ---------------------------------------------------------------- the panel --

const readout = el('pre');
const bars = el('div');
const buttons = el('div', { class: 'col', style: 'display:flex;flex-direction:column;gap:6px;margin-bottom:10px' });

const camBtn = el('button', { type: 'button' }, ['Start camera']);
camBtn.addEventListener('click', () => void startCamera());

const assistBtn = el('button', { type: 'button' }, ['Use Assist face']);
assistBtn.addEventListener('click', () => startAssist());

const calBtn = el('button', { type: 'button' }, ['Calibrate (hold still 2s)']);
calBtn.addEventListener('click', () => void calibrate());

const lmBtn = el('button', { type: 'button', class: 'on' }, ['Landmarks: on']);
lmBtn.addEventListener('click', () => {
  showLandmarks = !showLandmarks;
  lmBtn.textContent = `Landmarks: ${showLandmarks ? 'on' : 'off'}`;
  lmBtn.className = showLandmarks ? 'on' : '';
});

const ignBtn = el('button', { type: 'button', class: 'on' }, ['Ignored segments: on']);
ignBtn.addEventListener('click', () => {
  showIgnored = !showIgnored;
  ignBtn.textContent = `Ignored segments: ${showIgnored ? 'on' : 'off'}`;
  ignBtn.className = showIgnored ? 'on' : '';
});

const recBtn = el('button', { type: 'button' }, ['Record fixture']);
recBtn.addEventListener('click', () => {
  if (fixture === null) {
    const name = window.prompt('Fixture name (e.g. neutral, tilt, mouth-laugh)', 'neutral');
    if (name === null || name === '') return;
    // CLAUDE.md invariant 8: landmarks and blendshapes only, never an image.
    fixture = newFixtureFile(name, 'recorded', 'Recorded on the debug page. Landmarks and blendshapes only.');
    recBtn.textContent = 'Stop and download';
    recBtn.className = 'on';
  } else {
    const blob = new Blob([JSON.stringify(fixture)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fixture.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    fixture = null;
    recBtn.textContent = 'Record fixture';
    recBtn.className = '';
  }
});

buttons.append(camBtn, assistBtn, calBtn, lmBtn, ignBtn, recBtn);
panel.append(
  el('h2', { text: 'Source' }),
  buttons,
  el('h2', { text: 'Blendshapes (personal 0..1)' }),
  bars,
  el('h2', { text: 'State' }),
  readout,
  el('p', {
    class: 'small',
    text: 'Assist: mouse moves the face, Space = Maw, Shift = brows, B = blink, arrows lean/tilt.',
  }),
);

const barNames = ['jawOpen', 'smile', 'browUp', 'blinkL', 'blinkR'] as const;
const barEls = new Map<string, HTMLElement>();
for (const n of barNames) {
  const fill = el('i');
  bars.append(el('div', { text: n, class: 'small' }), el('div', { class: 'bar' }, [fill]));
  barEls.set(n, fill);
}

// --------------------------------------------------------------- the sources --

async function startCamera(): Promise<void> {
  try {
    const cam = new WebcamFaceSource({}, cal);
    await cam.start();
    webcam = cam;
    synthetic = null;
    camBtn.className = 'on';
    assistBtn.className = '';
    const v = cam.info().video;
    if (v !== null) {
      v.style.transform = 'scaleX(-1)';
      view.insertBefore(v, canvas);
    }
  } catch (err) {
    const msg = err instanceof CameraError ? err.message : String(err);
    window.alert(msg);
  }
}

function startAssist(): void {
  assist.attach(view);
  synthetic = new SyntheticFaceSource(assist, config.render.aspect, cal);
  void synthetic.start();
  webcam?.stop();
  webcam = null;
  assistBtn.className = 'on';
  camBtn.className = '';
}

async function calibrate(): Promise<void> {
  const collector = new CalibrationCollector();
  const aspect = currentAspect();
  const started = performance.now();
  calBtn.className = 'on';

  await new Promise<void>((resolve) => {
    const tick = (): void => {
      const raw = currentRaw();
      const face = raw?.faces[0];
      if (face !== undefined) collector.add(face, aspect);
      if (performance.now() - started >= config.calibration.holdMs) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  calBtn.className = '';
  const neutral = collector.resolveNeutral();
  if (!neutral.ok) {
    window.alert(`Too much movement (jitter ${neutral.jitterFh.toFixed(3)} FH, limit ${config.calibration.maxJitterFh}).`);
    return;
  }
  cal = buildCalibration({
    neutral,
    widePeak: neutral.blend,
    browPeak: neutral.blend,
    blinkPeak: neutral.blend,
    aspect,
  });
  webcam?.setCalibration(cal);
  synthetic?.setCalibration(cal);
}

function currentAspect(): number {
  return webcam?.info().aspect ?? config.render.aspect;
}

function currentRaw(): RawFrame | null {
  if (webcam !== null) return webcam.latestRaw();
  if (synthetic !== null) return synthetic.tickRaw(performance.now());
  return null;
}

// ----------------------------------------------------------------- the loop --

function loop(now: number): void {
  requestAnimationFrame(loop);

  const dt = now - lastT;
  lastT = now;
  if (dt > 0) fps = fps * 0.9 + (1000 / dt) * 0.1;

  const rect = view.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(rect.width * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const raw = currentRaw();
  const face = raw?.faces[0];
  if (raw === null || face === undefined) {
    readout.textContent = 'No face. Start the camera or the Assist face.';
    return;
  }

  const aspect = raw.aspect;
  const vp = computeViewport(rect.width, rect.height, aspect);
  const contours = buildContours(face, cal, aspect);
  const blend = normaliseBlend(face, cal);
  const mawState = maw.update(blend.jawOpen, dt);
  const lids = eyes.update(blend.blinkL, blend.blinkR, dt);
  const r = reactions.update(blend, 1, 0, now, config.quake.speedFhPerS);

  const segments = buildFaceTerrain({
    current: contours,
    previous: prevContours,
    bridgeIntact: !mawState.open,
    lidLShut: lids.left.shut,
    lidRShut: lids.right.shut,
  });
  prevContours = cloneContours(contours);

  // --- landmarks ---------------------------------------------------------
  if (showLandmarks) {
    ctx.fillStyle = 'rgba(158,150,138,0.55)';
    for (const i of USED_INDICES) {
      const lm = face.landmarks[i];
      if (lm === undefined) continue;
      // Mirrored, to match the video and the terrain.
      const x = vp.offsetX + (1 - lm.x) * vp.width;
      const y = vp.offsetY + lm.y * vp.height;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  // --- named contours ----------------------------------------------------
  for (const name of contourNames) {
    const pts = contours[name];
    if (pts.length < 2) continue;
    ctx.strokeStyle = CONTOUR_COLORS[name];
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const [i, p] of pts.entries()) {
      const s = worldToScreen(p, cal, vp);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
  }

  // --- walkable vs ignored ----------------------------------------------
  for (const seg of segments) {
    const walkable = seg.walkable;
    if (!walkable && !showIgnored) continue;
    const a = worldToScreen({ x: seg.ax, y: seg.ay }, cal, vp);
    const b = worldToScreen({ x: seg.bx, y: seg.by }, cal, vp);
    ctx.strokeStyle = seg.kind === 'rail' ? '#5FD0FF' : walkable ? hex(tokens.candle) : 'rgba(224,50,43,0.35)';
    ctx.lineWidth = walkable ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    // Up-normals on walkable segments, so a flipped winding is obvious.
    if (walkable) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      ctx.strokeStyle = 'rgba(255,181,71,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + seg.nx * 8, my + seg.ny * 8);
      ctx.stroke();
    }
  }

  // --- the swallow polygon ----------------------------------------------
  if (mawState.open) {
    const poly = swallowPolygon(contours);
    if (poly.length >= 3) {
      ctx.fillStyle = 'rgba(224,50,43,0.3)';
      ctx.beginPath();
      for (const [i, p] of poly.entries()) {
        const s = worldToScreen(p, cal, vp);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- bars and readout --------------------------------------------------
  for (const n of barNames) {
    const fill = barEls.get(n);
    if (fill === undefined) continue;
    fill.style.width = `${Math.round(blend[n] * 100)}%`;
  }

  const stats = classify(segments);
  const steepest = segments.reduce((m, s) => (s.walkable ? Math.max(m, slopeDeg(s)) : m), 0);

  if (fixture !== null) fixture.frames.push(packFixtureFrame(raw.t, face));

  readout.textContent = [
    `render        ${fps.toFixed(0)} fps`,
    `tracking      ${(webcam?.info().trackingHz ?? synthetic?.info().trackingHz ?? 0).toFixed(0)} Hz`,
    `aspect        ${aspect.toFixed(3)}`,
    '',
    `MAW           ${mawState.open ? 'OPEN' : 'shut'}  (${mawState.openness.toFixed(2)}, held ${mawState.heldMs.toFixed(0)}ms)`,
    `lid L / R     ${lids.left.shut ? 'SHUT' : 'open'} / ${lids.right.shut ? 'SHUT' : 'open'}`,
    '',
    `segments      ${stats.total}`,
    `  walkable    ${stats.walkable}`,
    `  standable   ${stats.standable}`,
    `  rails       ${stats.rails}`,
    `  NaN         ${stats.nan}`,
    `steepest walkable ${steepest.toFixed(1)} deg`,
    '',
    `laughing      ${r.laughing}  (jaw wobble ${r.jawWobbleHz.toFixed(1)} Hz)`,
    `gasp          ${r.gasp}`,
    `smiling       ${r.smiling}`,
    `browsUp       ${r.browsUp}`,
    '',
    `calibration   FH ${cal.fhUV.toFixed(4)} uv  centre ${cal.centerUV.x.toFixed(3)},${cal.centerUV.y.toFixed(3)}`,
    `  jaw         ${cal.jaw.base.toFixed(3)} .. ${cal.jaw.wide.toFixed(3)}`,
    `  brow        ${cal.brow.base.toFixed(3)} .. ${cal.brow.high.toFixed(3)}`,
    `  blink       ${cal.blink.base.toFixed(3)} .. ${cal.blink.shut.toFixed(3)}`,
    fixture === null ? '' : `RECORDING     ${fixture.frames.length} frames`,
  ].join('\n');
}

requestAnimationFrame(loop);

/** Keeps `Segment` referenced for the type-only import above. */
export type { Segment };
