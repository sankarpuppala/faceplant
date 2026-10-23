/**
 * Every DOM screen (SPEC section 12.5).
 *
 * Collected in one module rather than the eleven files SPEC section 19 lists:
 * each screen is a single function that returns a detached element, they share
 * all their helpers, and keeping them adjacent is what makes the voice
 * consistent. Recorded as a deviation in PLAN.md's progress log.
 *
 * Every screen is a labelled dialog, reachable by keyboard, with Escape wired
 * where an escape makes sense.
 */

import { config } from '../config.ts';
import { TAPES, isDailyUnlocked, isEndlessUnlocked, isLevelUnlocked, isTapeUnlocked, type Tape } from '../game/levelLoader.ts';
import type { Level } from '../game/levelSchema.ts';
import type { RunResult, Stamp } from '../game/rules.ts';
import { filterUnlocked } from '../game/rules.ts';
import { displayName } from '../game/names.ts';
import type { Progress } from '../storage/progress.ts';
import { SHOP_ITEMS, type ShopItemId } from '../game/shop.ts';
import type { FilterName, Settings } from '../storage/settings.ts';
import { shareText } from '../share/shareText.ts';
import { copy } from './copy.ts';
import { button, candleIcon, candleRow, el, field, screen, segmented, slider, toggle } from './dom.ts';
import { backdrop } from './backdrop.ts';
import { faceMapSvg } from './diagrams.ts';
import {
  iconCoin,
  iconForCause,
  iconForOutcome,
  iconComposure,
  iconCrawler,
  iconDrip,
  iconForShopItem,
  iconMawCard,
  iconMoth,
  iconOssuary,
  iconShelf,
  iconStepBridge,
  iconStepLose,
  iconStepWalk,
} from './icons.ts';

// ------------------------------------------------------------------- notice --

export function noticeScreen(onContinue: (scares: boolean) => void): HTMLElement {
  const node = screen(copy.notice.heading, [
    el('h2', { text: copy.notice.heading }),
    el('ul', { class: 'notice-list' }, copy.notice.items.map((t) => el('li', { text: t }))),
    el('div', { class: 'row' }, [
      button(copy.notice.continue, () => onContinue(true), 'btn primary'),
      button(copy.notice.continueNoScares, () => onContinue(false), 'btn'),
    ]),
  ]);
  // The first thing anyone ever sees. It was text on flat black.
  node.insertBefore(backdrop('notice'), node.firstChild);
  return node;
}

// -------------------------------------------------------------------- title --

export interface TitleActions {
  play: () => void;
  playNoCamera: () => void;
  shelf: () => void;
  settings: () => void;
  ossuary: () => void;
  shop: () => void;
  howToPlay: () => void;
}

export interface TitleState {
  hasCamera: boolean;
  reducedEffects: boolean;
  /** True once anything has been played - switches the primary button to CONTINUE. */
  returning: boolean;
  candles: number;
  coins: number;
  /** False in a private window or with site data blocked; the notice changes. */
  canSave: boolean;
}

/**
 * The title screen.
 *
 * The buttons were previously three rows of equal-weight pills, which read as
 * a crowded toolbar rather than a menu. They are now one unmistakable primary
 * action, a row of two things you might do *instead* of playing, and a small
 * tray of places to visit - so there is a clear first move for a new player
 * and a clear second move for a returning one.
 */
export function titleScreen(actions: TitleActions, state: TitleState): HTMLElement {
  const wordmark = el('h1', {
    class: state.reducedEffects ? 'wordmark' : 'wordmark jitter',
    text: copy.title.wordmark,
  });

  // U10 - play first, camera later. For a brand-new player the primary button
  // starts a level immediately in Assist, with the camera offered afterwards,
  // because nobody grants a webcam to a game they have not played.
  //
  // For a returning player that same button used to restart level 01-1, which
  // threw away their place in the story. Now it says CONTINUE and resumes the
  // first level they have not finished, with the shelf one click away.
  const primaryLabel = state.returning ? copy.title.continueLabel : copy.title.play;

  const secondary = el('div', { class: 'title-secondary' }, [
    state.returning ? button(copy.title.shelf, actions.shelf, 'btn') : null,
    button(copy.title.howToPlay, actions.howToPlay, 'btn'),
    state.returning ? button(copy.title.shop, actions.shop, 'btn') : null,
    state.returning ? null : button(copy.title.playNoCamera, actions.playNoCamera, 'btn'),
  ]);

  // Shop sits with the other real buttons rather than in the quiet tray. As a
  // dim underlined link labelled "The Pedlar" it was effectively invisible -
  // a player who asked for a shop could not find it.
  const tray = el('div', { class: 'title-tray' }, [
    button(copy.title.ossuary, actions.ossuary, 'btn quiet'),
    button(copy.title.settings, actions.settings, 'btn quiet'),
  ]);

  const node = screen('FACEPLANT', [
    el('div', { class: 'title-block' }, [
      wordmark,
      el('p', { class: 'tagline', text: copy.title.tagline }),
    ]),

    el('div', { class: 'title-actions' }, [
      button(primaryLabel, actions.play, 'btn primary big'),
      secondary,
    ]),

    state.returning
      ? el('div', { class: 'title-stats osd-text' }, [
          // Both of these are things the game draws everywhere else; the title
          // was the one place they were only words.
          el('span', { class: 'title-stat' }, [candleIcon(true), el('span', { text: copy.title.candles(state.candles) })]),
          el('span', { class: 'title-stat' }, [iconCoin(), el('span', { text: copy.shop.coinsHeld(state.coins) })]),
        ])
      : null,

    tray,

    el('div', { class: 'title-footer' }, [
      el('p', {
        class: 'small dim',
        style: state.canSave ? undefined : 'color:var(--rec)',
        text: state.canSave ? copy.title.saved : copy.title.notSaved,
      }),
      el('p', { class: 'small dim', text: copy.title.footer }),
    ]),
  ]);
  node.insertBefore(backdrop('title'), node.firstChild);
  node.classList.add('has-backdrop');
  return node;
}

