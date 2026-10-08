// Smoke test: fetch the built page and walk its module graph, so a broken
// import or a missing asset fails here rather than in front of a player.
const BASE = 'http://localhost:4173';
const seen = new Set();
const problems = [];

async function get(path) {
  const url = new URL(path, BASE).href;
  const res = await fetch(url);
  if (!res.ok) { problems.push(`${res.status} ${path}`); return null; }
  return res;
}

const index = await get('/index.html');
const html = index === null ? '' : await index.text();
console.log('index.html:', index === null ? 'FAIL' : `ok (${html.length} bytes)`);

// entry module from the <script type=module src=...>
const entry = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1];
console.log('entry module:', entry ?? 'NOT FOUND');

// Walk every static import, transitively.
async function walk(path) {
  if (seen.has(path)) return;
  seen.add(path);
  const res = await get(path);
  if (res === null) return;
  const js = await res.text();
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  // Only follow things that actually look like emitted chunk paths. Walking
  // every quoted string in minified output produces nonsense matches.
  for (const m of js.matchAll(/["'](\.{0,2}\/[A-Za-z0-9._\-/]+\.js)["']/g)) {
    await walk(new URL(m[1], new URL(dir, BASE)).pathname);
  }
}
if (entry) await walk(entry.replace(/^\./, ''));
console.log('modules walked:', seen.size);

// Assets the game fetches at runtime.
for (const p of ['/levels/01-1.json','/levels/04-2.json','/mediapipe/face_landmarker.task',
                 '/mediapipe/wasm/vision_wasm_internal.js','/mediapipe/wasm/vision_wasm_internal.wasm',
                 '/fonts/vt323-latin-400-normal.woff2','/debug.html']) {
  const res = await get(p);
  console.log((res ? 'ok  ' : 'FAIL'), p, res ? `(${res.headers.get('content-length') ?? '?'} bytes)` : '');
}

// Every level must parse and validate through the real schema.
const { parseLevel } = await import('./src/game/levelSchema.ts');
let validated = 0;
for (const id of ['01-1','01-2','01-3','01-4','02-1','02-2','02-3','03-1','03-2','03-3','04-1','04-2']) {
  const r = await get(`/levels/${id}.json`);
  if (!r) continue;
  try { parseLevel(await r.json(), id); validated++; } catch (e) { problems.push(`${id}: ${e.message}`); }
}
console.log('levels validated over HTTP:', validated, '/ 12');

console.log(problems.length === 0 ? '\nSMOKE TEST PASS' : `\nSMOKE TEST FAIL:\n  ${problems.join('\n  ')}`);
process.exit(problems.length === 0 ? 0 : 1);
