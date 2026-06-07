type MidiNote = {
  id?: string;
  pitch: number;
  startBeat: number;
  lengthBeats: number;
  velocity?: number;
};

type BlockShape = {
  id: bigint;
  trackId: bigint;
  kind: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  midiJson: string;
  assetId: bigint;
};

type TrackShape = {
  id: bigint;
  name: string;
};

function parseMidiNotes(midiJson: string): MidiNote[] {
  try {
    const value = JSON.parse(midiJson) as unknown;
    const notes = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && 'notes' in value
        ? (value as { notes: unknown[] }).notes
        : [];
    return notes.filter(
      (item): item is MidiNote =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as MidiNote).pitch === 'number' &&
        typeof (item as MidiNote).startBeat === 'number' &&
        typeof (item as MidiNote).lengthBeats === 'number'
    );
  } catch {
    return [];
  }
}

function pitchToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

type DrumPattern = {
  drums: boolean;
  steps: number;
  sounds: { id: string; name: string; strudel: string }[];
  pattern: number[][];
};

function parseDrumPattern(midiJson: string): DrumPattern | null {
  try {
    const parsed = JSON.parse(midiJson) as Record<string, unknown>;
    if (parsed.drums && Array.isArray(parsed.pattern)) return parsed as unknown as DrumPattern;
  } catch { /* fall through */ }
  return null;
}

function renderDrumHit(ctx: OfflineAudioContext, soundId: string, startSec: number, _beatsPerSec: number, mixed: GainNode) {
  const amp = 0.4;
  const dur = 0.15;

  if (soundId === 'kick') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, startSec);
    osc.frequency.exponentialRampToValueAtTime(40, startSec + dur);
    gain.gain.setValueAtTime(amp, startSec);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + dur);
    osc.connect(gain);
    gain.connect(mixed);
    osc.start(startSec);
    osc.stop(startSec + dur);
  } else if (soundId === 'snare' || soundId === 'clap') {
    const bufferSize = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amp, startSec);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + dur);
    source.connect(gain);
    gain.connect(mixed);
    source.start(startSec);
  } else if (soundId === 'hihat') {
    const bufferSize = Math.ceil(ctx.sampleRate * 0.06);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 6);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amp * 0.5, startSec);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + 0.06);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    source.connect(hp);
    hp.connect(gain);
    gain.connect(mixed);
    source.start(startSec);
  } else if (soundId === 'openhat') {
    const bufferSize = Math.ceil(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amp * 0.4, startSec);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + 0.25);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    source.connect(hp);
    hp.connect(gain);
    gain.connect(mixed);
    source.start(startSec);
  } else {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = soundId === 'tomhi' ? 200 : 100;
    gain.gain.setValueAtTime(amp, startSec);
    gain.gain.exponentialRampToValueAtTime(0.001, startSec + dur);
    osc.connect(gain);
    gain.connect(mixed);
    osc.start(startSec);
    osc.stop(startSec + dur);
  }
}

export type PlaybackHandle = {
  sourceNodes: AudioBufferSourceNode[];
  gainNodes: GainNode[];
  stop(): void;
};

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
  const totalSec = loopBeats / (bpm / 60);

  for (const [trackId, buffer] of trackBuffers) {
    const state = trackStates.get(trackId);
    if (state?.muted) continue;

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = totalSec;

    const gain = audioCtx.createGain();
    gain.gain.value = state?.volume ?? 0.72;

    source.connect(gain);
    gain.connect(audioCtx.destination);

    const offset = Math.max(0, playheadSec);
    source.start(0, offset);

    sources.push(source);
    gains.push(gain);
  }

  return {
    sourceNodes: sources,
    gainNodes: gains,
    stop() {
      for (const s of sources) {
        try { s.stop(); } catch {}
      }
    },
  };
}

export async function renderAllTracks(
  tracks: readonly TrackShape[],
  blocks: readonly BlockShape[],
  bpm: number,
  loopBeats: number,
  sampleRate: number
): Promise<Map<bigint, AudioBuffer>> {
  const results = new Map<bigint, AudioBuffer>();
  const beatsPerSec = bpm / 60;
  const totalSeconds = loopBeats / beatsPerSec;
  const lengthSamples = Math.ceil(totalSeconds * sampleRate);

  for (const track of tracks) {
    const trackBlocks = blocks.filter(b => b.trackId === track.id);
    if (!trackBlocks.length) continue;

    const ctx = new OfflineAudioContext(2, lengthSamples, sampleRate);
    const mixed = ctx.createGain();
    mixed.gain.value = 1;
    mixed.connect(ctx.destination);

    for (const block of trackBlocks) {
      if (block.kind === 'audio') continue;

      const drumPattern = parseDrumPattern(block.midiJson);
      if (drumPattern) {
        const stepDur = block.lengthBeats / drumPattern.steps;
        for (let si = 0; si < drumPattern.sounds.length; si++) {
          const sound = drumPattern.sounds[si];
          const row = drumPattern.pattern[si] ?? [];
          for (let step = 0; step < drumPattern.steps; step++) {
            if (row[step]) {
              const startSec = (block.startBeat + step * stepDur) / beatsPerSec;
              renderDrumHit(ctx, sound.id, startSec, beatsPerSec, mixed);
            }
          }
        }
      } else {
        const notes = parseMidiNotes(block.midiJson);

        for (const note of notes) {
          const startSec = (block.startBeat + note.startBeat) / beatsPerSec;
          const durSec = Math.max(0.02, note.lengthBeats / beatsPerSec);
          const amp = Math.max(0.05, Math.min(1, note.velocity ?? 0.8));

          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.value = pitchToFreq(note.pitch);

          gain.gain.setValueAtTime(0, startSec);
          gain.gain.linearRampToValueAtTime(amp * 0.3, startSec + 0.005);
          gain.gain.setValueAtTime(amp * 0.3, startSec + durSec * 0.7);
          gain.gain.linearRampToValueAtTime(0, startSec + durSec);

          osc.connect(gain);
          gain.connect(mixed);
          osc.start(startSec);
          osc.stop(startSec + durSec);
        }
      }
    }

    const buffer = await ctx.startRendering();
    results.set(track.id, buffer);
  }

  return results;
}

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

  return {
    sourceNodes: [source],
    gainNodes: [gain],
    stop() {
      try { source.stop(); } catch {}
    },
  };
}
