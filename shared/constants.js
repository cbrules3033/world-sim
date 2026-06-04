export const TERRAIN = {
  GRASS: 0,
  WATER: 1,
  ROCKY: 2,
};

export const RESOURCE_TYPES = {
  WOOD: 'wood',
  STONE: 'stone',
  COPPER: 'copper',
  IRON: 'iron',
};

export const SITE_TYPES = {
  FOREST: 'forest',
  DEPOSIT: 'deposit_site',
};

export const ENTITY_TYPES = {
  TREE: 'tree',
  ORE_NODE: 'ore_node',
};

export const TERRAIN_PROPERTIES = {
  [TERRAIN.GRASS]: { walkable: true, buildable: true, color: 0x4a8c3f },
  [TERRAIN.WATER]: { walkable: false, buildable: false, color: 0x2b6cb0 },
  [TERRAIN.ROCKY]: { walkable: true, buildable: true, color: 0x6b5b4f },
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
export const SPAWN_NEARBY_RADIUS = 25;

export const FOREST = {
  minRadius: 8,
  maxRadius: 15,
  minTrees: 30,
  maxTrees: 80,
  treeAmount: 100,
  minSpacing: 1.2,
  entityRadiusMin: 0.25,
  entityRadiusMax: 0.5,
};

export const DEPOSITS = {
  stone: { minNodes: 5, maxNodes: 10, nodeAmount: 1000, minRadius: 4, maxRadius: 7, minDistance: 18 },
  copper: { minNodes: 4, maxNodes: 8, nodeAmount: 1000, minRadius: 4, maxRadius: 6, minDistance: 25 },
  iron: { minNodes: 3, maxNodes: 6, nodeAmount: 1200, minRadius: 3, maxRadius: 5, minDistance: 26 },
};
