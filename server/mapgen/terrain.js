import { TERRAIN } from '../../shared/constants.js';

export function generateTerrain(width, height, rng, terrainNoise, rockyNoise) {
  const tiles = [];

  for (let x = 0; x < width; x++) {
    tiles[x] = [];
    for (let y = 0; y < height; y++) {
      const n = terrainNoise(x, y);
      let terrain;
      if (n < 0.32) {
        terrain = TERRAIN.WATER;
      } else if (rockyNoise && rockyNoise(x, y) > 0.76) {
        terrain = TERRAIN.ROCKY;
      } else {
        terrain = TERRAIN.GRASS;
      }
      tiles[x][y] = {
        x,
        y,
        terrain,
        walkable: terrain !== TERRAIN.WATER,
        buildable: terrain !== TERRAIN.WATER,
      };
    }
  }

  smoothWater(tiles, width, height);
  return tiles;
}

function smoothWater(tiles, width, height) {
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (tiles[x][y].terrain !== TERRAIN.WATER) continue;
      let waterNeighbors = 0;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            waterNeighbors++;
            continue;
          }
          if (tiles[nx][ny].terrain === TERRAIN.WATER) waterNeighbors++;
        }
      }
      if (waterNeighbors < 3) {
        tiles[x][y].terrain = TERRAIN.GRASS;
        tiles[x][y].walkable = true;
        tiles[x][y].buildable = true;
      }
    }
  }
}
