import { TERRAIN, SPAWN_CLEAR_RADIUS, SPAWN_NEARBY_RADIUS } from '../../shared/constants.js';

export function findSpawns(tiles, width, height, playerCount, rng, resourceSites, resourceEntities) {
  const spawns = [];
  const candidates = [];

  for (let x = SPAWN_CLEAR_RADIUS; x < width - SPAWN_CLEAR_RADIUS; x++) {
    for (let y = SPAWN_CLEAR_RADIUS; y < height - SPAWN_CLEAR_RADIUS; y++) {
      if (!isValidSpawnCenter(tiles, width, height, x, y, resourceEntities)) continue;

      const nearbyWood = countEntitiesNearby(resourceEntities, x, y, 'tree', SPAWN_NEARBY_RADIUS);
      const nearbyStone = countDepositsNearby(resourceSites, x, y, 'stone', SPAWN_NEARBY_RADIUS);

      if (nearbyWood >= 5 && nearbyStone >= 1) {
        candidates.push({ x, y, score: rng() });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score);

  for (const c of candidates) {
    if (spawns.length >= playerCount) break;
    if (spawns.every(s => manhattanDist(s, c) > SPAWN_CLEAR_RADIUS * 3)) {
      spawns.push({ x: c.x, y: c.y });
    }
  }

  return spawns;
}

function isValidSpawnCenter(tiles, width, height, x, y, resourceEntities) {
  for (let dx = -SPAWN_CLEAR_RADIUS; dx <= SPAWN_CLEAR_RADIUS; dx++) {
    for (let dy = -SPAWN_CLEAR_RADIUS; dy <= SPAWN_CLEAR_RADIUS; dy++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
      const tile = tiles[nx][ny];
      if (tile.terrain === TERRAIN.WATER) return false;

      for (const entity of resourceEntities) {
        const ex = entity.position.x;
        const ey = entity.position.y;
        if (Math.abs(ex - nx) < 1.5 && Math.abs(ey - ny) < 1.5) return false;
      }
    }
  }
  return true;
}

function countEntitiesNearby(entities, x, y, entityType, radius) {
  let count = 0;
  for (const entity of entities) {
    if (entity.type !== 'tree') continue;
    const d = Math.sqrt(
      (entity.position.x - x) ** 2 + (entity.position.y - y) ** 2
    );
    if (d <= radius) count++;
  }
  return count;
}

function countDepositsNearby(sites, x, y, resourceType, radius) {
  let count = 0;
  for (const site of sites) {
    if (site.type !== 'deposit_site') continue;
    if (site.resourceType !== resourceType) continue;
    const d = Math.sqrt(
      (site.center.x - x) ** 2 + (site.center.y - y) ** 2
    );
    if (d <= radius) count++;
  }
  return count;
}

function manhattanDist(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
