/**
 * Copies the MediaPipe wasm runtime out of node_modules and fetches the face
 * model into `public/mediapipe/` (CLAUDE.md invariant 1).
 *
 * This is the file that makes the privacy promise true. The game loads the
 * runtime and the model from its own origin, so at play time there is no CDN,
 * no third-party request and nothing for a network tab to show.
 *
 * The model itself is not on npm, so it is downloaded **once, at setup time**
 * from Google's own storage and then committed or cached locally. If the
 * download fails the script says exactly what to put where, because an offline
 * machine should still be able to finish the setup by hand.
 *
 * Windows (CLAUDE.md section 2): every path is built with path.join.
 */

import { createWriteStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'public', 'mediapipe');
const wasmOut = join(outDir, 'wasm');
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');

/** Official model location, from the MediaPipe Face Landmarker model card. */
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const MODEL_OUT = join(outDir, 'face_landmarker.task');
/** The published float16 bundle is about 3.7 MB; anything tiny is an error page. */
const MIN_MODEL_BYTES = 1_000_000;

/**
 * The package ships three builds of the wasm runtime, each about 13 MB:
 *
 *   vision_wasm_internal.*          SIMD, classic script  <- what we load
 *   vision_wasm_nosimd_internal.*   no SIMD, classic      <- the fallback
 *   vision_wasm_module_internal.*   SIMD, ES module       <- never requested
 *
 * `FilesetResolver.forVisionTasks(path)` is called without `useModule`, so the
 * ES-module build can never be fetched. Copying it would add 13 MB to every
 * deploy for nothing, so it is skipped - and the skip is a list of what we DO
 * need rather than a blocklist, so a renamed file fails loudly instead of
 * silently shipping again.
 */
const NEEDED_PREFIXES = ['vision_wasm_internal', 'vision_wasm_nosimd_internal'];

/**
 * Dropping the no-SIMD build halves the deploy, at the cost of the fallback
 * for browsers without WebAssembly SIMD. Every browser the game targets has
 * had it since 2021 (Chrome 91, Firefox 89, Safari 16.4), so this is a
 * reasonable trade for a size-constrained host - but it is a *choice*, not a
 * default, because without it a non-SIMD browser gets a 404 rather than a slow
 * frame rate. Set FACEPLANT_SIMD_ONLY=1 to take it.
 */
const SIMD_ONLY = process.env.FACEPLANT_SIMD_ONLY === '1';
const PREFIXES = SIMD_ONLY ? ['vision_wasm_internal'] : NEEDED_PREFIXES;

function copyWasm(): { copied: number; skipped: string[]; bytes: number } {
  if (!existsSync(wasmSrc)) {
    throw new Error(`Missing ${wasmSrc}. Run \`npm install\` first.`);
  }
  mkdirSync(wasmOut, { recursive: true });

  let copied = 0;
  let bytes = 0;
  const skipped: string[] = [];

  for (const name of readdirSync(wasmSrc)) {
    if (!PREFIXES.some((p) => name.startsWith(p))) {
      skipped.push(name);
      continue;
    }
    const dst = join(wasmOut, name);
    copyFileSync(join(wasmSrc, name), dst);
    bytes += statSync(dst).size;
    copied++;
  }

  if (copied === 0) {
    throw new Error(
      `No wasm files matched ${PREFIXES.join(', ')} in ${wasmSrc}. ` +
        'MediaPipe may have renamed them; check the package before deploying.',
    );
  }
  return { copied, skipped, bytes };
}

async function fetchModel(): Promise<'downloaded' | 'present' | 'failed'> {
  if (existsSync(MODEL_OUT) && statSync(MODEL_OUT).size >= MIN_MODEL_BYTES) return 'present';

  process.stdout.write(`Downloading the face model...\n  ${MODEL_URL}\n`);
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok || res.body === null) throw new Error(`HTTP ${res.status}`);
    mkdirSync(outDir, { recursive: true });
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(MODEL_OUT));

    const size = statSync(MODEL_OUT).size;
    if (size < MIN_MODEL_BYTES) {
      unlinkSync(MODEL_OUT);
      throw new Error(`the download was only ${size} bytes, which is not the model`);
    }
    return 'downloaded';
  } catch (err) {
    process.stdout.write(`  could not download: ${err instanceof Error ? err.message : String(err)}\n`);
    return 'failed';
  }
}

const wasm = copyWasm();
const model = await fetchModel();

process.stdout.write(`\nWrote ${wasm.copied} wasm files (${(wasm.bytes / 1_048_576).toFixed(1)} MB) to ${wasmOut}\n`);
if (wasm.skipped.length > 0) {
  process.stdout.write(`Skipped ${wasm.skipped.length} file(s) the game never requests:\n`);
  for (const n of wasm.skipped) process.stdout.write(`  ${n}\n`);
}

if (model === 'failed') {
  process.stdout.write(
    [
      '',
      'The face model is missing. The game still runs - Assist mode needs no',
      'camera and every level is completable without one - but webcam play will',
      'show a message until the model is in place.',
      '',
      'To finish by hand, download this file:',
      `  ${MODEL_URL}`,
      'and save it as:',
      `  ${MODEL_OUT}`,
      '',
      'Licence: Apache 2.0. Recorded in docs/CREDITS.md.',
      '',
    ].join('\n'),
  );
  process.exitCode = 1;
} else {
  const size = statSync(MODEL_OUT).size;
  process.stdout.write(`Model ${model}: ${MODEL_OUT} (${(size / 1_048_576).toFixed(2)} MB)\n`);
  process.stdout.write('\nDone. Nothing in the game will ever request these from a CDN.\n');
}
