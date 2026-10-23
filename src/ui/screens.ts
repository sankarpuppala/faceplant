/**
 * Every DOM screen (docs/OVERHAUL.md section 3, SPEC section 12.5).
 *
 * Each screen is one function returning a detached element. The rules from
 * the brief are built in here rather than remembered per screen:
 *
 *   - every screen has a way out, and Main menu within two inputs;
 *   - the action row is the sticky footer from `actions()`, so it is never off
 *     screen and never sits on the text;
 *   - nothing on a screen that the brief did not ask for.
 */

import { TAPES, isDailyUnlocked, isEndlessUnlocked, isLevelUnlocked, isTapeUnlocked, type Tape } from '../game/levelLoader.ts';
import type { Level } from '../game/levelSchema.ts';
import type { RunResult } from '../game/rules.ts';
import type { Progress } from '../storage/progress.ts';
import type { FilterName, Settings } from '../storage/settings.ts';
import { copy } from './copy.ts';
import { actions, button, candleIcon, candleRow, el, field, screen, segmented, slider } from './dom.ts';
import { backdrop } from './backdrop.ts';
import { faceMapSvg } from './diagrams.ts';
import { iconForOutcome } from './icons.ts';

// ------------------------------------------------------------------- notice --

export function noticeScreen(scares: boolean, onContinue: (scares: boolean) => void): HTMLElement {
  let on = scares;
  const toggle = segmented(
    [
      { value: 'on' as const, label: copy.settings.on },
      { value: 'off' as const, label: copy.settings.off },
    ],
    on ? 'on' : 'off',
    (v) => {
      on = v === 'on';
      toggle.update(v);
    },
  );
  return screen(
    copy.notice.heading,
    [
      el('h2', { text: copy.notice.heading }),
      el('ul', { class: 'notice-list' }, copy.notice.items.map((t) => el('li', { text: t }))),
      el('div', { class: 'box notice-scares' }, [field(copy.notice.scares, toggle.node, copy.notice.scaresHint)]),
    ],
    'solid',
    actions([button(copy.notice.continue, () => onContinue(on), 'primary')]),
  );
}

// -------------------------------------------------------------------- title --

export interface TitleActions {
  insertFace: () => void;
  playNoCamera: () => void;
  settings: () => void;
  leave: () => void;
}

export function titleScreen(a: TitleActions, state: { canSave: boolean }): HTMLElement {
  const node = screen(
    'FACEPLANT',
    [
      el('div', { class: 'title-block' }, [
        el('h1', { class: 'wordmark', text: copy.title.wordmark }),
        el('p', { class: 'tagline', text: copy.title.tagline }),
      ]),
    ],
    'solid',
    actions(
      [
        button(copy.title.insertFace, a.insertFace, 'primary'),
        button(copy.title.playNoCamera, a.playNoCamera, 'secondary'),
        button(copy.title.settings, a.settings, 'secondary'),
      ],
      [
        el('span', { class: 'title-footer dim', text: state.canSave ? copy.title.footer : copy.title.notSaved }),
        button(copy.title.leave, a.leave, 'tertiary'),
      ],
    ),
  );
  node.classList.add('title', 'has-backdrop');
  node.insertBefore(backdrop('title'), node.firstChild);
  return node;
}

// ------------------------------------------------------------------- camera --

export function cameraScreen(onAllow: () => void, onNoCamera: () => void, onBack: () => void, error?: string): HTMLElement {
  return screen(
    copy.camera.heading,
    [
      el('h2', { text: copy.camera.heading }),
      el('p', { class: 'dim', text: copy.camera.body }),
      error === undefined ? null : el('p', { class: 'danger-text', text: error }),
    ],
    'solid',
    actions(
      [
        error === undefined ? button(copy.camera.allow, onAllow, 'primary') : null,
        button(copy.camera.noCamera, onNoCamera, error === undefined ? 'secondary' : 'primary'),
      ],
      [button(copy.camera.back, onBack, 'tertiary')],
    ),
  );
}

// -------------------------------------------------------------- calibration --

export interface CalibrationView {
  node: HTMLElement;
  setPrompt: (text: string) => void;
  setProgress: (fraction01: number) => void;
  setError: (text: string | null) => void;
}

