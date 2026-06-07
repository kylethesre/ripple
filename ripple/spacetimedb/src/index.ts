import { SenderError, schema, table, t } from 'spacetimedb/server';

const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    token: t.string().unique(),
    name: t.string(),
    owner: t.identity().index('btree'),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const roomMember = table(
  {
    name: 'room_member',
    public: true,
    indexes: [
      { accessor: 'by_room', algorithm: 'btree', columns: ['roomId'] },
      { accessor: 'by_room_identity', algorithm: 'btree', columns: ['roomId', 'identity'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    identity: t.identity(),
    displayName: t.string(),
    role: t.string(),
    active: t.bool(),
    joinedAt: t.timestamp(),
    lastSeen: t.timestamp(),
  }
);

const view = table(
  {
    name: 'view',
    public: true,
    indexes: [
      { accessor: 'by_room', algorithm: 'btree', columns: ['roomId'] },
      { accessor: 'by_room_owner', algorithm: 'btree', columns: ['roomId', 'owner'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    owner: t.identity(),
    name: t.string(),
    kind: t.string(),
    locked: t.bool(),
    isDefault: t.bool(),
    playState: t.string(),
    playheadMicros: t.u64(),
    bpm: t.u32(),
    beatsPerBar: t.u32(),
    zoom: t.u32(),
    scrollLeft: t.u32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const track = table(
  { name: 'track', public: true, indexes: [{ accessor: 'by_room', algorithm: 'btree', columns: ['roomId'] }] },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    name: t.string(),
    position: t.u32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const viewTrackState = table(
  {
    name: 'view_track_state',
    public: true,
    indexes: [
      { accessor: 'by_view', algorithm: 'btree', columns: ['viewId'] },
      { accessor: 'by_view_track', algorithm: 'btree', columns: ['viewId', 'trackId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    viewId: t.u64(),
    trackId: t.u64(),
    muted: t.bool(),
    solo: t.bool(),
    volume: t.f64(),
    pan: t.f64(),
    updatedAt: t.timestamp(),
  }
);

const asset = table(
  { name: 'asset', public: true, indexes: [{ accessor: 'by_room', algorithm: 'btree', columns: ['roomId'] }] },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64(),
    owner: t.identity(),
    clientUploadKey: t.string().unique(),
    name: t.string(),
    mimeType: t.string(),
    byteSize: t.u64(),
    durationMicros: t.u64(),
    sampleRate: t.u32(),
    channels: t.u32(),
    waveformJson: t.string(),
    createdAt: t.timestamp(),
  }
);

const assetChunk = table(
  {
    name: 'asset_chunk',
    public: true,
    indexes: [
      { accessor: 'by_asset', algorithm: 'btree', columns: ['assetId'] },
      { accessor: 'by_asset_index', algorithm: 'btree', columns: ['assetId', 'chunkIndex'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    assetId: t.u64(),
    chunkIndex: t.u32(),
    dataBase64: t.string(),
    byteSize: t.u32(),
  }
);

const block = table(
  {
    name: 'block',
    public: true,
    indexes: [
      { accessor: 'by_track', algorithm: 'btree', columns: ['trackId'] },
      { accessor: 'by_asset', algorithm: 'btree', columns: ['assetId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    trackId: t.u64(),
    kind: t.string(),
    name: t.string(),
    instrumentKind: t.string(),
    instrumentKey: t.string(),
    assetId: t.u64(),
    startBeat: t.f64(),
    lengthBeats: t.f64(),
    assetOffsetMicros: t.u64(),
    assetDurationMicros: t.u64(),
    gain: t.f64(),
    fadeInMicros: t.u64(),
    fadeOutMicros: t.u64(),
    reverse: t.bool(),
    pitchSemitones: t.f64(),
    timeStretch: t.f64(),
    midiJson: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const effect = table(
  {
    name: 'effect',
    public: true,
    indexes: [{ accessor: 'by_target', algorithm: 'btree', columns: ['targetKind', 'targetId'] }],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    targetKind: t.string(),
    targetId: t.u64(),
    kind: t.string(),
    name: t.string(),
    enabled: t.bool(),
    position: t.u32(),
    paramsJson: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

const automationLane = table(
  {
    name: 'automation_lane',
    public: true,
    indexes: [
      { accessor: 'by_target', algorithm: 'btree', columns: ['targetKind', 'targetId'] },
      { accessor: 'by_effect', algorithm: 'btree', columns: ['effectId'] },
    ],
  },
  {
    id: t.u64().primaryKey().autoInc(),
    targetKind: t.string(),
    targetId: t.u64(),
    effectId: t.u64(),
    paramKey: t.string(),
    label: t.string(),
    enabled: t.bool(),
    visible: t.bool(),
    minValue: t.f64(),
    maxValue: t.f64(),
    scale: t.string(),
    color: t.string(),
    position: t.u32(),
    updatedAt: t.timestamp(),
  }
);

const automationPoint = table(
  { name: 'automation_point', public: true, indexes: [{ accessor: 'by_lane', algorithm: 'btree', columns: ['laneId'] }] },
  {
    id: t.u64().primaryKey().autoInc(),
    laneId: t.u64(),
    beat: t.f64(),
    value: t.f64(),
    curve: t.string(),
    updatedAt: t.timestamp(),
  }
);

const spacetimedb = schema({
  room,
  roomMember,
  view,
  track,
  viewTrackState,
  asset,
  assetChunk,
  block,
  effect,
  automationLane,
  automationPoint,
});
export default spacetimedb;

function makeToken(ctx: any): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 36; i++) token += alphabet[ctx.random.integerInRange(0, alphabet.length - 1)];
  return token;
}

function memberFor(ctx: any, roomId: bigint) {
  return [...ctx.db.roomMember.by_room_identity.filter([roomId, ctx.sender])][0] ?? null;
}

function requireRoom(ctx: any, roomId: bigint) {
  const existing = ctx.db.room.id.find(roomId);
  if (!existing) throw new SenderError('room not found');
  return existing;
}

function requireMember(ctx: any, roomId: bigint) {
  const existing = memberFor(ctx, roomId);
  if (!existing) throw new SenderError('not a room member');
  return existing;
}

function canEditRoom(ctx: any, roomId: bigint): boolean {
  const roomRow = requireRoom(ctx, roomId);
  if (roomRow.owner.equals(ctx.sender)) return true;
  const member = memberFor(ctx, roomId);
  return !!member && (member.role === 'owner' || member.role === 'editor');
}

function requireRoomEditor(ctx: any, roomId: bigint) {
  if (!canEditRoom(ctx, roomId)) throw new SenderError('not allowed');
}

function requireViewEditor(ctx: any, viewId: bigint) {
  const viewRow = ctx.db.view.id.find(viewId);
  if (!viewRow) throw new SenderError('view not found');
  if (viewRow.owner.equals(ctx.sender)) return viewRow;
  if (!viewRow.locked && canEditRoom(ctx, viewRow.roomId)) return viewRow;
  if (viewRow.kind !== 'personal' && canEditRoom(ctx, viewRow.roomId)) return viewRow;
  throw new SenderError('not allowed');
}

function createViewTrackStates(ctx: any, viewId: bigint, roomId: bigint) {
  for (const trackRow of ctx.db.track.by_room.filter(roomId)) {
    ctx.db.viewTrackState.insert({
      id: 0n,
      viewId,
      trackId: trackRow.id,
      muted: false,
      solo: false,
      volume: 0.72,
      pan: 0,
      updatedAt: ctx.timestamp,
    });
  }
}

export const createRoom = spacetimedb.reducer({ name: t.string(), displayName: t.string() }, (ctx, { name, displayName }) => {
  const token = makeToken(ctx);
  ctx.db.room.insert({ id: 0n, token, name, owner: ctx.sender, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  const roomRow = ctx.db.room.token.find(token);
  if (!roomRow) throw new SenderError('room creation failed');

  ctx.db.roomMember.insert({
    id: 0n,
    roomId: roomRow.id,
    identity: ctx.sender,
    displayName: displayName || 'Creator',
    role: 'owner',
    active: true,
    joinedAt: ctx.timestamp,
    lastSeen: ctx.timestamp,
  });

  ctx.db.view.insert({
    id: 0n,
    roomId: roomRow.id,
    owner: ctx.sender,
    name: 'Master',
    kind: 'master',
    locked: false,
    isDefault: true,
    playState: 'stopped',
    playheadMicros: 0n,
    bpm: 120,
    beatsPerBar: 4,
    zoom: 100,
    scrollLeft: 0,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  const master = [...ctx.db.view.by_room.filter(roomRow.id)].find((v: any) => v.kind === 'master');
  if (master) createViewTrackStates(ctx, master.id, roomRow.id);

  ctx.db.view.insert({
    id: 0n,
    roomId: roomRow.id,
    owner: ctx.sender,
    name: 'My View',
    kind: 'personal',
    locked: true,
    isDefault: false,
    playState: 'stopped',
    playheadMicros: 0n,
    bpm: 120,
    beatsPerBar: 4,
    zoom: 100,
    scrollLeft: 0,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  const personal = [...ctx.db.view.by_room_owner.filter([roomRow.id, ctx.sender])].find((v: any) => v.kind === 'personal');
  if (personal) createViewTrackStates(ctx, personal.id, roomRow.id);
});

export const joinRoom = spacetimedb.reducer({ token: t.string(), displayName: t.string() }, (ctx, { token, displayName }) => {
  const roomRow = ctx.db.room.token.find(token);
  if (!roomRow) throw new SenderError('room not found');
  const existing = memberFor(ctx, roomRow.id);
  if (existing) {
    ctx.db.roomMember.id.update({ ...existing, active: true, displayName, lastSeen: ctx.timestamp });
  } else {
    ctx.db.roomMember.insert({
      id: 0n,
      roomId: roomRow.id,
      identity: ctx.sender,
      displayName,
      role: 'editor',
      active: true,
      joinedAt: ctx.timestamp,
      lastSeen: ctx.timestamp,
    });
  }

  const personal = [...ctx.db.view.by_room_owner.filter([roomRow.id, ctx.sender])].find((v: any) => v.kind === 'personal');
  if (!personal) {
    ctx.db.view.insert({
      id: 0n,
      roomId: roomRow.id,
      owner: ctx.sender,
      name: 'My View',
      kind: 'personal',
      locked: true,
      isDefault: false,
      playState: 'stopped',
      playheadMicros: 0n,
      bpm: 120,
      beatsPerBar: 4,
      zoom: 100,
      scrollLeft: 0,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
    const created = [...ctx.db.view.by_room_owner.filter([roomRow.id, ctx.sender])].find((v: any) => v.kind === 'personal');
    if (created) createViewTrackStates(ctx, created.id, roomRow.id);
  }
});

export const setDisplayName = spacetimedb.reducer({ roomId: t.u64(), displayName: t.string() }, (ctx, { roomId, displayName }) => {
  const member = requireMember(ctx, roomId);
  ctx.db.roomMember.id.update({ ...member, displayName, lastSeen: ctx.timestamp });
});

export const createSharedView = spacetimedb.reducer({ roomId: t.u64(), name: t.string() }, (ctx, { roomId, name }) => {
  requireRoomEditor(ctx, roomId);
  ctx.db.view.insert({
    id: 0n,
    roomId,
    owner: ctx.sender,
    name,
    kind: 'shared',
    locked: false,
    isDefault: false,
    playState: 'stopped',
    playheadMicros: 0n,
    bpm: 120,
    beatsPerBar: 4,
    zoom: 100,
    scrollLeft: 0,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  const created = [...ctx.db.view.by_room.filter(roomId)].sort((a: any, b: any) => Number(b.id - a.id))[0];
  if (created) createViewTrackStates(ctx, created.id, roomId);
});

export const updateViewTransport = spacetimedb.reducer(
  { viewId: t.u64(), playState: t.string(), playheadMicros: t.u64(), bpm: t.u32() },
  (ctx, { viewId, playState, playheadMicros, bpm }) => {
    const viewRow = requireViewEditor(ctx, viewId);
    ctx.db.view.id.update({ ...viewRow, playState, playheadMicros, bpm, updatedAt: ctx.timestamp });
  }
);

export const updateViewLayout = spacetimedb.reducer({ viewId: t.u64(), zoom: t.u32(), scrollLeft: t.u32() }, (ctx, { viewId, zoom, scrollLeft }) => {
  const viewRow = requireViewEditor(ctx, viewId);
  ctx.db.view.id.update({ ...viewRow, zoom, scrollLeft, updatedAt: ctx.timestamp });
});

export const updateViewTrackState = spacetimedb.reducer(
  { viewId: t.u64(), trackId: t.u64(), muted: t.bool(), solo: t.bool(), volume: t.f64(), pan: t.f64() },
  (ctx, { viewId, trackId, muted, solo, volume, pan }) => {
    requireViewEditor(ctx, viewId);
    const existing = [...ctx.db.viewTrackState.by_view_track.filter([viewId, trackId])][0];
    if (existing) ctx.db.viewTrackState.id.update({ ...existing, muted, solo, volume, pan, updatedAt: ctx.timestamp });
    else ctx.db.viewTrackState.insert({ id: 0n, viewId, trackId, muted, solo, volume, pan, updatedAt: ctx.timestamp });
  }
);

export const createTrack = spacetimedb.reducer(
  { roomId: t.u64(), name: t.string() },
  (ctx, { roomId, name }) => {
    requireRoomEditor(ctx, roomId);
    const position = [...ctx.db.track.by_room.filter(roomId)].length;
    ctx.db.track.insert({
      id: 0n,
      roomId,
      name,
      position,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const renameTrack = spacetimedb.reducer(
  { trackId: t.u64(), name: t.string() },
  (ctx, { trackId, name }) => {
    const trackRow = ctx.db.track.id.find(trackId);
    if (!trackRow) throw new SenderError('track not found');
    requireRoomEditor(ctx, trackRow.roomId);
    ctx.db.track.id.update({ ...trackRow, name, updatedAt: ctx.timestamp });
  }
);

export const createAsset = spacetimedb.reducer(
  {
    roomId: t.u64(),
    clientUploadKey: t.string(),
    name: t.string(),
    mimeType: t.string(),
    byteSize: t.u64(),
    durationMicros: t.u64(),
    sampleRate: t.u32(),
    channels: t.u32(),
    waveformJson: t.string(),
  },
  (ctx, params) => {
    requireRoomEditor(ctx, params.roomId);
    ctx.db.asset.insert({ id: 0n, owner: ctx.sender, createdAt: ctx.timestamp, ...params });
  }
);

export const addAssetChunk = spacetimedb.reducer({ assetId: t.u64(), chunkIndex: t.u32(), dataBase64: t.string(), byteSize: t.u32() }, (ctx, params) => {
  const assetRow = ctx.db.asset.id.find(params.assetId);
  if (!assetRow) throw new SenderError('asset not found');
  requireRoomEditor(ctx, assetRow.roomId);
  ctx.db.assetChunk.insert({ id: 0n, ...params });
});

export const createBlock = spacetimedb.reducer(
  { trackId: t.u64(), kind: t.string(), name: t.string(), instrumentKind: t.string(), instrumentKey: t.string(), assetId: t.u64(), startBeat: t.f64(), lengthBeats: t.f64(), midiJson: t.string() },
  (ctx, { trackId, kind, name, instrumentKind, instrumentKey, assetId, startBeat, lengthBeats, midiJson }) => {
    const trackRow = ctx.db.track.id.find(trackId);
    if (!trackRow) throw new SenderError('track not found');
    requireRoomEditor(ctx, trackRow.roomId);
    ctx.db.block.insert({
      id: 0n,
      trackId,
      kind,
      name,
      instrumentKind,
      instrumentKey,
      assetId,
      startBeat,
      lengthBeats,
      assetOffsetMicros: 0n,
      assetDurationMicros: 0n,
      gain: 1,
      fadeInMicros: 0n,
      fadeOutMicros: 0n,
      reverse: false,
      pitchSemitones: 0,
      timeStretch: 1,
      midiJson,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
);

export const updateBlock = spacetimedb.reducer(
  {
    blockId: t.u64(),
    name: t.string(),
    startBeat: t.f64(),
    lengthBeats: t.f64(),
    assetOffsetMicros: t.u64(),
    assetDurationMicros: t.u64(),
    gain: t.f64(),
    fadeInMicros: t.u64(),
    fadeOutMicros: t.u64(),
    reverse: t.bool(),
    pitchSemitones: t.f64(),
    timeStretch: t.f64(),
    midiJson: t.string(),
    instrumentKind: t.string(),
    instrumentKey: t.string(),
  },
  (ctx, { blockId, ...updates }) => {
    const blockRow = ctx.db.block.id.find(blockId);
    if (!blockRow) throw new SenderError('block not found');
    const trackRow = ctx.db.track.id.find(blockRow.trackId);
    if (!trackRow) throw new SenderError('track not found');
    requireRoomEditor(ctx, trackRow.roomId);
    ctx.db.block.id.update({ ...blockRow, ...updates, updatedAt: ctx.timestamp });
  }
);

export const updateBlockMidi = spacetimedb.reducer(
  { blockId: t.u64(), midiJson: t.string() },
  (ctx, { blockId, midiJson }) => {
    const blockRow = ctx.db.block.id.find(blockId);
    if (!blockRow) throw new SenderError('block not found');
    const trackRow = ctx.db.track.id.find(blockRow.trackId);
    if (!trackRow) throw new SenderError('track not found');
    requireRoomEditor(ctx, trackRow.roomId);
    ctx.db.block.id.update({ ...blockRow, midiJson, updatedAt: ctx.timestamp });
  }
);

export const addEffect = spacetimedb.reducer(
  { targetKind: t.string(), targetId: t.u64(), kind: t.string(), name: t.string(), paramsJson: t.string() },
  (ctx, { targetKind, targetId, kind, name, paramsJson }) => {
    if (targetKind === 'track') {
      const trackRow = ctx.db.track.id.find(targetId);
      if (!trackRow) throw new SenderError('track not found');
      requireRoomEditor(ctx, trackRow.roomId);
    } else if (targetKind === 'block') {
      const blockRow = ctx.db.block.id.find(targetId);
      if (!blockRow) throw new SenderError('block not found');
      const trackRow = ctx.db.track.id.find(blockRow.trackId);
      if (!trackRow) throw new SenderError('track not found');
      requireRoomEditor(ctx, trackRow.roomId);
    } else throw new SenderError('invalid target');

    const position = [...ctx.db.effect.by_target.filter([targetKind, targetId])].length;
    ctx.db.effect.insert({ id: 0n, targetKind, targetId, kind, name, enabled: true, position, paramsJson, createdAt: ctx.timestamp, updatedAt: ctx.timestamp });
  }
);

export const addAutomationLane = spacetimedb.reducer(
  { targetKind: t.string(), targetId: t.u64(), effectId: t.u64(), paramKey: t.string(), label: t.string(), minValue: t.f64(), maxValue: t.f64(), scale: t.string(), color: t.string() },
  (ctx, params) => {
    const effectRow = ctx.db.effect.id.find(params.effectId);
    if (!effectRow) throw new SenderError('effect not found');
    const position = [...ctx.db.automationLane.by_target.filter([params.targetKind, params.targetId])].length;
    ctx.db.automationLane.insert({ id: 0n, enabled: true, visible: true, position, updatedAt: ctx.timestamp, ...params });
  }
);

export const upsertAutomationPoint = spacetimedb.reducer(
  { pointId: t.u64(), laneId: t.u64(), beat: t.f64(), value: t.f64(), curve: t.string() },
  (ctx, { pointId, laneId, beat, value, curve }) => {
    const lane = ctx.db.automationLane.id.find(laneId);
    if (!lane) throw new SenderError('automation lane not found');
    const existing = pointId === 0n ? null : ctx.db.automationPoint.id.find(pointId);
    if (existing) ctx.db.automationPoint.id.update({ ...existing, beat, value, curve, updatedAt: ctx.timestamp });
    else ctx.db.automationPoint.insert({ id: 0n, laneId, beat, value, curve, updatedAt: ctx.timestamp });
  }
);

export const heartbeat = spacetimedb.reducer((ctx) => {
  for (const member of ctx.db.roomMember.iter()) {
    if (member.identity.equals(ctx.sender) && member.active) {
      ctx.db.roomMember.id.update({ ...member, lastSeen: ctx.timestamp });
    }
  }
});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  for (const member of ctx.db.roomMember.iter()) {
    if (member.identity.equals(ctx.sender) && member.active) {
      ctx.db.roomMember.id.update({ ...member, active: false, lastSeen: ctx.timestamp });
    }
  }
});
