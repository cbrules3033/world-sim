import { WebSocket } from 'ws';

// Give the server a moment to start
await new Promise(r => setTimeout(r, 1000));

const ws1 = new WebSocket('ws://localhost:3010');
const ws2 = new WebSocket('ws://localhost:3010');

const messages1 = [];
const messages2 = [];

ws1.on('message', data => messages1.push(JSON.parse(data.toString())));
ws2.on('message', data => messages2.push(JSON.parse(data.toString())));

await new Promise(r => setTimeout(r, 300));

// Player 1 creates room
ws1.send(JSON.stringify({ type: 'create_room', playerName: 'Alice' }));
await new Promise(r => setTimeout(r, 300));

const created = messages1.find(m => m.type === 'room_created');
console.log('Room created:', created?.roomCode, 'Player ID:', created?.playerId?.slice(0, 8));

if (!created) {
  console.log('Failed to create room. Messages:', JSON.stringify(messages1));
  process.exit(1);
}

// Player 2 joins
ws2.send(JSON.stringify({ type: 'join_room', roomCode: created.roomCode, playerName: 'Bob' }));
await new Promise(r => setTimeout(r, 300));

const joined = messages2.find(m => m.type === 'joined_room');
console.log('Bob joined room:', joined?.roomCode);

if (!joined) {
  console.log('Failed to join. Messages2:', JSON.stringify(messages2));
  process.exit(1);
}

// Start game
ws1.send(JSON.stringify({ type: 'start_game', seed: 'test-seed' }));
await new Promise(r => setTimeout(r, 1000));

const map1 = messages1.find(m => m.type === 'map_data');
const map2 = messages2.find(m => m.type === 'map_data');
console.log('Alice got map:', map1 ? `yes (${map1.tiles?.length} tiles, ${map1.spawns?.length} spawns)` : 'no');
console.log('Bob got map:', map2 ? `yes (${map2.tiles?.length} tiles, ${map2.spawns?.length} spawns)` : 'no');

if (map1 && map2) {
  const same = JSON.stringify(map1.tiles) === JSON.stringify(map2.tiles);
  console.log('Maps identical:', same);
  console.log('Stats:', JSON.stringify(map1.stats));
} else {
  console.log('Map messages missing. Msgs1:', messages1.map(m => m.type), 'Msgs2:', messages2.map(m => m.type));
}

ws1.close();
ws2.close();
process.exit(0);
