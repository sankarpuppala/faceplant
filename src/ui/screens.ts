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
import { RITE_NAMES, canBuyRite, riteCost, spendableCandles, type Progress, type RiteName } from '../storage/progress.ts';
import type { FilterName, Settings } from '../storage/settings.ts';
import { shareText } from '../share/shareText.ts';
import { copy } from './copy.ts';
import { button, candleIcon, candleRow, el, field, screen, segmented, slider, toggle } from './dom.ts';

// ------------------------------------------------------------------- notice --

export function noticeScreen(onContinue: (scares: boolean) => void): HTMLElement {
  return screen(copy.notice.heading, [
    el('h2', { text: copy.notice.heading }),
    el('ul', { class: 'notice-list' }, copy.notice.items.map((t) => el('li', { text: t }))),
    el('div', { class: 'row' }, [
      button(copy.notice.continue, () => onContinue(true), 'btn primary'),
      button(copy.notice.continueNoScares, () => onContinue(false), 'btn'),
    ]),
  ]);
}

// -------------------------------------------------------------------- title --

export interface TitleActions {
  play: () => void;
  playNoCamera: () => void;
  settings: () => void;
  ossuary: () => void;
  rites: () => void;
}

export function titleScreen(actions: TitleActions, hasCamera: boolean, reducedEffects: boolean): HTMLElement {
  const wordmark = el('h1', { class: reducedEffects ? 'wordmark' : 'wordmark jitter', text: copy.title.wordmark });

  // U10 - play first, camera later. The primary button starts a level
  // immediately in Assist; the camera is offered afterwards as an upgrade,
  // because nobody grants a webcam to a game they have not played.
  const primaryLabel = hasCamera ? copy.title.play : copy.title.play;

  return screen('FACEPLANT', [
    wordmark,
    el('p', { class: 'tagline', text: copy.title.tagline }),
    el('div', { class: 'row' }, [button(primaryLabel, actions.play, 'btn primary')]),
    el('div', { class: 'row' }, [button(copy.title.playNoCamera, actions.playNoCamera, 'btn quiet')]),
    el('div', { class: 'row' }, [
      button(copy.title.settings, actions.settings, 'btn quiet'),
      button(copy.title.ossuary, actions.ossuary, 'btn quiet'),
      button(copy.title.rites, actions.rites, 'btn quiet'),
    ]),
    el('p', { class: 'small dim', text: copy.title.footer }),
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
    // A single candle as the focus point (SPEC section 12.5).
    el('div', { class: 'candlerow', style: 'transform:scale(2.2);margin-bottom:18px' }, [candleIcon(true)]),
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
    rack,
    blurb,
    levelHost,
    el('div', { class: 'row' }, [button(copy.shelf.back, actions.back, 'btn quiet')]),
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
      button(copy.pause.settings, actions.settings, 'btn'),
      button(copy.pause.shelf, actions.shelf, 'btn'),
    ]),
    el('p', { class: 'small dim', text: copy.hud.assistHint }),
  ], 'transparent');
}

// ------------------------------------------------------------------ results --

export interface ResultsActions {
  next: (() => void) | null;
  retry: () => void;
  shelf: () => void;
  copyResult: () => void;
  saveCard: () => void;
  saveClip: (() => void) | null;
}

const STAMP_CLASS: Record<Stamp, string> = {
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

  return screen('Results', [
    el('div', { class: 'tear' }),
    el('div', { class: `stamp ${STAMP_CLASS[result.stamp]}`, text: result.stamp }),
    el('p', { class: 'small dim', text: blurb }),
    candleRow(result.candles),
    el('div', { class: 'bigscore', text: result.score.toLocaleString('en-US') }),
    opts.newBest ? el('p', { class: 'tagline', text: copy.results.newBest }) : null,
    stats,
    opts.practice ? el('p', { class: 'small dim', text: copy.results.practice }) : null,
    el('pre', { class: 'sharetext', text: shareText(result) }),
    el('div', { class: 'row' }, [
      actions.next === null ? null : button(copy.results.next, actions.next, 'btn primary'),
      button(copy.results.retry, actions.retry, 'btn'),
      button(copy.results.shelf, actions.shelf, 'btn'),
    ]),
    el('div', { class: 'row' }, [
      button(copy.results.copy, actions.copyResult, 'btn quiet'),
      button(copy.results.card, actions.saveCard, 'btn quiet'),
      actions.saveClip === null ? null : button(copy.results.clip, actions.saveClip, 'btn quiet'),
    ]),
    // U8 - tell the player what the clip actually is, since "save clip" could
    // mean the whole attempt and this one is the six seconds that matter.
    el('p', { class: 'small dim', text: opts.recordingOn ? copy.results.clipHint : copy.results.clipOff }),
  ], 'transparent');
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
  close: () => void;
}

