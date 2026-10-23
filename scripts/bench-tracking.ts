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

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const url = process.argv[2] ?? 'http://localhost:5173';
const seconds = Number(process.argv[3] ?? 12);
/** `reduced` measures with "Reduce effects" on, to price the post-process. */
const reduced = process.argv[4] === 'reduced';
const port = 9333 + Math.floor(Math.random() * 400);

const browser = BROWSERS.find((b) => existsSync(b));
if (browser === undefined) {
  console.error('bench:tracking needs Chrome or Edge.');
  process.exit(2);
}

const profile = mkdtempSync(join(tmpdir(), 'fp-bench-'));
const child = spawn(
  browser,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--use-fake-device-for-media-stream=fps=30',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function pageSocket(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = (await res.json()) as { type: string; webSocketDebuggerUrl: string }[];
      const page = list.find((t) => t.type === 'page');
      if (page !== undefined) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('the browser never exposed a page');
}

class Cdp {
  private id = 0;
  private readonly pending = new Map<number, (v: unknown) => void>();
  private readonly ws: WebSocket;
  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: unknown };
      if (msg.id === undefined) return;
      this.pending.get(msg.id)?.(msg.error ?? msg.result);
      this.pending.delete(msg.id);
    });
  }
  static async open(wsUrl: string): Promise<Cdp> {
    const ws = new WebSocket(wsUrl);
    await new Promise((r, j) => {
      ws.addEventListener('open', r);
      ws.addEventListener('error', j);
    });
    return new Cdp(ws);
  }
  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((r) => this.pending.set(id, r));
  }
  async eval<T>(expression: string): Promise<T> {
    const r = (await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })) as {
      result?: { value?: T };
    };
    return r.result?.value as T;
  }
  close(): void {
    this.ws.close();
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

try {
  const cdp = await Cdp.open(await pageSocket());
  await cdp.send('Runtime.enable');
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
  if (overlay !== null) console.log(`
?debug=1 overlay:
${overlay}`);
  const cam = await cdp.eval<string>(`(() => { const v = window.faceplant.webcam?.info().video; return v ? v.videoWidth + 'x' + v.videoHeight : 'none'; })()`);
  console.log(`camera     ${cam}`);
  cdp.close();
} finally {
  child.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* the browser may still hold a lock on Windows; it is a temp dir */
  }
}
