import { TERRAIN, RESOURCE_TYPES, RESOURCE_AMOUNTS } from '../../shared/constants.js';

const RESOURCE_THRESHOLD = {
  tree: 0.60,
  stone: 0.72,
  iron: 0.80,
};

function placeResourceType(tiles, width, height, type, noiseFn) {
  const threshold = RESOURCE_THRESHOLD[type];
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const tile = tiles[x][y];
      if (tile.terrain !== TERRAIN.GRASS) continue;
      const n = noiseFn(x, y);
      if (n > threshold) {
        tile.resource = { type, amount: RESOURCE_AMOUNTS[type] };
        tile.walkable = false;
        tile.buildable = false;
      }
    }
  }
}

export function placeTrees(tiles, width, height, rng, noiseFn) {
  placeResourceType(tiles, width, height, RESOURCE_TYPES.TREE, noiseFn);
}

export function placeStone(tiles, width, height, rng, noiseFn) {
  placeResourceType(tiles, width, height, RESOURCE_TYPES.STONE, noiseFn);
}

export function placeIron(tiles, width, height, rng, noiseFn) {
  placeResourceType(tiles, width, height, RESOURCE_TYPES.IRON, noiseFn);
}