/** "Hold still. Look at the candle." A ring fills. "Open your mouth." Done. */
export function calibrationScreen(onSkip: () => void, onRetry: () => void, onBack: () => void): CalibrationView {
  const prompt = el('p', { class: 'osd-text', text: copy.calibration.hold });
  const error = el('p', { class: 'danger-text calib-error' });
  const ring = el('div', { class: 'calib-ring', style: '--p:0' }, [candleIcon(true)]);
  const retry = button(copy.calibration.again, onRetry, 'secondary');
  retry.style.display = 'none';

  const node = screen(
    copy.calibration.heading,
    [ring, prompt, error],
    'solid',
    actions([retry], [button(copy.calibration.skip, onSkip, 'tertiary'), button(copy.calibration.back, onBack, 'tertiary')]),
  );

  return {
    node,
    setPrompt: (t) => {
      prompt.textContent = t;
    },
    setProgress: (f) => {
      ring.style.setProperty('--p', String(Math.min(1, Math.max(0, f))));
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

type ShelfPick = { kind: 'tape'; tape: Tape; levelId: string } | { kind: 'daily' } | { kind: 'endless' };

/**
 * A row of tape spines. Locked tapes are black spines; the selected one slides
 * out. Under the shelf: the selected tape's chapters, each with its candles,
 * and the Play / Back row.
 */
export function shelfScreen(progress: Progress, a: ShelfActions, dayNumber: number): HTMLElement {
  const completed = new Set(Object.keys(progress.levels).filter((id) => (progress.levels[id]?.candles ?? 0) > 0));
  const rack = el('div', { class: 'rack', role: 'listbox', 'aria-label': copy.shelf.heading });
  const detail = el('div', { class: 'shelf-detail' });
  const spines: { node: HTMLElement; matches: (p: ShelfPick) => boolean }[] = [];

  // A tape's first unfinished chapter, or its first if all are done.
  const firstOpen = (tape: Tape): string =>
    tape.levelIds.find((id) => !completed.has(id) && isLevelUnlocked(id, completed)) ?? tape.levelIds[0] ?? '';

  const initial = (): ShelfPick => {
    for (const t of TAPES) {
      if (!isTapeUnlocked(t.number, completed)) break;
      if (t.levelIds.some((id) => !completed.has(id))) return { kind: 'tape', tape: t, levelId: firstOpen(t) };
    }
    const t = TAPES[0];
    return t === undefined ? { kind: 'daily' } : { kind: 'tape', tape: t, levelId: firstOpen(t) };
  };
  let pick = initial();

  const play = (): void => {
    if (pick.kind === 'daily') a.playDaily();
    else if (pick.kind === 'endless') a.playEndless();
    else a.playLevel(pick.levelId);
  };

  const render = (): void => {
    for (const s of spines) {
      const on = s.matches(pick);
      s.node.classList.toggle('current', on);
      s.node.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    detail.replaceChildren();
    if (pick.kind === 'daily') {
      const done = progress.daily !== null && progress.daily.day === dayNumber;
      detail.append(
        el('span', { class: 'tape-label', text: `${copy.shelf.daily} #${String(dayNumber).padStart(3, '0')}` }),
        el('p', { class: 'dim', text: done ? copy.shelf.dailyDone : copy.shelf.dailyBlurb }),
      );
      return;
    }
    if (pick.kind === 'endless') {
      detail.append(el('span', { class: 'tape-label', text: copy.shelf.endless }), el('p', { class: 'dim', text: copy.shelf.endlessBlurb }));
      if (progress.endlessBest.score > 0) detail.append(el('p', { class: 'osd-text dim', text: copy.shelf.best(progress.endlessBest.score) }));
      return;
    }
    const current = pick;
    const chapters = el('div', { class: 'chapters', role: 'radiogroup' });
    current.tape.levelIds.forEach((id, i) => {
      const unlocked = isLevelUnlocked(id, completed);
      const on = current.levelId === id;
      const chip = el(
        'button',
        { class: `chapter${on ? ' current' : ''}`, type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', disabled: !unlocked },
        [el('span', { class: 'chapter-n', text: `T${String(current.tape.number).padStart(2, '0')}/${i + 1}` }), candleRow(progress.levels[id]?.candles ?? 0)],
      );
      chip.addEventListener('click', () => {
        pick = { kind: 'tape', tape: current.tape, levelId: id };
        render();
      });
      chapters.appendChild(chip);
    });
    detail.append(el('span', { class: 'tape-label', text: `${String(current.tape.number).padStart(2, '0')} · ${current.tape.name}` }), chapters);
  };

  const addSpine = (num: string, name: string, lit: number, locked: boolean, cls: string, target: ShelfPick, matches: (p: ShelfPick) => boolean): void => {
    const candles = el('span', { class: 'spine-candles' });
    if (!locked && lit >= 0) for (let i = 0; i < 3; i++) candles.appendChild(candleIcon(i < lit));
    const spine = el(
      'button',
      {
        class: ['spine', cls, locked ? 'locked' : ''].filter((c) => c !== '').join(' '),
        type: 'button',
        role: 'option',
        disabled: locked,
        'aria-label': locked ? `${num} ${copy.shelf.locked}` : `${num} ${name}`,
      },
      [el('span', { class: 'spine-num', text: num }), el('span', { class: 'spine-name', text: locked ? '' : name }), candles],
    );
    if (!locked) {
      spine.addEventListener('click', () => {
        pick = target;
        render();
      });
      spine.addEventListener('dblclick', play);
    }
    rack.appendChild(spine);
    spines.push({ node: spine, matches });
  };

  for (const tape of TAPES) {
    const locked = !isTapeUnlocked(tape.number, completed);
    const earned = tape.levelIds.reduce((n, id) => n + (progress.levels[id]?.candles ?? 0), 0);
    const lit = Math.round((earned / Math.max(1, tape.levelIds.length * 3)) * 3);
    addSpine(
      String(tape.number).padStart(2, '0'),
      tape.name,
      lit,
      locked,
      '',
      { kind: 'tape', tape, levelId: firstOpen(tape) },
      (p) => p.kind === 'tape' && p.tape === tape,
    );
  }
  if (isDailyUnlocked(completed)) addSpine('∗', copy.shelf.daily, -1, false, 'daily', { kind: 'daily' }, (p) => p.kind === 'daily');
  if (isEndlessUnlocked(completed)) addSpine('∞', copy.shelf.endless, -1, false, 'endless', { kind: 'endless' }, (p) => p.kind === 'endless');

  render();

  return screen(
    copy.shelf.heading,
    [el('h2', { class: 'shelf-heading', text: copy.shelf.heading }), el('div', { class: 'shelf' }, [rack]), detail],
    'solid',
    actions([button(copy.shelf.play, play, 'primary'), button(copy.shelf.back, a.back, 'secondary')]),
  );
}

// -------------------------------------------------------------- tape insert --

/**
 * The 2 s between choosing a tape and playing it: its label on masking tape,
 * and the OSD settling its tracking. On the very first tape it also carries
 * the whole of the instructions - the face diagram and one sentence - and
 * waits for a key.
 */
export function tapeInsert(level: Level, opts: { firstRun: boolean; assist: boolean }): HTMLElement {
  return el('div', { class: `layer clear insert${opts.firstRun ? ' first' : ''}`, role: 'status' }, [
    el('div', { class: 'insert-card' }, [
      el('span', { class: 'tape-label', text: `${level.label} · ${level.title}` }),
      el('p', { class: 'osd-text insert-tracking', text: copy.insert.tracking }),
      level.mode === 'endless' ? null : el('p', { class: 'objective', text: copy.insert.objective(level.spawn.count) }),
      opts.firstRun ? el('div', { class: 'insert-diagram' }, [faceMapSvg()]) : null,
      opts.firstRun ? el('p', { class: 'insert-howto', text: copy.insert.howTo }) : null,
      opts.assist ? el('p', { class: 'dim insert-keys', text: copy.insert.assistKeys }) : null,
      opts.firstRun ? el('p', { class: 'osd-text dim blink-slow', text: copy.insert.pressKey }) : null,
    ]),
  ]);
}

// --------------------------------------------------------------------- HUD --

/**
 * The only in-play DOM (OVERHAUL 3.1). Everything else - REC, the tape
 * number, the Wicks, the Maw - is the Pixi OSD. This is the "TRACKING…"
 * message for a lost or loading face, with a Pause button, so a missing face
 * is never a blank screen.
 */
export interface HudView {
  node: HTMLElement;
  setTracking: (lost: boolean) => void;
}

export function hud(onPause: () => void): HudView {
  const box = el('div', { class: 'tracking-box', style: 'display:none' }, [
    el('p', { class: 'osd-text blink-slow', text: copy.hud.tracking }),
    button(copy.hud.pause, onPause, 'secondary'),
  ]);
  const node = el('div', { class: 'layer clear hud' }, [box]);
  let last: boolean | null = null;
  return {
    node,
    setTracking(lost) {
      if (lost === last) return;
      last = lost;
      box.style.display = lost ? '' : 'none';
    },
  };
}

/** Retry: 0.8 s of rewinding tape. */
export function rewindOverlay(): HTMLElement {
  return el('div', { class: 'layer clear rewind', role: 'status' }, [el('p', { class: 'osd-text rewind-label', text: copy.rewind })]);
}

// -------------------------------------------------------------------- pause --

export interface PauseActions {
  resume: () => void;
  restart: () => void;
  settings: () => void;
  mainMenu: () => void;
}

export function pauseScreen(a: PauseActions, opts: { assist: boolean }): HTMLElement {
  return screen(
    copy.pause.heading,
    [
      el('h2', { class: 'osd-text pause-heading', text: copy.pause.heading }),
      opts.assist ? el('p', { class: 'dim', text: copy.insert.assistKeys }) : null,
    ],
    'transparent',
    actions([
      button(copy.pause.resume, a.resume, 'primary'),
      button(copy.pause.restart, a.restart, 'secondary'),
      button(copy.pause.settings, a.settings, 'secondary'),
      button(copy.pause.mainMenu, a.mainMenu, 'secondary'),
    ]),
  );
}

// ------------------------------------------------------------------ results --

export interface ResultsActions {
  /** Win: the next tape (or the ending). Null on a loss and after the last tape. */
  next: (() => void) | null;
  retry: () => void;
  shelf: () => void;
  mainMenu: () => void;
  /** Only when a clip was actually recorded (it is opt-in, from Settings). */
  saveClip: (() => void) | null;
}

/** Stamp, one line, the Wick row, the score, and the button row. Nothing else. */
export function resultsScreen(result: RunResult, a: ResultsActions, opts: { practice: boolean; newBest: boolean; line: string }): HTMLElement {
  const strip = el('div', { class: 'outcome-strip', 'aria-label': copy.results.savedOf(result.saved, result.spawned) });
  for (const o of result.outcomes) strip.appendChild(el('span', { class: `outcome outcome-${o}` }, [iconForOutcome(o)]));

  const primary =
    a.next !== null
      ? button(copy.results.next, a.next, 'primary')
      : button(result.failed ? copy.results.retry : copy.results.replay, a.retry, 'primary');

  return screen(
    result.failed ? copy.results.lost : copy.results.saved,
    [
      el('div', { class: `stamp ${result.failed ? 'lost' : 'kept'}`, text: result.failed ? copy.results.lost : copy.results.saved }),
      el('p', { class: 'result-line', text: opts.line }),
      strip,
      el('p', { class: 'dim', text: copy.results.savedOf(result.saved, result.spawned) }),
      el('div', { class: 'result-score' }, [
        el('span', { class: 'dim', text: copy.results.score }),
        el('span', { class: 'bigscore', text: result.score.toLocaleString('en-US') }),
      ]),
      opts.newBest ? el('p', { class: 'tagline', text: copy.results.newBest }) : null,
      opts.practice ? el('p', { class: 'dim', text: copy.results.practice }) : null,
    ],
    'transparent',
    actions(
      [
        primary,
        a.next !== null ? button(copy.results.retry, a.retry, 'secondary') : null,
        button(copy.results.shelf, a.shelf, 'secondary'),
        button(copy.results.mainMenu, a.mainMenu, 'secondary'),
      ],
      [a.saveClip === null ? null : button(copy.results.clip, a.saveClip, 'tertiary')],
    ),
  );
}

/** The clip preview dialog. Nothing is kept once this closes (invariant 3). */
export function clipPreviewScreen(url: string, onSave: () => void, onDiscard: () => void): HTMLElement {
  const video = el('video', { src: url, autoplay: true, loop: true, muted: true, playsinline: true });
  return screen(
    copy.results.clip,
    [el('h2', { text: copy.results.clip }), el('div', { class: 'clip-preview' }, [video])],
    'solid',
    actions([button(copy.results.save, onSave, 'primary'), button(copy.results.discard, onDiscard, 'secondary')]),
  );
}

// ----------------------------------------------------------------- settings --

export interface SettingsActions {
  change: (next: Partial<Settings>) => void;
  resetProgress: () => void;
  back: () => void;
}

function onOff(on: boolean, set: (v: boolean) => void): HTMLElement {
  return segmented(
    [
      { value: 'on' as const, label: copy.settings.on },
      { value: 'off' as const, label: copy.settings.off },
    ],
    on ? 'on' : 'off',
    (v) => set(v === 'on'),
  ).node;
}

/** One column: label left, control right, hint under its own row. */
export function settingsScreen(settings: Settings, a: SettingsActions, opts: { thermalUnlocked: boolean; canRecord: boolean }): HTMLElement {
  const filter = segmented<FilterName>(
    [
      { value: 'vhs', label: 'VHS' },
      { value: 'ink', label: 'INK' },
      { value: 'thermal', label: 'THERMAL', disabled: !opts.thermalUnlocked },
    ],
    settings.filter,
    (f) => a.change({ filter: f }),
  );

  return screen(
    copy.settings.heading,
    [
      el('h2', { text: copy.settings.heading }),
      el('div', { class: 'settings-list' }, [
        slider(copy.settings.volume, settings.volume, (volume) => a.change({ volume })),
        slider(copy.settings.music, settings.musicVolume, (musicVolume) => a.change({ musicVolume })),
        slider(copy.settings.sfx, settings.sfxVolume, (sfxVolume) => a.change({ sfxVolume })),
        field(copy.settings.scares, onOff(settings.scares, (scares) => a.change({ scares })), copy.settings.scaresHint),
        field(
          copy.settings.effects,
          onOff(settings.reducedEffects, (reducedEffects) => a.change({ reducedEffects })),
          copy.settings.effectsHint,
        ),
        field(
          copy.settings.filter,
          filter.node,
          opts.thermalUnlocked ? copy.settings.filterHint : `${copy.settings.filterHint} ${copy.settings.thermalLocked}`,
        ),
        field(
          copy.settings.recording,
          opts.canRecord
            ? onOff(settings.recording, (recording) => a.change({ recording }))
            : el('span', { class: 'dim', text: copy.settings.recordingUnsupported }),
          copy.settings.recordingHint,
        ),
      ]),
    ],
    'solid',
    actions([button(copy.settings.back, a.back, 'primary')], [resetControl(a.resetProgress)]),
  );
}

/** Two taps, inline: destructive, but not worth a screen of its own. */
function resetControl(onConfirm: () => void): HTMLElement {
  const host = el('span', { class: 'reset' });
  const render = (confirming: boolean): void => {
    host.replaceChildren();
    if (!confirming) {
      host.appendChild(button(copy.settings.reset, () => render(true), 'tertiary'));
      return;
    }
    host.append(
      el('span', { class: 'danger-text', text: copy.settings.resetConfirm }),
      button(
        copy.settings.resetYes,
        () => {
          onConfirm();
          render(false);
        },
        'tertiary danger',
      ),
      button(copy.settings.resetNo, () => render(false), 'tertiary'),
    );
  };
  render(false);
  return host;
}

// ------------------------------------------------------- ending and credits --

export function endingScreen(onMainMenu: () => void): HTMLElement {
  return screen(
    'Ending',
    [el('p', { class: 'ending-line', text: copy.ending.line }), el('p', { class: 'dim', text: copy.ending.credits })],
    'solid',
    actions([button(copy.ending.mainMenu, onMainMenu, 'primary')]),
  );
}

/** "Leave": the tape runs out to black. A browser tab cannot quit itself. */
export function creditsScreen(onBack: () => void): HTMLElement {
  const node = screen(
    'Credits',
    copy.credits.lines.map((t, i) => el('p', { class: i === 0 ? 'credits-title' : 'dim', text: t })),
    'solid',
    actions([], [button(copy.credits.back, onBack, 'tertiary')]),
  );
  node.classList.add('to-black');
  return node;
}
