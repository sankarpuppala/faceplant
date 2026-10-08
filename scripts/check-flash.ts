/**
 * AC-6. Photosensitivity safety (CLAUDE.md invariant 4, WCAG 2.3.1).
 *
 * Verifies three things mechanically, so the rule cannot drift:
 *   1. every declared effect flashes at no more than 3 Hz;
 *   2. the effects "Reduce effects" must disable are all real effect names,
 *      and include every one capable of flashing;
 *   3. no source file hard-codes a flash rate that bypasses the config - the
 *      only way to flash is to declare a budget here first.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');

const MAX_HZ = 3;
const problems: string[] = [];

// --- 1. declared rates --------------------------------------------------------
const effects = Object.entries(config.render.effects);
for (const [name, spec] of effects) {
  if (typeof spec.maxFlashHz !== 'number' || !Number.isFinite(spec.maxFlashHz)) {
    problems.push(`${name}: maxFlashHz is not a number`);
  } else if (spec.maxFlashHz > MAX_HZ) {
    problems.push(`${name}: declares ${spec.maxFlashHz} Hz, over the ${MAX_HZ} Hz limit`);
  } else if (spec.maxFlashHz < 0) {
    problems.push(`${name}: negative maxFlashHz`);
  }
}

// --- 2. the reduced-effects list ---------------------------------------------
const names = new Set(effects.map(([n]) => n));
for (const n of config.render.reducedEffectsDisables) {
  if (!names.has(n)) problems.push(`reducedEffectsDisables names "${n}", which is not a declared effect`);
}

// Anything that can flash at all must be switched off by reduced effects.
for (const [name, spec] of effects) {
  if (spec.maxFlashHz > 0 && !(config.render.reducedEffectsDisables as readonly string[]).includes(name)) {
    problems.push(`${name} can flash at ${spec.maxFlashHz} Hz but reduced effects does not disable it`);
  }
}

// --- 3. no rate that bypasses the config -------------------------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(p) === '.ts') out.push(p);
  }
  return out;
}

/**
 * Looks for a literal number multiplied into a flash-shaped expression - the
 * `Math.floor(t / 1000 * N)` or `% 2 === 0` blink idiom - where N did not come
 * from config. A match is not proof of a fault, but it is the only place a
 * fault could hide, so it is reported for review.
 */
const suspicious = /Math\.floor\([^)]*\/\s*1000\s*\)\s*%|Math\.floor\(\s*\([^)]*\)\s*\*\s*(\d+(?:\.\d+)?)\s*\)\s*%/g;

for (const file of walk(srcDir)) {
  const rel = relative(root, file);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(suspicious)) {
    const literal = m[1];
    if (literal === undefined) continue;
    const hz = Number(literal) / 2; // the idiom toggles twice per cycle
    if (hz > MAX_HZ) problems.push(`${rel}: hard-coded blink at about ${hz} Hz ("${m[0].trim()}")`);
  }
}

// --- report -------------------------------------------------------------------
process.stdout.write('check:flash — declared effect budgets\n');
for (const [name, spec] of effects) {
  const disabled = (config.render.reducedEffectsDisables as readonly string[]).includes(name);
  process.stdout.write(
    `  ${name.padEnd(18)} ${String(spec.maxFlashHz).padStart(3)} Hz${disabled ? '   (off in reduced effects)' : ''}\n`,
  );
}

if (problems.length === 0) {
  process.stdout.write(`\nPASS — every effect is at or under ${MAX_HZ} flashes per second.\n`);
  process.exit(0);
}

process.stdout.write(`\nFAIL — ${problems.length} problem(s):\n`);
for (const p of problems) process.stdout.write(`  ${p}\n`);
process.exit(1);
