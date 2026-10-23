/**
 * The UI gallery (dev only, never bundled into the game).
 *
 * Renders every DOM screen from `screens.ts` with representative data, so the
 * interface can be *looked at* instead of imagined. `?screen=<id>` shows one
 * on its own, which is what the screenshot tooling uses; with no query it
 * shows the lot, stacked, for scanning.
 *
 * This exists because the screens are only ever assembled at runtime, deep
 * inside a camera flow, and judging a layout you cannot see is guesswork. It
 * is also the only practical way to check every screen at phone width.
 */

import { ALL_LEVEL_IDS } from './game/levelLoader.ts';
import type { Level } from './game/levelSchema.ts';
import type { RunResult } from './game/rules.ts';
import { EMPTY_PROGRESS, type Progress } from './storage/progress.ts';
import { DEFAULT_SETTINGS, type Settings } from './storage/settings.ts';
import * as S from './ui/screens.ts';
import { installGrain } from './ui/grain.ts';

installGrain();

const noop = (): void => undefined;

const ids = [...ALL_LEVEL_IDS];

const progress: Progress = {
  ...structuredClone(EMPTY_PROGRESS),
  levels: Object.fromEntries(
    ids.slice(0, 6).map((id, i) => [
      id,
      { candles: ([3, 3, 2, 2, 1, 1] as const)[i] ?? 1, bestScore: 4820 - i * 410, bestSaved: 8 - i, attempts: i + 1 },
    ]),
  ),
  survivors: { millicent: 2, horace: 4 },
  endlessBest: { score: 9120, waves: 14, saved: 38 },
  daily: null,
};

const settings: Settings = { ...DEFAULT_SETTINGS, noticeSeen: true, howToPlaySeen: true };

const result: RunResult = {
  levelId: '02-3',
  label: 'TAPE 02 — 3',
  title: 'LANTERN LIGHT',
  mode: 'story',
  spawned: 9,
  saved: 6,
  lost: 3,
  candles: 2,
  stamp: 'THE MAW AWOKE',
  score: 4820,
  mawWokeCount: 3,
  offerings: 1,
  bestProcession: 4,
  composureLeft: 0.42,
  composureLow: 0.18,
  lossesByCause: { maw: 1, void: 0, drip: 0, dark: 0, crawler: 1, moth: 1 },
  outcomes: ['saved', 'saved', 'maw', 'saved', 'crawler', 'saved', 'moth', 'saved', 'saved'],
  elapsedMs: 72_400,
  wave: 0,
  failed: false,
};

const failedResult: RunResult = {
  ...result,
  saved: 3,
  lost: 6,
  candles: 0,
  score: 940,
  failed: true,
  stamp: 'TAPE LOST',
  lossesByCause: { maw: 2, void: 0, drip: 1, dark: 0, crawler: 2, moth: 1 },
  outcomes: ['maw', 'saved', 'crawler', 'maw', 'saved', 'drip', 'moth', 'saved', 'crawler'],
};

const level = {
  id: '02-3',
  label: 'TAPE 02 — 3',
  title: 'LANTERN LIGHT',
  mode: 'story',
  timeLimitS: 90,
  spawn: { count: 9 },
} as unknown as Level;

const titleActions: S.TitleActions = { insertFace: noop, playNoCamera: noop, settings: noop, leave: noop };
const shelfActions: S.ShelfActions = { playLevel: noop, playDaily: noop, playEndless: noop, back: noop };
const pauseActions: S.PauseActions = { resume: noop, restart: noop, settings: noop, mainMenu: noop };
const resultsActions: S.ResultsActions = { next: noop, retry: noop, shelf: noop, mainMenu: noop, saveClip: null };
const settingsActions: S.SettingsActions = { change: noop, resetProgress: noop, back: noop };

type Entry = [id: string, label: string, make: () => HTMLElement];

