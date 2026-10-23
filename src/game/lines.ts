/**
 * Wick speech (SPEC sections 12.6, 12.7; docs/OVERHAUL.md section 4).
 *
 * Voice: short, quiet, wrong. Lowercase whispers, no jokes, no exclamation
 * marks, never gory. They are small candle-headed things standing on a
 * mountain that breathes, and the mountain is your face. They have noticed
 * something about it that you have not.
 *
 * U1 `mood`: a line can require that the player is already cracking. Hold a
 * still face and the Wicks stay hushed. Start to go and they say more, and
 * worse. `mood: 'any'` lines play at any time.
 */

import type { ComposureMood } from './composure.ts';

export type LineTrigger =
  | 'spawn'
  | 'idle'
  | 'smiling'
  | 'browsUp'
  | 'leaningIn'
  | 'mawOpen'
  | 'mawClosed'
  | 'laughing'
  | 'gasp'
  | 'saved'
  | 'swallowed'
  | 'lostOther'
  | 'rail'
  | 'flick'
  | 'quake'
  | 'dark'
  | 'crawler'
  | 'moth'
  | 'offering'
  | 'procession'
  | 'yawn'
  | 'blinkBridge'
  | 'turn'
  | 'stuck'
  | 'watcher'
  | 'finale';

export interface Line {
  trigger: LineTrigger;
  text: string;
  /** 'any', or the mood this line is reserved for. */
  mood: ComposureMood | 'any';
  /** Higher wins when several lines are eligible. */
  weight?: number;
}

/**
 * `{name}` is replaced with the Wick's name, `{full}` with name and title.
 * SPEC section 12.7 asks for at least 60.
 */
