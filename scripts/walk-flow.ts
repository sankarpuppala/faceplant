/**
 * `npm run check:flow` - walks the whole screen graph of the real game
 * (docs/OVERHAUL.md section 3) and fails if any screen cannot reach Main menu
 * in two inputs or fewer, or if Esc does nothing somewhere.
 *
 * Drives a headless Chrome or Edge against the dev server with real key
 * presses and real button clicks - the same inputs a player has. The camera
 * route uses the browser's built-in fake camera (a test pattern, no face).
 *
 * Usage:  npm run dev   (another terminal)
 *         npm run check:flow [-- http://localhost:5173]
 */

import { launch, sleep, type Cdp } from './browser.ts';

const url = process.argv[2] ?? 'http://localhost:5173';
const problems: string[] = [];
const rows: string[] = [];

async function phase(cdp: Cdp): Promise<string> {
  return cdp.eval<string>('window.faceplant.phase');
}

/** Clicks the visible button whose text matches, the way a player would. */
async function click(cdp: Cdp, label: string): Promise<boolean> {
  return cdp.eval<boolean>(`(() => {
    const want = ${JSON.stringify(label.toLowerCase())};
    const b = [...document.querySelectorAll('#ui-host button')].find(
      (n) => n.offsetParent !== null && !n.disabled && n.textContent.trim().toLowerCase().replace(/^\\u25b6\\s*/, '') === want,
    );
    if (b === undefined) return false;
    b.click();
    return true;
  })()`);
}

async function expectPhase(cdp: Cdp, want: string, how: string): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    if ((await phase(cdp)) === want) return true;
    await sleep(100);
  }
  problems.push(`${how}: expected ${want}, got ${await phase(cdp)}`);
  return false;
}

/** From the current screen, Main menu within `inputs` presses; records the route. */
async function toMainMenu(cdp: Cdp, from: string, route: (() => Promise<void>)[]): Promise<void> {
  for (const step of route) {
    await step();
    await sleep(250);
  }
  const ok = (await phase(cdp)) === 'title';
  rows.push(`${from.padEnd(22)} -> main menu in ${route.length} input${route.length === 1 ? '' : 's'}  ${ok ? 'ok' : 'FAIL'}`);
  if (!ok) problems.push(`${from}: did not reach Main menu (ended on ${await phase(cdp)})`);
  if (route.length > 2) problems.push(`${from}: Main menu took ${route.length} inputs`);
}

const browser = await launch();
const { cdp } = browser;
const esc = (): Promise<void> => cdp.key('Escape');
const press = (label: string) => async (): Promise<void> => {
  if (!(await click(cdp, label))) problems.push(`no "${label}" button on ${await phase(cdp)}`);
};

// Any uncaught error in the page fails the walk, wherever it happens.
cdp.on('Runtime.exceptionThrown', (p) => {
  const d = (p as { exceptionDetails?: { text?: string; exception?: { description?: string } } }).exceptionDetails;
  problems.push(`page error: ${d?.exception?.description ?? d?.text ?? 'unknown'}`);
});

