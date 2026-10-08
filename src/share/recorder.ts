/**
 * U8 - the auto-highlight clip recorder (replaces SPEC section 16's full-attempt clip).
 *
 * SPEC v1.0 recorded the whole attempt. Nobody watches ninety seconds of
 * someone else's face. So instead this keeps a **rolling buffer** of the last
 * `config.clip.bufferSeconds` and, when the run ends, cuts the seconds either
 * side of the player's biggest composure crash - the exact moment they cracked.
 * One tap, portrait, the funniest six seconds.
 *
 * Privacy (CLAUDE.md invariant 3), unchanged and non-negotiable:
 *   - off by default; the player turns it on in Settings;
 *   - the buffer lives in memory only, never in localStorage or IndexedDB;
 *   - the clip is previewed before it can be saved, and saving is a download;
 *   - `audio: false` on the capture stream and no microphone track is ever
 *     requested anywhere in this file or the project;
 *   - `discard()` drops every chunk, and closing the dialog calls it.
 */

import { config } from '../config.ts';

export type ClipFormat = { mimeType: string; extension: 'mp4' | 'webm' };

/**
 * Prefers MP4 (H.264 + AAC) because short-video platforms want it, and falls
 * back to WebM. The exact codec strings are probed rather than assumed, since
 * support differs between Chrome, Edge and Firefox.
 */
export function pickFormat(): ClipFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: ClipFormat[] = [
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
    { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
    { mimeType: 'video/mp4', extension: 'mp4' },
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
  ];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
    } catch {
      /* keep probing */
    }
  }
  return null;
}

export interface RecorderOptions {
  /** The portrait canvas to capture (see `portraitCanvas.ts`). */
  canvas: HTMLCanvasElement;
  /** Game audio only. Never a microphone. */
  audioNode: AudioNode | null;
  audioContext: AudioContext | null;
}

interface Chunk {
  blob: Blob;
  /** ms since recording started. */
  at: number;
}

export class ClipRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Chunk[] = [];
  private startedAtMs = 0;
  private format: ClipFormat | null = null;
  private stream: MediaStream | null = null;
  private audioDest: MediaStreamAudioDestinationNode | null = null;

  get available(): boolean {
    return pickFormat() !== null;
  }

  get recording(): boolean {
    return this.recorder !== null && this.recorder.state === 'recording';
  }

  get extension(): 'mp4' | 'webm' {
    return this.format?.extension ?? 'webm';
  }

  start(opts: RecorderOptions): boolean {
    this.discard();
    const format = pickFormat();
    if (format === null) return false;
    this.format = format;

    let stream: MediaStream;
    try {
      stream = opts.canvas.captureStream(config.clip.fps);
    } catch {
      return false;
    }

    // Game audio is tapped from the limiter's output. There is deliberately no
    // getUserMedia({ audio: true }) anywhere in this project.
    if (opts.audioNode !== null && opts.audioContext !== null) {
      try {
        const dest = opts.audioContext.createMediaStreamDestination();
        opts.audioNode.connect(dest);
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
        this.audioDest = dest;
      } catch {
        // No audio track is a fine outcome; a silent clip still shows the joke.
      }
    }

    this.stream = stream;
    try {
      this.recorder = new MediaRecorder(stream, { mimeType: format.mimeType, videoBitsPerSecond: 3_500_000 });
    } catch {
      this.cleanupStream();
      return false;
    }

    this.startedAtMs = performance.now();
    this.chunks = [];
    this.recorder.ondataavailable = (e: BlobEvent): void => {
      if (e.data.size === 0) return;
      this.chunks.push({ blob: e.data, at: performance.now() - this.startedAtMs });
      this.trim();
    };
    // One chunk per second keeps the rolling trim cheap and the cut accurate
    // to about a second, which is plenty for a six-second highlight.
    this.recorder.start(1000);
    return true;
  }

  /** Drops chunks older than the buffer window. This is the "rolling" part. */
  private trim(): void {
    const keepFromMs = (this.chunks[this.chunks.length - 1]?.at ?? 0) - config.clip.bufferSeconds * 1000;
    while (this.chunks.length > 2) {
      const first = this.chunks[0];
      if (first === undefined || first.at >= keepFromMs) break;
      this.chunks.shift();
    }
  }

  async stop(): Promise<void> {
    const rec = this.recorder;
    if (rec === null) return;
    if (rec.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        rec.onstop = (): void => resolve();
        rec.stop();
      });
    }
    this.cleanupStream();
    this.recorder = null;
  }

  private cleanupStream(): void {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    try {
      this.audioDest?.disconnect();
    } catch {
      /* already gone */
    }
    this.audioDest = null;
  }

  /**
   * Cuts the highlight around a moment.
   *
   * @param crashAtMs when the biggest composure drop happened, measured on the
   *   same clock as `start()` (that is, `performance.now()`).
   *
   * MediaRecorder chunks after the first are not independently decodable, so
   * the cut has to keep the header chunk. We therefore keep chunk 0 and splice
   * the window onto it. The result plays; it just means the clip can be a
   * little longer than requested when the crash is late in the buffer.
   */
  buildHighlight(crashAtMs: number): Blob | null {
    if (this.chunks.length === 0 || this.format === null) return null;

    const lead = config.clip.highlightLeadSeconds * 1000;
    const from = Math.max(0, crashAtMs - this.startedAtMs - lead);
    const to = from + config.clip.highlightSeconds * 1000;

    const parts: Blob[] = [];
    const header = this.chunks[0];
    if (header === undefined) return null;
    parts.push(header.blob);

    for (let i = 1; i < this.chunks.length; i++) {
      const c = this.chunks[i];
      if (c === undefined) continue;
      if (c.at >= from && c.at <= to + 1000) parts.push(c.blob);
    }

    // Fewer than two parts means the crash fell outside the buffer; hand back
    // the whole buffer rather than nothing.
    if (parts.length < 2) {
      return new Blob(this.chunks.map((c) => c.blob), { type: this.format.mimeType });
    }
    return new Blob(parts, { type: this.format.mimeType });
  }

  /** The whole buffer, for the "save the full attempt" option. */
  buildFull(): Blob | null {
    if (this.chunks.length === 0 || this.format === null) return null;
    return new Blob(this.chunks.map((c) => c.blob), { type: this.format.mimeType });
  }

  /** Invariant 3: nothing is kept once the dialog closes. */
  discard(): void {
    this.chunks = [];
    this.cleanupStream();
    if (this.recorder !== null && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.recorder = null;
  }

  get bufferedSeconds(): number {
    const last = this.chunks[this.chunks.length - 1];
    const first = this.chunks[0];
    if (last === undefined || first === undefined) return 0;
    return (last.at - first.at) / 1000;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
