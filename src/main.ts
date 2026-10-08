/**
 * Entry point.
 *
 * AC-5 is covered in three deliberately overlapping layers:
 *
 *   1. `installNetworkGuard()` refuses any off-device request at the API level.
 *      This is the layer that actually enforces CLAUDE.md invariant 1.
 *   2. `scripts/check-privacy.ts` scans the built bundle for anything that
 *      could leave, so a dependency that grows a beacon becomes visible.
 *   3. the dev-mode PerformanceObserver below reports any cross-origin
 *      resource the browser did load, catching markup and CSS paths that never
 *      touch a JS API.
 *
 * The guard is installed before the game is even *loaded*. `import` statements
 * are hoisted, so a plain import of `app.ts` would be evaluated before any
 * statement here could run - and `app.ts` pulls in Pixi and MediaPipe. A
 * dynamic import after the guard is installed is what makes the ordering real
 * rather than merely apparent.
 */

import { installNetworkGuard } from './privacy.ts';

installNetworkGuard();

function installCrossOriginObserver(): void {
  if (!import.meta.env.DEV) return;
  if (typeof PerformanceObserver === 'undefined') return;

  const origin = window.location.origin;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const name = entry.name;
        if (!name.startsWith('http')) continue;
        if (name.startsWith(origin)) continue;
        // eslint-disable-next-line no-console
        console.error(`[privacy] cross-origin resource loaded: ${name}`);
      }
    });
    observer.observe({ type: 'resource', buffered: true });
  } catch {
    /* the observer is a developer aid, never a requirement */
  }
}

async function boot(): Promise<void> {
  const host = document.getElementById('app');
  if (host === null) throw new Error('#app is missing from index.html');

  installCrossOriginObserver();

  // Loaded only now, with the guard already in place.
  const { App } = await import('./app.ts');
  const app = new App(host);
  await app.start();

  // Handy for measuring AC-7 from the console without a debug build.
  Object.defineProperty(window, 'faceplant', { value: app, configurable: true });
}

void boot().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const host = document.getElementById('app');
  if (host !== null) {
    host.textContent = 'FACEPLANT could not start. Check the console.';
    host.setAttribute('style', 'color:#EDE6D6;font-family:system-ui;padding:2rem');
  }
});