// ---------------------------------------------------------------- how to play --

/**
 * The instructions screen.
 *
 * Rewritten after the first version was called congested and confusing: it was
 * a single column of six prose paragraphs with two diagrams buried in it, and
 * the most important sentence - what you are actually trying to do - was in
 * the middle of the third paragraph.
 *
 * This version is built so that reading *less* of it still works. One line at
 * the top is enough to play. Three numbered cards are enough to play well. The
 * diagram, the two systems and the controls table are there for anyone who
 * wants them, in that order, and nothing is a wall of text.
 */
export function howToPlayScreen(onClose: () => void): HTMLElement {
  // Each step leads with a drawing. "Your eyebrow is a ledge" is a strange
  // sentence to read and an obvious thing to look at.
  const stepArt = [iconStepWalk, iconStepBridge, iconStepLose];
  const steps = el('div', { class: 'step-grid' });
  for (const [i, st] of copy.howTo.steps.entries()) {
    const art = stepArt[i] ?? iconStepWalk;
    steps.appendChild(
      el('div', { class: 'step-card' }, [
        el('div', { class: 'step-art' }, [art()]),
        el('div', {}, [
          el('div', { class: 'step-title' }, [el('span', { class: 'step-n', text: st.n }), st.title]),
          el('div', { class: 'step-body', text: st.body }),
        ]),
      ]),
    );
  }

  const controls = el('div', { class: 'key-grid' });
  for (const [key, what] of copy.howTo.controls) {
    controls.appendChild(el('kbd', { class: 'key', text: key }));
    controls.appendChild(el('span', { class: 'key-what', text: what }));
  }

  const elsewhere = el('div', { class: 'card-row' });
  for (const [title, body, art] of [
    [copy.howTo.tapesTitle, copy.howTo.tapesExplain, iconShelf],
    [copy.howTo.shopTitle, copy.howTo.shopExplain, iconCoin],
    [copy.howTo.ossuaryTitle, copy.howTo.ossuaryExplain, iconOssuary],
  ] as const) {
    elsewhere.appendChild(
      el('div', { class: 'mini-card' }, [
        el('div', { class: 'mini-card-art' }, [art()]),
        el('div', { class: 'mini-card-title', text: title }),
        el('p', { class: 'small dim', text: body }),
      ]),
    );
  }

  return screen(copy.howTo.heading, [
    el('h2', { text: copy.howTo.heading }),
    el('p', { class: 'lede', text: copy.howTo.inOneLine }),

    steps,

    el('h3', { text: copy.howTo.faceMapTitle }),
    el('div', { class: 'diagram-wrap' }, [faceMapSvg()]),
    el('p', { class: 'small dim centered', text: copy.howTo.mapLegend }),

    el('h3', { text: copy.howTo.twoRulesTitle }),
    el('div', { class: 'card-row' }, [
      el('div', { class: 'mini-card danger' }, [
        el('div', { class: 'mini-card-art' }, [iconMawCard()]),
        el('div', { class: 'mini-card-title', text: copy.howTo.mawTitle }),
        el('p', { class: 'small dim', text: copy.howTo.maw }),
      ]),
      el('div', { class: 'mini-card' }, [
        el('div', { class: 'mini-card-art' }, [iconComposure()]),
        el('div', { class: 'mini-card-title', text: copy.howTo.composureTitle }),
        el('p', { class: 'small dim', text: copy.howTo.composure }),
      ]),
    ]),

    // What the moving things are. A player previously had to infer a Moth from
    // a Wick's line of dialogue; now it is simply shown.
    el('h3', { text: copy.howTo.hazardsTitle }),
    el('div', { class: 'legend' }, [
      el('div', { class: 'legend-item' }, [iconCrawler(), el('span', { text: copy.howTo.hazardCrawler })]),
      el('div', { class: 'legend-item' }, [iconMoth(), el('span', { text: copy.howTo.hazardMoth })]),
      el('div', { class: 'legend-item' }, [iconDrip(), el('span', { text: copy.howTo.hazardDrip })]),
    ]),

    el('h3', { text: copy.howTo.elsewhereTitle }),
    elsewhere,

    el('h3', { text: copy.howTo.controlsTitle }),
    controls,

    el('p', { class: 'small dim centered', text: copy.howTo.again }),
    el('div', { class: 'row' }, [button(copy.howTo.close, onClose, 'btn primary')]),
  ]);
}