export const LINES: readonly Line[] = [
  // --- arriving ------------------------------------------------------------
  { trigger: 'spawn', text: "it's warm here.", mood: 'any', weight: 3 },
  { trigger: 'spawn', text: 'it is breathing.', mood: 'any', weight: 2 },
  { trigger: 'spawn', text: "don't breathe.", mood: 'any', weight: 2 },
  { trigger: 'spawn', text: 'i am {name}. remember me.', mood: 'any' },
  { trigger: 'spawn', text: 'the ground is soft. it should not be soft.', mood: 'any' },
  { trigger: 'spawn', text: 'we walk. we do not look up.', mood: 'any' },
  { trigger: 'spawn', text: 'it was asleep before we came.', mood: 'any' },
  { trigger: 'spawn', text: 'it knows how many of us there are.', mood: 'cracking' },

  // --- stuck: the one line that is really an instruction ------------------
  // A Wick pacing a dead end under the chin is invisible otherwise, and
  // tilting the head - which frees them - is not something a player thinks
  // to try at a problem they cannot see.
  { trigger: 'stuck', text: 'we are walled in. tip the mountain.', mood: 'any', weight: 3 },
  { trigger: 'stuck', text: 'something under the chin.', mood: 'any', weight: 2 },
  { trigger: 'stuck', text: 'lean. any way. please.', mood: 'any', weight: 2 },
  { trigger: 'stuck', text: 'we have walked this edge before.', mood: 'any' },
  { trigger: 'stuck', text: 'tilt your head. we cannot get out.', mood: 'cracking', weight: 2 },

  // --- waiting -------------------------------------------------------------
  { trigger: 'idle', text: "don't blink.", mood: 'any' },
  { trigger: 'idle', text: 'it is listening.', mood: 'any' },
  { trigger: 'idle', text: 'something behind its eyes moved.', mood: 'any', weight: 2 },
  { trigger: 'idle', text: 'walk softly on the nose.', mood: 'any' },
  { trigger: 'idle', text: 'the mouth is closed. keep it closed.', mood: 'any' },
  { trigger: 'idle', text: 'it is holding very still. so are we.', mood: 'steady' },
  { trigger: 'idle', text: 'quiet. it hears the quiet.', mood: 'steady' },
  { trigger: 'idle', text: 'there was a light behind us. now there is not.', mood: 'steady' },
  { trigger: 'idle', text: 'it is counting us.', mood: 'cracking' },
  { trigger: 'idle', text: 'the mountain has a smell. warm. like breath.', mood: 'any' },

  // --- expressions ---------------------------------------------------------
  { trigger: 'smiling', text: 'it is smiling.', mood: 'any', weight: 3 },
  { trigger: 'smiling', text: 'the corners went up.', mood: 'any' },
  { trigger: 'smiling', text: 'stop that.', mood: 'any' },
  { trigger: 'smiling', text: 'a smile is a mouth getting ready.', mood: 'cracking', weight: 2 },
  { trigger: 'smiling', text: 'keep the face flat. flat.', mood: 'panic', weight: 3 },

  { trigger: 'browsUp', text: 'the cliffs moved.', mood: 'any', weight: 3 },
  { trigger: 'browsUp', text: 'hold on, {name}.', mood: 'any' },
  { trigger: 'browsUp', text: 'it saw something.', mood: 'any' },
  { trigger: 'browsUp', text: 'what is it looking at.', mood: 'cracking' },

  { trigger: 'leaningIn', text: 'it comes closer.', mood: 'any', weight: 2 },
  { trigger: 'leaningIn', text: 'the world is getting bigger.', mood: 'any' },
  { trigger: 'leaningIn', text: 'it wants to see us.', mood: 'any' },

  // --- the maw -------------------------------------------------------------
  { trigger: 'mawOpen', text: 'the mouth is open.', mood: 'any', weight: 4 },
  { trigger: 'mawOpen', text: 'it is warm in there. do not look.', mood: 'any' },
  { trigger: 'mawOpen', text: 'walk away from it. slowly.', mood: 'any' },
  { trigger: 'mawOpen', text: 'the bridge is gone. the bridge was the lip.', mood: 'any', weight: 2 },
  { trigger: 'mawOpen', text: 'i can hear it swallow.', mood: 'cracking' },
  { trigger: 'mawClosed', text: 'it closed. we do not trust it.', mood: 'any' },
  { trigger: 'mawClosed', text: 'the lip is back.', mood: 'any' },

  { trigger: 'laughing', text: 'it is laughing.', mood: 'any', weight: 4 },
  { trigger: 'laughing', text: 'why is it laughing.', mood: 'any', weight: 2 },
  { trigger: 'laughing', text: 'the ground is shaking with it.', mood: 'cracking', weight: 3 },
  { trigger: 'laughing', text: 'that is the sound it makes before it eats.', mood: 'cracking' },
  { trigger: 'laughing', text: 'please stop.', mood: 'panic', weight: 4 },

  { trigger: 'gasp', text: 'it gasped. what did it see.', mood: 'any', weight: 2 },
  { trigger: 'gasp', text: 'it saw it too.', mood: 'any' },
  { trigger: 'gasp', text: 'if it is afraid, we should be.', mood: 'cracking' },

  { trigger: 'yawn', text: 'it opened on its own.', mood: 'any', weight: 4 },
  { trigger: 'yawn', text: 'it is not asking you any more.', mood: 'any', weight: 3 },
  { trigger: 'yawn', text: 'you let go of it.', mood: 'panic', weight: 3 },

  // --- terrain -------------------------------------------------------------
  { trigger: 'rail', text: 'the nose slopes to the mouth.', mood: 'any', weight: 3 },
  { trigger: 'rail', text: 'this way goes down. down is the mouth.', mood: 'any', weight: 2 },
  { trigger: 'rail', text: 'we are sliding.', mood: 'any' },
  { trigger: 'rail', text: 'it is tipping us toward it.', mood: 'cracking' },

  { trigger: 'flick', text: 'it threw me.', mood: 'any', weight: 3 },
  { trigger: 'flick', text: 'i am in the air. it is cold up here.', mood: 'any', weight: 2 },
  { trigger: 'flick', text: 'i saw the top of its head.', mood: 'any' },

  { trigger: 'quake', text: 'it moved.', mood: 'any', weight: 3 },
  { trigger: 'quake', text: 'hold on to it.', mood: 'any' },
  { trigger: 'quake', text: 'be still. be still. be still.', mood: 'cracking', weight: 2 },

  { trigger: 'turn', text: 'a long way down.', mood: 'any' },
  { trigger: 'turn', text: 'not that way.', mood: 'any' },

  { trigger: 'blinkBridge', text: 'the lid is shut. cross.', mood: 'any', weight: 3 },
  { trigger: 'blinkBridge', text: 'cross while it cannot see.', mood: 'any', weight: 2 },
  { trigger: 'blinkBridge', text: 'if it opens its eye now, i am in the eye.', mood: 'cracking' },

  // --- hazards -------------------------------------------------------------
  { trigger: 'dark', text: 'the dark is closer.', mood: 'any', weight: 2 },
  { trigger: 'dark', text: 'i cannot see it. i can feel it breathing.', mood: 'any' },
  { trigger: 'crawler', text: 'something else lives here.', mood: 'any', weight: 3 },
  { trigger: 'crawler', text: 'it has too many legs.', mood: 'any' },
  { trigger: 'crawler', text: 'give it to the mouth.', mood: 'any', weight: 2 },
  { trigger: 'moth', text: 'a moth. it wants the light.', mood: 'any', weight: 3 },
  { trigger: 'moth', text: 'breathe on it. only on it.', mood: 'any', weight: 2 },
  { trigger: 'moth', text: 'it is landing on {name}.', mood: 'any' },

  // --- the offering (U2) ---------------------------------------------------
  { trigger: 'offering', text: 'it ate the other thing.', mood: 'any', weight: 4 },
  { trigger: 'offering', text: 'it was fed. it is quiet for now.', mood: 'any', weight: 3 },
  { trigger: 'offering', text: 'we used the mouth. we should not have.', mood: 'any' },

  // --- the procession (U3) -------------------------------------------------
  { trigger: 'procession', text: 'stay close. the light is bigger together.', mood: 'any', weight: 3 },
  { trigger: 'procession', text: 'more of us. more of it shows.', mood: 'any', weight: 2 },
  { trigger: 'procession', text: 'i can see its skin now.', mood: 'any' },

  // --- outcomes ------------------------------------------------------------
  { trigger: 'saved', text: 'through. do not look back.', mood: 'any', weight: 3 },
  { trigger: 'saved', text: '{name} is through.', mood: 'any', weight: 2 },
  { trigger: 'saved', text: 'the door was real.', mood: 'any' },
  { trigger: 'saved', text: 'it let one go.', mood: 'any' },

  { trigger: 'swallowed', text: '{name} is gone.', mood: 'any', weight: 4 },
  { trigger: 'swallowed', text: 'it took {name}. it did not chew.', mood: 'any', weight: 2 },
  { trigger: 'swallowed', text: 'we heard {name} go down.', mood: 'any', weight: 2 },
  { trigger: 'swallowed', text: 'that was your mouth. that was {name}.', mood: 'cracking', weight: 3 },

  { trigger: 'lostOther', text: '{name} went out.', mood: 'any', weight: 3 },
  { trigger: 'lostOther', text: 'one less light.', mood: 'any', weight: 2 },
  { trigger: 'lostOther', text: 'the dark took {name}.', mood: 'any' },

  // --- THE WATCHER: the Watcher itself never speaks; these are the Wicks ---
  { trigger: 'watcher', text: 'it saw me.', mood: 'any', weight: 5 },
  { trigger: 'watcher', text: 'it is behind you.', mood: 'any', weight: 4 },
  { trigger: 'watcher', text: 'that is what was under the face.', mood: 'any', weight: 3 },

  // --- the finale (SPEC 10.3) ---------------------------------------------
  { trigger: 'finale', text: 'that is not the face.', mood: 'any', weight: 5 },
  { trigger: 'finale', text: 'it moved without you.', mood: 'any', weight: 4 },
  { trigger: 'finale', text: 'do not tell it we noticed.', mood: 'any', weight: 2 },
];

/** Written on the ruins (SPEC section 4). Carved, so capitals. */
export const RUIN_LORE: readonly string[] = [
  'IT SAW US.',
  'DO NOT BREATHE.',
  'THE MOUTH REMEMBERS.',
  'WE TRUSTED THE FACE.',
  'SOMETHING UNDER THE CHIN.',
  'DO NOT STAND IN THE EYE.',
];

/** The whisper scare's line: the voice at the edge of the frame, not one Wick. */
export const WHISPER_LINE = 'it can see us.';

export function fillLine(text: string, name: string, full: string): string {
  return text.replaceAll('{full}', full).replaceAll('{name}', name);
}
