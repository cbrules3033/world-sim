import { MessageType, sendMessage, broadcast } from './protocol.js';
import { generateMap } from './mapgen/index.js';
import { MAX_PLAYERS, DEFAULT_MAP_SIZE } from '../shared/constants.js';

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

export function handleMessage(ws, message, playerIdMap) {
  const data = JSON.parse(message);
  const { type, ...payload } = data;

  switch (type) {
    case MessageType.CREATE_ROOM:
      handleCreateRoom(ws, payload, playerIdMap);
      break;
    case MessageType.JOIN_ROOM:
      handleJoinRoom(ws, payload, playerIdMap);
      break;
    case MessageType.LEAVE_ROOM:
      handleLeaveRoom(ws, playerIdMap);
      break;
    case MessageType.START_GAME:
      handleStartGame(ws, payload, playerIdMap);
      break;
    case MessageType.PING:
      sendMessage(ws, MessageType.PONG);
      break;
  }
}

export function handleDisconnect(ws, playerIdMap) {
  const playerId = playerIdMap.get(ws);
  if (!playerId) return;

  for (const [code, room] of rooms) {
    if (room.players.has(playerId)) {
      room.players.delete(playerId);
      broadcast(room.players, MessageType.PLAYER_LEFT, { playerId, players: getPlayerList(room) });
      if (room.hostId === playerId && room.players.size > 0) {
        room.hostId = room.players.keys().next().value;
        broadcast(room.players, MessageType.LOBBY_UPDATE, { hostId: room.hostId, players: getPlayerList(room) });
      }
      if (room.players.size === 0) rooms.delete(code);
      break;
    }
  }
  playerIdMap.delete(ws);
}

function handleCreateRoom(ws, payload, playerIdMap) {
  const { playerName } = payload;
  if (!playerName) {
    sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Name required' });
    return;
  }

  const code = generateRoomCode();
  const playerId = generateId();
  const room = {
    code,
    hostId: playerId,
    players: new Map(),
    state: 'lobby',
    seed: null,
    mapSize: DEFAULT_MAP_SIZE,
  };
  room.players.set(playerId, { id: playerId, name: playerName, ws });
  rooms.set(code, room);
  playerIdMap.set(ws, playerId);

  sendMessage(ws, MessageType.ROOM_CREATED, {
    roomCode: code,
    playerId,
    players: getPlayerList(room),
    hostId: playerId,
  });
}

function handleJoinRoom(ws, payload, playerIdMap) {
  const { roomCode, playerName } = payload;
  if (!roomCode || !playerName) {
    sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Room code and name required' });
    return;
  }

  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Room not found' });
    return;
  }

  if (room.players.size >= MAX_PLAYERS) {
    sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Room is full' });
    return;
  }

  if (room.state !== 'lobby') {
    sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Game already in progress' });
    return;
  }

  const playerId = generateId();
  room.players.set(playerId, { id: playerId, name: playerName, ws });
  playerIdMap.set(ws, playerId);

  sendMessage(ws, MessageType.JOINED_ROOM, {
    roomCode,
    playerId,
    players: getPlayerList(room),
    hostId: room.hostId,
  });

  broadcast(room.players, MessageType.PLAYER_JOINED, {
    playerId,
    playerName,
    players: getPlayerList(room),
  }, playerId);
}

function handleLeaveRoom(ws, playerIdMap) {
  handleDisconnect(ws, playerIdMap);
}

function handleStartGame(ws, payload, playerIdMap) {
  const playerId = playerIdMap.get(ws);
  if (!playerId) {
    console.log('start_game: no playerId for ws');
    return;
  }

  for (const [code, room] of rooms) {
    if (!room.players.has(playerId)) continue;
    if (room.hostId !== playerId) {
      sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Only host can start' });
      return;
    }

    const seed = payload.seed || room.seed || `seed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    room.seed = seed;
    room.state = 'playing';

    console.log(`Starting game in room ${code}, seed: ${seed}, players: ${room.players.size}`);

    broadcast(room.players, MessageType.GAME_STARTING, {
      seed,
      width: room.mapSize.width,
      height: room.mapSize.height,
    });

    let mapData;
    try {
      mapData = generateMap(seed, room.mapSize.width, room.mapSize.height);
    } catch (err) {
      console.error('Map generation error:', err);
      sendMessage(ws, MessageType.ROOM_ERROR, { error: 'Failed to generate map' });
      return;
    }

    for (const [pid, player] of room.players) {
      sendMessage(player.ws, MessageType.MAP_DATA, {
        seed: mapData.seed,
        width: mapData.width,
        height: mapData.height,
        tiles: serializeTiles(mapData.tiles),
        resourceSites: mapData.resourceSites,
        resourceEntities: mapData.resourceEntities,
        spawns: mapData.spawns,
        stats: mapData.stats,
        playerId: pid,
      });
    }
    break;
  }
}

export function setRoomSeed(roomCode, seed) {
  const room = rooms.get(roomCode);
  if (room) room.seed = seed;
}

function getPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({ id: p.id, name: p.name }));
}

function generateId() {
  return crypto.randomUUID();
}

function serializeTiles(tiles) {
  const flat = [];
  const w = tiles.length;
  const h = tiles[0].length;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const t = tiles[x][y];
      flat.push({
        t: t.terrain,
        w: t.walkable,
        b: t.buildable,
      });
    }
  }
  return flat;
}