// ---------------------------------------------------------- camera explainer --

export function cameraScreen(onAllow: () => void, onSkip: () => void, error?: string): HTMLElement {
  return screen(copy.camera.heading, [
    el('h2', { text: copy.camera.heading }),
    el('p', { class: 'small', text: copy.camera.body }),
    error === undefined ? null : el('p', { class: 'small', style: 'color:var(--rec)', text: error }),
    el('div', { class: 'row' }, [
      button(copy.camera.allow, onAllow, 'btn primary'),
      button(copy.camera.skip, onSkip, 'btn'),
    ]),
    el('p', { class: 'small dim', text: copy.title.footer }),
  ]);
}

// -------------------------------------------------------------- calibration --

export interface CalibrationView {
  node: HTMLElement;
  setPrompt: (text: string) => void;
  setProgress: (fraction01: number) => void;
  setError: (text: string | null) => void;
}

export function calibrationScreen(onSkip: () => void, onRetry: () => void): CalibrationView {
  const prompt = el('p', { class: 'osd-text', text: copy.calibration.sit });
  const error = el('p', { class: 'small', style: 'color:var(--rec);min-height:1.5em' });
  const bar = el('i');
  const wrap = el('div', { class: 'composure' }, [bar]);
  const retry = button(copy.calibration.again, onRetry, 'btn');
  retry.style.display = 'none';

  const node = screen(copy.calibration.heading, [
    // A single candle as the focus point (SPEC section 12.5). Sized, not
    // scaled: `.candlerow` is a full-width flex row, so `transform: scale()`
    // on it produced a box 2.2x the width of the screen and a horizontal
    // scrollbar on anything narrow.
    el('div', { class: 'candle-focus' }, [candleIcon(true)]),
    el('h2', { text: copy.calibration.heading }),
    prompt,
    wrap,
    error,
    el('div', { class: 'row' }, [retry, button(copy.calibration.skip, onSkip, 'btn quiet')]),
  ]);

  return {
    node,
    setPrompt: (t) => {
      prompt.textContent = t;
    },
    setProgress: (f) => {
      bar.style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`;
    },
    setError: (t) => {
      error.textContent = t ?? '';
      retry.style.display = t === null ? 'none' : '';
    },
  };
}

// ------------------------------------------------------------------- shelf --

export interface ShelfActions {
  playLevel: (id: string) => void;
  playDaily: () => void;
  playEndless: () => void;
  shop: () => void;
  back: () => void;
}

export function shelfScreen(progress: Progress, actions: ShelfActions, dayNumber: number): HTMLElement {
  const completed = new Set(Object.keys(progress.levels).filter((id) => (progress.levels[id]?.candles ?? 0) > 0));
  const levelHost = el('div', { class: 'levelgrid' });
  const blurb = el('p', { class: 'small dim' });

  let selected: Tape | 'daily' | 'endless' = TAPES[0] ?? 'daily';

  const rack = el('div', { class: 'rack' });

  const renderLevels = (): void => {
    levelHost.replaceChildren();

    if (selected === 'daily') {
      const done = progress.daily !== null && progress.daily.day === dayNumber;
      blurb.textContent = done ? copy.shelf.dailyDone : 'One tape a day. The same tape for everyone.';
      levelHost.appendChild(
        makeCard(`DAILY #${String(dayNumber).padStart(3, '0')}`, 'today', done ? 3 : 0, false, actions.playDaily, done ? `best ${progress.daily?.result.saved ?? 0} saved` : undefined),
      );
      return;
    }

    if (selected === 'endless') {
      blurb.textContent = copy.shelf.endlessBlurb;
      const best = progress.endlessBest;
      levelHost.appendChild(
        makeCard('THE LONG TAPE', 'no end', 0, false, actions.playEndless, best.score > 0 ? `best ${best.score.toLocaleString('en-US')} · wave ${best.waves}` : undefined),
      );
      return;
    }

    const tape = selected;
    blurb.textContent = tape.teaches;
    for (const [i, id] of tape.levelIds.entries()) {
      const unlocked = isLevelUnlocked(id, completed) && isTapeUnlocked(tape.number, completed);
      const p = progress.levels[id];
      levelHost.appendChild(
        makeCard(
          `T${String(tape.number).padStart(2, '0')}/${i + 1}`,
          id,
          p?.candles ?? 0,
          !unlocked,
          () => actions.playLevel(id),
          p !== undefined && p.bestScore > 0 ? `best ${p.bestScore.toLocaleString('en-US')}` : undefined,
        ),
      );
    }
  };

  const spines: { node: HTMLElement; key: Tape | 'daily' | 'endless' }[] = [];

  const select = (key: Tape | 'daily' | 'endless'): void => {
    selected = key;
    for (const s of spines) s.node.classList.toggle('current', s.key === key);
    renderLevels();
  };

  for (const tape of TAPES) {
    const unlocked = isTapeUnlocked(tape.number, completed);
    const earned = tape.levelIds.reduce((n, id) => n + (progress.levels[id]?.candles ?? 0), 0);
    const spine = makeSpine(String(tape.number).padStart(2, '0'), tape.name, earned, tape.levelIds.length * 3, !unlocked, '');
    if (unlocked) spine.addEventListener('click', () => select(tape));
    rack.appendChild(spine);
    spines.push({ node: spine, key: tape });
  }

  if (isDailyUnlocked(completed)) {
    const spine = makeSpine('', copy.shelf.daily, 0, 0, false, 'daily');
    spine.addEventListener('click', () => select('daily'));
    rack.appendChild(spine);
    spines.push({ node: spine, key: 'daily' });
  }
  if (isEndlessUnlocked(completed)) {
    const spine = makeSpine('', copy.shelf.endless, 0, 0, false, 'endless');
    spine.addEventListener('click', () => select('endless'));
    rack.appendChild(spine);
    spines.push({ node: spine, key: 'endless' });
  }

  const node = screen(copy.shelf.heading, [
    el('h2', { text: copy.shelf.heading }),
    // Coins live here too, so the shop's currency is visible where you choose
    // what to play rather than only on the title screen.
    el('div', { class: 'coin-banner' }, [iconCoin(), el('span', { text: copy.shop.coinsHeld(progress.coins) })]),
    rack,
    blurb,
    levelHost,
    el('div', { class: 'row' }, [
      // The shelf is where you are between runs with coins in hand, so the
      // shop belongs here too, not only on the title screen.
      button(copy.title.shop, actions.shop, 'btn'),
      button(copy.shelf.back, actions.back, 'btn quiet'),
    ]),
  ]);

  select(selected);
  return node;
}

