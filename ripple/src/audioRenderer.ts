/**
 * Audio playback engine — plays pre-rendered AudioBuffers with pause/resume/seek.
 *
 * Does NOT render audio itself; rendering is done by superdoughRenderer.ts.
 * This module only handles scheduling pre-rendered buffers for playback.
 */

export type PlaybackHandle = {
  audioCtx: AudioContext;
  sourceNodes: AudioBufferSourceNode[];
  gainNodes: GainNode[];
  trackGains: Map<bigint, GainNode>;
  /** Wall-clock time (audioCtx.currentTime) when playback last started/resumed */
  startedAt: number;
  /** The buffer offset (in seconds) we started from */
  startOffset: number;
  /**
   * Stop all sources. After this the handle is dead — create a new one to play again.
   */
  stop(): void;
  /**
   * Pause playback by suspending the AudioContext.
   * Audio freezes in place; call resume() to continue.
   */
  pause(): Promise<void>;
  /**
   * Resume from where we paused.
   */
  resume(): Promise<void>;
  /**
   * Get current playback position in seconds (within the loop).
   */
  getCurrentTime(): number;
};

/**
 * Start playing pre-rendered track buffers.
 *
 * Each track gets its own AudioBufferSourceNode + GainNode.
 * Muted tracks get gain=0. Volume is applied to the gain node.
 * The sources loop between 0 and totalSec.
 *
 * Returns a PlaybackHandle for pause/resume/stop and real-time gain control.
 */
export function schedulePlayback(
  audioCtx: AudioContext,
  trackBuffers: Map<bigint, AudioBuffer>,
  playheadSec: number,
  bpm: number,
  loopBeats: number,
  trackStates: Map<bigint, { muted: boolean; volume: number }>
): PlaybackHandle {
  const sources: AudioBufferSourceNode[] = [];
  const gains: GainNode[] = [];
  const trackGains = new Map<bigint, GainNode>();
  const totalSec = loopBeats / (bpm / 60);

  for (const [trackId, buffer] of trackBuffers) {
    const state = trackStates.get(trackId);

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = totalSec;

    const gain = audioCtx.createGain();
    gain.gain.value = state?.muted ? 0 : (state?.volume ?? 0.72);

    source.connect(gain);
    gain.connect(audioCtx.destination);

    const offset = Math.max(0, playheadSec) % totalSec;
    source.start(0, offset);

    sources.push(source);
    gains.push(gain);
    trackGains.set(trackId, gain);
  }

  const startedAt = audioCtx.currentTime;
  const startOffset = Math.max(0, playheadSec) % totalSec;

  return {
    audioCtx,
    sourceNodes: sources,
    gainNodes: gains,
    trackGains,
    startedAt,
    startOffset,
    stop() {
      for (const s of sources) {
        try { s.stop(); } catch { /* already stopped */ }
      }
    },
    async pause() {
      if (audioCtx.state === 'running') {
        await audioCtx.suspend();
      }
    },
    async resume() {
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    },
    getCurrentTime() {
      const elapsed = audioCtx.currentTime - startedAt;
      return (startOffset + elapsed) % totalSec;
    },
  };
}

/**
 * Update track gains in real-time without re-rendering or re-scheduling.
 */
export function updatePlaybackGains(
  handle: PlaybackHandle,
  trackStates: Map<bigint, { muted: boolean; volume: number }>
) {
  for (const [trackId, gainNode] of handle.trackGains) {
    const state = trackStates.get(trackId);
    gainNode.gain.value = state?.muted ? 0 : (state?.volume ?? 0.72);
  }
}

// ─── Metronome ──────────────────────────────────────────────────────

export function generateMetronomeBuffer(bpm: number, beatsPerBar: number, loopBeats: number, sampleRate: number): Promise<AudioBuffer> {
  const totalSeconds = loopBeats / (bpm / 60);
  const lengthSamples = Math.ceil(totalSeconds * sampleRate);
  const ctx = new OfflineAudioContext(1, lengthSamples, sampleRate);
  const beatsPerSec = bpm / 60;
  const clickDuration = 0.04;

  for (let beat = 0; beat < loopBeats; beat++) {
    const startSec = beat / beatsPerSec;
    const isDownbeat = beat % beatsPerBar === 0;
    const freq = isDownbeat ? 1200 : 900;
    const amp = isDownbeat ? 0.5 : 0.3;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, startSec);
    gain.gain.linearRampToValueAtTime(amp, startSec + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + clickDuration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startSec);
    osc.stop(startSec + clickDuration);
  }

  return ctx.startRendering();
}

export function scheduleMetronome(
  audioCtx: AudioContext,
  buffer: AudioBuffer,
  playheadSec: number,
  loopBeats: number,
  bpm: number
): PlaybackHandle {
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = 0;
  const totalSec = loopBeats / (bpm / 60);
  source.loopEnd = totalSec;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.6;
  source.connect(gain);
  gain.connect(audioCtx.destination);

  const offset = Math.max(0, playheadSec);
  source.start(0, offset);

  const startedAt = audioCtx.currentTime;

  return {
    audioCtx,
    sourceNodes: [source],
    gainNodes: [gain],
    trackGains: new Map(),
    startedAt,
    startOffset: offset,
    stop() {
      try { source.stop(); } catch { /* already stopped */ }
    },
    async pause() {
      // Metronome pause handled by the shared AudioContext suspend
    },
    async resume() {
      // Metronome resume handled by the shared AudioContext resume
    },
    getCurrentTime() {
      const elapsed = audioCtx.currentTime - startedAt;
      return (offset + elapsed) % totalSec;
    },
  };
}
