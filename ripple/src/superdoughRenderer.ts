import { superdough, setAudioContext, initAudio, registerSynthSounds, samples } from 'superdough';

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
  piano: 'triangle', synth: 'sawtooth', bass: 'triangle', strings: 'sawtooth',
  pad: 'sawtooth', organ: 'triangle', flute: 'sine', pluck: 'triangle',
};

let superdoughReady = false;
let scheduledAbort: AbortController | null = null;
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
  console.log('[superdough] initializing audio...');
  try { await initAudio(); console.log('[superdough] init OK'); } catch (e) { console.warn('[superdough] init error:', e); }
  superdoughReady = true;
}

export function stopAllLiveAudio() {
  if (scheduledAbort) {
    scheduledAbort.abort();
    scheduledAbort = null;
  }
  if (liveAudioCtx) {
    liveAudioCtx.close();
    liveAudioCtx = null;
  }
}

export async function scheduleBlocksLive(
  blocks: readonly BlockShape[],
  playheadBeat: number,
  bpm: number,
  loopBeats: number,
  trackMutedMap: Map<bigint, boolean>,
) {
  stopAllLiveAudio();
  await ensureSuperdoughInit();

  const ac = new AudioContext();
  liveAudioCtx = ac;
  setAudioContext(ac);
  if (ac.state === 'suspended') await ac.resume();

  const abort = new AbortController();
  scheduledAbort = abort;

  const beatsPerSec = bpm / 60;
  const loopSec = loopBeats / beatsPerSec;

  const scheduleOnce = (startOffset: number) => {
    const now = ac.currentTime + startOffset;
    let count = 0;

    for (const block of blocks) {
      if (block.kind === 'audio') continue;
      if (trackMutedMap.get(block.trackId)) continue;

      const notes = parseMidiNotes(block.midiJson);
      const isSample = block.instrumentKind === 'sample';
      const instrumentKey = block.instrumentKey ?? '';
      const melodySound = MELODY_SOUNDS[instrumentKey] ?? 'triangle';

      for (const note of notes) {
        const noteAbsoluteBeat = block.startBeat + note.startBeat;
        const noteSec = noteAbsoluteBeat / beatsPerSec;
        const noteDurSec = Math.max(0.02, note.lengthBeats / beatsPerSec);
        const noteEndSec = noteSec + noteDurSec;
        const playheadSec = playheadBeat / beatsPerSec;

        if (noteEndSec <= playheadSec + 0.01) continue;

        const relativeStart = noteSec - playheadSec;
        const schedTime = now + Math.max(0, relativeStart);
        const remainingDur = noteDurSec - Math.max(0, -relativeStart);
        const durSec = Math.max(0.02, remainingDur);
        const gain = Math.max(0.05, Math.min(1, note.velocity ?? 0.8));

        if (isSample) {
          const sample = DRUM_MAP[Math.round(note.pitch)] ?? 'hh';
          console.log(`[superdough] drum: ${sample} gain=${gain} dur=${durSec.toFixed(2)} time=${schedTime.toFixed(2)}`);
          superdough({ s: sample, gain, duration: durSec }, schedTime, durSec).catch((e: unknown) => console.warn('[superdough] drum error:', e));
        } else {
          console.log(`[superdough] melody: s=${melodySound} note=${note.pitch} gain=${gain} time=${schedTime.toFixed(2)}`);
          superdough({ s: melodySound, note: note.pitch, gain, duration: durSec }, schedTime, durSec).catch((e: unknown) => console.warn('[superdough] melody error:', e));
        }
        count++;
      }
    }
    return count;
  };

  const count = scheduleOnce(0);
  console.log(`[superdough] scheduled ${count} notes, bpm=${bpm}, playheadBeat=${playheadBeat.toFixed(2)}, loop=${loopBeats}beats`);

  const scheduleNextLoop = () => {
    if (abort.signal.aborted) return;
    const ms = loopSec * 1000;
    setTimeout(() => {
      if (abort.signal.aborted) return;
      scheduleOnce(0);
      scheduleNextLoop();
    }, ms);
  };
  scheduleNextLoop();
}