try {
  await cdp.send('Page.navigate', { url });
  for (let i = 0; i < 80; i++) {
    if (await cdp.eval<boolean>('typeof window.faceplant === "object" && window.faceplant.phase !== "boot"')) break;
    await sleep(250);
  }

  // A brand-new player: the notice first. Esc is Continue there.
  await expectPhase(cdp, 'notice', 'first launch');
  await toMainMenu(cdp, 'notice', [esc]);

  // Title -> Settings -> back.
  await press('Settings')();
  await expectPhase(cdp, 'menu', 'title -> settings');
  await toMainMenu(cdp, 'settings', [esc]);

  // Title -> Leave (credits) -> back.
  await press('Leave')();
  await expectPhase(cdp, 'credits', 'title -> leave');
  await toMainMenu(cdp, 'credits', [esc]);

  // Title -> Insert face -> camera screen -> back.
  await press('Insert face')();
  await expectPhase(cdp, 'camera', 'title -> insert face');
  await toMainMenu(cdp, 'camera', [esc]);

  // Insert face -> Turn on camera -> calibration (fake camera, no face) -> back.
  await press('Insert face')();
  await expectPhase(cdp, 'camera', 'title -> insert face');
  await press('Turn on camera')();
  await expectPhase(cdp, 'calibrate', 'camera -> calibration');
  await toMainMenu(cdp, 'calibration', [esc]);

  // Without camera -> shelf -> back.
  await press('Play without camera')();
  await expectPhase(cdp, 'shelf', 'title -> without camera');
  await toMainMenu(cdp, 'shelf', [esc]);

  // Shelf -> Play -> the first tape insert waits for a key -> playing.
  await press('Play without camera')();
  await expectPhase(cdp, 'shelf', 'title -> without camera');
  await press('Play')();
  await expectPhase(cdp, 'inserting', 'shelf -> play');
  rows.push(`tape insert (first)     waits for a key: ${(await cdp.eval<boolean>('window.faceplant.insertUntilMs === Infinity')) ? 'ok' : 'FAIL'}`);
  await cdp.key('a', 'KeyA');
  await expectPhase(cdp, 'playing', 'insert -> any key');

  // Playing -> Esc -> pause -> Main menu.
  await esc();
  await expectPhase(cdp, 'paused', 'playing -> Esc');
  await toMainMenu(cdp, 'pause', [press('Main menu')]);

  // Pause -> Settings -> Esc returns to pause, not the title.
  await press('Play without camera')();
  await press('Play')();
  await expectPhase(cdp, 'inserting', 'shelf -> play (second time)');
  await esc();
  await expectPhase(cdp, 'paused', 'insert -> Esc');
  await press('Settings')();
  await expectPhase(cdp, 'menu', 'pause -> settings');
  await esc();
  await expectPhase(cdp, 'paused', 'settings (from pause) -> Esc');
  await esc();
  await expectPhase(cdp, 'playing', 'pause -> Esc resumes');

  // Playing -> Esc -> Restart: the rewind, then straight back into play.
  await esc();
  await press('Restart')();
  await expectPhase(cdp, 'rewinding', 'pause -> restart');
  await expectPhase(cdp, 'playing', 'rewind -> playing');

  // Results: end the run as the game would, then out.
  await cdp.eval('window.faceplant.finishRun()');
  await expectPhase(cdp, 'results', 'run over');
  await toMainMenu(cdp, 'results (Esc)', [esc]);
  await press('Play without camera')();
  await press('Play')();
  await cdp.key('a', 'KeyA');
  await sleep(2200);
  await cdp.eval('window.faceplant.finishRun()');
  await expectPhase(cdp, 'results', 'run over');
  await toMainMenu(cdp, 'results (button)', [press('Main menu')]);

  // Results -> Try again is the rewind, not a menu.
  await press('Play without camera')();
  await press('Play')();
  await sleep(2200);
  await cdp.eval('window.faceplant.finishRun()');
  await expectPhase(cdp, 'results', 'run over');
  const retry = (await click(cdp, 'Try again')) || (await click(cdp, 'Again'));
  if (!retry) problems.push('results: no Try again / Again button');
  await expectPhase(cdp, 'rewinding', 'results -> try again');
  await expectPhase(cdp, 'playing', 'rewind -> playing');
  await esc();
  await press('Main menu')();

  // Losing the tape: the Watcher sequence, which Esc skips to the results,
  // and which ends on the results by itself when left alone.
  await press('Play without camera')();
  await press('Play')();
  await sleep(2200);
  await cdp.eval('window.faceplant.startLoss(performance.now())');
  await expectPhase(cdp, 'losing', 'tape lost');
  await esc();
  await expectPhase(cdp, 'results', 'loss -> Esc');
  await toMainMenu(cdp, 'results (after a loss)', [press('Main menu')]);
  await press('Play without camera')();
  await press('Play')();
  await sleep(2200);
  await cdp.eval('window.faceplant.startLoss(performance.now())');
  await sleep(6500);
  await expectPhase(cdp, 'results', 'loss runs to the results by itself');
  await esc();

  // The ending card, after the last tape.
  await cdp.eval('window.faceplant.showEnding()');
  await expectPhase(cdp, 'ending', 'ending');
  await toMainMenu(cdp, 'ending', [esc]);

  console.log(rows.join('\n'));
  if (problems.length > 0) {
    console.error(`\nFAIL\n  ${problems.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nPASS - every screen reaches Main menu in two inputs or fewer, and Esc works on each.');
  }
} finally {
  await browser.close();
}
