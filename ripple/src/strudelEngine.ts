type StrudelRepl = {
  evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  stop(): void;
  setCps(value: number): void;
  scheduler: { now(): number };
};

type TransportState = {
  playing: boolean;
  bpm: number;
  playheadMicros: bigint;
};

type TrackShape = {
  id: bigint;
  name: string;
};

type BlockShape = {
  id: bigint;
  trackId: bigint;
  kind: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  midiJson: string;
  instrumentKind?: string;
  instrumentKey?: string;
};

type MidiNoteShape = {
  id?: string;
  pitch: number;
  startBeat: number;
  lengthBeats: number;
  velocity?: number;
};

const DRUM_MAP: Record<number, string> = {
  36: 'bd', 35: 'sd', 38: 'sn', 42: 'hh', 46: 'oh', 39: 'cp', 37: 'rim',
  50: 'ht', 47: 'ht', 45: 'lt', 41: 'lt', 48: 'mt', 43: 'mt',
  49: 'cr', 56: 'cy',
};

function drumPitchToSample(pitch: number): string {
  return DRUM_MAP[Math.round(pitch)] ?? 'hh';
}

let enginePromise: Promise<StrudelRepl> | null = null;

async function getEngine(): Promise<StrudelRepl> {
  if (!enginePromise) {
    const mod = await import('@strudel/web') as Record<string, unknown>;
    const init = mod['initStrudel'] as ((opts?: Record<string, unknown>) => Promise<unknown>) | undefined;
    if (init) {
      const engine = await init() as unknown as StrudelRepl;
      enginePromise = Promise.resolve(engine);
    } else {
      const replFn = mod['repl'] as (opts?: Record<string, unknown>) => unknown;
      const engine = replFn({ defaultOutput: 'webaudio' }) as unknown as StrudelRepl;
      enginePromise = Promise.resolve(engine);
    }
  }
  return await enginePromise;
}

function parseMidiNotes(midiJson: string): MidiNoteShape[] {
  try {
    const value = JSON.parse(midiJson) as unknown;
    const notes = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && 'notes' in value
        ? (value as { notes: unknown[] }).notes
        : [];
    return notes.filter(
      (item): item is MidiNoteShape =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as MidiNoteShape).pitch === 'number' &&
        typeof (item as MidiNoteShape).startBeat === 'number' &&
        typeof (item as MidiNoteShape).lengthBeats === 'number'
    );
  } catch {
    return [];
  }
}

function midiPitchToNoteName(pitch: number): string {
  const names = ['c', 'cs', 'd', 'ds', 'e', 'f', 'fs', 'g', 'gs', 'a', 'as', 'b'];
  const p = Math.round(pitch);
  const pc = ((p % 12) + 12) % 12;
  const octave = Math.floor(p / 12) - 1;
  return `${names[pc]}${octave}`;
}

function buildDrumPatternFromMidi(block: BlockShape): string {
  const notes = parseMidiNotes(block.midiJson);
  if (!notes.length) return 'silence';

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const blockBeats = Math.max(4, ...sorted.map(n => n.startBeat + n.lengthBeats));
  const layers: string[] = [];

  for (const note of sorted) {
    const sample = drumPitchToSample(note.pitch);
    const dur = Math.max(0.0625, note.lengthBeats);
    const amp = Math.max(0.1, Math.min(1, note.velocity ?? 0.8));
    const onset = note.startBeat / blockBeats;
    layers.push(`s("${sample}").dur(${dur}).gain(${amp}).late(${onset})`);
  }

  if (!layers.length) return 'silence';
  return `stack(${layers.join(', ')})`;
}

function buildMelodyPatternFromMidi(block: BlockShape): string {
  const notes = parseMidiNotes(block.midiJson);
  if (!notes.length) return 'silence';

  const sorted = [...notes].sort((a, b) => a.startBeat - b.startBeat);
  const blockBeats = Math.max(4, ...sorted.map(n => n.startBeat + n.lengthBeats));

  const instrumentSounds: Record<string, string> = {
    piano: 'piano', synth: 'sawtooth', bass: 'triangle', strings: 'sawtooth',
    pad: 'sawtooth', organ: 'triangle', flute: 'sine', pluck: 'triangle',
  };
  const sound = instrumentSounds[block.instrumentKey ?? ''] ?? 'triangle';

  const noteEntries: string[] = [];
  for (const note of sorted) {
    const name = midiPitchToNoteName(note.pitch);
    const dur = Math.max(0.0625, note.lengthBeats);
    const amp = Math.max(0.1, Math.min(1, note.velocity ?? 0.8));
    const onset = note.startBeat / blockBeats;
    noteEntries.push(`note("${name}").s("${sound}").dur(${dur}).gain(${amp}).late(${onset})`);
  }

  if (!noteEntries.length) return 'silence';
  return `stack(${noteEntries.join(', ')})`;
}

export function getMidiBlockPattern(midiJson: string, isDrum = false, instrumentKey?: string): string {
  if (isDrum) {
    const block: BlockShape = { id: 0n, trackId: 0n, kind: 'drum', name: '', startBeat: 0, lengthBeats: 4, midiJson };
    return buildDrumPatternFromMidi(block);
  }

  const block: BlockShape = { id: 0n, trackId: 0n, kind: 'midi', name: '', startBeat: 0, lengthBeats: 4, midiJson, instrumentKey };
  return buildMelodyPatternFromMidi(block);
}

export function buildFullPattern(_tracks: readonly TrackShape[], blocks: readonly BlockShape[]): string {
  const midiBlocks = blocks.filter((b) => b.kind !== 'audio');
  if (!midiBlocks.length) return 'silence';

  const layers = midiBlocks.map((block) => getMidiBlockPattern(block.midiJson, block.instrumentKind === 'sample', block.instrumentKey));
  const nonSilent = layers.filter((p) => p !== 'silence');
  if (!nonSilent.length) return 'silence';

  return `stack(${nonSilent.join(', ')})`;
}

let lastEvaluatedPattern: string | null = null;

export async function updateStrudelPlayback(
  transport: TransportState,
  tracks: readonly TrackShape[],
  blocks: readonly BlockShape[]
) {
  const engine = await getEngine();
  const pattern = buildFullPattern(tracks, blocks);

  engine.setCps(transport.bpm / 240);

  if (!transport.playing) {
    engine.stop();
    lastEvaluatedPattern = null;
    return;
  }

  if (pattern === lastEvaluatedPattern) return;
  lastEvaluatedPattern = pattern;

  console.log('[strudel] evaluating:', pattern);
  await engine.evaluate(pattern, true);
}
