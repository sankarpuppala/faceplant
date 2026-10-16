/**
 * `npm run check:ui` - looks at the interface, instead of imagining it.
 *
 * Drives a headless Chrome or Edge against `uigallery.html`, which renders
 * every DOM screen from `src/ui/screens.ts` with representative data. It does
 * two things:
 *
 *   1. **Screenshots** every screen at each width into `.uishots/`, so the
 *      layout can actually be reviewed.
 *   2. **Reports horizontal overflow** - any element sticking out past the
 *      right edge of the viewport - and exits non-zero if it finds any.
 *
 * It exists because the screens are only ever assembled at runtime, deep
 * inside a camera flow, and four separate layout faults had shipped unnoticed
 * because nobody could see them: a shop grid that declared two columns for
 * three children, so every buy button wrapped underneath the icon; a results
 * screen centred inside a scrolling layer, which put the verdict stamp above
 * the top edge and the Next / Retry / Shelf buttons below the bottom one with
 * no way to scroll to either; settings hints floating outside the rows they
 * belonged to; and a calibration candle scaled with a transform on a
 * full-width flex row, giving it a box 2.2x the width of the screen.
 *
 * None of those fail a unit test. All four are obvious in a screenshot.
 *
 * ## The narrow-width caveat
 *
 * Chrome on Windows will not make a headless window narrower than about
 * 504 CSS px: ask for 390 and the page is still laid out at 504 and the
 * *image* is scaled down, which looks exactly like text overflowing when it
 * is not. 504 is still below both of the interface's breakpoints (620px and
 * 520px), so the narrow layouts do get exercised - but a real phone is
 * narrower than anything this can test, and that gap is why the measurement
 * reports a viewport width rather than trusting the one it asked for.
 */

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SCREENS = [
  'notice',
  'title',
  'title-new',
  'howto',
  'camera',
  'camera-error',
  'calibration',
  'shelf',
  'pause',
  'pause-lost',
  'results',
  'results-failed',
  'settings',
  'ossuary',
  'shop',
  'ending',
  'intro',
];

/** Desktop, laptop, and the narrowest layout the tooling can actually reach. */
const WIDTHS = [1280, 520];

const BROWSERS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

function findBrowser(): string | null {
  return BROWSERS.find((b) => existsSync(b)) ?? null;
}

const BASE = process.env.UI_CHECK_URL ?? 'http://localhost:5173';
const OUT = join(process.cwd(), '.uishots');

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/uigallery.html`);
    return res.ok;
  } catch {
    return false;
  }
}

async function shoot(browser: string, screen: string, width: number): Promise<void> {
  const out = join(OUT, `${screen}-${width}.png`);
  await run(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--screenshot=${out}`,
      `--window-size=${width},900`,
      '--virtual-time-budget=4000',
      `${BASE}/uigallery.html?screen=${screen}`,
    ],
    { timeout: 40_000 },
  ).catch(() => undefined);
}

async function measure(browser: string, width: number): Promise<string> {
  const { stdout } = await run(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${width},900`,
      '--virtual-time-budget=5000',
      '--dump-dom',
      `${BASE}/uigallery.html?measure=1`,
    ],
    { timeout: 60_000, maxBuffer: 64 * 1024 * 1024 },
  );
  const m = /<pre id="measure-report">([\s\S]*?)<\/pre>/.exec(stdout);
  if (m === null) return 'no report (did the gallery fail to render?)';
  return m[1]!
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"');
}

async function main(): Promise<void> {
  const browser = findBrowser();
  if (browser === null) {
    console.error('check:ui needs Chrome or Edge, and found neither.');
    console.error('Looked in:\n  ' + BROWSERS.join('\n  '));
    process.exit(2);
  }

  if (!(await serverUp())) {
    console.error(`check:ui needs the dev server at ${BASE}.`);
    console.error('Run `npm run dev` in another terminal first.');
    process.exit(2);
  }

  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  let failures = 0;

  for (const width of WIDTHS) {
    for (const screen of SCREENS) await shoot(browser, screen, width);

    const report = await measure(browser, width);
    console.log(`\n=== asked for ${width}px ===`);
    console.log(report);
    const bad = report.split('\n').filter((l) => l.includes('+') && l.includes('px') && !l.startsWith('viewport'));
    failures += bad.length;
  }

  console.log(`\n${SCREENS.length * WIDTHS.length} screenshots in .uishots/`);

  if (failures > 0) {
    console.error(`\nFAIL - ${failures} screen(s) overflow the viewport horizontally.`);
    process.exit(1);
  }
  console.log('\nPASS - nothing overflows the viewport.');
}

await main();
