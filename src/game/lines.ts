/**
 * Wick speech (SPEC sections 3.3, 12.6, 12.7).
 *
 * Voice: lowercase whispers, deadpan, devout, a little judgemental. Never
 * cruel, never gory. They are a tiny nervous people standing on a mountain
 * that they believe dreams, and the mountain is your face.
 *
 * U1 adds `mood`: a line can require that the player is already cracking.
 * Hold a perfect face and the Wicks stay reverent and unsettling. Start to go,
 * and they pile on - the game spends your composure at you, and it gets better
 * at it the closer you are to losing. `mood: 'any'` lines play at any time.
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
 * 100 lines; SPEC section 12.7 asks for at least 60.
 */
export const LINES: readonly Line[] = [
  // --- arriving ------------------------------------------------------------
  { trigger: 'spawn', text: '…warm.', mood: 'any', weight: 3 },
  { trigger: 'spawn', text: 'the mountain is warm today.', mood: 'any' },
  { trigger: 'spawn', text: 'do not wake the maw.', mood: 'any', weight: 2 },
  { trigger: 'spawn', text: 'i am {name}. i will be brief.', mood: 'any' },
  { trigger: 'spawn', text: 'it breathes. i had hoped it would not.', mood: 'any' },
  { trigger: 'spawn', text: 'soft ground. unsettling.', mood: 'any' },
  { trigger: 'spawn', text: 'we walk. we do not ask why.', mood: 'any' },
  { trigger: 'spawn', text: 'the face is kind. the face is kind. the face is kind.', mood: 'cracking' },

  // --- being watched -------------------------------------------------------
  // Stuck. The one line in the game that is really an instruction: a Wick
  // pacing a dead end under the chin is invisible otherwise, and tilting the
  // head - which frees them, and is the whole premise of the game - is not
  // something a player thinks to try at a problem they cannot see.
  { trigger: 'stuck', text: 'we are walled in. tip the mountain.', mood: 'any', weight: 3 },
  { trigger: 'stuck', text: 'this is a basin. we have surveyed it. twice.', mood: 'any' },
  { trigger: 'stuck', text: 'lean, please. any direction. we are not fussy.', mood: 'any', weight: 2 },
  { trigger: 'stuck', text: 'under the chin. nobody comes back from under the chin.', mood: 'any' },
  { trigger: 'stuck', text: 'we have been here before. several times. just now.', mood: 'any' },
  { trigger: 'stuck', text: 'tilt your head. we will wait. we have no choice.', mood: 'cracking', weight: 2 },

  { trigger: 'idle', text: 'do not blink. or do. we do not know what blinking does.', mood: 'any' },
  { trigger: 'idle', text: 'we trust the face.', mood: 'any' },
  { trigger: 'idle', text: 'it smiles before it eats.', mood: 'any' },
  { trigger: 'idle', text: 'walk softly on the nose.', mood: 'any' },
  { trigger: 'idle', text: 'something is watching us from behind its eyes.', mood: 'any' },
  { trigger: 'idle', text: 'this is the stillest it has ever been. suspicious.', mood: 'steady' },
  { trigger: 'idle', text: 'nothing is happening. nothing is happening.', mood: 'steady' },
  { trigger: 'idle', text: 'it is holding very still. it knows we are here.', mood: 'steady' },
  { trigger: 'idle', text: 'is it alive? vote later.', mood: 'any' },
  { trigger: 'idle', text: 'the elders said the mountain had pores. they were right.', mood: 'any' },

  // --- expressions ---------------------------------------------------------
  { trigger: 'smiling', text: 'it is smiling. why is it smiling.', mood: 'any', weight: 3 },
  { trigger: 'smiling', text: 'the corners went up. that is never good.', mood: 'any' },
  { trigger: 'smiling', text: 'stop that.', mood: 'any' },
  { trigger: 'smiling', text: 'it finds us amusing. we find this ominous.', mood: 'any' },
  { trigger: 'smiling', text: 'a smile is just the maw practising.', mood: 'cracking', weight: 2 },
  { trigger: 'smiling', text: 'no. no. keep the face flat. FLAT.', mood: 'panic', weight: 3 },

  { trigger: 'browsUp', text: 'the cliffs moved!', mood: 'any', weight: 3 },
  { trigger: 'browsUp', text: 'the ledges rise. hold on, {name}.', mood: 'any' },
  { trigger: 'browsUp', text: 'surprise is a kind of earthquake.', mood: 'any' },
  { trigger: 'browsUp', text: 'who authorised the cliffs to do that.', mood: 'cracking' },

  { trigger: 'leaningIn', text: 'it comes closer…', mood: 'any', weight: 2 },
  { trigger: 'leaningIn', text: 'the world is growing. this is fine.', mood: 'any' },
  { trigger: 'leaningIn', text: 'it wants a better look at us. let it.', mood: 'any' },

  // --- the maw -------------------------------------------------------------
  { trigger: 'mawOpen', text: 'THE MAW STIRS', mood: 'any', weight: 4 },
  { trigger: 'mawOpen', text: 'the hunger. the hunger is open.', mood: 'any' },
  { trigger: 'mawOpen', text: 'everyone walk the other way. calmly. calmly!', mood: 'any' },
  { trigger: 'mawOpen', text: 'the bridge is gone! the bridge was the lip!', mood: 'any', weight: 2 },
  { trigger: 'mawOpen', text: 'i can see the inside of the mountain. it is pink.', mood: 'cracking' },
  { trigger: 'mawClosed', text: 'the bridge returns. praise the lip.', mood: 'any' },
  { trigger: 'mawClosed', text: 'it has closed. we do not relax.', mood: 'any' },

  { trigger: 'laughing', text: 'it is laughing. we are not safe.', mood: 'any', weight: 4 },
  { trigger: 'laughing', text: 'what is funny. tell us what is funny.', mood: 'any', weight: 2 },
  { trigger: 'laughing', text: 'the mountain is convulsing with joy. we are dying.', mood: 'cracking', weight: 3 },
  { trigger: 'laughing', text: 'this is the sound it makes before supper.', mood: 'cracking' },
  { trigger: 'laughing', text: 'WE ARE BEING ENJOYED', mood: 'panic', weight: 4 },

  { trigger: 'gasp', text: 'it gasped. something frightened the mountain.', mood: 'any', weight: 2 },
  { trigger: 'gasp', text: 'what did it see. what did it SEE.', mood: 'any' },
  { trigger: 'gasp', text: 'if the mountain is afraid, we should be afraid.', mood: 'cracking' },

  { trigger: 'yawn', text: 'it opened on its own. it is not even trying now.', mood: 'any', weight: 4 },
  { trigger: 'yawn', text: 'the maw yawns. the maw does not need permission.', mood: 'any', weight: 3 },
  { trigger: 'yawn', text: 'this is what losing composure looks like from in here.', mood: 'panic', weight: 3 },

  // --- terrain -------------------------------------------------------------
  { trigger: 'rail', text: 'big nose. good slide.', mood: 'any', weight: 3 },
  { trigger: 'rail', text: 'weeeee— oh. oh no, this goes toward the maw.', mood: 'any', weight: 2 },
  { trigger: 'rail', text: 'the nose is a road and the road is downhill.', mood: 'any' },
  { trigger: 'rail', text: 'why did the elders call this a blessing.', mood: 'cracking' },

  { trigger: 'flick', text: 'i am flying. i did not consent to flying.', mood: 'any', weight: 3 },
  { trigger: 'flick', text: 'the cliff threw me! the cliff THREW me!', mood: 'any', weight: 2 },
  { trigger: 'flick', text: 'tell my family i went up.', mood: 'any' },

  { trigger: 'quake', text: 'it moved! everyone hold the mountain!', mood: 'any', weight: 3 },
  { trigger: 'quake', text: 'quake. quake. this is a quake.', mood: 'any' },
  { trigger: 'quake', text: 'stand still, mountain. we are begging.', mood: 'cracking', weight: 2 },

  { trigger: 'turn', text: 'that is a long way down. i choose not to.', mood: 'any' },
  { trigger: 'turn', text: 'the edge. we do not do edges.', mood: 'any' },

  { trigger: 'blinkBridge', text: 'the lid! the lid is a bridge! go, go!', mood: 'any', weight: 3 },
  { trigger: 'blinkBridge', text: 'cross while it is not looking. that is the whole plan.', mood: 'any', weight: 2 },
  { trigger: 'blinkBridge', text: 'if it opens its eye now i am in the eye.', mood: 'cracking' },

  // --- hazards -------------------------------------------------------------
  { trigger: 'dark', text: 'the dark is coming in. closer, everyone, closer.', mood: 'any', weight: 2 },
  { trigger: 'dark', text: 'i cannot see the mountain. i can still feel it.', mood: 'any' },
  { trigger: 'crawler', text: 'something else lives here.', mood: 'any', weight: 3 },
  { trigger: 'crawler', text: 'it has too many legs for a pilgrim.', mood: 'any' },
  { trigger: 'crawler', text: 'feed it to the maw. yes. use the mouth. the MOUTH.', mood: 'any', weight: 2 },
  { trigger: 'moth', text: 'a moth. it wants my head.', mood: 'any', weight: 3 },
  { trigger: 'moth', text: 'blow it away! open the maw and BLOW!', mood: 'any', weight: 2 },
  { trigger: 'moth', text: 'the moth does not believe in us.', mood: 'any' },

  // --- the offering (U2) ---------------------------------------------------
  { trigger: 'offering', text: 'it ate for us.', mood: 'any', weight: 4 },
  { trigger: 'offering', text: 'the maw has been fed. the maw is briefly ours.', mood: 'any', weight: 3 },
  { trigger: 'offering', text: 'so the mouth can be a friend. noted. uneasily.', mood: 'any', weight: 2 },
  { trigger: 'offering', text: 'we have used the hunger. the elders will not approve.', mood: 'any' },

  // --- the procession (U3) -------------------------------------------------
  { trigger: 'procession', text: 'the procession grows. the light grows with it.', mood: 'any', weight: 3 },
  { trigger: 'procession', text: 'more of us, more of the mountain visible. a bargain.', mood: 'any', weight: 2 },
  { trigger: 'procession', text: 'we are many. we are bright. we are briefly brave.', mood: 'any' },

  // --- outcomes ------------------------------------------------------------
  { trigger: 'saved', text: 'we made it. we did not trust it.', mood: 'any', weight: 3 },
  { trigger: 'saved', text: '{name} is through. {name} is insufferable about it.', mood: 'any', weight: 2 },
  { trigger: 'saved', text: 'the gate. the gate was real.', mood: 'any' },
  { trigger: 'saved', text: 'one more home. do not look back at the face.', mood: 'any' },

  { trigger: 'swallowed', text: '{name} is gone.', mood: 'any', weight: 4 },
  { trigger: 'swallowed', text: 'the maw has taken {name}. we will not speak of the sound.', mood: 'any', weight: 2 },
  { trigger: 'swallowed', text: 'it ate {name}. it did not even notice.', mood: 'any', weight: 2 },
  { trigger: 'swallowed', text: 'brother {name}. a candle. a moment. a gulp.', mood: 'any' },
  { trigger: 'swallowed', text: 'that was {name}, and that was your mouth.', mood: 'cracking', weight: 3 },

  { trigger: 'lostOther', text: '{name} has gone out.', mood: 'any', weight: 3 },
  { trigger: 'lostOther', text: 'we are one flame fewer. the dark notices.', mood: 'any', weight: 2 },
  { trigger: 'lostOther', text: 'light a thought for {name}.', mood: 'any' },

  // --- THE WATCHER (earned by losing half the roster) ---------------------
  { trigger: 'watcher', text: 'it has stopped pretending to be a mountain.', mood: 'any', weight: 5 },
  { trigger: 'watcher', text: 'DO NOT LOOK AT IT', mood: 'any', weight: 4 },
  { trigger: 'watcher', text: 'that is what was under the face.', mood: 'any', weight: 4 },
  { trigger: 'watcher', text: 'we were never pilgrims. we were supper.', mood: 'any', weight: 3 },
  { trigger: 'watcher', text: 'it knows how many of us are left. it is counting.', mood: 'cracking', weight: 3 },

  // --- the finale (SPEC 10.3) ---------------------------------------------
  { trigger: 'finale', text: 'that is not the face.', mood: 'any', weight: 5 },
  { trigger: 'finale', text: 'it moved on its own. it moved WITHOUT you.', mood: 'any', weight: 4 },
  { trigger: 'finale', text: 'the mountain is dreaming and we are in the dream.', mood: 'any', weight: 3 },
  { trigger: 'finale', text: 'do not tell it we noticed.', mood: 'any', weight: 2 },
];

/** Ruin lore, written on the static geometry (SPEC section 4). */
export const RUIN_LORE: readonly string[] = [
  'IT SMILES BEFORE IT EATS.',
  'WALK SOFTLY ON THE NOSE.',
  'WE TRUST THE FACE.',
  'THE LIP IS A BRIDGE AND A PROMISE.',
  'THE DARK WAS HERE FIRST.',
  'DO NOT STAND IN THE EYE.',
];

export function fillLine(text: string, name: string, full: string): string {
  return text.replaceAll('{full}', full).replaceAll('{name}', name);
}