export function settingsScreen(settings: Settings, actions: SettingsActions, totalCandles: number, canRecord: boolean): HTMLElement {
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
      toggle(copy.settings.scares, settings.scares, (scares) => actions.change({ scares })).node,
      el('p', { class: 'small dim', text: copy.settings.scaresHint }),
      field(copy.settings.effects, effectsSeg.node, copy.settings.effectsHint),
      field(copy.settings.filter, filterSeg.node, thermalOk ? undefined : copy.settings.thermalLocked),
      toggle(copy.settings.hideFace, settings.hideMyFace, (hideMyFace) => actions.change({ hideMyFace })).node,
      el('p', { class: 'small dim', text: copy.settings.hideFaceHint }),
      field(copy.settings.controls, controlsSeg.node),
      field(copy.settings.recalibrate, button(copy.settings.recalibrate, actions.recalibrate, 'btn')),
      canRecord
        ? toggle(copy.settings.recording, settings.recording, (recording) => actions.change({ recording })).node
        : field(copy.settings.recording, el('span', { class: 'small dim', text: 'Not supported in this browser' })),
      el('p', { class: 'small dim', text: copy.settings.recordingHint }),
      toggle(copy.settings.lowPower, settings.lowPower, (lowPower) => actions.change({ lowPower })).node,
      el('p', { class: 'small dim', text: copy.settings.lowPowerHint }),
      slider(copy.settings.volume, settings.volume, (volume) => actions.change({ volume })),
    ]),
    el('div', { class: 'row' }, [button(copy.settings.close, actions.close, 'btn primary')]),
  ]);
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

// -------------------------------------------------------------------- rites --

/** U9 - spend candles on small permanent help. */
export function ritesScreen(progress: Progress, onBuy: (rite: RiteName) => void, onBack: () => void): HTMLElement {
  const available = spendableCandles(progress);
  const rows = el('div', { class: 'col' });

  for (const rite of RITE_NAMES) {
    const owned = progress.rites.includes(rite);
    const affordable = canBuyRite(progress, rite);
    rows.appendChild(
      el('div', { class: `rite ${owned ? 'owned' : ''}` }, [
        el('div', {}, [
          el('div', { class: 'name', text: copy.rites.names[rite] }),
          el('div', { class: 'desc', text: copy.rites.descriptions[rite] }),
        ]),
        owned
          ? el('span', { class: 'small', style: 'color:var(--candle)', text: copy.rites.owned })
          : (() => {
              const b = button(`${copy.rites.buy} · ${copy.rites.cost(riteCost(rite))}`, () => onBuy(rite), 'btn');
              b.disabled = !affordable;
              return b;
            })(),
      ]),
    );
  }

  return screen(copy.rites.heading, [
    el('h2', { text: copy.rites.heading }),
    el('p', { class: 'small dim', text: copy.rites.blurb }),
    el('p', { class: 'osd-text', text: copy.rites.available(available) }),
    rows,
    el('div', { class: 'row' }, [button(copy.rites.back, onBack, 'btn primary')]),
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
  setHint: (text: string | null) => void;
}

export function hud(): HudView {
  const fill = el('i');
  const bar = el('div', { class: 'composure' }, [fill]);
  const hint = el('div', { class: 'toast', style: 'display:none' });
  const node = el('div', { class: 'layer clear' }, [
    el('div', { class: 'hud-top' }, [el('div', { text: copy.hud.composure }), bar]),
    hint,
  ]);

  return {
    node,
    update(fraction, mood) {
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
      bar.classList.toggle('cracking', mood === 'cracking');
      bar.classList.toggle('panic', mood === 'panic');
    },
    setHint(text) {
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
    ]),
  ]);
}

export const SETTINGS_DEFAULT_VOLUME = config.audio.defaultVolume;
