/**
 * Copies the three OFL fonts out of node_modules into `public/fonts/`
 * (CLAUDE.md invariant 1: never the Google Fonts CDN).
 *
 * The @fontsource packages are the fonts themselves, published to npm under
 * their own OFL licences, so this is a local file copy with no network access
 * at all - at setup time or at play time.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'public', 'fonts');

interface FontSpec {
  pkg: string;
  /** File inside the package's `files` directory. */
  file: string;
  /** Name it gets in public/fonts, matching src/ui/tokens.css. */
  as: string;
}

const FONTS: FontSpec[] = [
  { pkg: '@fontsource/vt323', file: 'vt323-latin-400-normal.woff2', as: 'vt323-latin-400-normal.woff2' },
  { pkg: '@fontsource/im-fell-english-sc', file: 'im-fell-english-sc-latin-400-normal.woff2', as: 'im-fell-english-sc-latin-400-normal.woff2' },
  { pkg: '@fontsource/inter', file: 'inter-latin-400-normal.woff2', as: 'inter-latin-400-normal.woff2' },
  { pkg: '@fontsource/inter', file: 'inter-latin-600-normal.woff2', as: 'inter-latin-600-normal.woff2' },
];

mkdirSync(outDir, { recursive: true });

const licences: string[] = [];
let copied = 0;

for (const f of FONTS) {
  const pkgDir = join(root, 'node_modules', ...f.pkg.split('/'));
  const src = join(pkgDir, 'files', f.file);
  if (!existsSync(src)) {
    process.stdout.write(`MISSING ${src}\n  Run \`npm install\` first.\n`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(src, join(outDir, f.as));
  copied++;

  // Record the licence so the CREDITS test (AC-13) has something to check.
  const licencePath = join(pkgDir, 'LICENSE');
  if (existsSync(licencePath)) {
    const text = readFileSync(licencePath, 'utf8').split('\n')[0] ?? '';
    licences.push(`${f.pkg}: ${text.trim()}`);
  }
}

process.stdout.write(`Copied ${copied} font files to ${outDir}\n`);
for (const l of new Set(licences)) process.stdout.write(`  ${l}\n`);
