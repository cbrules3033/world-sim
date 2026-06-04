import { TERRAIN, RESOURCE_TYPES, SITE_TYPES, ENTITY_TYPES, FOREST, DEPOSITS } from '../../shared/constants.js';

let entityCounter = 0;
let siteCounter = 0;

function resetCounters() {
  entityCounter = 0;
  siteCounter = 0;
}

function nextEntityId(prefix) {
  entityCounter++;
  return `${prefix}_${String(entityCounter).padStart(3, '0')}`;
}

function nextSiteId(prefix) {
  siteCounter++;
  return `${prefix}_${String(siteCounter).padStart(2, '0')}`;
}

function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

function isOnGrass(tiles, x, y, width, height) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
  return tiles[tx][ty].terrain === TERRAIN.GRASS;
}

function markTileBlocked(tiles, x, y, width, height) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || tx >= width || ty < 0 || ty >= height) return;
  tiles[tx][ty].walkable = false;
  tiles[tx][ty].buildable = false;
}

export function generateForests(tiles, width, height, rng, noiseFn) {
  resetCounters();
  const sites = [];
  const entities = [];
  const centers = [];

  for (let x = 6; x < width - 6; x += 3) {
    for (let y = 6; y < height - 6; y += 3) {
      const n = noiseFn(x, y);
      if (n < 0.65) continue;
      if (tiles[x][y].terrain !== TERRAIN.GRASS) continue;

      let tooClose = false;
      for (const c of centers) {
        if (dist(x, y, c.x, c.y) < FOREST.minRadius * 2.5) { tooClose = true; break; }
      }
      if (tooClose) continue;

      centers.push({ x, y });

      const radius = FOREST.minRadius + rng() * (FOREST.maxRadius - FOREST.minRadius);
      const numTrees = Math.floor(FOREST.minTrees + rng() * (FOREST.maxTrees - FOREST.minTrees));
      const siteId = nextSiteId('forest');
      const treeIds = [];

      for (let i = 0; i < numTrees; i++) {
        const angle = rng() * Math.PI * 2;
        const rawDist = rng() * radius;
        const distFromCenter = rawDist * Math.sqrt(rng());
        const tx = x + Math.cos(angle) * distFromCenter;
        const ty = y + Math.sin(angle) * distFromCenter;

        if (!isOnGrass(tiles, tx, ty, width, height)) continue;

        let overlapping = false;
        for (const eid of treeIds) {
          const existing = entities.find(e => e.id === eid);
          if (existing && dist(tx, ty, existing.position.x, existing.position.y) < FOREST.minSpacing) {
            overlapping = true;
            break;
          }
        }
        if (overlapping) continue;

        const treeId = nextEntityId('tree');
        treeIds.push(treeId);

        const entityRadius = FOREST.entityRadiusMin + rng() * (FOREST.entityRadiusMax - FOREST.entityRadiusMin);

        entities.push({
          id: treeId,
          type: ENTITY_TYPES.TREE,
          resourceType: RESOURCE_TYPES.WOOD,
          amount: FOREST.treeAmount,
          position: { x: tx, y: ty },
          radius: entityRadius,
          blocksMovement: true,
          blocksBuilding: true,
          canBeGathered: true,
        });

        markTileBlocked(tiles, tx, ty, width, height);
      }

      if (treeIds.length > 0) {
        sites.push({
          id: siteId,
          type: SITE_TYPES.FOREST,
          resourceType: RESOURCE_TYPES.WOOD,
          center: { x, y },
          radius,
          nodeIds: treeIds,
        });
      }
    }
  }

  return { sites, entities };
}

function generateOreDepositType(tiles, width, height, rng, resourceType, noiseFn, threshold) {
  const config = DEPOSITS[resourceType];
  const sites = [];
  const entities = [];
  const centers = [];

  for (let x = 6; x < width - 6; x += 3) {
    for (let y = 6; y < height - 6; y += 3) {
      const n = noiseFn(x, y);
      if (n < threshold) continue;
      if (tiles[x][y].terrain !== TERRAIN.GRASS) continue;

      let tooClose = false;
      for (const c of centers) {
        if (dist(x, y, c.x, c.y) < config.minDistance) { tooClose = true; break; }
      }
      if (tooClose) continue;

      centers.push({ x, y });

      const radius = config.minRadius + rng() * (config.maxRadius - config.minRadius);
      const numNodes = Math.floor(config.minNodes + rng() * (config.maxNodes - config.minNodes + 1));
      const siteId = nextSiteId(`${resourceType}_deposit`);
      const nodeIds = [];

      for (let i = 0; i < numNodes; i++) {
        const angle = rng() * Math.PI * 2;
        const distFromCenter = rng() * radius * 0.9;
        const nx = x + Math.cos(angle) * distFromCenter;
        const ny = y + Math.sin(angle) * distFromCenter;

        if (!isOnGrass(tiles, nx, ny, width, height)) continue;

        const nodeId = nextEntityId(`${resourceType}_node`);
        nodeIds.push(nodeId);

        const entityRadius = 0.4 + rng() * 0.3;

        entities.push({
          id: nodeId,
          type: ENTITY_TYPES.ORE_NODE,
          depositId: siteId,
          resourceType,
          amount: config.nodeAmount,
          position: { x: nx, y: ny },
          radius: entityRadius,
          blocksMovement: true,
          blocksBuilding: true,
          canBeGathered: true,
        });

        markTileBlocked(tiles, nx, ny, width, height);
      }

      if (nodeIds.length > 0) {
        sites.push({
          id: siteId,
          type: SITE_TYPES.DEPOSIT,
          resourceType,
          center: { x, y },
          radius,
          totalAmount: config.nodeAmount * nodeIds.length,
          nodeIds,
        });
      }
    }
  }

  return { sites, entities };
}

export function generateStoneDeposits(tiles, width, height, rng, noiseFn) {
  return generateOreDepositType(tiles, width, height, rng, 'stone', noiseFn, 0.70);
}

export function generateCopperDeposits(tiles, width, height, rng, noiseFn) {
  return generateOreDepositType(tiles, width, height, rng, 'copper', noiseFn, 0.77);
}

export function generateIronDeposits(tiles, width, height, rng, noiseFn) {
  return generateOreDepositType(tiles, width, height, rng, 'iron', noiseFn, 0.83);
}
