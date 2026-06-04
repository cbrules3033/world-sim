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

function hasRockyNearby(tiles, width, height, cx, cy, range) {
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (tiles[nx][ny].terrain === TERRAIN.ROCKY) return true;
    }
  }
  return false;
}

function isValidForestCenter(tiles, width, height, cx, cy, occupiedCenters) {
  if (tiles[cx][cy].terrain !== TERRAIN.GRASS) return false;

  for (let dx = -FOREST.centerWaterClearance; dx <= FOREST.centerWaterClearance; dx++) {
    for (let dy = -FOREST.centerWaterClearance; dy <= FOREST.centerWaterClearance; dy++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false;
      if (tiles[nx][ny].terrain === TERRAIN.WATER) return false;
    }
  }

  let grassCount = 0;
  let totalChecked = 0;
  const cr = FOREST.centerGrassCheckRadius;
  for (let dx = -cr; dx <= cr; dx++) {
    for (let dy = -cr; dy <= cr; dy++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      totalChecked++;
      if (tiles[nx][ny].terrain === TERRAIN.GRASS) grassCount++;
    }
  }
  if (totalChecked === 0 || grassCount / totalChecked < FOREST.centerGrassThreshold) return false;

  for (const oc of occupiedCenters) {
    if (dist(cx, cy, oc.x, oc.y) < oc.radius + FOREST.forestSeparationGap) return false;
  }

  return true;
}

export function generateForests(tiles, width, height, rng, noiseFn) {
  resetCounters();
  const sites = [];
  const entities = [];
  const occupiedCenters = [];

  const area = width * height;
  const targetCount = Math.max(3, Math.floor(area / FOREST.targetAreaFactor));
  const maxAttempts = targetCount * 80;

  let attempts = 0;
  while (sites.length < targetCount && attempts < maxAttempts) {
    attempts++;

    const cx = FOREST.centerEdgeMargin + Math.floor(rng() * (width - FOREST.centerEdgeMargin * 2));
    const cy = FOREST.centerEdgeMargin + Math.floor(rng() * (height - FOREST.centerEdgeMargin * 2));

    if (!isValidForestCenter(tiles, width, height, cx, cy, occupiedCenters)) continue;

    const radius = FOREST.minRadius + rng() * (FOREST.maxRadius - FOREST.minRadius);
    const siteId = nextSiteId('forest');
    const treeIds = [];

    const targetTrees = Math.floor(FOREST.minTrees + rng() * (FOREST.maxTrees - FOREST.minTrees));

    let treeAttempts = 0;
    const maxTreeAttempts = targetTrees * 10;
    while (treeIds.length < targetTrees && treeAttempts < maxTreeAttempts) {
      treeAttempts++;

      const angle = rng() * Math.PI * 2;
      const d = radius * Math.sqrt(rng());
      const tx = cx + Math.cos(angle) * d;
      const ty = cy + Math.sin(angle) * d;

      const edgeNoise = noiseFn(tx * 0.25, ty * 0.25);
      if (d > radius * (0.65 + edgeNoise * 0.35)) continue;

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

    if (treeIds.length >= FOREST.minRequiredTrees) {
      sites.push({
        id: siteId,
        type: SITE_TYPES.FOREST,
        resourceType: RESOURCE_TYPES.WOOD,
        center: { x: cx, y: cy },
        radius,
        nodeIds: treeIds,
      });
      occupiedCenters.push({ x: cx, y: cy, radius: radius + FOREST.forestSeparationGap });
    }
  }

  return { sites, entities };
}

function generateOreDepositType(tiles, width, height, rng, resourceType, noiseFn, threshold, requireRockyNearby) {
  const config = DEPOSITS[resourceType];
  const sites = [];
  const entities = [];
  const centers = [];

  const margin = 6;

  for (let x = margin; x < width - margin; x += 4) {
    for (let y = margin; y < height - margin; y += 4) {
      const n = noiseFn(x, y);
      if (n < threshold) continue;
      if (tiles[x][y].terrain !== TERRAIN.GRASS) continue;

      if (requireRockyNearby && !hasRockyNearby(tiles, width, height, x, y, 5)) continue;

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
        const distFromCenter = rng() * radius * 0.8;
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
  return generateOreDepositType(tiles, width, height, rng, 'stone', noiseFn, 0.70, false);
}

export function generateCopperDeposits(tiles, width, height, rng, noiseFn) {
  return generateOreDepositType(tiles, width, height, rng, 'copper', noiseFn, 0.77, true);
}

export function generateIronDeposits(tiles, width, height, rng, noiseFn) {
  return generateOreDepositType(tiles, width, height, rng, 'iron', noiseFn, 0.83, true);
}
