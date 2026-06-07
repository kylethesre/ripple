import { DbConnection, tables } from './src/module_bindings/index.js';

const conn = DbConnection.builder()
  .withUri('wss://maincloud.spacetimedb.com')
  .withDatabaseName('ripple-fkb8z')
  .onConnect((ctx) => {
    console.log('Connected!');
    
    ctx.subscriptionBuilder()
      .onApplied(() => {
        console.log('Subscription applied! Creating user...');
        conn.reducers.registerUser({ name: 'Looper Bot' });
      })
      .subscribe([
        'SELECT * FROM user',
        'SELECT * FROM room',
        'SELECT * FROM track',
        'SELECT * FROM block',
      ]);
  })
  .build();

let hasStarted = false;

conn.db.user.onInsert((ctx, user) => {
  if (user.name === 'Looper Bot') {
    console.log('User registered, creating room...');
    conn.reducers.createRoom({ name: 'Simple Looper 🔁' });
  }
});

let roomId: bigint | null = null;
let drumTrackId: bigint | null = null;
let bassTrackId: bigint | null = null;
let melodyTrackId: bigint | null = null;

conn.db.room.onInsert((ctx, room) => {
  if (room.name !== 'Simple Looper 🔁' || roomId) return;
  roomId = room.id;
  console.log('Room created:', room.token);
  
  conn.reducers.createTrack({ roomId, name: 'Drums (TR-808)' });
  conn.reducers.createTrack({ roomId, name: 'Bass' });
  conn.reducers.createTrack({ roomId, name: 'Keys' });
});

conn.db.track.onInsert((ctx, track) => {
  if (track.roomId !== roomId) return;
  
  if (track.name === 'Drums (TR-808)') drumTrackId = track.id;
  if (track.name === 'Bass') bassTrackId = track.id;
  if (track.name === 'Keys') melodyTrackId = track.id;

  if (drumTrackId && bassTrackId && melodyTrackId && !hasStarted) {
    hasStarted = true;
    console.log('Tracks created, inserting blocks...');
    composeSong();
  }
});