function makeSpine(num: string, name: string, earned: number, total: number, locked: boolean, extraClass: string): HTMLElement {
  const sticker = el('div', { class: 'sticker' }, [
    num === '' ? null : el('small', { text: num }),
    name,
  ]);

  const candles = el('div', { class: 'candles' });
  if (total > 0) {
    // Three icons standing for the tape as a whole, filled proportionally -
    // a spine is too narrow for one icon per level.
    const lit = total === 0 ? 0 : Math.round((earned / total) * 3);
    for (let i = 0; i < 3; i++) candles.appendChild(candleIcon(i < lit));
  }

  const cls = ['spine', extraClass, locked ? 'locked' : ''].filter((c) => c !== '').join(' ');
  return el('button', { class: cls, type: 'button', disabled: locked, 'aria-label': `${name}${locked ? ` (${copy.shelf.locked})` : ''}` }, [sticker, candles]);
}

function makeCard(label: string, sub: string, candles: number, locked: boolean, onPick: () => void, best?: string): HTMLElement {
  const card = el('button', { class: 'levelcard', type: 'button', disabled: locked }, [
    el('span', { class: 'idx', text: label }),
    el('span', { text: locked ? copy.shelf.locked : sub }),
    best === undefined ? null : el('span', { class: 'small dim', text: best }),
    candleRow(candles),
  ]);
  if (!locked) card.addEventListener('click', onPick);
  return card;
}

// -------------------------------------------------------------------- pause --

export interface PauseActions {
  resume: () => void;
  restart: () => void;
  settings: () => void;
  shelf: () => void;
  exit: () => void;
  howToPlay: () => void;
  switchAssist?: () => void;
}

export function pauseScreen(actions: PauseActions, lostTracking: boolean): HTMLElement {
  return screen(copy.pause.heading, [
    el('div', { class: 'tear' }),
    el('h2', { class: 'osd-text', text: copy.pause.heading }),
    lostTracking ? el('p', { class: 'small dim', text: copy.pause.lostTracking }) : null,
    el('div', { class: 'row' }, [
      button(copy.pause.resume, actions.resume, 'btn primary'),
      lostTracking && actions.switchAssist !== undefined
        ? button(copy.pause.switchAssist, actions.switchAssist, 'btn')
        : null,
      button(copy.pause.restart, actions.restart, 'btn'),
      button(copy.title.howToPlay, actions.howToPlay, 'btn'),
      button(copy.pause.settings, actions.settings, 'btn'),
    ]),
    el('div', { class: 'row' }, [
      button(copy.pause.shelf, actions.shelf, 'btn'),
      button(copy.pause.exit, actions.exit, 'btn'),
    ]),
    el('p', { class: 'small dim', text: copy.pause.exitHint }),
    el('p', { class: 'small dim', text: copy.hud.assistHint }),
  ], 'transparent');
}

