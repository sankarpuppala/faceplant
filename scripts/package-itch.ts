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

/**
 * Entry names inside a zip, read with .NET through PowerShell. Reading the
 * archive back is the only way to catch the two faults that make an upload
 * silently useless - see the checks below.
 */
function listZipEntries(path: string): string[] {
  const out = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
        `$z = [IO.Compression.ZipFile]::OpenRead('${path}'); ` +
        '$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()',
    ],
    { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '');
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

/*
 * Built with `tar`, not PowerShell's `Compress-Archive`.
 *
 * Windows PowerShell 5.1 runs on .NET Framework, whose zip writer records
 * entry names with the *platform* separator - so every path in the archive
 * came out as `assets\app-xxxx.js`. The ZIP specification (APPNOTE 4.4.17.1)
 * requires forward slashes, and a conforming extractor therefore treats that
 * as a single file with backslashes in its name rather than a path. Uploaded
 * to itch.io it unpacks as a flat pile of oddly-named files, index.html finds
 * none of its assets, and the player gets a black page. It is silent: the zip
 * is valid, it is the right size, and nothing complains until it is live.
 *
 * bsdtar has shipped in Windows since 10/1803, writes spec-correct names, and
 * is a smaller ask than a dependency. `-C dist` with explicit children keeps
 * index.html at the zip root, which is what itch.io needs to find the entry
 * point.
 */
/*
 * The absolute path matters. On any machine with Git for Windows installed -
 * which is every machine this will ever run on - `tar.exe` on PATH resolves
 * to Git's GNU tar first, and GNU tar has no `-a` and cannot write zip at
 * all. It exits 128 with nothing on stderr.
 */
const bsdtar = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'tar.exe');
if (!existsSync(bsdtar)) {
  process.stdout.write(
    `\nNo bsdtar at ${bsdtar}.\nIt ships with Windows 10 1803 and later; this needs it to write the zip.\n\n`,
  );
  process.exit(1);
}

const entries = readdirSync(dist);
execFileSync(bsdtar, ['-a', '-c', '-f', zip, '-C', dist, ...entries], { stdio: 'inherit' });

if (!existsSync(zip)) {
  process.stdout.write(
    [
      '',
      'tar did not produce a zip.',
      '',
      'The usual cause is something still holding dist/ open - a `npm run',
      'preview` or `npm run check:ui` in another terminal. Stop it and try',
      'again. Any real error from tar is printed above.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/*
 * Read the archive back and prove it is the shape itch.io needs, because both
 * of the ways this can be wrong are invisible until the game is live: an
 * index.html one directory down just 404s, and backslash separators unpack as
 * a flat pile of strangely-named files. Neither makes the zip invalid.
 */
const names = listZipEntries(zip);
const problems: string[] = [];
if (!names.includes('index.html')) {
  problems.push('index.html is not at the root of the zip - itch.io will not find the entry point');
}
const backslashed = names.filter((n) => n.includes('\\'));
if (backslashed.length > 0) {
  problems.push(
    `${backslashed.length} entries use backslash separators, e.g. "${backslashed[0]}" ` +
      '- the ZIP spec requires forward slashes and itch.io will unpack these as flat files',
  );
}
if (!names.some((n) => n.startsWith('mediapipe/'))) {
  problems.push('no mediapipe/ directory - run `npm run setup` and rebuild, or the camera will never start');
}
if (problems.length > 0) {
  process.stdout.write('\nThe zip is not uploadable:\n' + problems.map((p) => `  - ${p}`).join('\n') + '\n\n');
  process.exit(1);
}

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
