import { DbConnection, tables } from './src/module_bindings/index.js';

const conn = DbConnection.builder()
  .withUri('wss://maincloud.spacetimedb.com')
  .withDatabaseName('ripple-fkb8z')
  .onConnect((ctx) => {
    console.log('Connected!');
    
    // Subscribe so we get events
    ctx.subscriptionBuilder()
      .onApplied(() => {
        console.log('Subscription applied! Creating user...');
        conn.reducers.registerUser({ name: 'Composer Bot' });
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
  if (user.name === 'Composer Bot') {
    console.log('User registered, creating room...');
    conn.reducers.createRoom({ name: 'Bot Banger 🤖🔥' });
  }
});

let roomId: bigint | null = null;
let drumTrackId: bigint | null = null;
let bassTrackId: bigint | null = null;
let melodyTrackId: bigint | null = null;

conn.db.room.onInsert((ctx, room) => {
  if (room.name !== 'Bot Banger 🤖🔥' || roomId) return;
  roomId = room.id;
  console.log('Room created:', room.token);
  
  conn.reducers.createTrack({ roomId, name: 'Drums (TR-909)' });
  conn.reducers.createTrack({ roomId, name: 'Bass' });
  conn.reducers.createTrack({ roomId, name: 'Melody' });
});

conn.db.track.onInsert((ctx, track) => {
  if (track.roomId !== roomId) return;
  
  if (track.name === 'Drums (TR-909)') drumTrackId = track.id;
  if (track.name === 'Bass') bassTrackId = track.id;
  if (track.name === 'Melody') melodyTrackId = track.id;

  if (drumTrackId && bassTrackId && melodyTrackId && !hasStarted) {
    hasStarted = true;
    console.log('Tracks created, inserting blocks...');
    composeSong();
  }
});

function composeSong() {
  if (roomId === null) return;

  // Let's compose an 8 measure song. Length in beats: 8 measures * 4 beats = 32 beats.
  // Actually, let's create a 4-measure loop that repeats twice (by making it 8 measures long but loop length 16 beats).
  // Wait, I can just create blocks of length 32 beats.

  // --- DRUMS ---
  // A standard 4-on-the-floor house beat.
  const drumNotes = [];
  for (let b = 0; b < 32; b += 1) {
    // Kick on every beat
    drumNotes.push({ id: `k${b}`, pitch: 36, startBeat: b, lengthBeats: 0.5, velocity: 1.0 });
    // Clap/Snare on every off-beat (2 and 4)
    if (b % 2 !== 0) {
      drumNotes.push({ id: `s${b}`, pitch: 39, startBeat: b, lengthBeats: 0.5, velocity: 0.9 });
    }
    // Closed HH every 1/8 note off-beat
    drumNotes.push({ id: `h${b}`, pitch: 42, startBeat: b + 0.5, lengthBeats: 0.25, velocity: 0.7 });
  }
  // Add some open hi-hats on the "and" of 4
  for (let m = 0; m < 8; m++) {
    drumNotes.push({ id: `oh${m}`, pitch: 46, startBeat: (m * 4) + 3.5, lengthBeats: 0.5, velocity: 0.8 });
    // crash on measure 1 and 5
    if (m % 4 === 0) {
      drumNotes.push({ id: `cr${m}`, pitch: 56, startBeat: (m * 4), lengthBeats: 2.0, velocity: 0.8 });
    }
  }

  const drumMidiJson = JSON.stringify({ notes: drumNotes });
  conn.reducers.createBlock({
    trackId: drumTrackId!,
    kind: 'midi',
    name: 'Drums',
    instrumentKind: 'sample',
    instrumentKey: 'tr909',
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 0,
    midiJson: drumMidiJson
  });

  // --- BASS ---
  // A groovy 16th note bassline.
  // Root notes: C minor progression: C, Ab, Eb, Bb
  // Wait, let's just do C, C, F, G (root notes)
  // Midi notes: C2 = 36, F1 = 29, G1 = 31
  const bassNotes = [];
  const bassPattern = [
    { beat: 0, pitch: 36 }, // C2
    { beat: 0.75, pitch: 36 },
    { beat: 1.5, pitch: 48 }, // C3 (octave jump)
    { beat: 2.0, pitch: 36 },
    { beat: 2.75, pitch: 46 }, // Bb2
    { beat: 3.5, pitch: 36 },
  ];
  
  const progression = [36, 36, 41, 43]; // C, C, F, G
  
  for (let m = 0; m < 8; m++) {
    const root = progression[m % 4];
    const offset = root - 36;
    for (const note of bassPattern) {
      bassNotes.push({
        id: `b${m}_${note.beat}`,
        pitch: note.pitch + offset,
        startBeat: (m * 4) + note.beat,
        lengthBeats: 0.5,
        velocity: 0.9
      });
    }
  }

  const bassMidiJson = JSON.stringify({ notes: bassNotes });
  conn.reducers.createBlock({
    trackId: bassTrackId!,
    kind: 'midi',
    name: 'Bassline',
    instrumentKind: 'melodic',
    instrumentKey: 'bass', // from wt_ebass
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 0,
    midiJson: bassMidiJson
  });

  // --- MELODY ---
  // A synth pluck melody
  const melodyNotes = [];
  const melodyPattern1 = [
    { beat: 0, pitch: 60 }, // C4
    { beat: 0.5, pitch: 63 }, // Eb4
    { beat: 1.5, pitch: 67 }, // G4
    { beat: 2.5, pitch: 63 },
    { beat: 3.0, pitch: 60 },
  ];
  const melodyPattern2 = [
    { beat: 0, pitch: 65 }, // F4
    { beat: 0.5, pitch: 67 }, // G4
    { beat: 1.5, pitch: 70 }, // Bb4
    { beat: 2.5, pitch: 67 },
    { beat: 3.0, pitch: 65 },
  ];

  for (let m = 0; m < 8; m++) {
    const pattern = m % 2 === 0 ? melodyPattern1 : melodyPattern2;
    for (const note of pattern) {
      melodyNotes.push({
        id: `m${m}_${note.beat}`,
        pitch: note.pitch,
        startBeat: (m * 4) + note.beat,
        lengthBeats: 0.5,
        velocity: 0.8
      });
    }
    // Add a little variation at the end of each 4-bar phrase
    if (m % 4 === 3) {
      melodyNotes.push({
        id: `m${m}_fill`,
        pitch: 72, // C5
        startBeat: (m * 4) + 3.5,
        lengthBeats: 0.5,
        velocity: 0.8
      });
    }
  }

  const melodyMidiJson = JSON.stringify({ notes: melodyNotes });
  conn.reducers.createBlock({
    trackId: melodyTrackId!,
    kind: 'midi',
    name: 'Synth Pluck',
    instrumentKind: 'melodic',
    instrumentKey: 'pluck', // from wt_clavinet
    assetId: 0n,
    startBeat: 0,
    lengthBeats: 32,
    loopBeats: 0,
    midiJson: melodyMidiJson
  });

  console.log('Song composed! Look for room "Bot Banger 🤖🔥"');
  setTimeout(() => process.exit(0), 1000);
}