// ------------------------------------------------------------------ results --

export interface ResultsActions {
  next: (() => void) | null;
  retry: () => void;
  shelf: () => void;
  shop: () => void;
  copyResult: () => void;
  saveCard: () => void;
  saveClip: (() => void) | null;
}

const STAMP_CLASS: Record<Stamp, string> = {
  'TAPE LOST': 'lost',
  'KEPT STILL': '',
  'THE MAW AWOKE': '',
  'LIGHTS OUT': 'out',
  COMPOSED: 'kept',
  CRACKED: '',
};

export function resultsScreen(
  result: RunResult,
  actions: ResultsActions,
  opts: { practice: boolean; newBest: boolean; recordingOn: boolean },
): HTMLElement {
  const stats = el('div', { class: 'stats' }, [
    el('div', {}, [el('span', { class: 'k', text: 'saved ' }), `${result.saved}/${result.spawned}`]),
    el('div', {}, [el('span', { class: 'k', text: 'the maw woke ' }), `${result.mawWokeCount}×`]),
    el('div', {}, [el('span', { class: 'k', text: 'composure left ' }), `${Math.round(result.composureLeft * 100)}%`]),
    result.offerings > 0
      ? el('div', {}, [el('span', { class: 'k', text: 'offerings ' }), String(result.offerings)])
      : null,
    result.bestProcession > 1
      ? el('div', {}, [el('span', { class: 'k', text: 'best procession ' }), `×${result.bestProcession}`])
      : null,
    result.mode === 'endless'
      ? el('div', {}, [el('span', { class: 'k', text: 'wave ' }), String(result.wave)])
      : null,
  ]);

  const blurb = copy.stampBlurb[result.stamp];

  // Every Wick's fate, in spawn order, as pictures. The same information the
  // share text carries as emoji - it just was not on screen anywhere.
  const strip = el('div', { class: 'outcome-strip' });
  for (const o of result.outcomes) {
    strip.appendChild(el('span', { class: `outcome outcome-${o}` }, [iconForOutcome(o)]));
  }

  // What the shop items did, if they did anything. Nothing is shown when
  // nothing happened, so this never becomes decoration you learn to skip.
  const riteLines = (Object.entries(result.riteSaves) as [keyof typeof result.riteSaves, number][]).filter(
    ([, n]) => n > 0,
  );
  const rites =
    riteLines.length === 0
      ? null
      : el(
          'div',
          { class: 'rite-saves' },
          [el('div', { class: 'rite-saves-title', text: copy.results.ritesTitle }) as Node].concat(
            riteLines.map(([id, n]) =>
              el('div', { class: 'rite-save' }, [
                el('span', { class: 'rite-save-icon' }, [iconForShopItem(id)]),
                el('span', { text: copy.results.riteSaves[id](n) }),
              ]),
            ),
          ),
        );

  /*
   * Composed in three bands rather than stacked as eleven loose blocks.
   *
   * Stacked, this screen ran to roughly 1,400px: on a laptop the verdict stamp
   * was cut off the top of the viewport and Next / Retry / Shelf sat far below
   * the fold with nothing to suggest they existed. The verdict reads first,
   * the detail sits in two columns beside itself where there is room for two,
   * and the actions are stuck to the bottom of the viewport so they can be
   * reached from any scroll position on any screen.
   */
  return screen(
    'Results',
    [
      el('div', { class: 'tear' }),

      el('div', { class: 'result-verdict' }, [
        el('div', { class: `stamp ${STAMP_CLASS[result.stamp]}`, text: result.stamp }),
        el('p', { class: 'small dim', text: blurb }),
        result.failed ? el('p', { class: 'small', style: 'color:var(--rec)', text: copy.results.failed }) : null,
        candleRow(result.candles),
        el('div', { class: 'result-numbers' }, [
          el('div', { class: 'bigscore', text: result.score.toLocaleString('en-US') }),
          // A failed tape pays nothing and says so, because an unexplained
          // zero reads as a bug.
          result.coins > 0
            ? el('div', { class: 'coin-banner earned' }, [
                iconCoin(),
                el('span', { text: copy.results.coins(result.coins) }),
              ])
            : result.failed
              ? el('p', { class: 'small dim', text: copy.results.noCoins })
              : null,
        ]),
        opts.newBest ? el('p', { class: 'tagline', text: copy.results.newBest }) : null,
      ]),

      el('div', { class: 'result-detail' }, [
        el('div', { class: 'result-col' }, [
          el('h3', { text: copy.results.rosterTitle }),
          strip,
          stats,
          opts.practice ? el('p', { class: 'small dim', text: copy.results.practice }) : null,
        ]),
        el('div', { class: 'result-col' }, [
          rites,
          el('h3', { text: copy.results.shareTitle }),
          el('pre', { class: 'sharetext', text: shareText(result) }),
          el('div', { class: 'row start' }, [
            button(copy.results.copy, actions.copyResult, 'btn quiet'),
            button(copy.results.card, actions.saveCard, 'btn quiet'),
            actions.saveClip === null ? null : button(copy.results.clip, actions.saveClip, 'btn quiet'),
          ]),
          // U8 - say what the clip actually is, since "save clip" could mean
          // the whole attempt and this one is the six seconds that matter.
          el('p', { class: 'small dim', text: opts.recordingOn ? copy.results.clipHint : copy.results.clipOff }),
        ]),
      ]),

      el('div', { class: 'result-actions' }, [
        el('div', { class: 'row' }, [
          // A lost tape offers no way forward: the only ways out are to try
          // again or leave. `next` is null in that case, set by the caller.
          actions.next === null ? null : button(copy.results.next, actions.next, 'btn primary'),
          button(
            result.failed ? copy.results.retryFailed : copy.results.retry,
            actions.retry,
            result.failed ? 'btn primary' : 'btn',
          ),
          button(copy.results.shelf, actions.shelf, 'btn'),
          // Straight after a payout is the moment someone most wants to spend.
          result.coins > 0 ? button(copy.title.shop, actions.shop, 'btn') : null,
        ]),
      ]),
    ],
    'transparent',
  );
}

