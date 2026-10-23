/**
 * `npm run bench:tracking` - measures tracker Hz and render fps in a real
 * browser, with a camera, without a human (docs/OVERHAUL.md section 7).
 *
 * Drives a headless Chrome or Edge over the DevTools protocol with Chrome's
 * built-in fake camera (`--use-fake-device-for-media-stream`), starts the
 * webcam path the same way the game does, plays level 01-1 and samples
 * `window.faceplant.trackingHz` / `.fps` once a second.
 *
 * The fake camera shows a test pattern, not a face, so the landmarker runs
 * its detector on every frame and finds nothing. That is still the right
 * measurement for the regression this exists to catch: whether the render
 * loop starves detection. Headless also renders WebGL in software, which is
 * slower than any integrated GPU - a build that holds its rate here holds it
 * on real hardware.
 *
 * Usage:
 *   npm run dev                       (in another terminal)
 *   npm run bench:tracking            (defaults to http://localhost:5173)
 *   npm run bench:tracking -- http://localhost:5174 15
 *
 * Works against any revision that exposes `window.faceplant` with
 * `enableCamera`, `playStory`, `trackingHz` and `fps`, which is every one
 * since v1 - so `git worktree add ../fp-v1 5715a98` can be measured with
 * the same script.
 */

import { launch, sleep } from './browser.ts';

const url = process.argv[2] ?? 'http://localhost:5173';
const seconds = Number(process.argv[3] ?? 12);
/** `reduced` measures with "Reduce effects" on, to price the post-process. */
const reduced = process.argv[4] === 'reduced';

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

const browser = await launch();
try {
  const { cdp } = browser;
  // Skip the notice so every revision lands on the same screen.
  await cdp.send('Page.navigate', { url });
  await sleep(1500);
  await cdp.eval(`(() => {
    const k = 'faceplant.settings.v1';
    let s = {};
    try { s = JSON.parse(localStorage.getItem(k) ?? '{}') ?? {}; } catch {}
    localStorage.setItem(k, JSON.stringify({ ...s, noticeSeen: true, howToPlaySeen: true, reducedEffects: ${reduced} }));
  })()`);
  await cdp.send('Page.navigate', { url: `${url}${url.includes('?') ? '&' : '?'}bench=1` });

  for (let i = 0; i < 60; i++) {
    if (await cdp.eval<boolean>('typeof window.faceplant === "object"')) break;
    await sleep(250);
  }
  // The same path the camera button takes. Calibration fails (there is no
  // face in the test pattern), which is fine: the webcam is already live.
  await cdp.eval('void window.faceplant.enableCamera(() => {})');
  for (let i = 0; i < 80; i++) {
    if (await cdp.eval<boolean>('window.faceplant.webcam !== null')) break;
    await sleep(250);
  }
  await cdp.eval(`window.faceplant.playStory('01-1')`);
  await sleep(3000);
  // Counts distinct tracker frames directly. The app's own \`trackingHz\` is an
  // average of 1000/dt, which reads high whenever frame timing jitters, so it
  // cannot be trusted to compare two revisions.
  await cdp.eval(`(() => {
    const w = window; w.__fpFrames = 0; w.__fpRenders = 0; let lastT = -1;
    const tick = () => {
      const t = w.faceplant.webcam?.latest()?.t ?? -1;
      if (t !== lastT) { lastT = t; w.__fpFrames++; }
      w.__fpRenders++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);

  const hz: number[] = [];
  const fps: number[] = [];
  const detect: number[] = [];
  let videoDriven = 0;
  for (let i = 0; i < seconds; i++) {
    await sleep(1000);
    const s = await cdp.eval<{ hz: number; fps: number; detectMs: number; vfc: boolean | null }>(
      `(() => { const w = window; const r = { hz: w.__fpFrames, fps: w.__fpRenders, detectMs: w.faceplant.webcam?.detectMs ?? -1, vfc: w.faceplant.webcam?.drivenByVideo ?? null }; w.__fpFrames = 0; w.__fpRenders = 0; return r; })()`,
    );
    hz.push(s.hz);
    fps.push(s.fps);
    detect.push(s.detectMs);
    if (s.vfc === true) videoDriven++;
  }
  console.log(`url        ${url}`);
  console.log(`tracker Hz median ${median(hz).toFixed(1)}  min ${Math.min(...hz).toFixed(1)}  max ${Math.max(...hz).toFixed(1)}`);
  console.log(`render fps median ${median(fps).toFixed(1)}  min ${Math.min(...fps).toFixed(1)}`);
  if (median(detect) >= 0) console.log(`detect ms  median ${median(detect).toFixed(1)}`);
  console.log(`driven by  ${videoDriven >= seconds / 2 ? 'video frame callback' : 'animation frame (fallback or v1)'}${reduced ? '  [reduce effects on]' : ''}`);
  const overlay = await cdp.eval<string | null>(`document.querySelector('.debug-overlay-text')?.textContent ?? null`);
  if (overlay !== null) console.log(`\n?debug=1 overlay:\n${overlay}`);
  const cam = await cdp.eval<string>(`(() => { const v = window.faceplant.webcam?.info().video; return v ? v.videoWidth + 'x' + v.videoHeight : 'none'; })()`);
  console.log(`camera     ${cam}`);
} finally {
  await browser.close();
}
