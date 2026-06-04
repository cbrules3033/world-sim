import { TERRAIN, SPAWN_CLEAR_RADIUS, SPAWN_NEARBY_MIN_TREES, SPAWN_NEARBY_MIN_STONE, SPAWN_NEARBY_RADIUS } from '../../shared/constants.js';

export function findSpawns(tiles, width, height, playerCount, rng) {
  const spawns = [];
  const candidates = [];

  for (let x = SPAWN_CLEAR_RADIUS; x < width - SPAWN_CLEAR_RADIUS; x++) {
    for (let y = SPAWN_CLEAR_RADIUS; y < height - SPAWN_CLEAR_RADIUS; y++) {
      if (!isValidSpawnCenter(tiles, width, height, x, y)) continue;
      const nearbyTrees = countResourceNearby(tiles, x, y, 'tree', SPAWN_NEARBY_RADIUS);
      const nearbyStone = countResourceNearby(tiles, x, y, 'stone', SPAWN_NEARBY_RADIUS);
      if (nearbyTrees >= SPAWN_NEARBY_MIN_TREES && nearbyStone >= SPAWN_NEARBY_MIN_STONE) {
        candidates.push({ x, y, score: rng() });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  for (const c of candidates) {
    if (spawns.length >= playerCount) break;
    if (spawns.every(s => distance(s, c) > SPAWN_CLEAR_RADIUS * 3)) {
      spawns.push({ x: c.x, y: c.y });
    }
  }

  return spawns;
}

function isValidSpawnCenter(tiles, width, height, x, y) {
  for (let dx = -SPAWN_CLEAR_RADIUS; dx <= SPAWN_CLEAR_RADIUS; dx++) {
    for (let dy = -SPAWN_CLEAR_RADIUS; dy <= SPAWN_CLEAR_RADIUS; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
      const tile = tiles[nx][ny];
      if (tile.terrain === TERRAIN.WATER) return false;
      if (tile.resource) return false;
    }
  }
  return true;
}

function countResourceNearby(tiles, x, y, type, radius) {
  let count = 0;
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(tiles.length - 1, x + radius);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(tiles[0].length - 1, y + radius);
  for (let nx = minX; nx <= maxX; nx++) {
    for (let ny = minY; ny <= maxY; ny++) {
      const tile = tiles[nx][ny];
      if (tile.resource && tile.resource.type === type) count++;
    }
  }
  return count;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