/** The clip preview dialog. Nothing is kept once this closes (invariant 3). */
export function clipPreviewScreen(url: string, onSave: () => void, onDiscard: () => void): HTMLElement {
  const video = el('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true });
  return screen('Clip preview', [
    el('h2', { text: copy.results.clip }),
    el('p', { class: 'small dim', text: copy.results.clipHint }),
    el('div', { class: 'clip-preview' }, [video]),
    el('div', { class: 'row' }, [
      button(copy.results.save, onSave, 'btn primary'),
      button(copy.results.discard, onDiscard, 'btn'),
    ]),
  ]);
}

// ----------------------------------------------------------------- settings --

export interface SettingsActions {
  change: (next: Partial<Settings>) => void;
  recalibrate: () => void;
  resetProgress: () => void;
  exportSave: () => void;
  importSave: () => void;
  close: () => void;
}

/** What the browser is actually promising about the save, in plain words. */
export type DurabilityLabel = 'persistent' | 'best-effort' | 'unavailable';

export function settingsScreen(
  settings: Settings,
  actions: SettingsActions,
  totalCandles: number,
  canRecord: boolean,
  durability: DurabilityLabel = 'best-effort',
): HTMLElement {
  const thermalOk = filterUnlocked('thermal', totalCandles);

  const filterSeg = segmented<FilterName>(
    [
      { value: 'vhs', label: 'VHS' },
      { value: 'ink', label: 'INK' },
      { value: 'thermal', label: 'THERMAL', disabled: !thermalOk },
    ],
    settings.filter,
    (filter) => actions.change({ filter }),
  );

  const effectsSeg = segmented(
    [
      { value: 'full' as const, label: 'Full' },
      { value: 'reduced' as const, label: 'Reduced' },
    ],
    settings.reducedEffects ? 'reduced' : 'full',
    (v) => actions.change({ reducedEffects: v === 'reduced' }),
  );

  const controlsSeg = segmented(
    [
      { value: 'face' as const, label: 'Face' },
      { value: 'assist' as const, label: 'Assist' },
    ],
    settings.controls,
    (controls) => actions.change({ controls }),
  );

  return screen(copy.settings.heading, [
    el('h2', { text: copy.settings.heading }),
    el('div', { class: 'col' }, [
      toggle(copy.settings.scares, settings.scares, (scares) => actions.change({ scares }), copy.settings.scaresHint)
        .node,
      field(copy.settings.effects, effectsSeg.node, copy.settings.effectsHint),
      field(copy.settings.filter, filterSeg.node, thermalOk ? undefined : copy.settings.thermalLocked),
      toggle(
        copy.settings.hideFace,
        settings.hideMyFace,
        (hideMyFace) => actions.change({ hideMyFace }),
        copy.settings.hideFaceHint,
      ).node,
      field(copy.settings.controls, controlsSeg.node),
      field(copy.settings.recalibrate, button(copy.settings.recalibrate, actions.recalibrate, 'btn')),
      canRecord
        ? toggle(
            copy.settings.recording,
            settings.recording,
            (recording) => actions.change({ recording }),
            copy.settings.recordingHint,
          ).node
        : field(
            copy.settings.recording,
            el('span', { class: 'small dim', text: 'Not supported in this browser' }),
            copy.settings.recordingHint,
          ),
      toggle(
        copy.settings.lowPower,
        settings.lowPower,
        (lowPower) => actions.change({ lowPower }),
        copy.settings.lowPowerHint,
      ).node,
      slider(copy.settings.volume, settings.volume, (volume) => actions.change({ volume })),
    ]),

    // "Will my progress still be there in a month?" deserves a real answer
    // rather than a reassuring sentence, so the actual storage guarantee is
    // stated here - including the Safari caveat that no API can fix - and an
    // export gives the player a copy that outlives any eviction policy.
    el('h3', { text: copy.settings.saveTitle }),
    el('p', {
      class: 'small dim',
      style: durability === 'unavailable' ? 'color:var(--rec)' : undefined,
      text:
        durability === 'persistent'
          ? copy.settings.durabilityPersistent
          : durability === 'unavailable'
            ? copy.settings.durabilityUnavailable
            : copy.settings.durabilityBestEffort,
    }),
    el('div', { class: 'row' }, [
      button(copy.settings.exportSave, actions.exportSave, 'btn'),
      button(copy.settings.importSave, actions.importSave, 'btn'),
    ]),
    el('p', { class: 'small dim', text: copy.settings.exportHint }),

    // The save lives in one localStorage key on this device and nowhere else,
    // so "start over" and "delete what you hold about me" are the same button.
    el('h3', { text: copy.settings.resetProgress }),
    el('p', { class: 'small dim', text: copy.settings.resetHint }),
    el('div', { class: 'row' }, [resetControl(actions.resetProgress)]),

    el('div', { class: 'row' }, [button(copy.settings.close, actions.close, 'btn primary')]),
  ]);
}

/**
 * Reset is two taps, not one, and the confirmation is inline rather than a
 * second dialog - it is destructive and irreversible, but it is also not worth
 * a whole screen.
 */
function resetControl(onConfirm: () => void): HTMLElement {
  const host = el('div', { class: 'row' });

  const render = (confirming: boolean): void => {
    host.replaceChildren();
    if (!confirming) {
      host.appendChild(button(copy.settings.resetProgress, () => render(true), 'btn'));
      return;
    }
    host.appendChild(el('span', { class: 'small', style: 'color:var(--rec)', text: copy.settings.resetConfirm }));
    host.appendChild(
      button(copy.settings.resetConfirmYes, () => {
        onConfirm();
        render(false);
      }, 'btn'),
    );
    host.appendChild(button(copy.settings.resetConfirmNo, () => render(false), 'btn quiet'));
  };

  render(false);
  return host;
}

// ------------------------------------------------------------------ ossuary --

/** U7 - the memorial. A growing list of named dead candles, with last words. */
export function ossuaryScreen(progress: Progress, onBack: () => void): HTMLElement {
  const list = el('div', { class: 'ossuary' });
  const bones = [...progress.ossuary].reverse();

  if (bones.length === 0) {
    list.appendChild(el('p', { class: 'small dim', text: copy.ossuary.empty }));
  } else {
    for (const b of bones) {
      list.appendChild(
        el('div', { class: `bone-row ${b.cause === 'maw' ? 'maw' : ''}` }, [
          el('div', { class: 'bone-icon' }, [iconForCause(b.cause)]),
          el('div', {}, [
            el('div', { text: displayName(b.name, b.title) }),
            b.lastWords === null ? null : el('div', { class: 'last', text: `“${b.lastWords}”` }),
          ]),
          el('div', { class: 'cause', text: copy.ossuary.causes[b.cause] }),
        ]),
      );
    }
  }

  const survivors = Object.entries(progress.survivors).filter(([, n]) => n > 1);

  return screen(copy.ossuary.heading, [
    el('h2', { text: copy.ossuary.heading }),
    el('p', { class: 'small dim', text: copy.ossuary.blurb }),
    list,
    survivors.length === 0
      ? null
      : el('div', {}, [
          el('h3', { text: 'Veterans' }),
          el('p', { class: 'small dim', text: survivors.map(([n, runs]) => `${n} (${runs} runs)`).join(' · ') }),
        ]),
    el('div', { class: 'row' }, [button(copy.ossuary.back, onBack, 'btn primary')]),
  ]);
}

// --------------------------------------------------------------------- shop --

/**
 * THE PEDLAR - the coin shop, replacing the old candle-spending Rites screen.
 *
 * Each row states its exact mechanical effect in numbers, because the previous
 * screen described its effects only in the Wicks' voice ("they will risk
 * slightly longer steps") and nobody could tell what they had bought.
 */
export function shopScreen(
  progress: Progress,
  onBuy: (item: ShopItemId) => void,
  onBack: () => void,
): HTMLElement {
  const rows = el('div', { class: 'col' });

  for (const item of SHOP_ITEMS) {
    const owned = progress.rites.includes(item.id);
    const affordable = progress.coins >= item.costCoins;

    const action = owned
      ? el('span', { class: 'owned-tag', text: copy.shop.owned })
      : (() => {
          const b = button(`${copy.shop.buy} · ${copy.shop.cost(item.costCoins)}`, () => onBuy(item.id), 'btn');
          b.disabled = !affordable;
          if (!affordable) b.title = copy.shop.cantAfford;
          return b;
        })();

    rows.appendChild(
      el('div', { class: `shop-row ${owned ? 'owned' : ''}` }, [
        el('div', { class: 'shop-icon' }, [iconForShopItem(item.id)]),
        el('div', { class: 'shop-text' }, [
          el('div', { class: 'shop-name', text: item.name }),
          el('div', { class: 'shop-blurb', text: item.blurb }),
          el('div', { class: 'shop-effect', text: item.effect }),
        ]),
        action,
      ]),
    );
  }

  return screen(copy.shop.heading, [
    el('h2', { text: copy.shop.heading }),
    el('div', { class: 'coin-banner' }, [iconCoin(), el('span', { text: copy.shop.coinsHeld(progress.coins) })]),
    el('p', { class: 'small dim centered', text: copy.shop.blurb }),
    progress.coinsEarned === 0 ? el('p', { class: 'small dim centered', text: copy.shop.empty }) : null,
    rows,
    el('div', { class: 'row' }, [button(copy.shop.back, onBack, 'btn primary')]),
  ]);
}


// ------------------------------------------------------------------- ending --

export function endingScreen(onBack: () => void): HTMLElement {
  return screen('Ending', [
    el('p', { class: 'tagline', style: 'font-size:clamp(20px,4vw,38px)', text: copy.ending.line }),
    el('p', { class: 'small dim', text: copy.ending.credits }),
    el('div', { class: 'row' }, [button(copy.ending.again, onBack, 'btn quiet')]),
  ]);
}

// ---------------------------------------------------------------------- HUD --

/**
 * U1 - the COMPOSURE bar. The only piece of in-game DOM, because it has to be
 * perfectly crisp: it is the thing a viewer reads first in a muted clip, and
 * the thing that tells the player how close they are to losing.
 */
export interface HudView {
  node: HTMLElement;
  update: (fraction: number, mood: 'steady' | 'cracking' | 'panic') => void;
  /**
   * How many more may be lost before the tape is. Null in endless mode. Shown
   * so that failing never arrives without warning - a fail condition the
   * player cannot see coming is just an ambush.
   */
  setLossBudget: (remaining: number | null) => void;
  setHint: (text: string | null) => void;
}

export function hud(): HudView {
  const fill = el('i');
  const bar = el('div', { class: 'composure' }, [fill]);
  const budget = el('div', { class: 'loss-budget', style: 'display:none' });
  const hint = el('div', { class: 'toast', style: 'display:none' });
  const node = el('div', { class: 'layer clear' }, [
    el('div', { class: 'hud-top' }, [el('div', { text: copy.hud.composure }), bar, budget]),
    hint,
  ]);

  // Every setter below is called once per rendered frame, so each one only
  // touches the DOM when its value has actually changed. Writing `textContent`
  // and toggling classes 60 times a second invalidates layout 60 times a
  // second, and the whole picture - including the face contour - gets choppy
  // for the sake of text that changes once every few seconds.
  let lastWidth = -1;
  let lastMood = '';
  let lastBudget: number | null | undefined;
  let lastHint: string | null | undefined;

  return {
    node,
    update(fraction, mood) {
      // Rounded to whole percent: sub-pixel width changes are invisible and
      // only cost a relayout.
      const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
      if (pct !== lastWidth) {
        fill.style.width = `${pct}%`;
        lastWidth = pct;
      }
      if (mood !== lastMood) {
        bar.classList.toggle('cracking', mood === 'cracking');
        bar.classList.toggle('panic', mood === 'panic');
        lastMood = mood;
      }
    },
    setLossBudget(remaining) {
      if (remaining === lastBudget) return;
      lastBudget = remaining;

      if (remaining === null) {
        budget.style.display = 'none';
        return;
      }
      budget.style.display = '';
      budget.textContent = copy.hud.lossBudget(remaining);
      // Only shout about it when it is nearly spent.
      budget.classList.toggle('warn', remaining <= 2);
      budget.classList.toggle('critical', remaining === 0);
    },
    setHint(text) {
      if (text === lastHint) return;
      lastHint = text;
      hint.style.display = text === null ? 'none' : '';
      hint.textContent = text ?? '';
    },
  };
}

/** A level's hint card, shown for a moment as a level starts. */
export function levelIntro(level: Level): HTMLElement {
  return el('div', { class: 'layer clear', style: 'align-content:center' }, [
    el('div', { class: 'panel' }, [
      el('p', { class: 'osd-text dim', text: level.label }),
      el('h2', { text: level.title }),
      level.hint === undefined ? null : el('p', { class: 'small dim', text: level.hint }),
      // The flavour hint above says what the level is teaching, never what it
      // is scoring - a player could clear tapes for a while with no idea what
      // they were actually trying to protect. Endless has no fixed roster to
      // state a count for, so it keeps the card to flavour alone.
      level.mode === 'endless'
        ? null
        : el('p', { class: 'small objective', text: copy.hud.objective(level.spawn.count) }),
    ]),
  ]);
}

export const SETTINGS_DEFAULT_VOLUME = config.audio.defaultVolume;
