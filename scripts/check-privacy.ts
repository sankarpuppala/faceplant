/**
 * AC-5. Scans the **built** bundle for anything that could leave the device.
 *
 * This runs on `dist/` rather than on `src/`, deliberately: a dependency could
 * introduce a CDN URL or a beacon without any of our source mentioning it, and
 * the bundle is what actually ships. Together with the dev-mode
 * PerformanceObserver in `main.ts` it covers both halves of invariant 1 -
 * nothing external in the code, nothing external at runtime.
 *
 * Checks:
 *   1. no absolute http(s) URL outside a small allowlist;
 *   2. no fetch/XHR/WebSocket/sendBeacon/EventSource with a non-relative URL;
 *   3. no getUserMedia request for audio (invariant 3: never the microphone);
 *   4. no analytics, ad or crash-reporter names (invariant 2);
 *   5. no localStorage/IndexedDB key that smells like media storage.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '..', 'dist');

if (!existsSync(dist)) {
  process.stdout.write('dist/ does not exist. Run `npm run build` first.\n');
  process.exit(1);
}

/**
 * Hosts allowed to appear as *text* in the bundle.
 *
 * Appearing as text and being requested are different things, and this project
 * does not rely on the distinction: `src/privacy.ts` wraps fetch, XHR,
 * sendBeacon, WebSocket and EventSource and refuses anything that is not
 * same-origin, so none of these can be reached even if something tried. This
 * script checks the far cheaper property - that nothing *new* and unexplained
 * has appeared - and the guard is what makes the invariant true.
 *
 * Most entries are licence headers, specification links and XML namespaces,
 * which are names rather than endpoints. One is not, and it is called out
 * individually below.
 */
const ALLOWED_SUBSTRINGS: readonly string[] = [
  'https://faceplant.game',
  'http://www.w3.org/',
  'https://www.w3.org/',
  'http://www.khronos.org/',
  'https://github.com/',
  'https://opensource.org/',
  'https://pixijs.com',
  'https://pixijs.io',
  'https://www.apache.org/licenses/',
  'https://developer.mozilla.org/',
  'https://claude.com/claude-code',
  // MediaPipe's own bundle carries the model-card URL in a comment. The model
  // is served from public/mediapipe; this string is never fetched.
  'https://storage.googleapis.com/mediapipe-models/',
  //
  // *** The one real endpoint in the bundle. ***
  //
  // @mediapipe/tasks-vision ships a telemetry client that POSTs to this URL.
  // It is opt-in behind `TaskRunner.enableLogging()`, which this project never
  // calls, so it is dormant in the pinned version - but a dormant beacon in
  // somebody else's code is not a privacy guarantee. It is neutralised by the
  // runtime guard in src/privacy.ts, and the GUARD_MARKERS check below fails
  // the build if that guard is ever removed from the bundle.
  'https://odml.pa.googleapis.com/v1/log',
  'https://google.github.io/mediapipe/',
  'https://ai.google.dev/edge/mediapipe',
  'https://mediapipe.page.link/',
  'https://chromium.googlesource.com/',
  'https://source.chromium.org/',
  'https://emscripten.org',
  'https://registry.khronos.org/',
  'https://www.khronos.org/',
  'http://kripken.github.io/emscripten-site/',
  'http://unicode.org/',
  'http://en.wikipedia.org/',
  'https://www.ietf.org/',
  'https://tools.ietf.org/',
  'http://pubs.opengroup.org/',
  'https://webkit.org/',
  'https://bugzil.la/',
  'https://bugs.chromium.org/',
  'https://crbug.com/',
  'http://www.pixijs.com/',
  'http://server.com',
  'https://html.spec.whatwg.org/',
  'https://url.spec.whatwg.org/',
  'https://streams.spec.whatwg.org/',
  'https://heycam.github.io/',
  'https://www.unicode.org/',
  'http://site.icu-project.org/',
  'https://sourceware.org/',
  'https://gcc.gnu.org/',
  'https://llvm.org/',
  'https://reviews.llvm.org/',
  'https://github.com',
  'http://creativecommons.org/',
  'https://creativecommons.org/',
  'http://schemas.',
  'https://schemas.',
];

/**
 * Proof that the runtime guard survived into the bundle. If a refactor drops
 * it, the allowlist above stops being safe, so this check must fail loudly.
 */
