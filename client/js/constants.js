const TILE_SIZE = 32;

const SCALE = {
  TERRAIN_TILE_SIZE: 32,
  BUILD_CELL_SIZE: 8,
  BUILD_CELLS_PER_TILE: 4,
  UNIT_RADIUS_PX: 5,
  UNIT_SELECTION_RADIUS_PX: 10,
};

const BUILDING_DEFS = {
  town_center: { label: 'Town Center', hotkey: 'T', w: 12, h: 12, color: 0xc49a5a, hp: 1500, cost: {} },
  house: { label: 'House', hotkey: 'H', w: 5, h: 5, color: 0xd2b48c, hp: 300, cost: { wood: 25 } },
  lumber_camp: { label: 'Lumber Camp', hotkey: 'L', w: 7, h: 7, color: 0x8b5a2b, hp: 500, cost: { wood: 50 } },
  mining_camp: { label: 'Mining Camp', hotkey: 'M', w: 7, h: 7, color: 0x777777, hp: 500, cost: { wood: 50 } },
  barracks: { label: 'Barracks', hotkey: 'B', w: 12, h: 10, color: 0x9a6a3a, hp: 900, cost: { wood: 150 } },
  farm: { label: 'Farm', hotkey: 'G', w: 12, h: 12, color: 0xb5a642, hp: 200, cost: { wood: 60 } },
};

const TERRAIN_COLORS = {
  0: 0x4a8c3f,
  1: 0x2b6cb0,
  2: 0x5f6a4f,
};

const ENTITY_COLORS = {
  tree: 0x2d6a2d,
  stone: 0x808080,
  copper: 0xcd7f32,
  iron: 0x4a4a4a,
};

const SITE_COLORS = {
  forest: 0x1a4a1a,
  deposit_site: 0x8b4513,
};

const MAX_PLAYERS = 8;

const RESOURCE_GATHER_RULES = {
  wood: {
    gatherIntervalMs: 800,
    gatherAmount: 2,
    carryCapacity: 10,
    validDropoffs: ['town_center', 'lumber_camp'],
    actionName: 'chopping',
  },
  stone: {
    gatherIntervalMs: 900,
    gatherAmount: 2,
    carryCapacity: 10,
    validDropoffs: ['town_center', 'mining_camp'],
    actionName: 'mining',
  },
  copper: {
    gatherIntervalMs: 1000,
    gatherAmount: 2,
    carryCapacity: 10,
    validDropoffs: ['town_center', 'mining_camp'],
    actionName: 'mining',
  },
  iron: {
    gatherIntervalMs: 1100,
    gatherAmount: 2,
    carryCapacity: 10,
    validDropoffs: ['town_center', 'mining_camp'],
    actionName: 'mining',
  },
};

const POPULATION = {
  BASE_CAP: 5,
  PER_HOUSE: 5,
};

const VILLAGER_COST = {
  wood: 50,
};

const UI_STYLE = {
  panelBg: 0x000000,
  panelAlpha: 0.75,
  textColor: '#ffffff',
  disabledColor: '#666666',
  buttonBg: 0x3a3a3a,
  buttonHover: 0x5a5a5a,
  buttonDisabled: 0x222222,
  accentColor: '#ffcc00',
};
