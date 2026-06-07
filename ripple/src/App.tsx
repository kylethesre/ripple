import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { putCachedAudioAsset } from './audioAssetCache';
import { analyzeAudioFile, chunkAudioBuffer, makeClientUploadKey } from './audioUpload';
import { generateMetronomeBuffer, scheduleMetronome, schedulePlayback, updatePlaybackGains, PlaybackHandle } from './audioRenderer';
import { getMidiBlockPattern } from './strudelEngine';
import { renderAllTrackBuffers, ensureLiveContext } from './superdoughRenderer';
import { reducers, tables } from './module_bindings';

const BEAT_WIDTH = 80;

type SampleKit = {
  id: string;
  name: string;
  category: string;
  sounds: { pitch: number; name: string; strudel: string }[];
};

const SAMPLE_KITS: SampleKit[] = [
  {
    id: 'tr909', name: 'Roland TR-909', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
      { pitch: 49, name: 'Ride', strudel: 's("rd")' }, { pitch: 41, name: 'Lo Tom', strudel: 's("lt")' },
      { pitch: 45, name: 'Mid Tom', strudel: 's("mt")' }, { pitch: 48, name: 'Hi Tom', strudel: 's("ht")' },
    ],
  },
  {
    id: 'tr808', name: 'Roland TR-808', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
      { pitch: 49, name: 'Ride', strudel: 's("rd")' }, { pitch: 41, name: 'Lo Tom', strudel: 's("lt")' },
      { pitch: 45, name: 'Mid Tom', strudel: 's("mt")' }, { pitch: 48, name: 'Hi Tom', strudel: 's("ht")' },
    ],
  },
  {
    id: 'linn', name: 'Akai Linn', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
      { pitch: 49, name: 'Ride', strudel: 's("rd")' }, { pitch: 37, name: 'Rim', strudel: 's("rim")' },
    ],
  },
  {
    id: 'tr707', name: 'Roland TR-707', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
      { pitch: 49, name: 'Ride', strudel: 's("rd")' }, { pitch: 37, name: 'Rim', strudel: 's("rim")' },
    ],
  },
  {
    id: 'rhythmace', name: 'Rhythm Ace', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
    ],
  },
  {
    id: 'visco', name: 'Visco Space Drum', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 50, name: 'Hi Tom', strudel: 's("ht")' }, { pitch: 47, name: 'Lo Tom', strudel: 's("lt")' },
      { pitch: 49, name: 'Crash', strudel: 's("cr")' },
    ],
  },
  {
    id: 'cassio', name: 'Casio', category: 'percussion',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'HiHat', strudel: 's("hh")' }, { pitch: 56, name: 'Cowbell', strudel: 's("cb")' },
      { pitch: 39, name: 'Clap', strudel: 's("cp")' },
    ],
  },
  {
    id: 'jazz', name: 'Jazz Kit', category: 'drums',
    sounds: [
      { pitch: 36, name: 'Kick', strudel: 's("bd")' }, { pitch: 38, name: 'Snare', strudel: 's("sd")' },
      { pitch: 42, name: 'Closed HH', strudel: 's("hh")' }, { pitch: 46, name: 'Open HH', strudel: 's("oh")' },
      { pitch: 49, name: 'Ride', strudel: 's("rd")' }, { pitch: 56, name: 'Crash', strudel: 's("cr")' },
      { pitch: 37, name: 'Rim', strudel: 's("rim")' },
    ],
  },
];

type MelodyInstrument = { id: string; name: string; strudel: string; category: string };
const MELODY_INSTRUMENTS: MelodyInstrument[] = [
  { id: 'piano', name: 'Piano', strudel: 's("wt_piano")', category: 'keys' },
  { id: 'epiano', name: 'E-Piano', strudel: 's("wt_epiano")', category: 'keys' },
  { id: 'synth', name: 'FM Synth', strudel: 's("wt_fmsynth")', category: 'synth' },
  { id: 'bass', name: 'E-Bass', strudel: 's("wt_ebass")', category: 'bass' },
  { id: 'dbass', name: 'Double Bass', strudel: 's("wt_dbass")', category: 'bass' },
  { id: 'strings', name: 'String Box', strudel: 's("wt_stringbox")', category: 'orchestral' },
  { id: 'violin', name: 'Violin', strudel: 's("wt_violin")', category: 'orchestral' },
  { id: 'cello', name: 'Cello', strudel: 's("wt_cello")', category: 'orchestral' },
  { id: 'pad', name: 'Theremin', strudel: 's("wt_theremin")', category: 'synth' },
  { id: 'organ', name: 'Organ', strudel: 's("wt_eorgan")', category: 'keys' },
  { id: 'flute', name: 'Flute', strudel: 's("wt_flute")', category: 'wind' },
  { id: 'pluck', name: 'Clavinet', strudel: 's("wt_clavinet")', category: 'keys' },
  { id: 'vgame', name: '8-Bit', strudel: 's("wt_vgame")', category: 'synth' },
  { id: 'aguitar', name: 'Acoustic Guitar', strudel: 's("wt_aguitar")', category: 'guitar' },
  { id: 'eguitar', name: 'Electric Guitar', strudel: 's("wt_eguitar")', category: 'guitar' },
];

function microsPerBeat(bpm: number): bigint {
  return BigInt(Math.round(60_000_000 / bpm));
}

function microsToPixels(value: bigint, bpm: number) {
  const mpb = microsPerBeat(bpm);
  return Number(value * 1000n / mpb) * BEAT_WIDTH / 1000;
}

function pixelsToMicros(px: number, bpm: number) {
  const mpb = microsPerBeat(bpm);
  return BigInt(Math.max(0, Math.round(px / BEAT_WIDTH * 1000))) * mpb / 1000n;
}

function formatTimecode(playheadMicros: bigint, bpm: number, beatsPerBar: number) {
  const mpb = microsPerBeat(bpm);
  const beat = Number(playheadMicros / mpb);
  const bar = Math.floor(beat / beatsPerBar) + 1;
  const inBar = (beat % beatsPerBar) + 1;
  const tick = Math.floor((Number(playheadMicros % mpb) / Number(mpb)) * 96);
  return { bar: String(bar).padStart(2, '0'), beat: String(Math.floor(inBar)).padStart(2, '0'), tick: String(tick).padStart(2, '0') };
}

function shortId(value: unknown) {
  const text = String(value ?? '');
  return text.length > 8 ? text.slice(0, 8) : text || 'anon';
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';
}

function viewDisplayName(view: { name: string; kind: string; owner: { toHexString(): string } }, identity: { toHexString(): string } | null | undefined, members: { displayName: string; identity: { toHexString(): string } }[]) {
  if (view.kind === 'master' || view.kind === 'shared') return view.name;
  const isOwner = identity && view.owner.toHexString() === identity.toHexString();
  if (isOwner) return 'My View';
  const owner = members.find(m => m.identity.toHexString() === view.owner.toHexString());
  return owner ? `${owner.displayName}'s View` : view.name;
}

function volumeToDb(volume: number, muted: boolean) {
  if (muted) return 'Muted';
  if (volume <= 0) return '-∞ dB';
  return `${(20 * Math.log10(volume)).toFixed(1)} dB`;
}

function waveBars(seed: bigint, count = 44) {
  let x = Number(seed % 2_147_483_647n) || 17;
  return Array.from({ length: count }, () => {
    x = (x * 48271) % 2_147_483_647;
    return 5 + (x % 28);
  });
}

function midiPreview(midiJson: string) {
  return parseMidiNotes(midiJson);
}

type MidiNote = {
  id: string;
  pitch: number;
  startBeat: number;
  lengthBeats: number;
  velocity: number;
};

function parseMidiNotes(midiJson: string): MidiNote[] {
  try {
    const parsed = JSON.parse(midiJson || '{}') as { notes?: MidiNote[] };
    return parsed.notes ?? [];
  } catch {
    return [];
  }
}

function serializeMidiNotes(notes: MidiNote[]) {
  return JSON.stringify({ notes });
}

