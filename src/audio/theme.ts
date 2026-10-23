/**
 * The menu theme, as data.
 *
 * The title screen was silent until a level started. The game is a cursed
 * camcorder tape and a tape that plays *nothing* while you sit on its label
 * is not atmospheric, it is just empty. This is the music that plays under
 * the title, the shelf and the shop: a slow music-box lullaby over a low
 * pad that never quite resolves.
 *
 * It is synthesized, like every sound in the game (`sound.ts`), so there is no
 * file to license, host or download - CLAUDE.md invariant 10 is satisfied by
 * there being nothing third-party in it. This module holds only the score, so
 * it can be tested without an AudioContext.
 *
 * Key and mood: A minor, with the chord progression Am - F - Dm - E. The last
 * chord is E *major* (a G sharp), the dominant, which pulls hard back to A and
 * is exactly the chord a lullaby uses right before it turns out to be a threat.
 * On every second pass the closing phrase slips a semitone flat, so the loop
 * is never quite the same loop twice.
 */

export const THEME_BPM = 52;
export const THEME_BEAT_S = 60 / THEME_BPM;
export const BEATS_PER_CHORD = 8;
export const THEME_BEATS = BEATS_PER_CHORD * 4;

/** MIDI note numbers, three voices each, low and close. */
export const THEME_CHORDS: readonly (readonly number[])[] = [
  [45, 48, 52], // Am  A2 C3 E3
  [41, 45, 48], // F   F2 A2 C3
  [38, 41, 45], // Dm  D2 F2 A2
  [40, 44, 47], // E   E2 G#2 B2
];

/**
 * One music-box note per beat or a rest, across four chords of eight beats.
 * Sparse on purpose: the gaps are where the room sounds back.
 */
export const THEME_MELODY: readonly (number | null)[] = [
  // Am
  81, null, 76, null, 72, null, 76, null,
  // F
  77, null, 81, null, 77, null, 72, null,
  // Dm
  74, null, 77, null, 81, null, 77, null,
  // E
  80, null, 83, null, 80, null, 76, null,
];

export function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

/** The chord sounding on a given beat of the loop. */
export function chordAt(beat: number): readonly number[] {
  const bar = Math.floor(beat / BEATS_PER_CHORD) % THEME_CHORDS.length;
  return THEME_CHORDS[bar] ?? [];
}

/** True on the first beat of a chord, where the pad changes. */
export function chordStartsAt(beat: number): boolean {
  return beat % BEATS_PER_CHORD === 0;
}

/**
 * The melody note for a beat, or null for a rest. On odd passes the last four
 * beats drop a semitone: the lullaby going slightly wrong.
 */
export function melodyAt(beat: number): number | null {
  const inLoop = ((beat % THEME_BEATS) + THEME_BEATS) % THEME_BEATS;
  const note = THEME_MELODY[inLoop] ?? null;
  if (note === null) return null;
  const pass = Math.floor(beat / THEME_BEATS);
  const closing = inLoop >= THEME_BEATS - 4;
  return pass % 2 === 1 && closing ? note - 1 : note;
}

/** A slow breath of wind through the room, every sixteen beats. */
export function windSwellAt(beat: number): boolean {
  return beat % 16 === 4;
}

/** A far-off whisper, once per loop, right after the dominant arrives. */
export function whisperAt(beat: number): boolean {
  return beat % THEME_BEATS === 26;
}
