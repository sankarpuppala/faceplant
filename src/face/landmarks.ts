/**
 * MediaPipe Face Landmarker index sets (SPEC section 6.3).
 *
 * VERIFIED against the installed `@mediapipe/tasks-vision@1.1.0` by reading
 * `FaceLandmarker.FACE_LANDMARKS_*` and walking each connection list into an
 * ordered chain. `tests/face/landmarks.test.ts` re-checks the structural
 * properties (ordering, no duplicates, every index inside the model's range)
 * so a model change cannot silently rewire the terrain.
 *
 * The nose chain is the one set MediaPipe does not publish as a connection
 * list; it is the canonical 468-point mesh bridge, confirmed visually on the
 * debug page (`/debug.html`).
 */

/** Points in the 468-landmark face mesh (the model also emits iris points past this). */
export const FACE_MESH_POINTS = 468;

/**
 * The face oval as one ordered ring, starting at the top-centre forehead (10)
 * and running down the subject's right side of the image to the chin (152) and
 * back up. This is MediaPipe's own order from FACE_LANDMARKS_FACE_OVAL.
 */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150,
  136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;

/** Index into FACE_OVAL of the chin point (152). */
export const FACE_OVAL_CHIN_INDEX = 18;

export const TOP_OF_FOREHEAD = 10;
export const CHIN = 152;

/**
 * The forehead dome: the oval arc that runs across the top of the head.
 * Ordered left-to-right in *image* space, which is right-to-left on the
 * subject. Mirroring for the selfie view fixes that in `mapping.ts`.
 */
export const FOREHEAD = [332, 297, 338, 10, 109, 67, 103, 54] as const;

/**
 * Cheeks: the oval arcs between the brow line and the jaw, ordered temple to
 * jaw. Named for the *subject's* sides, which is also which side of the screen
 * they appear on once the selfie view is mirrored.
 */
export const CHEEK_SUBJECT_RIGHT = [21, 162, 127, 234, 93, 132, 58, 172] as const;
export const CHEEK_SUBJECT_LEFT = [251, 389, 356, 454, 323, 361, 288, 397] as const;

/** The jaw arc, ordered left to right in image space. */
export const JAW = [172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397] as const;

/**
 * Eyebrows. MediaPipe's EYEBROW connection lists contain two chains each; the
 * upper one is the ledge the Wicks stand on, so that is what we use.
 * "L" / "R" are the subject's left and right.
 */
export const BROW_UPPER_SUBJECT_LEFT = [300, 293, 334, 296, 336] as const;
export const BROW_LOWER_SUBJECT_LEFT = [276, 283, 282, 295, 285] as const;
export const BROW_UPPER_SUBJECT_RIGHT = [70, 63, 105, 66, 107] as const;
export const BROW_LOWER_SUBJECT_RIGHT = [46, 53, 52, 65, 55] as const;

/** The nose: nasion between the brows, down the bridge, to the tip, then the base. */
export const NOSE_BRIDGE = [168, 6, 197, 195, 5, 4, 1] as const;
export const NOSE_TIP = 1;
export const NOSE_BASE = [1, 2] as const;

/** Lips, from MediaPipe FACE_LANDMARKS_LIPS. Ordered image-left to image-right. */
export const LIP_OUTER_UPPER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291] as const;
export const LIP_OUTER_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291] as const;
export const LIP_INNER_UPPER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308] as const;
export const LIP_INNER_LOWER = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308] as const;

export const MOUTH_CORNER_IMAGE_LEFT = 61;
export const MOUTH_CORNER_IMAGE_RIGHT = 291;

/** Eyes, from MediaPipe FACE_LANDMARKS_*_EYE. Each chain runs corner to corner. */
export const EYE_UPPER_SUBJECT_LEFT = [263, 466, 388, 387, 386, 385, 384, 398, 362] as const;
export const EYE_LOWER_SUBJECT_LEFT = [263, 249, 390, 373, 374, 380, 381, 382, 362] as const;
export const EYE_UPPER_SUBJECT_RIGHT = [33, 246, 161, 160, 159, 158, 157, 173, 133] as const;
export const EYE_LOWER_SUBJECT_RIGHT = [33, 7, 163, 144, 145, 153, 154, 155, 133] as const;

/**
 * Every index the game reads. Fixtures store only these (CLAUDE.md invariant 8),
 * which is why a fixture file cannot be turned back into a face.
 */
export const USED_INDICES: readonly number[] = [
  ...new Set<number>([
    ...FACE_OVAL,
    ...FOREHEAD,
    ...CHEEK_SUBJECT_LEFT,
    ...CHEEK_SUBJECT_RIGHT,
    ...JAW,
    ...BROW_UPPER_SUBJECT_LEFT,
    ...BROW_LOWER_SUBJECT_LEFT,
    ...BROW_UPPER_SUBJECT_RIGHT,
    ...BROW_LOWER_SUBJECT_RIGHT,
    ...NOSE_BRIDGE,
    ...NOSE_BASE,
    ...LIP_OUTER_UPPER,
    ...LIP_OUTER_LOWER,
    ...LIP_INNER_UPPER,
    ...LIP_INNER_LOWER,
    ...EYE_UPPER_SUBJECT_LEFT,
    ...EYE_LOWER_SUBJECT_LEFT,
    ...EYE_UPPER_SUBJECT_RIGHT,
    ...EYE_LOWER_SUBJECT_RIGHT,
  ]),
].sort((a, b) => a - b);

/**
 * MediaPipe blendshape category names we map onto our five (SPEC section 6.1).
 * Smile and brow-raise are each the mean of a left/right pair, so a lopsided
 * grin still reads as a grin.
 */
export const BLENDSHAPE_SOURCES = {
  jawOpen: ['jawOpen'],
  smile: ['mouthSmileLeft', 'mouthSmileRight'],
  browUp: ['browOuterUpLeft', 'browOuterUpRight', 'browInnerUp'],
  blinkL: ['eyeBlinkLeft'],
  blinkR: ['eyeBlinkRight'],
} as const satisfies Record<string, readonly string[]>;