function pitchName(pitch: number) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12) - 1}`;
}

function isMidiBlock(block: { kind: string }) {
  return block.kind !== 'audio';
}

function isSampleBlock(block: { instrumentKind?: string }) {
  return block.instrumentKind === 'sample';
}

function useRoomToken() {
  return useMemo(() => {
    const match = window.location.pathname.match(/^\/r\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }, []);
}

function App() {
  const [globalName, setGlobalName] = useState('');
  const [activeViewId, setActiveViewId] = useState<bigint | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [newViewName, setNewViewName] = useState('Mix View');
  const [selectedBlockId, setSelectedBlockId] = useState<bigint | null>(null);
  const [openPianoRollBlockId, setOpenPianoRollBlockId] = useState<bigint | null>(null);
  const [masterVolume, setMasterVolume] = useState(0.82);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [hiddenPlayheads, setHiddenPlayheads] = useState<Set<bigint>>(new Set());
  const [blockDrag, setBlockDrag] = useState<{ blockId: bigint; mode: 'move' | 'resize'; originX: number; startBeat: number; lengthBeats: number } | null>(null);
  const blockDragRef = useRef<typeof blockDrag>(null);
  const blockDragMovedRef = useRef(false);
  const blockDragEndedRef = useRef(false);
  const [loopDragStartBeat, setLoopDragStartBeat] = useState<number | null>(null);
  const [loopDragCurrentBeat, setLoopDragCurrentBeat] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; trackId: bigint } | null>(null);
  const [addBlockType, setAddBlockType] = useState<{ trackId: bigint; category: 'melody' | 'sample' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [audioRenderRetry, setAudioRenderRetry] = useState(0);

  const tokenFromUrl = useRoomToken();
  const [page, setPage] = useState<'list' | 'workspace'>(tokenFromUrl ? 'workspace' : 'list');
  const [displayPlayheadMicros, setDisplayPlayheadMicros] = useState<bigint>(0n);
  const [playbackRestartToken, setPlaybackRestartToken] = useState(0);

  const { isActive: connected, identity } = useSpacetimeDB();
  const [users] = useTable(tables.user);
  const [rooms] = useTable(tables.room);
  const [members] = useTable(tables.roomMember);
  const [views] = useTable(tables.view);
  const [tracks] = useTable(tables.track);
  const [trackStates] = useTable(tables.viewTrackState);
  const [blocks] = useTable(tables.block);
  const [assets] = useTable(tables.asset);


  const registerUser = useReducer(reducers.registerUser);
  const createRoom = useReducer(reducers.createRoom);
  const joinRoom = useReducer(reducers.joinRoom);
  const createSharedView = useReducer(reducers.createSharedView);
  const updateViewTransport = useReducer(reducers.updateViewTransport);
  const updateViewTrackState = useReducer(reducers.updateViewTrackState);
  const updateViewLoopRegion = useReducer(reducers.updateViewLoopRegion);
  const createAsset = useReducer(reducers.createAsset);
  const addAssetChunk = useReducer(reducers.addAssetChunk);
  const createTrack = useReducer(reducers.createTrack);
  const renameTrackReducer = useReducer(reducers.renameTrack);
  const createBlock = useReducer(reducers.createBlock);
  const updateBlock = useReducer(reducers.updateBlock);
  const updateBlockMidi = useReducer(reducers.updateBlockMidi);


  const heartbeat = useReducer(reducers.heartbeat);

  useEffect(() => {
    if (!connected) return;
    const interval = window.setInterval(() => void heartbeat(), 15_000);
    void heartbeat();
    return () => window.clearInterval(interval);
  }, [connected, heartbeat]);

  const myUser = useMemo(() => users.find(u => u.identity.toHexString() === identity?.toHexString()), [users, identity]);
  
  const currentRoom = useMemo(() => {
    if (tokenFromUrl) return rooms.find(room => room.token === tokenFromUrl) ?? null;
    return rooms.find(room => room.owner.toHexString() === identity?.toHexString()) ?? rooms[0] ?? null;
  }, [identity, rooms, tokenFromUrl]);

  const roomMembers = useMemo(() => members.filter(member => member.roomId === currentRoom?.id), [currentRoom?.id, members]);
  const roomViews = useMemo(() => views.filter(view => view.roomId === currentRoom?.id).sort((a, b) => Number(a.id - b.id)), [currentRoom?.id, views]);
  const roomTracks = useMemo(() => tracks.filter(track => track.roomId === currentRoom?.id).sort((a, b) => a.position - b.position), [currentRoom?.id, tracks]);
  const activeView = roomViews.find(view => view.id === activeViewId) ?? roomViews.find(view => view.kind === 'master') ?? roomViews[0] ?? null;
  const activeTrackStates = useMemo(() => trackStates.filter(state => state.viewId === activeView?.id), [activeView?.id, trackStates]);
  const masterView = roomViews.find(view => view.kind === 'master') ?? null;
  const masterTrackStates = useMemo(() => trackStates.filter(state => state.viewId === masterView?.id), [masterView?.id, trackStates]);
  
  const computedTrackStateMap = useMemo(() => {
    const map = new Map<bigint, { muted: boolean; volume: number }>();
    const anySolo = activeTrackStates.some(ts => ts.solo);
    for (const track of roomTracks) {
      const ts = activeTrackStates.find(s => s.trackId === track.id);
      const muted = ts?.muted ?? false;
      const solo = ts?.solo ?? false;
      const effectivelyMuted = anySolo ? !solo : muted;
      map.set(track.id, { muted: effectivelyMuted, volume: ts?.volume ?? 0.72 });
    }
    return map;
  }, [activeTrackStates, roomTracks]);

  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const localPlayheadRef = useRef<bigint>(0n);
  const lastSyncRef = useRef<number>(0);
  const viewIdRef = useRef<bigint | null>(null);
  const bpmRef = useRef<number>(120);
  const playingRef = useRef<boolean>(false);
  const loopStartMicrosRef = useRef<bigint>(0n);
  const loopEndMicrosRef = useRef<bigint>(24n * 4n * 500_000n);
  const maxBeatsRef = useRef<number>(24 * 4);
  const loopBeatsRef = useRef<number>(24 * 4);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const metronomeHandleRef = useRef<PlaybackHandle | null>(null);
  const metronomeBufferRef = useRef<AudioBuffer | null>(null);
  const trackBuffersRef = useRef<Map<bigint, AudioBuffer>>(new Map());
  const playbackHandleRef = useRef<PlaybackHandle | null>(null);
  const renderingRef = useRef<boolean>(false);
  const lastRenderKeyRef = useRef<string>('');
  const timelineRulerRef = useRef<HTMLDivElement>(null);

  if (activeView) {
    const roomTrackIds = new Set(roomTracks.map(t => t.id));
    const roomBlocks = blocks.filter(b => roomTrackIds.has(b.trackId));
    const contentEndBeat = roomBlocks.length > 0 ? Math.max(...roomBlocks.map(b => b.startBeat + b.lengthBeats)) : activeView.beatsPerBar;

    const customLoop = (activeView.loopLengthBeats ?? 0) > 0;
    const loopBeats = customLoop ? activeView.loopStartBeat + activeView.loopLengthBeats : Math.max(activeView.beatsPerBar, Math.ceil(contentEndBeat / activeView.beatsPerBar) * activeView.beatsPerBar);
    const visualBeats = Math.max(24, loopBeats + activeView.beatsPerBar);
    
    maxBeatsRef.current = visualBeats;
    loopBeatsRef.current = loopBeats;
    loopStartMicrosRef.current = customLoop ? BigInt(Math.round(activeView.loopStartBeat * (60_000_000 / activeView.bpm))) : 0n;
    loopEndMicrosRef.current = BigInt(Math.round(loopBeats * (60_000_000 / activeView.bpm)));
  }

  useEffect(() => {
    if (!activeView) return;

    viewIdRef.current = activeView.id;
    bpmRef.current = activeView.bpm;
    playingRef.current = activeView.playState === 'playing';

    if (activeView.playState !== 'playing') {
      cancelAnimationFrame(animationRef.current);
      lastTimeRef.current = 0;
      localPlayheadRef.current = activeView.playheadMicros;
      setDisplayPlayheadMicros(activeView.playheadMicros);
      return;
    }

    localPlayheadRef.current = activeView.playheadMicros;
    setDisplayPlayheadMicros(activeView.playheadMicros);
    lastTimeRef.current = 0;
    lastSyncRef.current = 0;

    const tick = (now: number) => {
      if (!playingRef.current) return;

      if (!lastTimeRef.current) {
        lastTimeRef.current = now;
        animationRef.current = requestAnimationFrame(tick);
        return;
      }

      const elapsedMicros = BigInt(Math.round((now - lastTimeRef.current) * 1000));
      lastTimeRef.current = now;

      let nextPlayhead = localPlayheadRef.current + elapsedMicros;
      if (nextPlayhead >= loopEndMicrosRef.current) {
        const loopLen = loopEndMicrosRef.current - loopStartMicrosRef.current;
        nextPlayhead = loopStartMicrosRef.current + ((nextPlayhead - loopStartMicrosRef.current) % loopLen);
      }

      localPlayheadRef.current = nextPlayhead;
      setDisplayPlayheadMicros(nextPlayhead);

      if (now - lastSyncRef.current > 33) {
        lastSyncRef.current = now;
        const vid = viewIdRef.current;
        if (vid && playingRef.current) {
          void updateViewTransport({
            viewId: vid,
            playState: 'playing',
            playheadMicros: nextPlayhead,
            bpm: bpmRef.current,
          });
        }
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [activeView?.id, activeView?.playState, activeView?.bpm, updateViewTransport]);

  // Sync remote scrubs
  useEffect(() => {
    if (activeView?.playheadMicros !== undefined) {
      const diff = Math.abs(Number(activeView.playheadMicros - localPlayheadRef.current));
      if (activeView.playState !== 'playing') {
        localPlayheadRef.current = activeView.playheadMicros;
        setDisplayPlayheadMicros(activeView.playheadMicros);
      } else if (diff > 500_000) {
        // Significant jump while playing = remote scrub
        localPlayheadRef.current = activeView.playheadMicros;
        setDisplayPlayheadMicros(activeView.playheadMicros);
        setPlaybackRestartToken(t => t + 1);
      }
    }
  }, [activeView?.playState, activeView?.playheadMicros]);

  const scrubToPixel = useCallback((clientX: number, element: HTMLElement) => {
    if (!activeView || !canEditView) return;
    const rect = element.getBoundingClientRect();
    const scrollLeft = element.scrollLeft ?? 0;
    const px = clientX - rect.left + scrollLeft;
    const micros = pixelsToMicros(px, activeView.bpm);
    localPlayheadRef.current = micros;
    setDisplayPlayheadMicros(micros);
    if (activeView.playState === 'playing') setPlaybackRestartToken(t => t + 1);
    void updateViewTransport({ viewId: activeView.id, playState: activeView.playState, playheadMicros: micros, bpm: activeView.bpm });
  }, [activeView, updateViewTransport]);

  // Render track buffers when block/track data changes
  useEffect(() => {
    if (!activeView) return;
    const roomTrackIds = new Set(roomTracks.map(t => t.id));
    const roomBlocks = blocks.filter(b => roomTrackIds.has(b.trackId));
    const midiBlocks = roomBlocks.filter(b => b.kind !== 'audio');

    // Build a key from all MIDI data to detect changes
    const renderKey = midiBlocks.map(b => `${b.id}:${b.midiJson}:${b.startBeat}:${b.lengthBeats}:${b.loopBeats}:${b.instrumentKind}:${b.instrumentKey}`).sort().join('|')
      + `|bpm=${activeView.bpm}|beats=${loopBeatsRef.current}|ls=${activeView.loopStartBeat}|ll=${activeView.loopLengthBeats}`;
    if (renderKey === lastRenderKeyRef.current) return;

    if (renderingRef.current) return; // don't overlap renders
    
    lastRenderKeyRef.current = renderKey;
    renderingRef.current = true;

    const trackShapes = roomTracks.map(t => ({ id: t.id, name: t.name }));
    const blockShapes = midiBlocks.map(b => ({
      id: b.id, trackId: b.trackId, kind: b.kind, name: b.name,
      startBeat: b.startBeat, lengthBeats: b.lengthBeats, loopBeats: b.loopBeats, midiJson: b.midiJson, assetId: b.assetId,
      instrumentKind: b.instrumentKind, instrumentKey: b.instrumentKey,
    }));
    const loopBeats = loopBeatsRef.current;

    void renderAllTrackBuffers(trackShapes, blockShapes, activeView.bpm, loopBeats, 44100).then(buffers => {
      trackBuffersRef.current = buffers;
      renderingRef.current = false;
      console.log(`[audio] rendered ${buffers.size} track buffers`);
      if (playingRef.current && audioCtxRef.current && playbackHandleRef.current) {
        const playheadSec = playbackHandleRef.current.getCurrentTime();
        
        playbackHandleRef.current.stop();
        if (metronomeHandleRef.current) metronomeHandleRef.current.stop();

        const effLoopStart = (activeView.loopLengthBeats ?? 0) > 0 ? (activeView.loopStartBeat ?? 0) : 0;
        playbackHandleRef.current = schedulePlayback(audioCtxRef.current, buffers, playheadSec, activeView.bpm, loopBeats, computedTrackStateMap, effLoopStart);
        
        if (metronomeEnabled && metronomeBufferRef.current) {
          metronomeHandleRef.current = scheduleMetronome(audioCtxRef.current, metronomeBufferRef.current, playheadSec, loopBeats, activeView.bpm, effLoopStart);
        }
      }
      setAudioRenderRetry(c => c + 1);
    }).catch(err => {
      console.error('[audio] render error:', err);
      renderingRef.current = false;
      setAudioRenderRetry(c => c + 1);
    });
  }, [activeView?.bpm, blocks, roomTracks, activeView, audioRenderRetry]);

  // Playback: play/pause/stop using pre-rendered buffers
  useEffect(() => {
    if (!activeView) return;

    let cancelled = false;

    const stopPlayback = () => {
      if (playbackHandleRef.current) {
        playbackHandleRef.current.stop();
        playbackHandleRef.current = null;
      }
      if (metronomeHandleRef.current) {
        metronomeHandleRef.current.stop();
        metronomeHandleRef.current = null;
      }
    };

    if (activeView.playState !== 'playing') {
      stopPlayback();
      return;
    }

    // Starting fresh playback
    let playheadSec = Number(localPlayheadRef.current) / 1_000_000;
    if (playbackHandleRef.current) {
      playheadSec = playbackHandleRef.current.getCurrentTime();
    }

    stopPlayback();

    const loopBeats = loopBeatsRef.current;

    // Build track states map for mute/volume


    // Start playback with pre-rendered buffers
    const startPlayback = async () => {
      const audioCtx = await ensureLiveContext();
      if (cancelled) return;
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      if (cancelled) return;

      const buffers = trackBuffersRef.current;
      const effLoopStart = (activeView.loopLengthBeats ?? 0) > 0 ? (activeView.loopStartBeat ?? 0) : 0;
      if (buffers.size > 0) {
        const handle = schedulePlayback(audioCtx, buffers, playheadSec, activeView.bpm, loopBeats, computedTrackStateMap, effLoopStart);
        playbackHandleRef.current = handle;
      }

      // Metronome
      if (metronomeEnabled) {
        if (!metronomeBufferRef.current) {
          const buf = await generateMetronomeBuffer(activeView.bpm, activeView.beatsPerBar, loopBeats, audioCtx.sampleRate);
          if (cancelled) return;
          metronomeBufferRef.current = buf;
        }
        const metroHandle = scheduleMetronome(audioCtx, metronomeBufferRef.current, playheadSec, loopBeats, activeView.bpm, effLoopStart);
        metronomeHandleRef.current = metroHandle;
      }
    };

    void startPlayback();

    return () => {
      cancelled = true;
      stopPlayback();
    };
  }, [activeView?.playState, metronomeEnabled, playbackRestartToken]);

  // Update gains in real-time when mute/volume changes (no re-render needed)
  useEffect(() => {
    if (!playbackHandleRef.current) return;
    updatePlaybackGains(playbackHandleRef.current, computedTrackStateMap);
  }, [computedTrackStateMap]);

  useEffect(() => {
    if (!blockDrag) return;
    blockDragRef.current = blockDrag;
    blockDragMovedRef.current = false;
    const onMove = (event: PointerEvent) => {
      const drag = blockDragRef.current;
      if (!drag) return;
      if (Math.abs(event.clientX - drag.originX) > 2) blockDragMovedRef.current = true;
      const dx = event.clientX - drag.originX;
      const dBeats = dx / BEAT_WIDTH;
      const el = document.querySelector(`[data-block-id="${drag.blockId}"]`) as HTMLElement | null;
      if (!el) return;
      if (drag.mode === 'move') {
        const newStart = Math.max(0, Math.round((drag.startBeat + dBeats) * 4) / 4);
        el.style.left = `${newStart * BEAT_WIDTH}px`;
      } else {
        const newLen = Math.max(0.25, Math.round((drag.lengthBeats + dBeats) * 4) / 4);
        el.style.width = `${newLen * BEAT_WIDTH}px`;
      }
    };
    const onUp = (event: PointerEvent) => {
      const drag = blockDragRef.current;
      blockDragRef.current = null;
      if (!drag) return;
      if (!blockDragMovedRef.current) { setBlockDrag(null); return; }
      const dx = event.clientX - drag.originX;
      const dBeats = dx / BEAT_WIDTH;
      const block = blocks.find(b => b.id === drag.blockId);
      if (block) {
        const base = { blockId: block.id, name: block.name, assetOffsetMicros: block.assetOffsetMicros, assetDurationMicros: block.assetDurationMicros, gain: block.gain, fadeInMicros: block.fadeInMicros, fadeOutMicros: block.fadeOutMicros, reverse: block.reverse, pitchSemitones: block.pitchSemitones, timeStretch: block.timeStretch, midiJson: block.midiJson, instrumentKind: block.instrumentKind ?? 'melodic', instrumentKey: block.instrumentKey ?? 'piano', loopBeats: block.loopBeats };
        if (drag.mode === 'move') {
          const newStart = Math.max(0, Math.round((drag.startBeat + dBeats) * 4) / 4);
          void updateBlock({ ...base, startBeat: newStart, lengthBeats: block.lengthBeats });
        } else {
          const newLen = Math.max(0.25, Math.round((drag.lengthBeats + dBeats) * 4) / 4);
          void updateBlock({ ...base, startBeat: block.startBeat, lengthBeats: newLen });
        }
      }
      blockDragEndedRef.current = true;
      setTimeout(() => { blockDragEndedRef.current = false; }, 50);
      setBlockDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); blockDragRef.current = null; };
  }, [blockDrag]);



  const needsJoinPrompt = !!tokenFromUrl && !!currentRoom && !!connected && !roomMembers.some(member => member.identity.toHexString() === identity?.toHexString());



  useEffect(() => {
    if (!activeViewId && roomViews.length > 0) setActiveViewId((roomViews.find(view => view.kind === 'master') ?? roomViews[0]).id);
  }, [activeViewId, roomViews]);

  const createProject = (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!connected) return;
    const ADJECTIVES = ['Neon', 'Synth', 'Retro', 'Digital', 'Analog', 'Cosmic', 'Electric', 'Sonic', 'Funky', 'Chill'];
    const NOUNS = ['Studio', 'Jam', 'Beat', 'Track', 'Room', 'Vibe', 'Groove', 'Session', 'Lab', 'Space'];
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    void createRoom({ name: `${adj} ${noun}` });
  };

  const shareUrl = currentRoom ? `${window.location.origin}/r/${currentRoom.token}` : '';
  const activeMember = roomMembers.find(member => member.identity.toHexString() === identity?.toHexString());
  const canEdit = !!activeMember && activeMember.role !== 'viewer';
  
  const canEditView = useMemo(() => {
    if (!activeView) return false;
    if (activeView.owner.toHexString() === identity?.toHexString()) return true;
    if (!activeView.locked && canEdit) return true;
    if (activeView.kind !== 'personal' && canEdit) return true;
    return false;
  }, [activeView, identity, canEdit]);

  const selectedBlock = blocks.find(block => block.id === selectedBlockId) ?? null;
  const pianoRollBlock = blocks.find(block => block.id === openPianoRollBlockId) ?? null;

  const stateForTrack = (trackId: bigint) => activeTrackStates.find(state => state.trackId === trackId);
  const masterStateForTrack = (trackId: bigint) => masterTrackStates.find(state => state.trackId === trackId);
  const blocksForTrack = (trackId: bigint) => blocks.filter(block => block.trackId === trackId).sort((a, b) => a.startBeat - b.startBeat);



  const setTransport = (playState: string, playheadMicros = activeView?.playheadMicros ?? 0n) => {
    if (!activeView || !canEditView) return;
    playingRef.current = playState === 'playing';
    void updateViewTransport({ viewId: activeView.id, playState, playheadMicros, bpm: activeView.bpm });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return;
      const vid = viewIdRef.current;
      if (!vid) return;

      if (event.code === 'Space') {
        event.preventDefault();
        const nextPlaying = !playingRef.current;
        playingRef.current = nextPlaying;
        void updateViewTransport({ viewId: vid, playState: nextPlaying ? 'playing' : 'paused', playheadMicros: localPlayheadRef.current, bpm: bpmRef.current });
      }
      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        const measureMicros = BigInt(Math.round(4 * (60_000_000 / bpmRef.current)));
        const current = localPlayheadRef.current;
        const target = current > measureMicros ? current - measureMicros : 0n;
        void updateViewTransport({ viewId: vid, playState: playingRef.current ? 'playing' : 'paused', playheadMicros: target, bpm: bpmRef.current });
      }
      if (event.code === 'ArrowRight') {
        event.preventDefault();
        const measureMicros = BigInt(Math.round(4 * (60_000_000 / bpmRef.current)));
        void updateViewTransport({ viewId: vid, playState: playingRef.current ? 'playing' : 'paused', playheadMicros: localPlayheadRef.current + measureMicros, bpm: bpmRef.current });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [updateViewTransport]);

  const toggleTrackMute = (trackId: bigint) => {
    if (!activeView || !canEditView) return;
    const state = stateForTrack(trackId);
    void updateViewTrackState({
      viewId: activeView.id,
      trackId,
      muted: !(state?.muted ?? false),
      solo: state?.solo ?? false,
      volume: state?.volume ?? 0.72,
      pan: state?.pan ?? 0,
    });
  };

  const toggleTrackSolo = (trackId: bigint) => {
    if (!activeView || !canEditView) return;
    const state = stateForTrack(trackId);
    void updateViewTrackState({
      viewId: activeView.id,
      trackId,
      muted: state?.muted ?? false,
      solo: !(state?.solo ?? false),
      volume: state?.volume ?? 0.72,
      pan: state?.pan ?? 0,
    });
  };

  const setTrackVolume = (trackId: bigint, volume: number) => {
    if (!activeView) return;
    const state = stateForTrack(trackId);
    void updateViewTrackState({
      viewId: activeView.id,
      trackId,
      muted: state?.muted ?? false,
      solo: state?.solo ?? false,
      volume,
      pan: state?.pan ?? 0,
    });
  };

  const createView = () => {
    if (!currentRoom || !newViewName.trim()) return;
    void createSharedView({ roomId: currentRoom.id, name: newViewName.trim() });
    setModalOpen(false);
    setNewViewName('Mix View');
  };

  const addTrack = () => {
    if (!currentRoom || !canEdit) return;
    const used = new Set(roomTracks.map(track => track.name));
    let index = 1;
    while (used.has(`Track ${index}`)) index += 1;
    void createTrack({ roomId: currentRoom.id, name: `Track ${index}` });
  };

  const renameTrack = (trackId: bigint, name: string) => {
    if (!canEdit) return;
    void renameTrackReducer({ trackId, name });
  };



  const handleFileUpload = async (file: File | null) => {
    if (!file || !currentRoom || !canEdit) return;
    setUploading(true);
    setUploadError(null);
    try {
      const metadata = await analyzeAudioFile(file);
      const clientUploadKey = makeClientUploadKey(currentRoom.id);

      await createAsset({
        roomId: currentRoom.id,
        clientUploadKey,
        name: file.name,
        mimeType: metadata.mimeType,
        byteSize: metadata.byteSize,
        durationMicros: metadata.durationMicros,
        sampleRate: metadata.sampleRate,
        channels: metadata.channels,
        waveformJson: metadata.waveformJson,
      });

      const createdAsset = assets.find(asset => asset.clientUploadKey === clientUploadKey);
      const assetRow = createdAsset ?? (await waitForAsset(clientUploadKey, () => assets.find(asset => asset.clientUploadKey === clientUploadKey)));
      if (!assetRow) throw new Error('Uploaded asset did not appear in subscriptions');

      const chunks = chunkAudioBuffer(metadata.buffer);
      for (const chunk of chunks) {
        await addAssetChunk({ assetId: assetRow.id, chunkIndex: chunk.chunkIndex, dataBase64: chunk.dataBase64, byteSize: chunk.byteSize });
      }

      await putCachedAudioAsset({
        key: `${assetRow.id.toString()}:${assetRow.byteSize.toString()}:${assetRow.createdAt.microsSinceUnixEpoch.toString()}`,
        mimeType: assetRow.mimeType,
        byteSize: Number(assetRow.byteSize),
        data: metadata.buffer,
      });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const myOwnedRooms = useMemo(() => rooms.filter(room => room.owner.toHexString() === identity?.toHexString()).sort((a, b) => Number(b.updatedAt.microsSinceUnixEpoch - a.updatedAt.microsSinceUnixEpoch)), [identity, rooms]);
  const myMemberRoomIds = useMemo(() => {
    const ids = new Set<bigint>();
    for (const member of members) {
      if (member.identity.toHexString() === identity?.toHexString()) ids.add(member.roomId);
    }
    return ids;
  }, [identity, members]);
  const myJoinedRooms = useMemo(() => rooms.filter(room => myMemberRoomIds.has(room.id) && room.owner.toHexString() !== identity?.toHexString()).sort((a, b) => Number(b.updatedAt.microsSinceUnixEpoch - a.updatedAt.microsSinceUnixEpoch)), [identity, myMemberRoomIds, rooms]);

  const navigateToRoom = useCallback((roomToken: string) => {
    window.history.pushState({}, '', `/r/${roomToken}`);
    window.location.href = `/r/${roomToken}`;
  }, []);

  const navigateToList = useCallback(() => {
    window.history.pushState({}, '', '/');
    setPage('list');
  }, []);

  if (connected && !myUser) {
    return (
      <main className="landing">
        <div className="landing-card" style={{ maxWidth: 400 }}>
          <div className="logo big">ripple<i /></div>
          <h1>What should we call you?</h1>
          <p>Enter a display name so others can identify you.</p>
          <form className="create-room-form" onSubmit={e => {
            e.preventDefault();
            if (globalName.trim()) void registerUser({ name: globalName.trim() });
          }}>
            <input className="modal-input" autoFocus value={globalName} onChange={e => setGlobalName(e.target.value)} placeholder="Your name" />
            <button className="modal-btn primary" disabled={!globalName.trim()}>Continue</button>
          </form>
        </div>
      </main>
    );
  }

  if (page === 'list') {
    return (
      <main className="landing">
        <div className="workspace-list">
          <div className="logo big">ripple<i /></div>
          <h1>Your Workspaces</h1>
          <p>Create a new collaborative DAW room or open an existing one.</p>
          <div className="create-room-form">
            <button className="modal-btn primary" onClick={() => createProject()} disabled={!connected}>Create Workspace</button>
          </div>
          <div className="bs mono" style={{ marginBottom: 12 }}>Status <span>{connected ? 'Connected' : 'Disconnected'}</span></div>
          {myOwnedRooms.length > 0 ? (
            <div className="room-section">
              <div className="room-section-title mono">Your Rooms</div>
              {myOwnedRooms.map(room => (
                <button key={String(room.id)} className="room-card" onClick={() => navigateToRoom(room.token)}>
                  <div className="room-card-name">{room.name}</div>
                  <div className="room-card-meta mono">Token <span>{room.token.slice(0, 12)}...</span></div>
                </button>
              ))}
            </div>
          ) : null}
          {myJoinedRooms.length > 0 ? (
            <div className="room-section">
              <div className="room-section-title mono">Joined Rooms</div>
              {myJoinedRooms.map(room => (
                <button key={String(room.id)} className="room-card" onClick={() => navigateToRoom(room.token)}>
                  <div className="room-card-name">{room.name}</div>
                  <div className="room-card-meta mono">Token <span>{room.token.slice(0, 12)}...</span></div>
                </button>
              ))}
            </div>
          ) : null}
          {myOwnedRooms.length === 0 && myJoinedRooms.length === 0 ? (
            <div className="empty-rooms">No rooms yet. Create one above to get started.</div>
          ) : null}
        </div>
      </main>
    );
  }

  if (!currentRoom) {
    return (
      <main className="landing">
        <div className="landing-card">
          <div className="logo big">ripple<i /></div>
          <h1>Room not found</h1>
          <p>This room may have been deleted or the link is invalid.</p>
          <button className="modal-btn primary" onClick={navigateToList}>Back to Workspaces</button>
        </div>
      </main>
    );
  }

  const time = formatTimecode(displayPlayheadMicros, activeView?.bpm ?? 120, activeView?.beatsPerBar ?? 4);

  if (needsJoinPrompt) {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <form className="modal" onSubmit={e => {
          e.preventDefault();
          if (connected) void joinRoom({ token: currentRoom.token });
        }}>
          <div className="modal-title">Join &ldquo;{currentRoom.name}&rdquo;</div>
          <div className="modal-sub">You are about to join this workspace.</div>
          <div className="modal-actions">
            <button className="modal-btn primary" type="submit" disabled={!connected}>Join Room</button>
          </div>
          <div className="bs mono" style={{ marginTop: 8 }}>Identity <span>{shortId(identity?.toHexString())}</span></div>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar roomName={currentRoom.name} connected={connected} members={roomMembers} shareUrl={shareUrl} onHome={navigateToList} />
      <div className="view-tabs">
        {roomViews.map((view, index) => (
          <button key={String(view.id)} className={`view-tab ${view.kind === 'master' ? 'master' : ''} ${view.id === activeView?.id ? 'active' : ''}`} onClick={() => setActiveViewId(view.id)}>
            {view.kind === 'master' ? <span className="vt-icon">★</span> : <span className={`vt-owner cav-${(index % 4) + 1}`}>{initials(view.name)[0]}</span>}
            <span>{viewDisplayName(view, identity, roomMembers)}</span>
            {view.kind === 'personal' && view.locked ? <span className="vt-lock">lock</span> : null}
          </button>
        ))}
        <button className="view-tab-add" onClick={() => setModalOpen(true)} title="New view">+</button>
      </div>
      <div className="transport">
        <button className="t-btn" disabled={!canEditView} onClick={() => setTransport('stopped', 0n)}>⏮</button>
        <button className={`t-btn ${activeView?.playState === 'playing' ? 'playing' : ''}`} disabled={!canEditView} onClick={() => setTransport(activeView?.playState === 'playing' ? 'paused' : 'playing')}>
          {activeView?.playState === 'playing' ? '⏸' : '▶'}
        </button>

        <button className="t-btn" disabled={!canEditView} onClick={() => setTransport('stopped')}>⏹</button>
        <button className={`t-btn ${metronomeEnabled ? 'playing' : ''}`} onClick={() => setMetronomeEnabled(!metronomeEnabled)} title="Metronome">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10.1 2.3-4.5 16.4a2 2 0 0 0 1.9 2.5h9a2 2 0 0 0 1.9-2.5l-4.5-16.4a2 2 0 0 0-3.8 0Z" />
            <path d="M12 2v20" />
            <circle cx="12" cy="14" r="2" />
          </svg>
        </button>
        <div className="tc mono">{time.bar}<span className="bar">:</span>{time.beat}.<span className="ms">{time.tick}</span></div>
        <button className="bpm-d mono" disabled={!canEditView} onClick={() => {
          if (!activeView || !canEditView) return;
          const input = window.prompt('Enter new BPM (60-300):', String(activeView.bpm));
          if (!input) return;
          const newBpm = parseInt(input, 10);
          if (!isNaN(newBpm) && newBpm >= 60 && newBpm <= 300) {
            updateViewTransport({ viewId: activeView.id, playState: activeView.playState, playheadMicros: activeView.playheadMicros, bpm: newBpm });
          }
        }}>BPM <span>{activeView?.bpm ?? 120}</span></button>
        <div className="sp" />
        <label className="master-volume mono">Master <input type="range" min="0" max="1" step="0.01" value={masterVolume} onChange={event => setMasterVolume(Number(event.target.value))} /></label>
        <div className="view-meta">
          <div className={`vm-icon ${activeView?.kind === 'master' ? '' : `ph-${(roomViews.findIndex(v => v.id === activeView?.id) % 4) + 1}`}`}>{activeView?.kind === 'master' ? '★' : initials(viewDisplayName(activeView, identity, roomMembers))[0]}</div>
          <div><div className="vm-label mono">VIEWING</div><div className="vm-val">{viewDisplayName(activeView, identity, roomMembers)}</div></div>
        </div>
      </div>
      <div className="ws">
        <div className="ths">
          {roomTracks.length === 0 ? (
            <div className="empty-tracks">
              <div className="empty-tracks-title mono">No tracks yet</div>
              <div className="empty-tracks-sub">Add your first track to get started.</div>
              <button className="modal-btn primary" onClick={addTrack} disabled={!canEdit}>+ Add Track</button>
            </div>
          ) : (
            <>
              {roomTracks.map(track => {
                const state = stateForTrack(track.id);
                const masterState = masterStateForTrack(track.id);
                const muted = state?.muted ?? false;
                const solo = state?.solo ?? false;
                const differsFromMaster = !!masterState && (masterState.muted !== muted || masterState.solo !== solo || Math.abs(masterState.volume - (state?.volume ?? 0.72)) > 0.01);
                const trackBlocks = blocksForTrack(track.id);
                const laneHasAudio = trackBlocks.some(block => block.kind === 'audio');
                const laneHasMidi = trackBlocks.some(block => block.kind !== 'audio');
                return (
                  <div key={String(track.id)} className={`${laneHasAudio ? 'th-audio' : 'th-midi'} ${muted ? 'muted' : ''} th`}>
                    <div className="tn"><div className={`t-icon ${laneHasAudio ? 'audio' : 'midi'}`}>{laneHasAudio ? '♫' : 'M'}</div><input className="track-name-input" disabled={!canEdit} value={track.name} onChange={event => renameTrack(track.id, event.target.value)} /></div>
                    {laneHasMidi ? <div className="midi-meta"><span className="midi-chan mono">MIDI</span><span className="midi-chan mono">Block</span></div> : null}
                    <div className="tc2"><button className={`tb ${solo ? 'tb-a' : ''}`} disabled={!canEditView} onClick={() => toggleTrackSolo(track.id)}>S</button><button className={`tb ${muted ? 'tb-m' : ''}`} disabled={!canEditView} onClick={() => toggleTrackMute(track.id)}>M</button></div>
                    <div className="meter"><div className="meter-f" style={{ width: activeView?.playState === 'playing' && !muted ? `${35 + ((Number(track.id) * 11) % 55)}%` : '8%' }} /></div>
                    <div className="view-overrides">{differsFromMaster ? <div className="vo-dot" /> : null}{trackBlocks.some(block => block.kind !== 'audio') ? <div className="vo-dot auto" /> : null}</div>
                  </div>
                );
              })}
              <button className="add-track-btn" onClick={addTrack} disabled={!canEdit}>+ Add Track</button>
            </>
          )}
        </div>
        <div className="tl-area">
          <div className="track-legend mono"><div className="legend-item"><div className="legend-swatch audio" />Audio</div><div className="legend-item"><div className="legend-swatch midi" />MIDI</div><div className="legend-sep" />{roomViews.slice(0, 4).map((view, index) => {
            const hidden = hiddenPlayheads.has(view.id);
            return <div className={`legend-item ${hidden ? 'legend-hidden' : ''}`} key={String(view.id)} onClick={() => { if (activeView && view.id === activeView.id) return; setHiddenPlayheads(prev => { const next = new Set(prev); if (next.has(view.id)) next.delete(view.id); else next.add(view.id); return next; }); }} style={{ cursor: 'pointer' }}><div className={`legend-swatch ph-${(index % 4) + 1}`} />{viewDisplayName(view, identity, roomMembers)}</div>;
          })}</div>
          <div className="tl-body"
               onClick={event => { setContextMenu(null); if (!blockDragRef.current && !blockDrag && !blockDragEndedRef.current) scrubToPixel(event.clientX, event.currentTarget); }}>
            <div className="ruler" ref={timelineRulerRef} 
              onPointerDown={event => {
                if (event.button === 2) {
                  if (!canEditView) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const clickX = event.clientX - rect.left + event.currentTarget.scrollLeft;
                  const beat = Math.round(clickX / BEAT_WIDTH);
                  setLoopDragStartBeat(beat);
                  setLoopDragCurrentBeat(beat);
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.preventDefault();
                  event.stopPropagation();
                } else if (event.button === 0) {
                  scrubToPixel(event.clientX, event.currentTarget);
                }
              }}
              onPointerMove={event => {
                if (loopDragStartBeat !== null) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const clickX = event.clientX - rect.left + event.currentTarget.scrollLeft;
                  const beat = Math.round(clickX / BEAT_WIDTH);
                  setLoopDragCurrentBeat(beat);
                }
              }}
              onPointerUp={event => {
                if (loopDragStartBeat !== null) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const clickX = event.clientX - rect.left + event.currentTarget.scrollLeft;
                  const beat = Math.round(clickX / BEAT_WIDTH);
                  const start = Math.min(loopDragStartBeat, beat);
                  const end = Math.max(loopDragStartBeat, beat);
                  const length = end - start;
                  if (activeView) {
                    updateViewLoopRegion({ viewId: activeView.id, loopStartBeat: start, loopLengthBeats: length });
                  }
                  setLoopDragStartBeat(null);
                  setLoopDragCurrentBeat(null);
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onContextMenu={event => event.preventDefault()}
            >
              {Array.from({ length: maxBeatsRef.current }, (_, index) => <div className={`rm mono ${index % (activeView?.beatsPerBar ?? 4) === 0 ? 'rm-measure' : ''}`} key={index}>{index % (activeView?.beatsPerBar ?? 4) === 0 ? `${Math.floor(index / (activeView?.beatsPerBar ?? 4)) + 1}` : ''}</div>)}
              {(() => {
                let renderStartBeat = activeView?.loopStartBeat ?? 0;
                let renderLengthBeats = activeView?.loopLengthBeats ?? 0;
                if (loopDragStartBeat !== null && loopDragCurrentBeat !== null) {
                  renderStartBeat = Math.min(loopDragStartBeat, loopDragCurrentBeat);
                  renderLengthBeats = Math.max(loopDragStartBeat, loopDragCurrentBeat) - renderStartBeat;
                }
                if (renderLengthBeats > 0) {
                  return (
                    <div style={{ position: 'absolute', left: renderStartBeat * BEAT_WIDTH, width: renderLengthBeats * BEAT_WIDTH, top: 0, bottom: 0, backgroundColor: 'oklch(68% 0.16 195 / 0.1)', borderLeft: '2px solid oklch(68% 0.16 195)', borderRight: '2px solid oklch(68% 0.16 195)', pointerEvents: 'none' }} />
                  );
                }
                return null;
              })()}
            </div>
            {roomViews.filter(view => !hiddenPlayheads.has(view.id) || (activeView && view.id === activeView.id)).map((view) => {
              const isActive = activeView && view.id === activeView.id;
              const playheadMicros = isActive ? displayPlayheadMicros : view.playheadMicros;
              const colorIndex = roomViews.indexOf(view) % 4;
              const label = view.kind === 'master' ? 'Master' : initials(viewDisplayName(view, identity, roomMembers));
              const left = microsToPixels(playheadMicros, view.bpm);
              return (
                <React.Fragment key={String(view.id)}>
                  <div
                    className={`playhead ${view.kind === 'master' ? 'master ph-master' : `ph-${(colorIndex % 4) + 1}`} ${isActive ? 'active' : ''}`}
                    style={{ left }}
                  />
                  <div
                    className={`playhead-label ${isActive ? 'active' : ''}`}
                    style={{ left: `calc(${left}px + 5px)`, color: view.kind === 'master' ? 'var(--fg)' : `var(--col-${['a','b','c','d'][colorIndex % 4]})` }}
                  >{label}</div>
                </React.Fragment>
              );
            })}
            {roomTracks.length === 0 ? (
              <div className="empty-timeline">
                <div className="empty-timeline-title">Add a track to start building your arrangement</div>
              </div>
            ) : null}
            {roomTracks.map(track => {
              const muted = stateForTrack(track.id)?.muted ?? false;
              const blocksForLane = blocksForTrack(track.id);
              return (
                <div key={String(track.id)} className={`${blocksForLane.some(block => block.kind === 'audio') ? 'lane-audio' : 'lane-midi'} ${muted ? 'lane-muted' : ''}`} style={{ width: maxBeatsRef.current * 80 }} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setContextMenu({ x: event.clientX, y: event.clientY, trackId: track.id }); }}>
                  {blocksForLane.map((block, index) => {
                    const isSelected = selectedBlockId === block.id;
                    const left = block.startBeat * BEAT_WIDTH;
                    const width = block.lengthBeats * BEAT_WIDTH;
                    const onBlockPointerDown = (event: React.PointerEvent) => {
                      if (event.button !== 0 || !canEdit) return;
                      event.stopPropagation();
                      setSelectedBlockId(block.id);
                      setBlockDrag({ blockId: block.id, mode: 'move', originX: event.clientX, startBeat: block.startBeat, lengthBeats: block.lengthBeats });
                    };
                    const onResizePointerDown = (event: React.PointerEvent) => {
                      if (event.button !== 0 || !canEdit) return;
                      event.stopPropagation();
                      setSelectedBlockId(block.id);
                      setBlockDrag({ blockId: block.id, mode: 'resize', originX: event.clientX, startBeat: block.startBeat, lengthBeats: block.lengthBeats });
                    };
                    return isMidiBlock(block) ? (
                      <button key={String(block.id)} data-block-id={String(block.id)} className={`clip-m s${(index % 3) + 1} ${isSelected ? 'selected' : ''}`} style={{ left, width }} onPointerDown={onBlockPointerDown} onDoubleClick={event => { event.stopPropagation(); setOpenPianoRollBlockId(block.id); }}>
                        <div className="midi-lbl">{block.name}</div><div className="midi-notes">{(() => {
                          const notes = midiPreview(block.midiJson);
                          if (!notes.length) return null;
                          const loopBeats = block.loopBeats > 0 ? block.loopBeats : block.lengthBeats;
                          const maxBeat = block.lengthBeats;
                          const renderedNotes = [];
                          for (const note of notes) {
                            let offset = 0;
                            while ((note.startBeat ?? 0) + offset < block.lengthBeats) {
                              const noteStart = (note.startBeat ?? 0) + offset;
                              const noteEnd = Math.min(noteStart + (note.lengthBeats ?? 0.25), block.lengthBeats);
                              const len = noteEnd - noteStart;
                              if (len > 0) {
                                renderedNotes.push(
                                  <span key={`${note.id || Math.random()}-${offset}`} className={`midi-note ${isSampleBlock(block) ? 'drum' : ''}`} style={{ left: `${(noteStart / maxBeat) * 100}%`, bottom: `${(((note.pitch ?? 60) - 36) / 48) * 100}%`, width: `${Math.max(2, (len / maxBeat) * 100)}%`, opacity: offset > 0 ? 0.3 : 1 }} />
                                );
                              }
                              offset += loopBeats;
                            }
                          }
                          return renderedNotes;
                        })()}</div>
                        <div className="clip-resize-handle" onPointerDown={onResizePointerDown} />
                      </button>
                    ) : (
                      <button key={String(block.id)} data-block-id={String(block.id)} className={`clip-a s${(index % 4) + 1} ${isSelected ? 'selected' : ''}`} style={{ left, width }} onPointerDown={onBlockPointerDown} onDoubleClick={event => { event.stopPropagation(); setOpenPianoRollBlockId(block.id); }}>
                        <div className="clip-bg">{waveBars(block.id).map((height, i) => <span key={i} style={{ height }} />)}</div><span className="clip-lbl">{block.name}</span>
                        <div className="clip-resize-handle" onPointerDown={onResizePointerDown} />
                      </button>
                    );
                  })}

                </div>
              );
            })}
          </div>
        </div>
        <div className="rp">
          <div className="ptabs"><button className="ptab ptab-a">Mixer</button></div>
          <div className="pcont">
            {roomTracks.map(track => {
              const state = stateForTrack(track.id);
              const volume = state?.volume ?? 0.72;
              const muted = state?.muted ?? false;
              return (
                <div className="ch" key={String(track.id)}>
                  <div className="ch-hd"><div className="ch-n"><span>{track.name}</span><span className="ch-type">LANE</span></div><div className="ch-db mono">{volumeToDb(volume, muted)}</div></div>
                  <input className="fader-input" type="range" min="0" max="1" step="0.01" value={volume} onChange={event => setTrackVolume(track.id, Number(event.target.value))} />
                  <div className="ch-meter"><div className="ch-meter-f" style={{ width: activeView?.playState === 'playing' && !muted ? `${25 + ((Number(track.id) * 9) % 65)}%` : '4%' }} /></div>

                </div>
              );
            })}
            <div className="files-box">
              <div className="modal-label mono">Files cached in browser</div>
              <div className="bs mono">Assets <span>{assets.length}</span></div>
              <label className="upload-drop">{uploading ? 'Uploading...' : 'Upload WAV / MP3 / OGG'}<input type="file" accept="audio/wav,audio/mpeg,audio/ogg" hidden disabled={!canEdit || uploading} onChange={event => void handleFileUpload(event.target.files?.[0] ?? null)} /></label>
              {uploadError ? <div className="bs mono warn-pop">Upload error <span>{uploadError}</span></div> : null}
            </div>
          </div>
        </div>
      </div>
      <div className="bb"><div className="bs mono">SR <span>48 kHz</span></div><div className="bs mono">Bit <span>24</span></div><div className="bs mono">Buffer <span>256</span></div><div className="bs mono">CPU <span>{activeView?.playState === 'playing' ? '18%' : '7%'}</span></div><div className="bsp" /><div className="bs mono">Identity <span>{shortId(identity?.toHexString())}</span></div></div>
      {modalOpen ? <div className="modal-overlay active"><div className="modal"><div className="modal-title">Create New View</div><div className="modal-sub">Views share tracks and blocks, but have their own playhead, playback state, and track mix.</div><label className="modal-label mono">View Name</label><input className="modal-input" value={newViewName} onChange={event => setNewViewName(event.target.value)} /><div className="modal-actions"><button className="modal-btn" onClick={() => setModalOpen(false)}>Cancel</button><button className="modal-btn primary" onClick={createView}>Create View</button></div></div></div> : null}
      {pianoRollBlock ? <PianoRollModal blockId={pianoRollBlock.id} block={pianoRollBlock} updateBlockMidi={updateBlockMidi} updateBlock={updateBlock} beatsPerBar={activeView?.beatsPerBar ?? 4} onClose={() => setOpenPianoRollBlockId(null)} /> : null}
      {selectedBlock ? (() => {
        return <div className="selection-popover mono">Selected {selectedBlock.kind}: <span>{selectedBlock.name}</span> · {selectedBlock.kind !== 'audio' ? <span style={{ cursor: 'pointer' }} onClick={() => setOpenPianoRollBlockId(selectedBlock.id)}>edit</span> : 'double click audio to edit'}</div>;
      })() : null}
      {contextMenu ? <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={event => event.stopPropagation()}>
        <button className="context-menu-item" onClick={() => { setAddBlockType({ trackId: contextMenu.trackId, category: 'melody' }); setContextMenu(null); }}>Add Melody Block</button>
        <button className="context-menu-item" onClick={() => { setAddBlockType({ trackId: contextMenu.trackId, category: 'sample' }); setContextMenu(null); }}>Add Sample Block</button>
      </div> : null}
      {addBlockType ? <div className="modal-overlay active" onClick={() => setAddBlockType(null)}>
        <div className="modal" onClick={event => event.stopPropagation()}>
          <div className="modal-title">{addBlockType.category === 'melody' ? 'Select Instrument' : 'Select Sample Kit'}</div>
          <div className="modal-sub">{addBlockType.category === 'melody' ? 'Choose an instrument for this melody block.' : 'Choose a sample kit for this block.'}</div>
          <div className="instrument-grid">
            {addBlockType.category === 'melody' ? MELODY_INSTRUMENTS.map(inst => (
              <button key={inst.id} className="instrument-card" onClick={() => { void createBlock({ trackId: addBlockType.trackId, kind: 'midi', name: inst.name, instrumentKind: 'melodic', instrumentKey: inst.id, assetId: 0n, startBeat: 1, lengthBeats: 4, loopBeats: 4, midiJson: '' }); setAddBlockType(null); }}>
                <div className="instrument-name mono">{inst.name}</div>
                <div className="instrument-cat">{inst.category}</div>
              </button>
            )) : SAMPLE_KITS.map(kit => (
              <button key={kit.id} className="instrument-card" onClick={() => { const midiJson = JSON.stringify({ notes: kit.sounds.slice(0, 3).map((s, i) => ({ id: `d${i}`, pitch: s.pitch, startBeat: i, lengthBeats: 0.5, velocity: 0.8 })) }); void createBlock({ trackId: addBlockType.trackId, kind: 'midi', name: kit.name, instrumentKind: 'sample', instrumentKey: kit.id, assetId: 0n, startBeat: 1, lengthBeats: 4, loopBeats: 4, midiJson }); setAddBlockType(null); }}>
                <div className="instrument-name mono">{kit.name}</div>
                <div className="instrument-cat">{kit.category} · {kit.sounds.length} sounds</div>
              </button>
            ))}
          </div>
          <div className="modal-actions"><button className="modal-btn" onClick={() => setAddBlockType(null)}>Cancel</button></div>
        </div>
      </div> : null}
    </div>
  );
}

function TopBar({ roomName, connected, members, shareUrl, onHome }: { roomName: string; connected: boolean; members: { displayName: string; active: boolean }[]; shareUrl: string; onHome: () => void }) {
  return (
    <div className="topbar">
      <button className="home-btn mono" onClick={onHome} title="Back to workspaces">← Home</button>
      <div className="logo">ripple<i /></div>
      <div className="session-info"><div className="session-name">{roomName}</div><div className="session-live"><div className="dot" /><div className="txt mono">{connected ? 'Live' : 'Offline'}</div></div></div>
      <div className="topbar-sp" />
      <button className="share-btn mono" onClick={() => void navigator.clipboard?.writeText(shareUrl)}>Copy Link</button>
      <div className="collab-avatars">{members.slice(0, 6).map((member, index) => <div key={`${member.displayName}-${index}`} className={`cav cav-${(index % 4) + 1} ${member.active ? 'active' : ''}`} title={member.displayName}>{initials(member.displayName)}</div>)}</div>
    </div>
  );
}

function PianoRollModal({ blockId, block, updateBlockMidi, updateBlock, beatsPerBar, onClose }: { blockId: bigint; block: { name: string; midiJson: string; instrumentKind?: string; instrumentKey?: string; startBeat: number; lengthBeats: number; loopBeats: number; assetOffsetMicros: bigint; assetDurationMicros: bigint; gain: number; fadeInMicros: bigint; fadeOutMicros: bigint; reverse: boolean; pitchSemitones: number; timeStretch: number }; updateBlockMidi: (params: { blockId: bigint; midiJson: string }) => Promise<void>; updateBlock: (params: { blockId: bigint; name: string; startBeat: number; lengthBeats: number; loopBeats: number; assetOffsetMicros: bigint; assetDurationMicros: bigint; gain: number; fadeInMicros: bigint; fadeOutMicros: bigint; reverse: boolean; pitchSemitones: number; timeStretch: number; midiJson: string; instrumentKind: string; instrumentKey: string }) => Promise<void>; beatsPerBar: number; onClose: () => void }) {
  const isSample = block.instrumentKind === 'sample';
  const sampleKit = isSample ? SAMPLE_KITS.find(k => k.id === block.instrumentKey) : null;
  const scales = {
    chromatic: { label: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as number[] },
    major: { label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] as number[] },
    minor: { label: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] as number[] },
  } as const;
  const [scaleKey, setScaleKey] = useState<keyof typeof scales>('chromatic');
  const tonic = 60;
  const scale = scales[scaleKey];
  const topPitch = 96;
  const bottomPitch = 24;
  const pitchRows = useMemo(() => {
    if (isSample && sampleKit) {
      return sampleKit.sounds.map(s => ({ pitch: s.pitch, label: s.name, black: false })).reverse();
    }
    const out: { pitch: number; label: string; black: boolean }[] = [];
    for (let pitch = topPitch; pitch >= bottomPitch; pitch--) {
      if (!scale.intervals.includes((pitch - tonic + 1200) % 12)) continue;
      const label = pitchName(pitch);
      out.push({ pitch, label, black: label.includes('#') });
    }
    return out;
  }, [scaleKey, isSample, sampleKit]);
  const loopBeats = block.loopBeats > 0 ? block.loopBeats : block.lengthBeats;
  const [horizontalBeats, setHorizontalBeats] = useState(() => Math.max(8, Math.ceil(loopBeats / 4) * 4 + 4));
  const [notes, setNotes] = useState(() => parseMidiNotes(block.midiJson));
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(notes[0]?.id ? [notes[0].id] : []);
  const [dragMode, setDragMode] = useState<'move' | 'resize' | null>(null);
  const [dragOrigin, setDragOrigin] = useState<{ x: number; y: number; noteId: string | null; startBeat: number; lengthBeats: number; initialSelection: string[] } | null>(null);
  const [dragOffsets, setDragOffsets] = useState<Record<string, { startBeat: number; pitch: number }>>({});
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; x: number; y: number; active: boolean } | null>(null);
  const [gridMode, setGridMode] = useState<'idle' | 'select'>('idle');
  const [gridStart, setGridStart] = useState<{ x: number; y: number; beat: number; pitch: number } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{ pitch: number; startBeat: number; endBeat: number } | null>(null);
  const [gridScrollTop, setGridScrollTop] = useState(0);
  const [gridScrollLeft, setGridScrollLeft] = useState(0);
  const [pointerDownMoved, setPointerDownMoved] = useState(false);
  const [noteDragMoved, setNoteDragMoved] = useState(false);
  const [clipboard, setClipboard] = useState<MidiNote[]>([]);
  const dragAutoScrollRef = useRef<number | null>(null);
  const dragBaseNotesRef = useRef<MidiNote[] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const noteSurfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nextNotes = parseMidiNotes(block.midiJson);
    setNotes(nextNotes);
  }, [block.midiJson]);

  useEffect(() => {
    // Auto-scroll to show notes when roll opens (mount only)
    const grid = gridRef.current;
    if (grid && notes.length > 0) {
      const minPitch = Math.min(...notes.map(n => n.pitch));
      const maxPitch = Math.max(...notes.map(n => n.pitch));
      const centerPitch = Math.floor((minPitch + maxPitch) / 2);
      const centerRow = pitchToRow(centerPitch);
      const targetScroll = Math.max(0, centerRow * laneHeight - grid.clientHeight / 2);
      grid.scrollTop = targetScroll;
      setGridScrollTop(targetScroll);
    }
  }, []);

  const selectedNotes = notes.filter(note => selectedNoteIds.includes(note.id));

  const commitNotes = (nextNotes: MidiNote[]) => {
    const grid = gridRef.current;
    const scrollTop = grid?.scrollTop ?? gridScrollTop;
    const scrollLeft = grid?.scrollLeft ?? gridScrollLeft;
    setNotes(nextNotes);
    const json = serializeMidiNotes(nextNotes);
    console.log('[strudel] pattern:', getMidiBlockPattern(json));
    void updateBlockMidi({ blockId, midiJson: json });
    requestAnimationFrame(() => {
      const currentGrid = gridRef.current;
      if (!currentGrid) return;
      currentGrid.scrollTop = scrollTop;
      currentGrid.scrollLeft = scrollLeft;
      setGridScrollTop(scrollTop);
      setGridScrollLeft(scrollLeft);
    });
  };

  const laneHeight = 24;
  const totalRows = pitchRows.length;
  const pianoTopOffset = 18;
  const beatMarkers = Array.from({ length: Math.ceil(horizontalBeats / beatsPerBar) + 1 }, (_, index) => index * beatsPerBar);
  const snapBeat = (value: number) => Math.max(0, Math.round(value * 4) / 4);
  const snapLength = (value: number) => Math.max(0.25, Math.round(value * 4) / 4);

  const pitchToRow = (pitch: number) => Math.max(0, pitchRows.findIndex(row => row.pitch === pitch));

  const rowToPitch = (rowIndex: number) => pitchRows[Math.max(0, Math.min(totalRows - 1, rowIndex))]?.pitch ?? tonic;

  const pointToNote = (clientX: number, clientY: number) => {
    const surfaceRect = noteSurfaceRef.current?.getBoundingClientRect();
    if (!surfaceRect) return { beat: 0, pitch: tonic };
    const x = clientX - surfaceRect.left;
    const y = clientY - surfaceRect.top;
    const beat = Math.max(0, Math.min(horizontalBeats, x / 48));
    const row = Math.max(0, Math.min(totalRows - 1, Math.floor((y - pianoTopOffset) / laneHeight)));
    return {
      beat: snapBeat(beat),
      pitch: rowToPitch(row),
    };
  };

  const addNoteAt = (clientX: number, clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const { beat, pitch } = pointToNote(clientX, clientY);
    const nextNote: MidiNote = {
      id: crypto.randomUUID(),
      pitch,
      startBeat: snapBeat(beat),
      lengthBeats: 0.5,
      velocity: 0.8,
    };
    const nextNotes = [...notes, nextNote].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    setNotes(nextNotes);
    setSelectedNoteIds([nextNote.id]);
  };

  const commitDraftNote = () => {
    if (!noteDraft) return;
    const lengthBeats = Math.max(0.25, noteDraft.endBeat - noteDraft.startBeat);
    const nextNote: MidiNote = {
      id: crypto.randomUUID(),
      pitch: noteDraft.pitch,
      startBeat: snapBeat(noteDraft.startBeat),
      lengthBeats: snapLength(lengthBeats),
      velocity: 0.8,
    };
    const nextNotes = [...notes, nextNote].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    commitNotes(nextNotes);
    setSelectedNoteIds([nextNote.id]);
    setNoteDraft(null);
  };

  const updateSelectedNote = (updater: (note: MidiNote) => MidiNote) => {
    if (!selectedNoteIds.length) return;
    const nextNotes = notes.map(note => (selectedNoteIds.includes(note.id) ? updater(note) : note));
    commitNotes(nextNotes);
  };

  const deleteSelectedNote = () => {
    if (!selectedNoteIds.length) return;
    commitNotes(notes.filter(note => !selectedNoteIds.includes(note.id)));
    setSelectedNoteIds([]);
  };

  const onPointerDownNote = (event: PointerEventLike, note: MidiNote, resize: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setDragMode(resize ? 'resize' : 'move');
    dragBaseNotesRef.current = notes.map(n => ({ ...n }));
    setDragOrigin({ x: event.clientX, y: event.clientY, noteId: note.id, startBeat: note.startBeat, lengthBeats: note.lengthBeats, initialSelection: selectedNoteIds.includes(note.id) ? selectedNoteIds : [note.id] });
    if (resize) {
      setDragOffsets({ [note.id]: { startBeat: 0, pitch: 0 } });
    } else {
      const ids = selectedNoteIds.includes(note.id) ? selectedNoteIds : [note.id];
      const origin = note;
      setDragOffsets(Object.fromEntries(ids.map(id => {
        const selected = notes.find(n => n.id === id)!;
        return [id, { startBeat: selected.startBeat - origin.startBeat, pitch: selected.pitch - origin.pitch }];
      })));
    }
  };

  const stopDragAutoScroll = () => {
    if (dragAutoScrollRef.current != null) {
      window.clearInterval(dragAutoScrollRef.current);
      dragAutoScrollRef.current = null;
    }
  };

  const startDragAutoScroll = (clientY: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const edge = 28;
    const maxStep = 14;
    const distanceToTop = clientY - rect.top;
    const distanceToBottom = rect.bottom - clientY;
    let direction = 0;
    let speed = 0;
    if (distanceToTop < edge) {
      direction = -1;
      speed = Math.max(2, Math.round((edge - distanceToTop) / 2));
    } else if (distanceToBottom < edge) {
      direction = 1;
      speed = Math.max(2, Math.round((edge - distanceToBottom) / 2));
    }
    speed = Math.min(speed, maxStep);
    if (!direction || !speed) {
      stopDragAutoScroll();
      return;
    }
    if (dragAutoScrollRef.current != null) return;
    dragAutoScrollRef.current = window.setInterval(() => {
      const currentGrid = gridRef.current;
      if (!currentGrid) return;
      currentGrid.scrollTop = Math.max(0, currentGrid.scrollTop + direction * speed);
      setGridScrollTop(currentGrid.scrollTop);
    }, 16);
  };

  const onPointerMove = (event: PointerEventLike) => {
    if (selectionBox?.active) {
      if (Math.abs(event.clientX - selectionBox.startX) > 3 || Math.abs(event.clientY - selectionBox.startY) > 3) setPointerDownMoved(true);
      const rect = noteSurfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSelectionBox(prev => prev ? { ...prev, x: event.clientX - rect.left, y: event.clientY - rect.top } : prev);
      return;
    }
    if (noteDraft) {
      const grid = gridRef.current;
      if (!grid) return;
      const rect = noteSurfaceRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const beat = Math.max(0, x / 48);
      const row = Math.max(0, Math.min(totalRows - 1, Math.floor((y - pianoTopOffset) / laneHeight)));
      setNoteDraft(prev => prev ? { ...prev, endBeat: beat, pitch: rowToPitch(row) } : prev);
      return;
    }
    if (!dragMode || !dragOrigin || !dragOrigin.noteId) return;
    if (Math.abs(event.clientX - dragOrigin.x) > 2 || Math.abs(event.clientY - dragOrigin.y) > 2) setNoteDragMoved(true);
    startDragAutoScroll(event.clientY);
    const dxBeats = (event.clientX - dragOrigin.x) / 48;
    const ids = dragOrigin.initialSelection;
    const { pitch: targetPitch } = pointToNote(event.clientX, event.clientY);
    const baseNotes = dragBaseNotesRef.current ?? notes;
    if (dragMode === 'move') {
      const nextNotes = baseNotes.map(note => ids.includes(note.id) ? ({
        ...note,
        startBeat: snapBeat(dragOrigin.startBeat + dxBeats + (dragOffsets[note.id]?.startBeat ?? 0)),
        pitch: targetPitch + (dragOffsets[note.id]?.pitch ?? 0),
      }) : note);
      setNotes(nextNotes);
    } else {
      const nextNotes = baseNotes.map(note => note.id === dragOrigin.noteId ? ({
        ...note,
        lengthBeats: snapLength(dragOrigin.lengthBeats + dxBeats),
      }) : note);
      setNotes(nextNotes);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        deleteSelectedNote();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        selectAll();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        copySelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        pasteClipboard();
      }
      if (selectedNoteIds.length && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        event.preventDefault();
        const step = event.shiftKey ? 12 : 1;
        const delta = event.key === 'ArrowUp' ? step : -step;
        updateSelectedNote(note => ({ ...note, pitch: note.pitch + delta }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clipboard, deleteSelectedNote, notes, selectedNoteIds.length]);

  const onPointerUp = () => {
    stopDragAutoScroll();
    const isClick = dragOrigin ? !noteDragMoved : false;
    if (dragMode && dragOrigin?.noteId) {
      void updateBlockMidi({ blockId, midiJson: serializeMidiNotes(notes) });
    }
    if (isClick && dragOrigin?.noteId) {
      setSelectedNoteIds([dragOrigin.noteId]);
    }
    setDragMode(null);
    setDragOrigin(null);
    if (selectionBox?.active) {
      const left = Math.min(selectionBox.startX, selectionBox.x);
      const right = Math.max(selectionBox.startX, selectionBox.x);
      const top = Math.min(selectionBox.startY, selectionBox.y);
      const bottom = Math.max(selectionBox.startY, selectionBox.y);
      const nextSelected = notes.filter(note => {
        const rowIndex = pitchToRow(note.pitch);
        const noteLeft = note.startBeat * 48;
        const noteTop = rowIndex * laneHeight + pianoTopOffset + 3;
        const noteRight = noteLeft + note.lengthBeats * 48;
        const noteBottom = noteTop + 18;
        return noteRight >= left && noteLeft <= right && noteBottom >= top && noteTop <= bottom;
      }).map(note => note.id);
      setSelectedNoteIds(nextSelected);
      setSelectionBox(null);
    }
    if (noteDraft) {
      commitDraftNote();
    }
    if (gridMode === 'select' && gridStart && isClick && !pointerDownMoved) {
      addNoteAt(gridStart.x, gridStart.y);
    }
    setGridMode('idle');
    setGridStart(null);
    setPointerDownMoved(false);
    setNoteDragMoved(false);
    setDragOffsets({});
    dragBaseNotesRef.current = null;
  };

  const selectAll = () => setSelectedNoteIds(notes.map(note => note.id));
  const copySelected = () => setClipboard(selectedNotes.map(note => ({ ...note })));
  const pasteClipboard = () => {
    if (!clipboard.length) return;
    const offset = clipboard.reduce((min, note) => Math.min(min, note.startBeat), clipboard[0].startBeat);
    const pasted = clipboard.map(note => ({
      ...note,
      id: crypto.randomUUID(),
      startBeat: snapBeat(note.startBeat - offset + 0.5),
    }));
    const nextNotes = [...notes, ...pasted].sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);
    commitNotes(nextNotes);
    setSelectedNoteIds(pasted.map(note => note.id));
  };

  return (
    <div className="modal-overlay active">
      <div className="piano-modal" onPointerMove={onPointerMove as any} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        <div className="modal-title">{isSample ? `${sampleKit?.name ?? 'Sample'} · ${block.name}` : `Piano Roll · ${block.name}`}</div>
        <div className="modal-toolbar">
          <label className="modal-chip mono">Scale
            <select value={scaleKey} onChange={event => setScaleKey(event.target.value as keyof typeof scales)}>
              {Object.entries(scales).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
            </select>
          </label>
          <label className="modal-chip mono">Measures
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6 }}>
              <button className="icon-btn small" onClick={() => {
                const newLoopBeats = Math.max(4, loopBeats - 4);
                if (newLoopBeats !== loopBeats) {
                  setHorizontalBeats(Math.max(8, Math.ceil(newLoopBeats / 4) * 4 + 4));
                  void updateBlock({ ...block, blockId, instrumentKind: block.instrumentKind ?? 'melodic', instrumentKey: block.instrumentKey ?? 'piano', loopBeats: newLoopBeats });
                }
              }}>-</button>
              <span>{Math.round(loopBeats / 4)}</span>
              <button className="icon-btn small" onClick={() => {
                const newLoopBeats = loopBeats + 4;
                setHorizontalBeats(Math.max(8, Math.ceil(newLoopBeats / 4) * 4 + 4));
                void updateBlock({ ...block, blockId, instrumentKind: block.instrumentKind ?? 'melodic', instrumentKey: block.instrumentKey ?? 'piano', loopBeats: newLoopBeats });
              }}>+</button>
            </div>
          </label>
          <label className="modal-chip mono">{isSample ? 'Kit' : 'Instrument'}
            <select value={block.instrumentKey ?? ''} onChange={event => {
              const key = event.target.value;
              if (isSample) {
                const kit = SAMPLE_KITS.find(k => k.id === key);
                if (kit) void updateBlock({ blockId, name: kit.name, instrumentKind: 'sample', instrumentKey: key, startBeat: block.startBeat, lengthBeats: block.lengthBeats, loopBeats: block.loopBeats, assetOffsetMicros: block.assetOffsetMicros, assetDurationMicros: block.assetDurationMicros, gain: block.gain, fadeInMicros: block.fadeInMicros, fadeOutMicros: block.fadeOutMicros, reverse: block.reverse, pitchSemitones: block.pitchSemitones, timeStretch: block.timeStretch, midiJson: block.midiJson });
              } else {
                const inst = MELODY_INSTRUMENTS.find(i => i.id === key);
                if (inst) void updateBlock({ blockId, name: inst.name, instrumentKind: 'melodic', instrumentKey: key, startBeat: block.startBeat, lengthBeats: block.lengthBeats, loopBeats: block.loopBeats, assetOffsetMicros: block.assetOffsetMicros, assetDurationMicros: block.assetDurationMicros, gain: block.gain, fadeInMicros: block.fadeInMicros, fadeOutMicros: block.fadeOutMicros, reverse: block.reverse, pitchSemitones: block.pitchSemitones, timeStretch: block.timeStretch, midiJson: block.midiJson });
              }
            }}>
              {isSample ? SAMPLE_KITS.map(kit => <option key={kit.id} value={kit.id}>{kit.name}</option>) : MELODY_INSTRUMENTS.map(inst => <option key={inst.id} value={inst.id}>{inst.name}</option>)}
            </select>
          </label>
        </div>
        <div className="modal-sub">Click to add notes. Drag notes to move. Drag the right edge to resize. Box-select with the mouse. Arrow keys move by scale steps, Shift+Arrow moves an octave.</div>
        <div className="piano-grid-scroll" ref={gridRef as any} onScroll={event => { const grid = event.currentTarget as HTMLDivElement; setGridScrollTop(grid.scrollTop); setGridScrollLeft(grid.scrollLeft); }}>
          <div className="piano-grid-inner" style={{ minWidth: `${horizontalBeats * 48 + 64}px` }}>
            <div className="piano-grid-content">
              <div className="piano-keys-column">
                <div className="piano-key-spacer" />
                {pitchRows.map(row => <div className={`piano-key mono ${row.black ? 'black' : 'white'}`} key={row.pitch}><span>{row.label}</span></div>)}
              </div>
              <div
                className="piano-notes"
                style={{ minWidth: `${horizontalBeats * 48}px` }}
                onPointerDown={event => {
                  if (event.button === 2) {
                    event.preventDefault();
                    const grid = gridRef.current;
                    const surfaceRect = noteSurfaceRef.current?.getBoundingClientRect();
                    if (!grid || !surfaceRect) return;
                    const point = pointToNote(event.clientX, event.clientY);
                    setNoteDraft({ pitch: point.pitch, startBeat: point.beat, endBeat: point.beat + 0.5 });
                    setSelectionBox(null);
                    setGridMode('idle');
                    setGridStart(null);
                    return;
                  }
                  if (event.button !== 0) return;
                  const grid = gridRef.current;
                  if (!grid) return;
                  const target = event.target as HTMLElement;
                  if (target.closest('.roll-note')) return;
                  const surfaceRect = noteSurfaceRef.current?.getBoundingClientRect();
                  if (!surfaceRect) return;
                  const point = pointToNote(event.clientX, event.clientY);
                  setGridStart({ x: event.clientX, y: event.clientY, beat: point.beat, pitch: point.pitch });
                  setGridMode('select');
                  setPointerDownMoved(false);
                  const viewX = event.clientX - surfaceRect.left;
                  const viewY = event.clientY - surfaceRect.top;
                  setSelectionBox({ startX: viewX, startY: viewY, x: viewX, y: viewY, active: true });
                }}
                onContextMenu={event => event.preventDefault()}
              >
                <div ref={noteSurfaceRef} className="note-surface">
                  <div className="measure-ruler sticky" style={{ height: `${pianoTopOffset}px` }}>{beatMarkers.map(beat => beat % beatsPerBar === 0 ? <div key={`measure-${beat}`} className="measure-ruler-item" style={{ left: beat * 48 }}><span>{String(beat / beatsPerBar + 1).padStart(2, '0')}</span></div> : null)}</div>
                  {beatMarkers.map(beat => {
                    const isMeasure = beat % beatsPerBar === 0;
                    return <div key={beat} className={`beat-marker ${isMeasure ? 'measure' : ''}`} style={{ left: beat * 48, top: pianoTopOffset }} />;
                  })}
                  {Array.from({ length: totalRows }, (_, rowIndex) => <div key={rowIndex} className="piano-row-line" style={{ top: rowIndex * laneHeight + pianoTopOffset }} />)}
                  {Array.from({ length: Math.floor((topPitch - bottomPitch) / 12) + 1 }, (_, octaveIndex) => {
                    const pitch = topPitch - octaveIndex * 12;
                    const rowIndex = pitchToRow(pitch);
                    if (rowIndex < 0 || rowIndex >= totalRows) return null;
                    return (
                      <React.Fragment key={`octave-${pitch}`}>
                        <div className="octave-marker" style={{ top: rowIndex * laneHeight + pianoTopOffset }} />
                        <div className="octave-label" style={{ top: rowIndex * laneHeight + pianoTopOffset }}><span>{pitchName(pitch)}</span></div>
                      </React.Fragment>
                    );
                  })}
                  {selectionBox?.active ? <div className="selection-rect" style={{ left: Math.min(selectionBox.startX, selectionBox.x), top: Math.min(selectionBox.startY, selectionBox.y), width: Math.abs(selectionBox.x - selectionBox.startX), height: Math.abs(selectionBox.y - selectionBox.startY) }} /> : null}
                  {loopBeats < horizontalBeats ? <div className="piano-grid-out-of-bounds" style={{ position: 'absolute', top: pianoTopOffset, left: loopBeats * 48, width: (horizontalBeats - loopBeats) * 48, height: totalRows * laneHeight, backgroundColor: 'rgba(0, 0, 0, 0.4)', pointerEvents: 'none', zIndex: 1 }} /> : null}
                  {notes.flatMap(note => {
                    const phantoms = [];
                    let offset = loopBeats;
                    while (note.startBeat + offset < horizontalBeats) {
                      const rowIndex = pitchToRow(note.pitch);
                      const left = (note.startBeat + offset) * 48;
                      const width = note.lengthBeats * 48;
                      const top = rowIndex * laneHeight + pianoTopOffset + 3;
                      phantoms.push(
                        <div key={`${note.id}-phantom-${offset}`} className="roll-note phantom" style={{ left, top, width, height: 18, opacity: 0.3, pointerEvents: 'none', filter: 'grayscale(100%)' }}>
                           <span className="roll-note-label">{pitchName(note.pitch)}</span>
                        </div>
                      );
                      offset += loopBeats;
                    }
                    return phantoms;
                  })}
                  {noteDraft ? <div className="roll-note draft" style={{ left: noteDraft.startBeat * 48, top: pitchToRow(noteDraft.pitch) * laneHeight + pianoTopOffset + 3, width: Math.max(0.25, noteDraft.endBeat - noteDraft.startBeat) * 48, height: 18 }} /> : null}
                  {notes.map(note => {
                  const rowIndex = pitchToRow(note.pitch);
                  const left = note.startBeat * 48;
                  const width = note.lengthBeats * 48;
                  const top = rowIndex * laneHeight + pianoTopOffset + 3;
                  return (
                    <div
                      key={note.id}
                      className={`roll-note ${selectedNoteIds.includes(note.id) ? 'selected' : ''}`}
                      style={{ left, top, width, height: 18 }}
                      onPointerDown={event => {
                        onPointerDownNote(event, note, false);
                        const el = event.currentTarget as HTMLElement;
                        if ('setPointerCapture' in el) el.setPointerCapture((event as any).pointerId);
                      }}
                      onPointerUp={event => {
                        const el = event.currentTarget as HTMLElement;
                        if ('releasePointerCapture' in el) el.releasePointerCapture((event as any).pointerId);
                      }}
                    >
                      <span className="roll-note-label">{pitchName(note.pitch)}</span>
                      <div className="roll-note-handle" title="Resize note" onPointerDown={event => { onPointerDownNote(event, note, true); const el = event.currentTarget as HTMLElement; if ('setPointerCapture' in el) el.setPointerCapture((event as any).pointerId); }} onPointerUp={event => { const el = event.currentTarget as HTMLElement; if ('releasePointerCapture' in el) el.releasePointerCapture((event as any).pointerId); }} />
                    </div>
                  );
                })}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <div className="bs mono">Selected <span>{selectedNoteIds.length ? `${selectedNoteIds.length} note(s)` : 'none'}</span></div>
          <button className="modal-btn" onClick={deleteSelectedNote} disabled={!selectedNoteIds.length}>Delete Note</button>
          <button className="modal-btn primary" onClick={() => { void updateBlockMidi({ blockId, midiJson: serializeMidiNotes(notes) }); onClose(); }}>Close</button>
        </div>
      </div>
    </div>
  );
}

type PointerEventLike = {
  clientX: number;
  clientY: number;
  preventDefault(): void;
  stopPropagation(): void;
};

async function waitForAsset<T>(key: string, getValue: () => T | undefined, attempts = 30, delayMs = 200): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const value = getValue();
    if (value) return value;
    await new Promise(resolve => window.setTimeout(resolve, delayMs));
  }
  console.warn('Timed out waiting for uploaded asset', key);
  return undefined;
}

export default App;