const SCREENS: Entry[] = [
  ['notice', 'First launch notice', () => S.noticeScreen(true, noop)],
  ['title', 'Title', () => S.titleScreen(titleActions, { canSave: true })],
  ['camera', 'Camera permission', () => S.cameraScreen(noop, noop, noop)],
  ['camera-error', 'Camera refused', () => S.cameraScreen(noop, noop, noop, 'There is no camera. Everything can be played without it.')],
  ['calibration', 'Calibration', () => {
    const v = S.calibrationScreen(noop, noop, noop);
    v.setProgress(0.4);
    return v.node;
  }],
  ['shelf', 'The shelf', () => S.shelfScreen(progress, shelfActions, 12)],
  ['insert', 'Tape insert', () => S.tapeInsert(level, { firstRun: false, assist: false })],
  ['insert-first', 'Tape insert (first tape)', () => S.tapeInsert(level, { firstRun: true, assist: true })],
  ['tracking', 'Tracking lost', () => {
    const h = S.hud(noop);
    h.setTracking(true);
    return h.node;
  }],
  ['rewind', 'Rewind', () => S.rewindOverlay()],
  ['pause', 'Pause', () => S.pauseScreen(pauseActions, { assist: true })],
  ['results', 'Results', () => S.resultsScreen(result, resultsActions, { practice: false, newBest: false, line: 'your mouth opened. they saw it.' })],
  [
    'results-failed',
    'Results (lost tape)',
    () => S.resultsScreen(failedResult, { ...resultsActions, next: null, saveClip: noop }, { practice: false, newBest: false, line: 'you let it in.' }),
  ],
  ['settings', 'Settings', () => S.settingsScreen(settings, settingsActions, { thermalUnlocked: false, canRecord: true })],
  ['ending', 'Ending', () => S.endingScreen(noop)],
  ['credits', 'Leave (credits)', () => S.creditsScreen(noop)],
];

const host = document.getElementById('host') as HTMLElement;
const params = new URLSearchParams(location.search);
const only = params.get('screen');

/**
 * `?measure=1` renders every screen in turn at the current window size and
 * reports anything sticking out past the right edge, as plain text for
 * `chrome --dump-dom` to read back.
 *
 * Horizontal overflow is the one layout fault that is invisible in a
 * screenshot of the left-hand side of a page and ruins a phone: the shop's
 * effect text ran off the edge of a 390px screen for a long time and nothing
 * caught it, because every check anyone ran was a desktop screenshot.
 */
if (params.get('measure') === '1') {
  const report: string[] = [];
  const viewport = document.documentElement.clientWidth;

  for (const [id, , make] of SCREENS) {
    host.textContent = '';
    document.body.classList.add('solo');
    const node = make();
    host.appendChild(node);

    const offenders: string[] = [];
    // The screen itself must not scroll sideways. This is the check that
    // matters: it is true if anything that is *not* clipped pokes out.
    if (node.scrollWidth > node.clientWidth + 1) {
      offenders.push(`screen scrolls sideways +${node.scrollWidth - node.clientWidth}px`);
    }

    for (const elem of node.querySelectorAll<HTMLElement>('*')) {
      // The backdrop is decoration inside its own overflow: hidden box - fog
      // banks wider than the screen and an SVG scene cropped by `slice` are
      // meant to run past the edges and be clipped. Reporting them flagged
      // every title and notice as overflowing when nothing could scroll.
      if (elem.closest('.backdrop') !== null) continue;
      const r = elem.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const over = Math.round(r.right - viewport);
      if (over > 1) {
        const tag = elem.tagName.toLowerCase();
        const cls = elem.className === '' ? '' : `.${String(elem.className).split(' ').join('.')}`;
        offenders.push(`${tag}${cls} +${over}px`);
      }
    }
    // Only the widest few, and only unique selectors - a single overflowing
    // row otherwise reports every descendant inside it.
    const unique = [...new Set(offenders)].slice(0, 6);
    report.push(`${id}: ${unique.length === 0 ? 'ok' : unique.join(' | ')}`);
    host.textContent = '';
  }

  const pre = document.createElement('pre');
  pre.id = 'measure-report';
  pre.textContent = `viewport ${viewport}px\n` + report.join('\n');
  document.body.classList.remove('solo');
  host.appendChild(pre);
} else if (only !== null) {
  document.body.classList.add('solo');
  const entry = SCREENS.find(([id]) => id === only);
  if (entry !== undefined) host.appendChild(entry[2]());
  else host.textContent = `no screen called "${only}"`;
} else {
  for (const [id, label, make] of SCREENS) {
    const section = document.createElement('section');
    section.className = 'gallery-item';
    const h = document.createElement('h2');
    h.textContent = `${label}  —  ?screen=${id}`;
    section.appendChild(h);
    const frame = document.createElement('div');
    frame.className = 'gallery-frame';
    frame.appendChild(make());
    section.appendChild(frame);
    host.appendChild(section);
  }
}
