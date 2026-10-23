/**
 * AC-2, AC-6, AC-9, AC-13 — levels, determinism, composure, scares, sharing,
 * storage, config hygiene and credits.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { config, defaultTunables } from '../../src/config.ts';
import { Composure, moodFor } from '../../src/game/composure.ts';
import { dayNumber, generateDaily, generateEndless, TEMPLATES } from '../../src/game/daily.ts';
import {
  ALL_LEVEL_IDS,
  isDailyUnlocked,
  isLevelUnlocked,
  isStoryFinale,
  isTapeUnlocked,
  nextLevelId,
  nextUnplayedLevelId,
  STORY_FINALE_ID,
  TAPES,
  tapeFor,
} from '../../src/game/levelLoader.ts';
import { LevelError, parseLevel, validateLevel, type Level } from '../../src/game/levelSchema.ts';
import { LINES, RUIN_LORE, fillLine, type LineTrigger } from '../../src/game/lines.ts';
import { LineDirector } from '../../src/game/lineDirector.ts';
import { displayName, NameDealer, titleForRunsSurvived, WICK_NAMES } from '../../src/game/names.ts';
import { Procession } from '../../src/game/procession.ts';
import { buildResult, candlesFor, filterUnlocked, stampFor, THERMAL_UNLOCK_CANDLES, type RunResult } from '../../src/game/rules.ts';
import { FaceLooksBack, finaleBlendOverride, ScareDirector, scareDurationMs } from '../../src/game/scares.ts';
import { noReactions, type Reactions } from '../../src/face/reactions.ts';
import { Rng } from '../../src/physics/vec.ts';
import { World } from '../../src/physics/world.ts';
import {
  completedLevelIds,
  EMPTY_PROGRESS,
  recordDaily,
  recordRun,
  type Progress,
} from '../../src/storage/progress.ts';
import { DEFAULT_SETTINGS } from '../../src/storage/settings.ts';
import { flashBudget } from '../../src/render/postfx.ts';
import { hex, tokens } from '../../src/render/tokens.ts';

const ROOT = join(import.meta.dirname, '..', '..');
const LEVEL_DIR = join(ROOT, 'public', 'levels');

function loadAll(): Level[] {
  return readdirSync(LEVEL_DIR)
    .filter((n) => n.endsWith('.json'))
    .map((n) => parseLevel(JSON.parse(readFileSync(join(LEVEL_DIR, n), 'utf8')), n));
}

// ----------------------------------------------------------------- levels ---

describe('level schema (SPEC 9.1)', () => {
  const levels = loadAll();

  it('every shipped level validates', () => {
    expect(levels).toHaveLength(15);
    for (const l of levels) expect(l.id).toMatch(/^0[1-5]-[1-4]$/);
  });

  it('every level id matches its filename and its tape', () => {
    for (const l of levels) {
      const tape = tapeFor(l.id);
      expect(tape, `${l.id} belongs to no tape`).toBeDefined();
      expect(tape?.number).toBe(l.tape);
      expect(l.label).toBe(`T${String(l.tape).padStart(2, '0')}/${l.index}`);
    }
  });

  it('the tapes declare exactly the levels on disk', () => {
    expect(TAPES.flatMap((t) => t.levelIds).sort()).toEqual(levels.map((l) => l.id).sort());
    expect(TAPES.map((t) => t.levelIds.length)).toEqual([4, 3, 3, 2, 3]);
  });

  it('rejects coordinates outside the visible region', () => {
    const base = levels[0];
    expect(base).toBeDefined();
    if (base === undefined) return;
    expect(() => validateLevel({ ...base, gate: { ...base.gate, x: 99 } }, 'bad')).toThrow(LevelError);
    expect(() => validateLevel({ ...base, spawn: { ...base.spawn, y: -99 } }, 'bad')).toThrow(LevelError);
  });

  it('rejects candle thresholds that are impossible or out of order', () => {
    const base = levels[0];
    if (base === undefined) return;
    expect(() => validateLevel({ ...base, candles: { 3: 1, 2: 2, 1: 3 } }, 'bad')).toThrow(/ascending/);
    expect(() => validateLevel({ ...base, candles: { 3: 999, 2: 1, 1: 1 } }, 'bad')).toThrow(/exceeds/);
  });

  it('rejects malformed JSON with a message that names the field', () => {
    expect(() => parseLevel({ id: 'x' }, 'x')).toThrow(/spawn/);
    expect(() => parseLevel({ ...loadAll()[0], tape: 'two' }, 'x')).toThrow(/tape/);
    expect(() => parseLevel({ ...loadAll()[0], spawn: { x: 0, y: 0, count: 1, intervalMs: 1, dir: 7 } }, 'x')).toThrow(/dir/);
    expect(() => parseLevel({ ...loadAll()[0], hazards: [{ type: 'dragon', x: 0, y: 0, atMs: 0 }] }, 'x')).toThrow(/dragon/);
  });

  it('every level is reachable by unlocking in order', () => {
    const done = new Set<string>();
    for (const id of ALL_LEVEL_IDS) {
      expect(isLevelUnlocked(id, done), `${id} is not reachable`).toBe(true);
      done.add(id);
    }
    expect(nextLevelId(ALL_LEVEL_IDS[ALL_LEVEL_IDS.length - 1] ?? '')).toBeNull();
  });

  it('tape 1 is open from the start and tape 2 is not', () => {
    expect(isTapeUnlocked(1, new Set())).toBe(true);
    expect(isTapeUnlocked(2, new Set())).toBe(false);
    expect(isDailyUnlocked(new Set())).toBe(false);
    expect(isDailyUnlocked(new Set(TAPES[0]?.levelIds ?? []))).toBe(true);
  });

  it('spends its hazards and scares inside the time limit', () => {
    for (const l of levels) {
      for (const h of l.hazards) {
        expect(h.atMs, `${l.id}: a hazard spawns after time runs out`).toBeLessThan(l.timeLimitS * 1000);
      }
      for (const s of l.scares) {
        expect(s.atMs, `${l.id}: a scare fires after time runs out`).toBeLessThan(l.timeLimitS * 1000);
      }
    }
  });

  it('gives every level a hint in the Wicks voice', () => {
    for (const l of levels) {
      expect(l.hint, `${l.id} has no hint`).toBeTruthy();
      // Lowercase whispers (SPEC 12.6): the hint must not start capitalised.
      expect(l.hint?.[0]).toBe(l.hint?.[0]?.toLowerCase());
    }
  });
});

// ------------------------------------------------------------ daily tape ---

describe('the Daily Tape (SPEC 11.2, decision D12)', () => {
  it('is byte-identical for the same day', () => {
    for (const day of [0, 1, 7, 42, 365, 1000]) {
      expect(JSON.stringify(generateDaily(day))).toBe(JSON.stringify(generateDaily(day)));
    }
  });

  it('differs between adjacent days', () => {
    for (let day = 0; day < 12; day++) {
      expect(JSON.stringify(generateDaily(day))).not.toBe(JSON.stringify(generateDaily(day + 1)));
    }
  });

  it('cycles through every template', () => {
    const seen = new Set<string>();
    for (let day = 0; day < TEMPLATES.length; day++) seen.add(generateDaily(day).hint ?? '');
    expect(seen.size).toBe(TEMPLATES.length);
    expect(TEMPLATES).toHaveLength(config.daily.templates);
  });

  it('labels and validates every day for five years', () => {
    for (let day = 0; day < 1826; day += 37) {
      const l = generateDaily(day);
      expect(l.label).toBe(`DAILY #${String(day).padStart(3, '0')}`);
      expect(l.mode).toBe('daily');
      expect(() => validateLevel(l, `daily-${day}`)).not.toThrow();
    }
  });

  it('counts whole UTC days from the epoch, so a timezone cannot shift it', () => {
    const epoch = new Date(`${config.daily.epochDate}T00:00:00Z`);
    expect(dayNumber(epoch)).toBe(0);
    expect(dayNumber(new Date(epoch.getTime() + 86_400_000))).toBe(1);
    // Late evening and early morning of the same UTC day agree.
    expect(dayNumber(new Date(`${config.daily.epochDate}T23:59:59Z`))).toBe(0);
    // Before the epoch clamps to 0 rather than going negative.
    expect(dayNumber(new Date(epoch.getTime() - 86_400_000 * 5))).toBe(0);
  });

  it('the Long Tape validates and never ends on the clock', () => {
    const e = generateEndless();
    expect(e.mode).toBe('endless');
    expect(e.timeLimitS).toBeGreaterThan(600);
    expect(() => validateLevel(e, 'endless')).not.toThrow();
  });
});

// ------------------------------------------------------------- composure ---

describe('COMPOSURE (U1)', () => {
  const STEP = 1000 / 60;
  const react = (over: Partial<Reactions>): Reactions => ({ ...noReactions(), ...over });

  it('starts full and stays full with a still face', () => {
    const c = new Composure();
    let s = c.update(noReactions(), false, STEP, 0);
    expect(s.fraction).toBe(1);
    for (let i = 1; i < 200; i++) s = c.update(noReactions(), false, STEP, i * STEP);
    expect(s.fraction).toBe(1);
    expect(s.mood).toBe('steady');
  });

  it('drains fastest for laughing, and in the documented order', () => {
    const drainFor = (over: Partial<Reactions>): number => {
      const c = new Composure();
      let s = c.update(react(over), false, STEP, 0);
      for (let i = 1; i < 30; i++) s = c.update(react(over), false, STEP, i * STEP);
      return 1 - s.fraction;
    };
    const laugh = drainFor({ laughing: true, smiling: true });
    const gasp = drainFor({ gasp: true });
    const flinch = drainFor({ flinching: true });
    const smile = drainFor({ smiling: true });
    const brow = drainFor({ browsUp: true });

    expect(laugh).toBeGreaterThan(gasp);
    expect(gasp).toBeGreaterThan(flinch);
    expect(flinch).toBeGreaterThan(smile);
    expect(smile).toBeGreaterThan(brow);
    expect(brow).toBeGreaterThan(0);
  });

  it('does not charge for a smile on top of a laugh', () => {
    // A laugh already includes a smile; charging both made one giggle lethal.
    const c1 = new Composure();
    const c2 = new Composure();
    let a = 0;
    let b = 0;
    for (let i = 0; i < 30; i++) {
      a = c1.update(react({ laughing: true, smiling: true }), false, STEP, i * STEP).fraction;
      b = c2.update(react({ laughing: true, smiling: false }), false, STEP, i * STEP).fraction;
    }
    expect(a).toBeCloseTo(b, 10);
  });

  it('U2: holding the Maw open costs composure', () => {
    const c = new Composure();
    let s = c.update(noReactions(), true, STEP, 0);
    for (let i = 1; i < 60; i++) s = c.update(noReactions(), true, STEP, i * STEP);
    expect(s.fraction).toBeLessThan(1);
    expect(s.activeTells).toContain('mawOpen');
  });

  it('refills only after the delay, so you cannot rescue a laugh by freezing', () => {
    const c = new Composure();
    let t = 0;
    for (let i = 0; i < 60; i++, t += STEP) c.update(react({ laughing: true }), false, STEP, t);
    const afterLaugh = c.fraction;

    // Immediately still: nothing comes back inside the delay window.
    for (let i = 0; i < 10; i++, t += STEP) c.update(noReactions(), false, STEP, t);
    expect(c.fraction).toBeCloseTo(afterLaugh, 6);

    // Past the delay, it recovers.
    t += config.composure.regainDelayMs;
    for (let i = 0; i < 120; i++, t += STEP) c.update(noReactions(), false, STEP, t);
    expect(c.fraction).toBeGreaterThan(afterLaugh);
  });

  it('yawns at zero, refunds a little, and respects its cooldown', () => {
    const c = new Composure();
    let t = 0;
    let yawns = 0;
    let sawYawning = false;
    for (let i = 0; i < 2000; i++, t += STEP) {
      const s = c.update(react({ laughing: true }), false, STEP, t);
      if (s.justYawned) yawns++;
      if (s.yawning) sawYawning = true;
    }
    expect(yawns).toBeGreaterThan(0);
    expect(sawYawning).toBe(true);
    // Cooldown-limited: not one per frame.
    const seconds = (2000 * STEP) / 1000;
    const maxPossible = seconds / ((config.composure.yawn.durationMs + config.composure.yawn.cooldownMs) / 1000);
    expect(yawns).toBeLessThanOrEqual(Math.ceil(maxPossible) + 1);
  });

  it('reports mood thresholds and the lowest point reached', () => {
    expect(moodFor(1)).toBe('steady');
    expect(moodFor(config.composure.crackingFraction)).toBe('cracking');
    expect(moodFor(config.composure.panicFraction)).toBe('panic');

    const c = new Composure();
    let t = 0;
    for (let i = 0; i < 100; i++, t += STEP) c.update(react({ laughing: true }), false, STEP, t);
    const low = c.lowestFraction;
    for (let i = 0; i < 400; i++, t += STEP) c.update(noReactions(), false, STEP, t);
    // Recovering must not raise the recorded low - U8 cuts the clip on it.
    expect(c.lowestFraction).toBeCloseTo(low, 10);
    expect(c.fraction).toBeGreaterThan(low);
  });

  it('a reward hands composure back but never past full', () => {
    const c = new Composure();
    let t = 0;
    for (let i = 0; i < 60; i++, t += STEP) c.update(react({ laughing: true }), false, STEP, t);
    const before = c.fraction;
    c.reward(config.offering.composureRefundUnits);
    expect(c.fraction).toBeGreaterThan(before);
    c.reward(10_000);
    expect(c.fraction).toBe(1);
  });
});

// ------------------------------------------------------------ procession ---

describe('PROCESSION (U3)', () => {
  it('climbs one step per savesPerStep and caps out', () => {
    const p = new Procession();
    expect(p.multiple).toBe(1);
    for (let i = 0; i < config.procession.savesPerStep; i++) p.save();
    expect(p.multiple).toBe(2);
    for (let i = 0; i < 200; i++) p.save();
    expect(p.multiple).toBe(config.procession.maxMultiple);
  });

  it('turns the multiplier into light, which is the whole point', () => {
    const p = new Procession();
    expect(p.state.lightBonusFh).toBe(0);
    for (let i = 0; i < config.procession.savesPerStep * 3; i++) p.save();
    expect(p.state.lightBonusFh).toBeCloseTo(3 * config.procession.lightBonusFhPerStep, 9);
  });

  it('a loss sets it back but never to zero', () => {
    const p = new Procession();
    for (let i = 0; i < config.procession.savesPerStep * 5; i++) p.save();
    const before = p.multiple;
    p.loss();
    expect(p.multiple).toBeLessThan(before);
    expect(p.multiple).toBeGreaterThanOrEqual(1);
    expect(p.state.justBroken).toBe(true);
  });

  it('remembers the best reached this run', () => {
    const p = new Procession();
    for (let i = 0; i < config.procession.savesPerStep * 4; i++) p.save();
    const best = p.state.best;
    for (let i = 0; i < 10; i++) p.loss();
    expect(p.state.best).toBe(best);
    expect(p.multiple).toBe(1);
  });
});

// ----------------------------------------------------------------- lines ---

describe('Wick lines (SPEC 12.6, 12.7)', () => {
  it('ships at least the 60 lines the spec asks for', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(60);
    expect(RUIN_LORE.length).toBeGreaterThan(3);
  });

  it('covers every trigger the game can raise', () => {
    const triggers: LineTrigger[] = [
      'spawn', 'idle', 'smiling', 'browsUp', 'leaningIn', 'mawOpen', 'mawClosed', 'laughing', 'gasp',
      'saved', 'swallowed', 'lostOther', 'rail', 'flick', 'quake', 'dark', 'crawler', 'moth',
      'offering', 'procession', 'yawn', 'blinkBridge', 'turn', 'finale',
    ];
    for (const t of triggers) {
      expect(LINES.some((l) => l.trigger === t), `no line for trigger "${t}"`).toBe(true);
    }
  });

  it('every trigger has at least one mood-independent line, so it can always speak', () => {
    const byTrigger = new Map<string, number>();
    for (const l of LINES) {
      if (l.mood === 'any') byTrigger.set(l.trigger, (byTrigger.get(l.trigger) ?? 0) + 1);
    }
    for (const l of LINES) {
      expect(byTrigger.get(l.trigger) ?? 0, `"${l.trigger}" has only mood-gated lines`).toBeGreaterThan(0);
    }
  });

  it('keeps the Wick voice: lowercase whispers, no shouting, never gory (OVERHAUL 4)', () => {
    const banned = /(blood|bloody|gore|die|kill|corpse|murder)/i;
    for (const l of LINES) {
      expect(l.text, `"${l.text}" reads as gory`).not.toMatch(banned);
      // Whispers: no capitals at all (the old voice shouted "THE MAW STIRS"),
      // and no exclamation marks.
      expect(l.text, `"${l.text}" is not lowercase`).toBe(l.text.toLowerCase());
      expect(l.text, `"${l.text}" shouts`).not.toContain('!');
    }
  });

  it('no level, daily or Long Tape line shouts either', () => {
    for (const level of loadAll()) {
      for (const l of level.lines) {
        expect(l.text, `${level.id}: "${l.text}" is not lowercase`).toBe(l.text.toLowerCase());
        expect(l.text, `${level.id}: "${l.text}" shouts`).not.toContain('!');
      }
      expect(level.hint ?? '', `${level.id} hint shouts`).not.toContain('!');
    }
  });

  it('has no duplicate lines', () => {
    const texts = LINES.map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('fills in names', () => {
    expect(fillLine('{name} is gone.', 'kevin', 'kevin, the brave')).toBe('kevin is gone.');
    expect(fillLine('{full} is gone.', 'kevin', 'kevin, the brave')).toBe('kevin, the brave is gone.');
  });

  it('shows one line at a time and never repeats one inside a level', () => {
    const d = new LineDirector(7);
    const seen = new Set<string>();
    let t = 0;
    for (let i = 0; i < 200; i++) {
      t += config.lines.minGapMs + 10;
      const line = d.request({ trigger: 'idle' }, t);
      if (line === null) continue;
      expect(seen.has(line.text), `repeated "${line.text}"`).toBe(false);
      seen.add(line.text);
      d.tick(t + config.lines.displayMs + 1);
    }
    expect(seen.size).toBeGreaterThan(3);
  });

  it('enforces the minimum gap for ordinary lines', () => {
    const d = new LineDirector(1);
    expect(d.request({ trigger: 'idle' }, 0)).not.toBeNull();
    expect(d.request({ trigger: 'idle' }, 10)).toBeNull();
    expect(d.request({ trigger: 'turn' }, config.lines.minGapMs - 1)).toBeNull();
  });

  it('lets a high-priority reaction interrupt a low-priority line (SPEC 12.7)', () => {
    const d = new LineDirector(3);
    const idle = d.request({ trigger: 'idle' }, 0);
    expect(idle).not.toBeNull();
    // The Maw opening outranks idle chatter and cuts in immediately.
    const maw = d.request({ trigger: 'mawOpen' }, 50);
    expect(maw).not.toBeNull();
    expect(maw?.trigger).toBe('mawOpen');
  });

  it('U1: cracking unlocks extra lines and tightens the gap', () => {
    const steady = new LineDirector(11);
    const cracking = new LineDirector(11);
    cracking.setMood('cracking');

    // The tighter gap is live immediately.
    steady.request({ trigger: 'idle' }, 0);
    cracking.request({ trigger: 'idle' }, 0);
    const tAfterShortGap = config.lines.crackingGapMs + 1;
    expect(steady.request({ trigger: 'turn' }, tAfterShortGap)).toBeNull();
    expect(cracking.request({ trigger: 'turn' }, tAfterShortGap)).not.toBeNull();

    // And there are genuinely more things to say while cracking.
    const crackOnly = LINES.filter((l) => l.mood === 'cracking' || l.mood === 'panic');
    expect(crackOnly.length).toBeGreaterThan(5);
  });

  it('a scripted level line bypasses the line table', () => {
    const d = new LineDirector(5);
    const line = d.request({ trigger: 'idle', text: 'a bespoke line' }, 0);
    expect(line?.text).toBe('a bespoke line');
  });
});

// ----------------------------------------------------------------- names ---

describe('named Wicks (U7)', () => {
  it('deals names without repeats, then keeps going', () => {
    const d = new NameDealer(1);
    const seen = new Set<string>();
    for (let i = 0; i < WICK_NAMES.length; i++) {
      const n = d.next();
      expect(seen.has(n)).toBe(false);
      seen.add(n);
    }
    // Past the pool it must still produce something rather than undefined.
    expect(d.next()).toBeTruthy();
  });

  it('is seeded, so a Daily Tape has the same cast for everyone', () => {
    const a = new NameDealer(99);
    const b = new NameDealer(99);
    const c = new NameDealer(100);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    expect([c.next(), c.next(), c.next()]).not.toEqual(first);
  });

  it('awards titles only to survivors', () => {
    expect(titleForRunsSurvived(1)).toBeNull();
    expect(titleForRunsSurvived(2)).toBeTruthy();
    expect(titleForRunsSurvived(99)).toBeTruthy();
    expect(displayName('kevin', null)).toBe('kevin');
    expect(displayName('kevin', 'the twice-blessed')).toBe('kevin, the twice-blessed');
  });
});

// ----------------------------------------------------------------- rules ---

describe('candles, stamps and score (SPEC 9.2, 12.5)', () => {
  const level = loadAll()[0] as Level;

  it('awards candles by threshold', () => {
    expect(candlesFor(level, 0)).toBe(0);
    expect(candlesFor(level, level.candles[1])).toBe(1);
    expect(candlesFor(level, level.candles[2])).toBe(2);
    expect(candlesFor(level, level.candles[3])).toBe(3);
    expect(candlesFor(level, 999)).toBe(3);
  });

  const base: Omit<RunResult, 'stamp'> = {
    levelId: '01-1', label: 'T01/1', title: 'Warm', mode: 'story',
    spawned: 5, saved: 5, lost: 0, candles: 3, score: 100, mawWokeCount: 0,
    offerings: 0, bestProcession: 1, composureLeft: 1, composureLow: 1,
    lossesByCause: { maw: 0, void: 0, drip: 0, dark: 0, crawler: 0, moth: 0 },
    outcomes: [], elapsedMs: 1000, wave: 0, failed: false,
  };

  it('stamps LIGHTS OUT when nothing survived', () => {
    expect(stampFor({ ...base, saved: 0, lost: 5 })).toBe('LIGHTS OUT');
  });

  it('stamps COMPOSED for a flawless, steady run', () => {
    expect(stampFor(base)).toBe('COMPOSED');
  });

  it('stamps CRACKED when you saved everyone but nearly lost it', () => {
    expect(stampFor({ ...base, composureLow: 0.05, composureLeft: 0.3 })).toBe('CRACKED');
  });

  it('stamps THE MAW AWOKE when the mouth was the cause', () => {
    expect(
      stampFor({ ...base, saved: 4, lost: 1, lossesByCause: { ...base.lossesByCause, maw: 1 } }),
    ).toBe('THE MAW AWOKE');
  });

  it('unlocks THERMAL at the documented candle count', () => {
    expect(filterUnlocked('ink', 0)).toBe(true);
    expect(filterUnlocked('vhs', 0)).toBe(true);
    expect(filterUnlocked('thermal', THERMAL_UNLOCK_CANDLES - 1)).toBe(false);
    expect(filterUnlocked('thermal', THERMAL_UNLOCK_CANDLES)).toBe(true);
  });
});

// ---------------------------------------------------------------- scares ---

describe('scares (SPEC 10, invariants 4 and 5)', () => {
  const levels = loadAll();
  const on = { enabled: true, reducedEffects: false, segmentationAvailable: true };

  it('AC-9: with scares off, not one scare fires on any level', () => {
    for (const level of levels) {
      const d = new ScareDirector(level, { enabled: false, reducedEffects: false, segmentationAvailable: true });
      for (let t = 0; t <= level.timeLimitS * 1000 + 5000; t += 100) d.update(t);
      expect(d.firedTypes, `${level.id} fired a scare with scares off`).toHaveLength(0);
      expect(d.current).toBeNull();
    }
  });

  it('AC-9: the finale plays straight with scares off', () => {
    const off = new FaceLooksBack(1000, false);
    for (let t = 0; t < 10_000; t += 50) expect(off.update(t)).toBe(false);

    const onFinale = new FaceLooksBack(1000, true);
    let sawIt = false;
    for (let t = 0; t < 10_000; t += 50) if (onFinale.update(t)) sawIt = true;
    expect(sawIt).toBe(true);
  });

  it('does fire scares when they are on', () => {
    const level = levels.find((l) => l.scares.length > 0);
    expect(level).toBeDefined();
    if (level === undefined) return;
    const d = new ScareDirector(level, on);
    for (let t = 0; t <= level.timeLimitS * 1000; t += 50) d.update(t);
    expect(d.firedTypes.length).toBeGreaterThan(0);
  });

  it('invariant 4: reduced effects suppresses flicker specifically', () => {
    const level = levels.find((l) => l.scares.some((s) => s.type === 'flicker'));
    expect(level).toBeDefined();
    if (level === undefined) return;
    const d = new ScareDirector(level, { ...on, reducedEffects: true });
    for (let t = 0; t <= level.timeLimitS * 1000; t += 50) d.update(t);
    expect(d.firedTypes).not.toContain('flicker');
    expect(d.flickering).toBe(false);
  });

  it('never overlaps two scares, and respects the minimum gap', () => {
    const level = levels.find((l) => l.scares.length > 2);
    expect(level).toBeDefined();
    if (level === undefined) return;
    const d = new ScareDirector(level, on);
    const starts: number[] = [];
    for (let t = 0; t <= level.timeLimitS * 1000; t += 10) {
      const s = d.update(t);
      if (s !== null) starts.push(s.startedMs);
    }
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0);
      expect(gap).toBeGreaterThanOrEqual(config.scares.minGapMs);
    }
  });

  it('degrades behindYou to a flat figure when segmentation is too slow (SPEC 10.2)', () => {
    const level = levels.find((l) => l.scares.some((s) => s.type === 'behindYou'));
    expect(level).toBeDefined();
    if (level === undefined) return;
    const d = new ScareDirector(level, { ...on, segmentationAvailable: false });
    for (let t = 0; t <= level.timeLimitS * 1000; t += 50) d.update(t);
    expect(d.firedTypes).not.toContain('behindYou');
  });

  it('every scare has a bounded duration', () => {
    for (const t of ['flicker', 'whisper', 'figure', 'stinger', 'behindYou', 'faceLooksBack'] as const) {
      expect(scareDurationMs(t)).toBeGreaterThan(0);
      expect(scareDurationMs(t)).toBeLessThanOrEqual(2500);
    }
  });

  it('the finale override eases in and out rather than snapping', () => {
    expect(finaleBlendOverride(0).smile).toBeCloseTo(0, 6);
    expect(finaleBlendOverride(0.5).smile).toBeGreaterThan(0.5);
    expect(finaleBlendOverride(1).smile).toBeCloseTo(0, 6);
  });

  it('AC-9: a full world run with scares off produces no scare at all', () => {
    // The director is one half; this is the other - the real world loop, on the
    // finale level, asserting the whole path stays quiet.
    const level = levels.find((l) => l.id === '04-2');
    expect(level).toBeDefined();
    if (level === undefined) return;

    const d = new ScareDirector(level, { enabled: false, reducedEffects: false, segmentationAvailable: false });
    const finale = new FaceLooksBack(45_000, false);
    const world = new World({ level, tunables: defaultTunables(), seed: 1, endless: false });
    const stepMs = 1000 / config.physics.stepHz;

    for (let t = 0; t <= level.timeLimitS * 1000; t += stepMs) {
      world.step(stepMs);
      world.drain();
      expect(d.update(world.elapsedMs)).toBeNull();
      expect(finale.update(world.elapsedMs)).toBe(false);
      if (world.snapshot().over) break;
    }
    expect(d.firedTypes).toHaveLength(0);
  });
});

// ----------------------------------------------------------------- share ---

describe('progress (U7)', () => {
  const result: RunResult = {
    levelId: '01-1', label: 'T01/1', title: 'Warm', mode: 'story',
    stamp: 'THE MAW AWOKE',
    spawned: 3, saved: 2, lost: 1, candles: 2, score: 500, mawWokeCount: 1,
    offerings: 0, bestProcession: 1, composureLeft: 0.8, composureLow: 0.7,
    lossesByCause: { maw: 1, void: 0, drip: 0, dark: 0, crawler: 0, moth: 0 },
    outcomes: ['saved', 'saved', 'maw'], elapsedMs: 30_000, wave: 0, failed: false,
  };

  const roster = [
    { name: 'kevin', state: 'saved' },
    { name: 'agnes', state: 'saved' },
    { name: 'deborah', state: 'lost' },
  ];

  it('records candles and survivors', () => {
    const p = recordRun(structuredClone(EMPTY_PROGRESS), result, roster);
    expect(p.levels['01-1']?.candles).toBe(2);
    expect(p.survivors.kevin).toBe(1);
    expect(p.survivors.agnes).toBe(1);
    expect(p.survivors.deborah).toBeUndefined();
  });

  it('keeps the best candles, never downgrades them', () => {
    let p = recordRun(structuredClone(EMPTY_PROGRESS), { ...result, candles: 3 }, roster);
    p = recordRun(p, { ...result, candles: 1 }, roster);
    expect(p.levels['01-1']?.candles).toBe(3);
    expect(p.levels['01-1']?.attempts).toBe(2);
  });

  it('a Wick that dies loses its accumulated title', () => {
    let p = recordRun(structuredClone(EMPTY_PROGRESS), result, roster);
    expect(p.survivors.kevin).toBe(1);
    p = recordRun(p, result, [{ name: 'kevin', state: 'lost' }]);
    expect(p.survivors.kevin).toBeUndefined();
  });

  it('decision D12: only the first daily attempt is stored', () => {
    let p = recordDaily(structuredClone(EMPTY_PROGRESS), 17, result);
    expect(p.daily?.result.saved).toBe(2);
    p = recordDaily(p, 17, { ...result, saved: 3 });
    expect(p.daily?.result.saved).toBe(2);
    // A new day replaces it.
    p = recordDaily(p, 18, { ...result, saved: 3 });
    expect(p.daily?.day).toBe(18);
  });

  it('only improves the endless best', () => {
    let p = recordRun(structuredClone(EMPTY_PROGRESS), { ...result, mode: 'endless', score: 900, wave: 4 }, roster);
    expect(p.endlessBest.score).toBe(900);
    p = recordRun(p, { ...result, mode: 'endless', score: 100, wave: 1 }, roster);
    expect(p.endlessBest.score).toBe(900);
  });

});

describe('losing a tape (the fail condition)', () => {
  it('stamps TAPE LOST above every other reading of the run', () => {
    const r: Omit<RunResult, 'stamp'> = {
      levelId: '01-1', label: 'T01/1', title: 'Warm', mode: 'story',
      spawned: 10, saved: 4, lost: 6, candles: 1, score: 100, mawWokeCount: 0,
      offerings: 0, bestProcession: 1, composureLeft: 1, composureLow: 1,
      lossesByCause: { maw: 0, void: 6, drip: 0, dark: 0, crawler: 0, moth: 0 },
      outcomes: [], elapsedMs: 1000, wave: 0, failed: true,
    };
    expect(stampFor(r)).toBe('TAPE LOST');
    // Even a run that would otherwise have read as composed.
    expect(stampFor({ ...r, saved: 10, lost: 0, composureLeft: 1 })).toBe('TAPE LOST');
  });

  it('the threshold is more than half the roster', () => {
    expect(config.rules.failLossFraction).toBe(0.5);
    // Exactly half is survivable; one more is not. 10 Wicks: 5 lost is fine.
    const budget = Math.floor(10 * config.rules.failLossFraction);
    expect(budget).toBe(5);
    expect(5 > budget).toBe(false);
    expect(6 > budget).toBe(true);
  });

  it('holds the run open long enough for the scare to land', () => {
    // Headless runs (tests, soak) keep stepping after the fail; the app
    // freezes play and runs the Watcher sequence on its own clock.
    expect(config.rules.failHoldMs).toBeGreaterThan(0);
  });
});

// ------------------------------------------- resuming, exiting, the ending ---

describe('picking up where you left off', () => {
  it('CONTINUE resumes the first unfinished level, not the first level', () => {
    // The bug this covers: the title button always started 01-1, so a player
    // who had finished ten levels was dropped back into the tutorial.
    const done = new Set(['01-1', '01-2', '01-3']);
    expect(nextUnplayedLevelId(done)).toBe('01-4');

    expect(nextUnplayedLevelId(new Set())).toBe(ALL_LEVEL_IDS[0]);
    // Everything finished: nothing to resume, so the shelf is the destination.
    expect(nextUnplayedLevelId(new Set(ALL_LEVEL_IDS))).toBeNull();
  });

  it('only counts a level as completed once it has earned a candle', () => {
    const p: Progress = {
      ...structuredClone(EMPTY_PROGRESS),
      levels: {
        '01-1': { candles: 2, bestScore: 10, bestSaved: 2, attempts: 1 },
        // Attempted and failed: no candles, so it is still the next thing to play.
        '01-2': { candles: 0, bestScore: 0, bestSaved: 0, attempts: 4 },
      },
    };
    const done = completedLevelIds(p);
    expect(done.has('01-1')).toBe(true);
    expect(done.has('01-2')).toBe(false);
    expect(nextUnplayedLevelId(done)).toBe('01-2');
  });

  it('the ending card belongs to the narrative finale, not the last level on disk', () => {
    // Tape 05 is post-game content that unlocks after the story. Walking the
    // level list to find "the end" moved the credits onto a bonus level.
    expect(isStoryFinale(STORY_FINALE_ID)).toBe(true);
    expect(isStoryFinale('04-2')).toBe(true);

    const last = ALL_LEVEL_IDS[ALL_LEVEL_IDS.length - 1];
    expect(last).not.toBe(STORY_FINALE_ID);
    expect(isStoryFinale(last ?? '')).toBe(false);

    // And the finale is genuinely mid-list now, with a tape after it.
    expect(nextLevelId(STORY_FINALE_ID)).not.toBeNull();
  });

  it('the bonus tape unlocks exactly when the story ends', () => {
    const throughTape4 = new Set(
      TAPES.filter((t) => t.number <= 4).flatMap((t) => t.levelIds),
    );
    expect(isTapeUnlocked(5, throughTape4)).toBe(true);

    const missingFinale = new Set([...throughTape4].filter((id) => id !== STORY_FINALE_ID));
    expect(isTapeUnlocked(5, missingFinale)).toBe(false);
  });
});

// ----------------------------------------------------- config and tokens ---

describe('config hygiene (AC-2) and flash safety (AC-6)', () => {
  /** Walks config, yielding every leaf path. */
  function* leaves(obj: unknown, path: string[] = []): Generator<{ path: string[]; value: unknown }> {
    if (typeof obj !== 'object' || obj === null) {
      yield { path, value: obj };
      return;
    }
    if (Array.isArray(obj)) return; // declarative lists, not tunables
    for (const [k, v] of Object.entries(obj)) yield* leaves(v, [...path, k]);
  }

  /**
   * The unit may sit on the leaf (`walkSpeedFhPerS`) or on the group that owns
   * it (`drainPerS.laughing`, `costCandles.tallowShell`), so the whole path is
   * searched, case-insensitively. A key like `wick.speed` still fails, which is
   * the point: CLAUDE.md section 6 requires a unit in the name or the comment.
   */
  const UNIT_TOKENS = [
    'ms', 'hz', 'fh', 'fhpers', 'fhpers2', 'deg', 'px', 'dbfs', 'seconds', 'persecond',
    'units', 'multiple', 'fraction', 'alpha', 'beta', 'gain', 'depth', 'ratio', 'aspect',
    'width', 'height', 'radius', 'count', 'cost', 'score', 'bonus', 'volume', 'fps',
    'restitution', 'friction', 'decay', 'limit', 'steps', 'saves', 'allowed', 'templates',
    'date', 'url', 'wave', 'threshold', 'range', 'ceiling', 'max', 'min', 'per', 'from',
  ];

  it('every numeric config key carries a unit somewhere in its path', () => {
    const missing: string[] = [];
    for (const { path, value } of leaves(config)) {
      if (typeof value !== 'number') continue;
      const key = path[path.length - 1] ?? '';
      // Numeric map keys (candle tiers) are indices, not quantities.
      if (/^\d+$/.test(key)) continue;
      const joined = path.join('.').toLowerCase();
      if (!UNIT_TOKENS.some((u) => joined.includes(u))) missing.push(path.join('.'));
    }
    expect(missing, `config keys without a unit in the name: ${missing.join(', ')}`).toEqual([]);
  });

  it('the unit check has teeth', () => {
    // Proof the test above would actually fail on an unlabelled key.
    const joined = 'wick.speed'.toLowerCase();
    expect(UNIT_TOKENS.some((u) => joined.includes(u))).toBe(false);
  });

  it('every number is finite and non-negative where that is meaningful', () => {
    for (const { path, value } of leaves(config)) {
      if (typeof value !== 'number') continue;
      expect(Number.isFinite(value), `${path.join('.')} is not finite`).toBe(true);
      if (!path.join('.').includes('Dbfs')) {
        expect(value, `${path.join('.')} is negative`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('AC-6: no declared effect may flash more than 3 times a second', () => {
    const budget = flashBudget();
    expect(Object.keys(budget).length).toBeGreaterThan(4);
    for (const [name, hz] of Object.entries(budget)) {
      expect(hz, `${name} declares ${hz} Hz`).toBeLessThanOrEqual(3);
    }
  });

  it('AC-6: reduced effects disables everything that can flash', () => {
    const disabled = new Set<string>(config.render.reducedEffectsDisables);
    for (const [name, hz] of Object.entries(flashBudget())) {
      if (hz > 0) expect(disabled.has(name), `${name} flashes but is not disabled`).toBe(true);
    }
  });

  it('audio stays under the limiter and gives scares a real attack', () => {
    expect(config.audio.limiterCeilingDbfs).toBeLessThanOrEqual(-6);
    expect(config.audio.scareMinAttackMs).toBeGreaterThanOrEqual(30);
  });

  it('settings default to the safe, private choices', () => {
    // Invariant 3: recording is off until the player asks for it.
    expect(DEFAULT_SETTINGS.recording).toBe(false);
    // U10: the first run needs no camera.
    expect(DEFAULT_SETTINGS.controls).toBe('assist');
    expect(DEFAULT_SETTINGS.noticeSeen).toBe(false);
  });

  it('the Pixi tokens and the CSS variables agree (SPEC 12.2)', () => {
    const css = readFileSync(join(ROOT, 'src', 'ui', 'tokens.css'), 'utf8');
    const map: Record<string, string> = {
      void: '--void',
      ink: '--ink',
      rot: '--rot',
      blood: '--blood',
      bone: '--bone',
      boneDim: '--bone-dim',
      candle: '--candle',
      ember: '--ember',
      rec: '--rec',
      mold: '--mold',
      wax: '--wax',
    };
    for (const [token, cssVar] of Object.entries(map)) {
      const want = hex(tokens[token as keyof typeof tokens]);
      const found = new RegExp(`${cssVar}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
      expect(found, `${cssVar} is missing from tokens.css`).not.toBeNull();
      expect(found?.[1]?.toLowerCase(), `${cssVar} does not match tokens.ts`).toBe(want);
    }
  });
});

// --------------------------------------------------------------- credits ---

describe('AC-13: credits', () => {
  const creditsPath = join(ROOT, 'docs', 'CREDITS.md');

  it('CREDITS.md exists', () => {
    expect(existsSync(creditsPath)).toBe(true);
  });

  it('every self-hosted font is credited with a licence', () => {
    const credits = readFileSync(creditsPath, 'utf8');
    const fontDir = join(ROOT, 'public', 'fonts');
    if (!existsSync(fontDir)) return; // not set up yet; the build script covers it
    for (const file of readdirSync(fontDir).filter((f) => f.endsWith('.woff2'))) {
      expect(credits, `${file} is not in CREDITS.md`).toContain(file);
    }
    for (const licence of ['OFL', 'Apache']) expect(credits).toContain(licence);
  });

  it('there are no audio files to credit, because every sound is synthesised', () => {
    const audioDir = join(ROOT, 'public', 'audio');
    const files = existsSync(audioDir) ? readdirSync(audioDir).filter((f) => /\.(ogg|mp3|wav|m4a)$/.test(f)) : [];
    expect(files, 'audio files appeared; they must be listed in CREDITS.md').toEqual([]);
    expect(readFileSync(creditsPath, 'utf8')).toContain('synthesised');
  });

  it('the MediaPipe model is credited', () => {
    expect(readFileSync(creditsPath, 'utf8')).toContain('face_landmarker.task');
  });
});

// ----------------------------------------------------------------- misc ----

describe('the seeded PRNG', () => {
  it('is deterministic and uniform enough for level generation', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());

    const r = new Rng(7);
    let sum = 0;
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20_000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
      buckets[Math.floor(v * 10)] = (buckets[Math.floor(v * 10)] ?? 0) + 1;
    }
    expect(sum / 20_000).toBeCloseTo(0.5, 2);
    for (const n of buckets) expect(n).toBeGreaterThan(1500);
  });

  it('range, int and pick stay in bounds', () => {
    const r = new Rng(3);
    for (let i = 0; i < 500; i++) {
      const v = r.range(-2, 5);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(5);
      const n = r.int(0, 4);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    }
  });
});

describe('buildResult ties the systems together', () => {
  it('turns a finished world into a result', () => {
    const level = loadAll().find((l) => l.id === '01-1') as Level;
    const world = new World({ level, tunables: defaultTunables(), seed: 5, endless: false });
    const stepMs = 1000 / config.physics.stepHz;
    for (let t = 0; t <= level.timeLimitS * 1000; t += stepMs) {
      world.step(stepMs);
      world.drain();
      if (world.snapshot().over) break;
    }
    const result = buildResult(level, world.snapshot(), world.finalScore());
    expect(result.levelId).toBe('01-1');
    expect(result.spawned).toBe(level.spawn.count);
    expect(result.outcomes).toHaveLength(result.spawned);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
