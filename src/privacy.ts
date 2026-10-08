/**
 * The network guard: CLAUDE.md invariant 1, enforced instead of promised.
 *
 * The invariant is that the game makes **no network requests at runtime except
 * same-origin static assets**. Up to now that was guaranteed by inspection -
 * we don't write any, and `check-privacy.ts` scans the bundle for any that
 * crept in. Inspection is not enough, and here is why:
 *
 * `@mediapipe/tasks-vision` ships a telemetry client that POSTs to
 * `https://odml.pa.googleapis.com/v1/log`. It is opt-in behind a
 * `TaskRunner.enableLogging()` method that this project never calls, so it is
 * dormant. But "dormant in the version we pinned" is a claim about somebody
 * else's code, and a minor-version bump could change it without any change of
 * ours. A privacy promise that depends on a third party's default settings is
 * not a promise.
 *
 * So this file makes it structural. Every egress API the platform offers is
 * wrapped, and anything that is not same-origin is refused before it leaves.
 * The guard is installed as the very first thing `main.ts` does, before Pixi or
 * MediaPipe are even imported, so there is no window in which it is not active.
 *
 * What is still allowed: the game's own files - the wasm runtime, the face
 * model, fonts, level JSON - all served from this origin, plus the `blob:` and
 * `data:` URLs the clip recorder and the result card produce locally.
 */

export interface BlockedRequest {
  api: 'fetch' | 'xhr' | 'sendBeacon' | 'WebSocket' | 'EventSource';
  url: string;
}

const blocked: BlockedRequest[] = [];
let installed = false;

/** Everything the game is allowed to load, by URL scheme. */
const LOCAL_SCHEMES = new Set(['blob:', 'data:', 'about:', 'filesystem:']);

/**
 * True if a URL stays on this device. Relative URLs resolve against the
 * document, so they are same-origin by construction.
 */
export function isLocalUrl(raw: string, origin: string, base: string): boolean {
  if (raw === '') return true;
  let parsed: URL;
  try {
    parsed = new URL(raw, base);
  } catch {
    // Unparseable: refuse it rather than guess.
    return false;
  }
  if (LOCAL_SCHEMES.has(parsed.protocol)) return true;
  return parsed.origin === origin;
}

function note(api: BlockedRequest['api'], url: string): void {
  blocked.push({ api, url });
  // eslint-disable-next-line no-console
  console.error(`[privacy] blocked a ${api} request that would have left this device: ${url}`);
}

/** Requests the guard has refused. The privacy test reads this. */
export function blockedRequests(): readonly BlockedRequest[] {
  return blocked;
}

/**
 * Installs the guard. Idempotent, and safe to call in a non-browser context
 * (the tests call it against a stub global).
 */
export function installNetworkGuard(scope: typeof globalThis = globalThis): void {
  if (installed) return;
  // No document means no page to protect - the headless tests drive
  // `isLocalUrl` directly with explicit arguments instead.
  if (typeof location === 'undefined') return;
  installed = true;

  const origin = location.origin;
  const base = location.href;
  const ok = (url: string): boolean => isLocalUrl(url, origin, base);

  // --- fetch -------------------------------------------------------------
  const realFetch = scope.fetch;
  if (typeof realFetch === 'function') {
    scope.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
      if (!ok(url)) {
        note('fetch', url);
        return Promise.reject(new Error(`FACEPLANT blocked an off-device request to ${url}`));
      }
      return realFetch.call(scope, input, init);
    };
  }

  // --- XMLHttpRequest ----------------------------------------------------
  const Xhr = (scope as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
  if (typeof Xhr === 'function') {
    const realOpen = Xhr.prototype.open;
    // `open` has two overloads with optional trailing arguments; forwarding
    // them untouched via apply keeps the platform's signature the platform's
    // problem rather than ours.
    // `open` is an overload set with optional trailing arguments, so the
    // wrapper is typed loosely here and cast back; the alternative is to
    // re-declare both overloads just to forward them unchanged.
    type AnyOpen = (this: XMLHttpRequest, ...args: unknown[]) => void;
    const guardedOpen: AnyOpen = function guardedOpen(this: XMLHttpRequest, ...args: unknown[]): void {
      const url = args[1];
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : String(url);
      if (!ok(href)) {
        note('xhr', href);
        throw new Error(`FACEPLANT blocked an off-device request to ${href}`);
      }
      (realOpen as unknown as AnyOpen).apply(this, args);
    };
    Xhr.prototype.open = guardedOpen as unknown as XMLHttpRequest['open'];
  }

  // --- sendBeacon: the classic analytics channel -------------------------
  const nav = (scope as { navigator?: Navigator }).navigator;
  if (nav !== undefined && typeof nav.sendBeacon === 'function') {
    const realBeacon = nav.sendBeacon.bind(nav);
    nav.sendBeacon = function guardedBeacon(url: string | URL, data?: BodyInit | null): boolean {
      const href = typeof url === 'string' ? url : url.href;
      if (!ok(href)) {
        note('sendBeacon', href);
        return false;
      }
      return data === undefined ? realBeacon(url) : realBeacon(url, data);
    };
  }

  // --- WebSocket and EventSource ----------------------------------------
  // A socket is never a static asset, so no URL is ever allowed - not even a
  // same-origin one. The game has no server to talk to (decision D1).
  const realWs = (scope as { WebSocket?: typeof WebSocket }).WebSocket;
  if (typeof realWs === 'function') {
    const guardedWs = function GuardedWebSocket(url: string | URL): WebSocket {
      const href = typeof url === 'string' ? url : url.href;
      note('WebSocket', href);
      throw new Error(`FACEPLANT blocked a WebSocket to ${href}`);
    } as unknown as typeof WebSocket;
    guardedWs.prototype = realWs.prototype;
    (scope as { WebSocket: typeof WebSocket }).WebSocket = guardedWs;
  }

  const realEs = (scope as { EventSource?: typeof EventSource }).EventSource;
  if (typeof realEs === 'function') {
    const EsCtor = realEs;
    const guardedEs = function GuardedEventSource(url: string | URL, init?: EventSourceInit): EventSource {
      const href = typeof url === 'string' ? url : url.href;
      if (!ok(href)) {
        note('EventSource', href);
        throw new Error(`FACEPLANT blocked an EventSource to ${href}`);
      }
      return new EsCtor(url, init);
    } as unknown as typeof EventSource;
    guardedEs.prototype = realEs.prototype;
    (scope as { EventSource: typeof EventSource }).EventSource = guardedEs;
  }
}

/** Test seam: forget that the guard was installed. */
export function resetNetworkGuardForTests(): void {
  installed = false;
  blocked.length = 0;
}