function composeSong() {
  if (roomId === null) return;

  // Total song length is 8 measures = 32 beats.
  // We will compose 2-measure loops (8 beats long)
  // and set loopBeats = 8, lengthBeats = 32 so they loop 4 times.

  // --- DRUMS ---
  // A classic 808 beat, 2 measures long.
  const drumNotes = [];
  for (let b = 0; b < 8; b += 1) {
    // Kick on 1 and 3 (and slightly before 3 on the second measure)
    if (b === 0 || b === 4) {
      drumNotes.push({ id: `k${b}`, pitch: 36, startBeat: b, lengthBeats: 0.5, velocity: 1.0 });
    }
    if (b === 3.5 || b === 6.5) {
      drumNotes.push({ id: `k_sync${b}`, pitch: 36, startBeat: b, lengthBeats: 0.5, velocity: 0.8 });
    }
    // Snare on 2 and 4
    if (b % 2 !== 0) {
      drumNotes.push({ id: `s${b}`, pitch: 38, startBeat: b, lengthBeats: 0.5, velocity: 0.9 });
    }
    // Closed HH every 1/8 note
    for (let h = 0; h < 2; h++) {
      drumNotes.push({ id: `h${b}_${h}`, pitch: 42, startBeat: b + (h * 0.5), lengthBeats: 0.25, velocity: 0.7 });
    }
  }

  const drumMidiJson = JSON.stringify({ notes: drumNotes });
  conn.reducers.createBlock({
    trackId: drumTrackId!,
    kind: 'midi',
    name: '808 Loop',
    instrumentKind: 'sample',
    instrumentKey: 'tr808',
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 8,
    midiJson: drumMidiJson
  });

  // --- BASS ---
  // A simple 2-measure bassline.
  // Root notes: A minor -> F major
  const bassNotes = [
    { id: 'b1', pitch: 33, startBeat: 0.0, lengthBeats: 0.5, velocity: 0.9 }, // A1
    { id: 'b2', pitch: 33, startBeat: 0.75, lengthBeats: 0.25, velocity: 0.7 },
    { id: 'b3', pitch: 45, startBeat: 1.5, lengthBeats: 0.5, velocity: 0.9 }, // A2 (octave)
    { id: 'b4', pitch: 33, startBeat: 2.5, lengthBeats: 0.5, velocity: 0.8 },
    { id: 'b5', pitch: 35, startBeat: 3.5, lengthBeats: 0.5, velocity: 0.8 }, // B1 (walkup)
    
    { id: 'b6', pitch: 29, startBeat: 4.0, lengthBeats: 0.5, velocity: 0.9 }, // F1
    { id: 'b7', pitch: 29, startBeat: 4.75, lengthBeats: 0.25, velocity: 0.7 },
    { id: 'b8', pitch: 41, startBeat: 5.5, lengthBeats: 0.5, velocity: 0.9 }, // F2 (octave)
    { id: 'b9', pitch: 29, startBeat: 6.5, lengthBeats: 0.5, velocity: 0.8 },
    { id: 'b10', pitch: 31, startBeat: 7.5, lengthBeats: 0.5, velocity: 0.8 }, // G1 (walkup)
  ];

  const bassMidiJson = JSON.stringify({ notes: bassNotes });
  conn.reducers.createBlock({
    trackId: bassTrackId!,
    kind: 'midi',
    name: 'Bass Loop',
    instrumentKind: 'melodic',
    instrumentKey: 'dbass',
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 8,
    midiJson: bassMidiJson
  });

  // --- KEYS (Melody) ---
  // A simple 2-measure electric piano chord progression
  // Am: A-C-E, F: F-A-C
  const keysNotes = [
    // Am
    { id: 'k1', pitch: 57, startBeat: 0.0, lengthBeats: 1.5, velocity: 0.7 }, // A3
    { id: 'k2', pitch: 60, startBeat: 0.0, lengthBeats: 1.5, velocity: 0.7 }, // C4
    { id: 'k3', pitch: 64, startBeat: 0.0, lengthBeats: 1.5, velocity: 0.7 }, // E4
    
    // Am/G
    { id: 'k4', pitch: 55, startBeat: 2.0, lengthBeats: 1.0, velocity: 0.6 }, // G3
    { id: 'k5', pitch: 60, startBeat: 2.0, lengthBeats: 1.0, velocity: 0.6 }, // C4
    { id: 'k6', pitch: 64, startBeat: 2.0, lengthBeats: 1.0, velocity: 0.6 }, // E4

    // F
    { id: 'k7', pitch: 53, startBeat: 4.0, lengthBeats: 1.5, velocity: 0.7 }, // F3
    { id: 'k8', pitch: 57, startBeat: 4.0, lengthBeats: 1.5, velocity: 0.7 }, // A3
    { id: 'k9', pitch: 60, startBeat: 4.0, lengthBeats: 1.5, velocity: 0.7 }, // C4

    // Fmaj7
    { id: 'k10', pitch: 53, startBeat: 6.0, lengthBeats: 1.0, velocity: 0.6 }, // F3
    { id: 'k11', pitch: 57, startBeat: 6.0, lengthBeats: 1.0, velocity: 0.6 }, // A3
    { id: 'k12', pitch: 60, startBeat: 6.0, lengthBeats: 1.0, velocity: 0.6 }, // C4
    { id: 'k13', pitch: 64, startBeat: 6.0, lengthBeats: 1.0, velocity: 0.6 }, // E4
  ];

  const melodyMidiJson = JSON.stringify({ notes: keysNotes });
  conn.reducers.createBlock({
    trackId: melodyTrackId!,
    kind: 'midi',
    name: 'Keys Loop',
    instrumentKind: 'melodic',
    instrumentKey: 'epiano',
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 8,
    midiJson: melodyMidiJson
  });

  console.log('Song composed! Look for room "Simple Looper 🔁"');
  setTimeout(() => process.exit(0), 1000);
}
