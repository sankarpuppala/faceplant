/**
 * Renders the sound library off the main thread. Synthesising every sound
 * takes about half a second of CPU, and on the main thread that half second
 * would land on the title screen and on the face tracker.
 *
 * In: `{ name, rate }`. Out: `{ name, data }`, the samples transferred, not copied.
 */

import { renderSample, type SampleName } from './samples.ts';

self.onmessage = (ev: MessageEvent<{ name: SampleName; rate: number }>): void => {
  const { name, rate } = ev.data;
  const data = renderSample(name, rate);
  (self as unknown as { postMessage: (m: unknown, t: Transferable[]) => void }).postMessage({ name, data }, [data.buffer]);
};
