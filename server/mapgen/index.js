import { TERRAIN, RESOURCE_TYPES, SPAWN_CLEAR_RADIUS } from '../../shared/constants.js';
import { createRng } from './rng.js';
import { makeNoise } from './noise.js';
import { generateTerrain } from './terrain.js';
import { placeTrees, placeStone, placeIron } from './resources.js';
import { findSpawns } from './spawn.js';

export function generateMap(seed, width, height) {
  const rng = createRng(seed);

  const terrainNoise = makeNoise(rng, 4, 1 / 16);
  const tiles = generateTerrain(width, height, rng, terrainNoise);

  const forestNoise = makeNoise(rng, 2, 1 / 12);
  placeTrees(tiles, width, height, rng, forestNoise);

  const stoneNoise = makeNoise(rng, 2, 1 / 16);
  placeStone(tiles, width, height, rng, stoneNoise);

  const ironNoise = makeNoise(rng, 2, 1 / 20);
  placeIron(tiles, width, height, rng, ironNoise);

  const stats = computeStats(tiles, width, height);

  const spawns = findSpawns(tiles, width, height, 8, rng);

  clearSpawnZones(tiles, spawns);

  stats.validSpawns = spawns.length;

  return { seed, width, height, tiles, spawns, stats };
}

function computeStats(tiles, width, height) {
  const stats = {
    water: 0,
    grass: 0,
    dirt: 0,
    sand: 0,
    tree: 0,
    stone: 0,
    iron: 0,
    validSpawns: 0,
  };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      const terrainName = Object.entries(TERRAIN).find(([, v]) => v === tile.terrain)?.[0]?.toLowerCase();
      if (terrainName && stats[terrainName] !== undefined) stats[terrainName]++;

      if (tile.resource) {
        stats[tile.resource.type]++;
      }
    }
  }

  return stats;
}

function clearSpawnZones(tiles, spawns) {
  const radius = Math.floor(SPAWN_CLEAR_RADIUS / 2);
  for (const spawn of spawns) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const nx = spawn.x + dx;
        const ny = spawn.y + dy;
        if (nx < 0 || nx >= tiles.length || ny < 0 || ny >= tiles[0].length) continue;
        const tile = tiles[nx][ny];
        tile.resource = null;
        tile.walkable = true;
        tile.buildable = true;
      }
    }
  }
}
