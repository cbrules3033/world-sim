export const MessageType = {
  CREATE_ROOM: 'create_room',
  ROOM_CREATED: 'room_created',
  JOIN_ROOM: 'join_room',
  JOINED_ROOM: 'joined_room',
  PLAYER_JOINED: 'player_joined',
  PLAYER_LEFT: 'player_left',
  START_GAME: 'start_game',
  GAME_STARTING: 'game_starting',
  MAP_DATA: 'map_data',
  ROOM_ERROR: 'room_error',
  LEAVE_ROOM: 'leave_room',
  LOBBY_UPDATE: 'lobby_update',
  PING: 'ping',
  PONG: 'pong',
};

export function sendMessage(ws, type, payload = {}) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

export function broadcast(players, type, payload = {}, excludeId = null) {
  for (const [id, player] of players) {
    if (id === excludeId) continue;
    sendMessage(player.ws, type, payload);
  }
}