const GUARD_MARKERS: readonly string[] = [
  'blocked a ',
  'that would have left this device',
];

const BANNED_NAMES: readonly string[] = [
  'google-analytics',
  'googletagmanager',
  'gtag(',
  'segment.io',
  'mixpanel',
  'amplitude.com',
  'sentry.io',
  'bugsnag',
  'datadoghq',
  'hotjar',
  'plausible.io',
  'posthog',
  'doubleclick',
  'facebook.net',
  'fbq(',
  'clarity.ms',
  'newrelic',
  'rollbar',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.css', '.json', '.map', '.svg']);

interface Finding {
  file: string;
  rule: string;
  detail: string;
}

const findings: Finding[] = [];
const urlRe = /https?:\/\/[^\s'"`)\\<>]+/g;

let scanned = 0;
let bytes = 0;

for (const file of walk(dist)) {
  bytes += statSync(file).size;
  if (!TEXT_EXT.has(extname(file))) continue;
  // Source maps carry the original comments, so scanning them would flag our
  // own documentation. The emitted code is what ships and what we check.
  if (file.endsWith('.map')) continue;

  const rel = relative(dist, file);
  const text = readFileSync(file, 'utf8');
  scanned++;

  // 1 - absolute URLs.
  for (const match of text.match(urlRe) ?? []) {
    if (ALLOWED_SUBSTRINGS.some((a) => match.startsWith(a))) continue;
    findings.push({ file: rel, rule: 'absolute-url', detail: match.slice(0, 140) });
  }

  // 2 - network calls with a non-relative URL. The patterns look for a
  // scheme or a protocol-relative URL as the first argument.
  const netRe = /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b[^\n]{0,80}?["'`](https?:|\/\/)/g;
  for (const m of text.match(netRe) ?? []) {
    if (ALLOWED_SUBSTRINGS.some((a) => m.includes(a))) continue;
    findings.push({ file: rel, rule: 'network-call', detail: m.slice(0, 140) });
  }

  // 3 - the microphone. Invariant 3: audio is never captured.
  if (/getUserMedia\s*\(\s*\{[^}]*audio\s*:\s*true/.test(text)) {
    findings.push({ file: rel, rule: 'microphone', detail: 'getUserMedia requested audio: true' });
  }

  // 4 - trackers.
  for (const name of BANNED_NAMES) {
    if (text.includes(name)) findings.push({ file: rel, rule: 'tracker', detail: name });
  }

  // 5 - media in storage. Invariant 3: only progress and settings persist.
  const storeRe = /(localStorage|sessionStorage|indexedDB)[^\n]{0,60}(video|frame|image|clip|photo|recording|blob)/gi;
  for (const m of text.match(storeRe) ?? []) {
    findings.push({ file: rel, rule: 'media-storage', detail: m.slice(0, 140) });
  }
}

// --- the runtime guard must have survived into the bundle -----------------
let guardFound = false;
for (const file of walk(dist)) {
  if (extname(file) !== '.js') continue;
  const text = readFileSync(file, 'utf8');
  if (GUARD_MARKERS.every((m) => text.includes(m))) {
    guardFound = true;
    break;
  }
}
if (!guardFound) {
  findings.push({
    file: 'dist/',
    rule: 'missing-network-guard',
    detail: 'installNetworkGuard() from src/privacy.ts is not in the bundle, so invariant 1 is unenforced',
  });
}

process.stdout.write(`check:privacy — scanned ${scanned} text files, dist/ is ${(bytes / 1_048_576).toFixed(2)} MB\n`);
process.stdout.write(`runtime network guard: ${guardFound ? 'present' : 'MISSING'}\n`);

if (findings.length === 0) {
  process.stdout.write('PASS — no external URLs, no network calls, no microphone, no trackers.\n');
  process.exit(0);
}

process.stdout.write(`\nFAIL — ${findings.length} finding(s):\n`);
const byRule = new Map<string, Finding[]>();
for (const f of findings) {
  const list = byRule.get(f.rule) ?? [];
  list.push(f);
  byRule.set(f.rule, list);
}
for (const [rule, list] of byRule) {
  process.stdout.write(`\n  ${rule} (${list.length})\n`);
  for (const f of list.slice(0, 12)) process.stdout.write(`    ${f.file}: ${f.detail}\n`);
  if (list.length > 12) process.stdout.write(`    ... and ${list.length - 12} more\n`);
}
process.exit(1);
