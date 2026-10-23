/**
 * A headless Chrome or Edge, driven over the DevTools protocol, for the
 * scripts that have to see the real game running: `bench:tracking`,
 * `check:flow`. Node's own `WebSocket` and `fetch` - no new dependency.
 *
 * The fake camera (`--use-fake-device-for-media-stream`) is Chrome's built-in
 * test pattern. It is not a face and nothing of anyone's is ever involved.
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

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Cdp {
  private id = 0;
  private readonly pending = new Map<number, (v: unknown) => void>();
  private readonly listeners = new Map<string, ((params: unknown) => void)[]>();
  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(String(ev.data)) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: unknown };
      if (msg.id === undefined) {
        if (msg.method !== undefined) for (const cb of this.listeners.get(msg.method) ?? []) cb(msg.params);
        return;
      }
      this.pending.get(msg.id)?.(msg.error ?? msg.result);
      this.pending.delete(msg.id);
    });
  }

  /** Listens for a protocol event, e.g. `Runtime.exceptionThrown`. */
  on(method: string, cb: (params: unknown) => void): void {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), cb]);
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

  /** A real key press, through the browser's input pipeline. */
  async key(key: string, code = key): Promise<void> {
    const keyCode = key === 'Escape' ? 27 : key === 'Enter' ? 13 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  }

  close(): void {
    this.ws.close();
  }
}

export interface Browser {
  cdp: Cdp;
  close: () => Promise<void>;
}

export async function launch(opts: { width?: number; height?: number; fakeCameraFps?: number } = {}): Promise<Browser> {
  const exe = BROWSERS.find((b) => existsSync(b));
  if (exe === undefined) throw new Error('needs Chrome or Edge, and found neither');

  const port = 9333 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), 'fp-browser-'));
  const child = spawn(
    exe,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--use-fake-device-for-media-stream=fps=${opts.fakeCameraFps ?? 30}`,
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${opts.width ?? 1280},${opts.height ?? 720}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let wsUrl: string | null = null;
  for (let i = 0; i < 50 && wsUrl === null; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = (await res.json()) as { type: string; webSocketDebuggerUrl: string }[];
      wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
    } catch {
      /* not up yet */
    }
    if (wsUrl === null) await sleep(200);
  }
  if (wsUrl === null) {
    child.kill();
    throw new Error('the browser never exposed a page');
  }

  const cdp = await Cdp.open(wsUrl);
  await cdp.send('Runtime.enable');
  return {
    cdp,
    close: async () => {
      cdp.close();
      child.kill();
      await sleep(500);
      try {
        rmSync(profile, { recursive: true, force: true });
      } catch {
        /* Windows may still hold a lock on the temp profile; it is a temp dir */
      }
    },
  };
}
