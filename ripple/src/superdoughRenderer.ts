import {
  superdough,
  setAudioContext,
  getAudioContext,
  initAudio,
  registerSynthSounds,
  samples,
  resetGlobalEffects,
  setSuperdoughAudioController,
} from 'superdough';

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
  instrumentKind?: string;
  instrumentKey?: string;
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

const DRUM_MAP: Record<number, string> = {
  36: 'kick', 35: 'kick', 38: 'snare', 42: 'shaker', 46: 'shaker', 39: 'clap', 37: 'stab',
  50: 'tom', 47: 'tom', 45: 'tom', 41: 'tom', 48: 'tom', 43: 'tom',
  49: 'crash', 56: 'crash',
};

const MELODY_SOUNDS: Record<string, string> = {
  piano: 'wt_piano',
  epiano: 'wt_epiano',
  synth: 'wt_fmsynth',
  bass: 'wt_ebass',
  dbass: 'wt_dbass',
  strings: 'wt_stringbox',
  violin: 'wt_violin',
  cello: 'wt_cello',
  pad: 'wt_theremin',
  organ: 'wt_eorgan',
  flute: 'wt_flute',
  pluck: 'wt_clavinet',
  vgame: 'wt_vgame',
  aguitar: 'wt_aguitar',
  eguitar: 'wt_eguitar',
};

let superdoughReady = false;
/** The "real" AudioContext used for live playback — restored after offline renders. */
let liveAudioCtx: AudioContext | null = null;

async function ensureSuperdoughInit() {
  if (superdoughReady) return;
  console.log('[superdough] registering synth sounds...');
  registerSynthSounds();
  console.log('[superdough] loading drum samples...');
  try {
    await samples('https://raw.githubusercontent.com/Bubobubobubobubo/dough-samples/main/strudel.json');
    console.log('[superdough] samples loaded');
  } catch (e) {
    console.warn('[superdough] sample load error:', e);
  }
  console.log('[superdough] loading waveforms...');
  try {
    const res = await fetch('https://raw.githubusercontent.com/Bubobubobubobubo/Dough-Waveforms/main/strudel.json');
    const data = await res.json() as Record<string, any>;
    const baseUrl = data._base as string;
    const flattened: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(data)) {
      if (key === '_base') continue;
      if (value && value.d2 && Array.isArray(value.d2)) {
        flattened[key] = value.d2;
      } else if (Array.isArray(value)) {
        flattened[key] = value;
      }
    }
    await samples(flattened, baseUrl);
    console.log('[superdough] waveforms loaded');
  } catch (e) {
    console.warn('[superdough] waveform load error:', e);
  }
  console.log('[superdough] initializing audio...');
  try { await initAudio(); console.log('[superdough] init OK'); } catch (e) { console.warn('[superdough] init error:', e); }
  superdoughReady = true;
}

/**
 * Ensure we have a live AudioContext and superdough is initialized.
 */
export async function ensureLiveContext(): Promise<AudioContext> {
  if (!liveAudioCtx || liveAudioCtx.state === 'closed') {
    liveAudioCtx = new AudioContext();
    setAudioContext(liveAudioCtx);
  }
  await ensureSuperdoughInit();
  return liveAudioCtx;
}

/**
 * Get the current live AudioContext (may be null if not yet initialized).
 */
export function getLiveAudioContext(): AudioContext | null {
  return liveAudioCtx;
}

/**
 * Render a single track's blocks to an AudioBuffer using superdough + OfflineAudioContext.
 *
 * The key trick: we null out superdough's internal destination singleton
 * (via resetGlobalEffects + setSuperdoughAudioController(null)) so it
 * rebuilds fresh orbit/bus/destination nodes on the OfflineAudioContext.
 * After rendering, we restore the live context and null it again so the
 * live context gets fresh nodes too.
 */
export async function renderTrackBuffer(
  blocks: readonly BlockShape[],
  bpm: number,
  loopBeats: number,
  sampleRate: number,
): Promise<AudioBuffer> {
  await ensureSuperdoughInit();

  const beatsPerSec = bpm / 60;
  const totalSeconds = loopBeats / beatsPerSec;
  const lengthSamples = Math.ceil(totalSeconds * sampleRate);

  const offlineCtx = new OfflineAudioContext(2, lengthSamples, sampleRate);

  // Save the live context
  const previousCtx = getAudioContext();

  // Swap to offline context and force superdough to rebuild its internal
  // destination/orbit nodes on the new context
  setAudioContext(offlineCtx as unknown as AudioContext);
  resetGlobalEffects();
  setSuperdoughAudioController(null);
  await initAudio();

  // Schedule all notes for this track's blocks
  const schedulePromises: Promise<void>[] = [];

  for (const block of blocks) {
    if (block.kind === 'audio') continue;

    const notes = parseMidiNotes(block.midiJson);
    const isSample = block.instrumentKind === 'sample';
    const instrumentKey = block.instrumentKey ?? '';
    const melodySound = MELODY_SOUNDS[instrumentKey] ?? 'triangle';

    for (const note of notes) {
      const noteAbsoluteBeat = block.startBeat + note.startBeat;
      const noteSec = noteAbsoluteBeat / beatsPerSec;
      const noteDurSec = Math.max(0.02, note.lengthBeats / beatsPerSec);
      const gain = Math.max(0.05, Math.min(1, note.velocity ?? 0.8));

      if (noteSec >= totalSeconds) continue;

      if (isSample) {
        const sample = DRUM_MAP[Math.round(note.pitch)] ?? 'hh';
        schedulePromises.push(
          superdough({ s: sample, gain, duration: noteDurSec }, noteSec, noteDurSec)
            .catch((e: unknown) => console.warn('[superdough] offline drum error:', e))
        );
      } else {
        schedulePromises.push(
          superdough({ s: melodySound, note: note.pitch, gain, duration: noteDurSec }, noteSec, noteDurSec)
            .catch((e: unknown) => console.warn('[superdough] offline melody error:', e))
        );
      }
    }
  }

  await Promise.all(schedulePromises);

  const buffer = await offlineCtx.startRendering();

  // Restore the live context and force superdough to rebuild on it too
  setAudioContext(previousCtx);
  resetGlobalEffects();
  setSuperdoughAudioController(null);

  return buffer;
}

/**
 * Render all tracks to AudioBuffers.
 * Returns a Map from trackId → AudioBuffer.
 */
export async function renderAllTrackBuffers(
  tracks: readonly TrackShape[],
  blocks: readonly BlockShape[],
  bpm: number,
  loopBeats: number,
  sampleRate: number,
): Promise<Map<bigint, AudioBuffer>> {
  const results = new Map<bigint, AudioBuffer>();

  for (const track of tracks) {
    const trackBlocks = blocks.filter(b => b.trackId === track.id);
    if (!trackBlocks.length) continue;

    const midiBlocks = trackBlocks.filter(b => b.kind !== 'audio');
    if (!midiBlocks.length) continue;

    console.log(`[superdough] rendering track "${track.name}" (${midiBlocks.length} blocks)...`);
    const buffer = await renderTrackBuffer(midiBlocks, bpm, loopBeats, sampleRate);
    results.set(track.id, buffer);
    console.log(`[superdough] track "${track.name}" rendered: ${buffer.duration.toFixed(2)}s`);
  }

  return results;
}
