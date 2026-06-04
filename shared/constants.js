export const TERRAIN = {
  GRASS: 0,
  WATER: 1,
  DIRT: 2,
  SAND: 3,
};

export const RESOURCE_TYPES = {
  TREE: 'tree',
  STONE: 'stone',
  IRON: 'iron',
};

export const RESOURCE_AMOUNTS = {
  tree: 100,
  stone: 200,
  iron: 150,
};

export const TERRAIN_PROPERTIES = {
  [TERRAIN.GRASS]: { walkable: true, buildable: true, color: 0x4a8c3f },
  [TERRAIN.WATER]: { walkable: false, buildable: false, color: 0x2b6cb0 },
  [TERRAIN.DIRT]: { walkable: true, buildable: true, color: 0x8b7355 },
  [TERRAIN.SAND]: { walkable: true, buildable: false, color: 0xd4b96b },
};

export const RESOURCE_COLORS = {
  tree: 0x2d6a2d,
  stone: 0x808080,
  iron: 0x8b0000,
};

export const MAP_SIZES = {
  small: { width: 128, height: 128 },
  medium: { width: 256, height: 256 },
  large: { width: 512, height: 512 },
};

export const DEFAULT_MAP_SIZE = MAP_SIZES.small;
export const TILE_SIZE = 32;
export const MAX_PLAYERS = 8;
export const GAME_TICK_RATE = 20;

export const SPAWN_CLEAR_RADIUS = 5;
export const SPAWN_NEARBY_MIN_TREES = 5;
export const SPAWN_NEARBY_MIN_STONE = 2;
export const SPAWN_NEARBY_RADIUS = 25;
