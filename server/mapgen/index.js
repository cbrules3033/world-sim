import { TERRAIN, RESOURCE_TYPES } from '../../shared/constants.js';
import { createRng } from './rng.js';
import { makeNoise } from './noise.js';
import { generateTerrain } from './terrain.js';
import { generateForests, generateStoneDeposits, generateCopperDeposits, generateIronDeposits } from './resources.js';
import { findSpawns } from './spawn.js';

export function generateMap(seed, width, height) {
  const rng = createRng(seed);

  const terrainNoise = makeNoise(rng, 4, 1 / 16);
  const rockyNoise = makeNoise(rng, 2, 1 / 18);
  const tiles = generateTerrain(width, height, rng, terrainNoise, rockyNoise);

  const forestNoise = makeNoise(rng, 2, 1 / 14);
  const forestResult = generateForests(tiles, width, height, rng, forestNoise);

  const stoneNoise = makeNoise(rng, 3, 1 / 20);
  const stoneResult = generateStoneDeposits(tiles, width, height, rng, stoneNoise);

  const copperNoise = makeNoise(rng, 3, 1 / 24);
  const copperResult = generateCopperDeposits(tiles, width, height, rng, copperNoise);

  const ironNoise = makeNoise(rng, 3, 1 / 28);
  const ironResult = generateIronDeposits(tiles, width, height, rng, ironNoise);

  const resourceSites = [
    ...forestResult.sites,
    ...stoneResult.sites,
    ...copperResult.sites,
    ...ironResult.sites,
  ];

  const resourceEntities = [
    ...forestResult.entities,
    ...stoneResult.entities,
    ...copperResult.entities,
    ...ironResult.entities,
  ];

  const stats = computeStats(tiles, width, height, resourceSites, resourceEntities);

  const spawns = findSpawns(tiles, width, height, 8, rng, resourceSites, resourceEntities);

  clearSpawnZones(tiles, spawns, resourceEntities);

  stats.validSpawns = spawns.length;

  return {
    seed,
    width,
    height,
    tiles,
    resourceSites,
    resourceEntities,
    spawns,
    stats,
  };
}

function computeStats(tiles, width, height, resourceSites, resourceEntities) {
  const stats = {
    water: 0,
    grass: 0,
    rocky: 0,
    forests: 0,
    trees: 0,
    stoneDeposits: 0,
    stoneNodes: 0,
    copperDeposits: 0,
    copperNodes: 0,
    ironDeposits: 0,
    ironNodes: 0,
    validSpawns: 0,
  };

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      if (tile.terrain === TERRAIN.WATER) stats.water++;
      else if (tile.terrain === TERRAIN.ROCKY) stats.rocky++;
      else stats.grass++;
    }
  }

  for (const site of resourceSites) {
    if (site.type === 'forest') stats.forests++;
    if (site.type === 'deposit_site') {
      if (site.resourceType === 'stone') stats.stoneDeposits++;
      if (site.resourceType === 'copper') stats.copperDeposits++;
      if (site.resourceType === 'iron') stats.ironDeposits++;
    }
  }

  for (const entity of resourceEntities) {
    if (entity.type === 'tree') stats.trees++;
    if (entity.type === 'ore_node') {
      if (entity.resourceType === 'stone') stats.stoneNodes++;
      if (entity.resourceType === 'copper') stats.copperNodes++;
      if (entity.resourceType === 'iron') stats.ironNodes++;
    }
  }

  return stats;
}

function clearSpawnZones(tiles, spawns, resourceEntities) {
  const radius = Math.floor(5 / 2);
  for (const spawn of spawns) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const nx = spawn.x + dx;
        const ny = spawn.y + dy;
        if (nx < 0 || nx >= tiles.length || ny < 0 || ny >= tiles[0].length) continue;
        const tile = tiles[nx][ny];
        tile.walkable = true;
        tile.buildable = true;
      }
    }
  }
}
