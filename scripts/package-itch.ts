/**
 * Zips `dist/` for itch.io (`npm run package:itch`).
 *
 * Uses PowerShell's Compress-Archive rather than a dependency, because this is
 * a Windows-first project (CLAUDE.md section 2) and adding an archiver package
 * to ship a zip would be the wrong trade.
 *
 * ⚠ itch.io and the camera: a `getUserMedia` call inside itch's embed iframe
 * needs `allow="camera"` on that iframe, which the uploader does not let you
 * set. In practice the game must be launched with itch's "click to launch in
 * fullscreen" / new-window option, or played from the GitHub Pages URL. That is
 * risk R4 in PLAN.md and has to be confirmed on the real page - this script
 * prints the reminder so it cannot be forgotten at upload time.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dist = join(root, 'dist');
const outDir = join(root, 'dist-itch');
const zip = join(outDir, 'faceplant.zip');

if (!existsSync(dist)) {
  process.stdout.write('dist/ does not exist. Run `npm run build` first.\n');
  process.exit(1);
}
if (!existsSync(join(dist, 'index.html'))) {
  process.stdout.write('dist/index.html is missing; the build looks incomplete.\n');
  process.exit(1);
}

function totalBytes(dir: string): number {
  let n = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    n += s.isDirectory() ? totalBytes(p) : s.size;
  }
  return n;
}

mkdirSync(outDir, { recursive: true });
rmSync(zip, { force: true });

// `dist/*` rather than `dist` so index.html sits at the zip root, which is
// what itch.io requires to find the entry point.
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${join(dist, '*')}' -DestinationPath '${zip}' -CompressionLevel Optimal -Force`,
  ],
  { stdio: 'inherit' },
);

const raw = totalBytes(dist);
const zipped = statSync(zip).size;

process.stdout.write(
  [
    '',
    `dist/      ${(raw / 1_048_576).toFixed(2)} MB`,
    `zip        ${(zipped / 1_048_576).toFixed(2)} MB  ->  ${zip}`,
    '',
    'Before you upload:',
    '  1. Tick "This file will be played in the browser".',
    '  2. Set the viewport to 1280x720 and enable the fullscreen button.',
    '  3. Test the camera from the itch page itself. If the embed blocks it,',
    '     use the launch-in-new-window option or link to the GitHub Pages URL.',
    '     Record what happened in PLAN.md (risk R4, AC-12).',
    '',
  ].join('\n'),
);
