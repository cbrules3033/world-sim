class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    if (!data || !data.tiles) {
      console.error('GameScene: no map data received', data);
      return;
    }
    this.playerId = data.playerId;
    this.seed = data.seed;
    this.width = data.width;
    this.height = data.height;
    this.tiles = data.tiles;
    this.resourceSites = data.resourceSites || [];
    this.resourceEntities = data.resourceEntities || [];
    this.spawns = data.spawns || [];
    this.stats = data.stats || {};

    this.playerResources = {
      wood: 0,
      stone: 0,
      copper: 0,
      iron: 0,
    };

    if (!Array.isArray(data.resourceEntities)) {
      console.error('resourceEntities was missing or not an array:', data.resourceEntities);
    }
    if (!Array.isArray(data.resourceSites)) {
      console.error('resourceSites was missing or not an array:', data.resourceSites);
    }

    this.buildings = [];
    this.units = [];
    this.selectedUnits = [];
    this.nextBuildingId = 1;
    this.nextUnitId = 1;

    this.buildGridWidth = this.width * SCALE.BUILD_CELLS_PER_TILE;
    this.buildGridHeight = this.height * SCALE.BUILD_CELLS_PER_TILE;
    this.buildGrid = [];

    for (let gy = 0; gy < this.buildGridHeight; gy++) {
      const row = [];
      for (let gx = 0; gx < this.buildGridWidth; gx++) {
        const tx = Math.floor(gx / SCALE.BUILD_CELLS_PER_TILE);
        const ty = Math.floor(gy / SCALE.BUILD_CELLS_PER_TILE);
        const tile = this.tiles[ty * this.width + tx];
        const isWater = !tile || tile.t === 1;
        row.push({
          x: gx, y: gy,
          terrainTileX: tx, terrainTileY: ty,
          buildable: !isWater,
          pathable: !isWater,
          occupiedBy: null,
          blockedBy: null,
        });
      }
      this.buildGrid.push(row);
    }

    for (const entity of this.resourceEntities) {
      this.blockBuildCellsForEntity(entity);
    }

    console.log('MAP DATA RECEIVED:', {
      seed: this.seed,
      size: `${this.width}x${this.height}`,
      tiles: this.tiles?.length,
      resourceSites: this.resourceSites?.length,
      resourceEntities: this.resourceEntities?.length,
      stats: this.stats,
      buildGrid: `${this.buildGridWidth}x${this.buildGridHeight}`,
    });
  }

  blockBuildCellsForEntity(entity) {
    const px = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
    const py = entity.position.y * SCALE.TERRAIN_TILE_SIZE;
    const radius = entity.collisionRadiusPx || 6;

    const minBX = Math.max(0, Math.floor((px - radius) / SCALE.BUILD_CELL_SIZE));
    const maxBX = Math.min(this.buildGridWidth - 1, Math.floor((px + radius) / SCALE.BUILD_CELL_SIZE));
    const minBY = Math.max(0, Math.floor((py - radius) / SCALE.BUILD_CELL_SIZE));
    const maxBY = Math.min(this.buildGridHeight - 1, Math.floor((py + radius) / SCALE.BUILD_CELL_SIZE));

    for (let gy = minBY; gy <= maxBY; gy++) {
      for (let gx = minBX; gx <= maxBX; gx++) {
        const cellCX = gx * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        const cellCY = gy * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        const dx = cellCX - px;
        const dy = cellCY - py;
        if (dx * dx + dy * dy <= radius * radius) {
          this.buildGrid[gy][gx].buildable = false;
          this.buildGrid[gy][gx].pathable = false;
          this.buildGrid[gy][gx].blockedBy = entity.id;
        }
      }
    }
  }

  worldPxToBuildCell(x, y) {
    return { x: Math.floor(x / SCALE.BUILD_CELL_SIZE), y: Math.floor(y / SCALE.BUILD_CELL_SIZE) };
  }

  buildCellToWorldPx(x, y) {
    return { x: x * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2, y: y * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2 };
  }

  isCellPathable(x, y) {
    if (x < 0 || x >= this.buildGridWidth || y < 0 || y >= this.buildGridHeight) return false;
    const cell = this.buildGrid[y][x];
    return !!cell && cell.pathable && !cell.occupiedBy;
  }

  findPath(startX, startY, goalX, goalY) {
    const open = [];
    const closed = new Set();

    const key = (x, y) => `${x},${y}`;

    const heuristic = (x, y) => {
      const dx = Math.abs(x - goalX);
      const dy = Math.abs(y - goalY);
      return Math.min(dx, dy) * 14 + Math.abs(dx - dy) * 10;
    };

    open.push({ x: startX, y: startY, g: 0, f: heuristic(startX, startY), parent: null });

    const dirs = [
      { x: 0, y: -1, cost: 10 },
      { x: 1, y: 0, cost: 10 },
      { x: 0, y: 1, cost: 10 },
      { x: -1, y: 0, cost: 10 },
      { x: 1, y: -1, cost: 14 },
      { x: 1, y: 1, cost: 14 },
      { x: -1, y: 1, cost: 14 },
      { x: -1, y: -1, cost: 14 },
    ];

    const maxIterations = 50000;
    let iterations = 0;

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;

      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }

      const current = open.splice(bestIdx, 1)[0];
      const ck = key(current.x, current.y);

      if (current.x === goalX && current.y === goalY) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      closed.add(ck);

      for (const d of dirs) {
        const nx = current.x + d.x;
        const ny = current.y + d.y;

        if (!this.isCellPathable(nx, ny)) continue;

        // diagonal corner-cutting prevention
        if (d.cost === 14) {
          if (!this.isCellPathable(current.x + d.x, current.y) || !this.isCellPathable(current.x, current.y + d.y)) continue;
        }

        const nk = key(nx, ny);
        if (closed.has(nk)) continue;

        const ng = current.g + d.cost;

        const existing = open.find(o => o.x === nx && o.y === ny);
        if (existing) {
          if (ng < existing.g) {
            existing.g = ng;
            existing.f = ng + heuristic(nx, ny);
            existing.parent = current;
          }
        } else {
          open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny), parent: current });
        }
      }
    }

    return null;
  }

  simplifyPath(path) {
    if (!path || path.length <= 2) return path;

    const result = [path[0]];
    let lastDx = null;
    let lastDy = null;

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const cur = path[i];

      const dx = Math.sign(cur.x - prev.x);
      const dy = Math.sign(cur.y - prev.y);

      if (lastDx !== null && (dx !== lastDx || dy !== lastDy)) {
        result.push(prev);
      }

      lastDx = dx;
      lastDy = dy;
    }

    result.push(path[path.length - 1]);
    return result;
  }

  pathCellsToWaypoints(path) {
    return path.map(p => this.buildCellToWorldPx(p.x, p.y));
  }

  findNearestPathableCell(cx, cy, maxRadius = 12) {
    if (this.isCellPathable(cx, cy)) return { x: cx, y: cy };

    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          if (this.isCellPathable(x, y)) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }

  commandMoveUnit(unit, targetWorldX, targetWorldY) {
    const start = this.worldPxToBuildCell(unit.x, unit.y);
    const goal = this.worldPxToBuildCell(targetWorldX, targetWorldY);

    let finalGoal = goal;

    if (!this.isCellPathable(goal.x, goal.y)) {
      finalGoal = this.findNearestPathableCell(goal.x, goal.y, 12);
      if (!finalGoal) {
        console.warn('No pathable target near clicked location');
        return;
      }
    }

    const path = this.findPath(start.x, start.y, finalGoal.x, finalGoal.y);

    if (!path || path.length === 0) {
      console.warn('No path found', { start, finalGoal });
      return;
    }

    const simplified = this.simplifyPath(path);
    const waypoints = this.pathCellsToWaypoints(simplified);

    unit.path = waypoints;
    unit.pathIndex = 0;
    unit.state = 'moving';

    const first = waypoints[0];
    unit.targetX = first.x;
    unit.targetY = first.y;
  }

  renderPaths() {
    this.pathGraphics.clear();

    for (const u of this.selectedUnits) {
      if (!u.path || u.path.length === 0) continue;

      this.pathGraphics.lineStyle(2, 0x00ffff, 0.8);

      this.pathGraphics.beginPath();
      this.pathGraphics.moveTo(u.x, u.y);

      for (let i = u.pathIndex; i < u.path.length; i++) {
        this.pathGraphics.lineTo(u.path[i].x, u.path[i].y);
      }

      this.pathGraphics.strokePath();
    }
  }

  assignGatherTask(unit, entity) {
    if (!entity || !entity.canBeGathered || entity.amount <= 0 || !entity.resourceType) {
      return;
    }

    const rules = RESOURCE_GATHER_RULES[entity.resourceType];
    if (!rules) {
      console.warn('No gather rules for resource:', entity.resourceType);
      return;
    }

    unit.gatherTargetId = entity.id;
    unit.gatherResourceType = entity.resourceType;
    unit.carryCapacity = rules.carryCapacity;
    unit.workState = 'moving_to_resource';
    unit.gatherTimer = 0;

    const point = this.getGatherPointNearEntity(entity, unit);
    this.commandMoveUnit(unit, point.x, point.y);

    console.log(`${unit.id} assigned to ${rules.actionName} ${entity.resourceType} from ${entity.id}`);
  }

  getGatherPointNearEntity(entity, unit) {
    const ex = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
    const ey = entity.position.y * SCALE.TERRAIN_TILE_SIZE;

    const dx = unit.x - ex;
    const dy = unit.y - ey;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;

    const collisionRadius = entity.collisionRadiusPx || 8;
    const standDistance = collisionRadius + SCALE.UNIT_RADIUS_PX + 4;

    return {
      x: ex + (dx / d) * standDistance,
      y: ey + (dy / d) * standDistance,
    };
  }

  getResourceEntityById(id) {
    return this.resourceEntities.find(e => e.id === id);
  }

  getBuildingById(id) {
    return this.buildings.find(b => b.id === id);
  }

  getNearestDropoff(unit, resourceType) {
    const rules = RESOURCE_GATHER_RULES[resourceType];

    if (!rules) {
      console.warn('No dropoff rules for resource:', resourceType);
      return null;
    }

    let best = null;
    let bestDist = Infinity;

    for (const b of this.buildings) {
      if (b.ownerId !== this.playerId) continue;
      if (!rules.validDropoffs.includes(b.type)) continue;

      const bx = b.worldX + (b.footprintW * SCALE.BUILD_CELL_SIZE) / 2;
      const by = b.worldY + (b.footprintH * SCALE.BUILD_CELL_SIZE) / 2;

      const dx = bx - unit.x;
      const dy = by - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < bestDist) {
        best = b;
        bestDist = d;
      }
    }

    return best;
  }

  getDropoffPointNearBuilding(building, unit) {
    const left = building.worldX;
    const right = building.worldX + building.footprintW * SCALE.BUILD_CELL_SIZE;
    const top = building.worldY;
    const bottom = building.worldY + building.footprintH * SCALE.BUILD_CELL_SIZE;

    const cx = (left + right) / 2;
    const cy = (top + bottom) / 2;

    const dx = unit.x - cx;
    const dy = unit.y - cy;

    if (Math.abs(dx) > Math.abs(dy)) {
      return {
        x: dx < 0 ? left - 10 : right + 10,
        y: Phaser.Math.Clamp(unit.y, top, bottom),
      };
    }

    return {
      x: Phaser.Math.Clamp(unit.x, left, right),
      y: dy < 0 ? top - 10 : bottom + 10,
    };
  }

  clearUnitWork(unit) {
    unit.workState = 'idle';
    unit.gatherTargetId = null;
    unit.gatherResourceType = null;
    unit.dropoffTargetId = null;
    unit.gatherTimer = 0;
  }

  canAffordCost(cost = {}) {
    for (const [resource, amount] of Object.entries(cost)) {
      if ((this.playerResources[resource] || 0) < amount) return false;
    }
    return true;
  }

  spendCost(cost = {}) {
    if (!this.canAffordCost(cost)) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      this.playerResources[resource] -= amount;
    }
    this.updateResourceHud();
    return true;
  }

  formatCost(cost = {}) {
    const parts = [];
    for (const [resource, amount] of Object.entries(cost)) {
      parts.push(`${resource}:${amount}`);
    }
    return parts.length > 0 ? parts.join(' ') : 'free';
  }

  showFloatingMessage(text, x = 20, y = 90, color = '#ffcc00') {
    const msg = this.add.text(x, y, text, {
      fontSize: '14px', color, fontFamily: 'monospace',
      backgroundColor: '#000000aa', padding: { x: 6, y: 4 },
    });
    msg.setScrollFactor(0);
    msg.setDepth(300);
    this.tweens.add({
      targets: msg,
      alpha: 0,
      y: y - 20,
      duration: 1200,
      onComplete: () => msg.destroy(),
    });
  }

  sendUnitToDropoff(unit) {
    if (!unit.carryResource || unit.carryAmount <= 0) {
      unit.workState = 'idle';
      return false;
    }

    const dropoff = this.getNearestDropoff(unit, unit.carryResource);

    if (!dropoff) {
      console.warn('No dropoff found for:', unit.carryResource);
      unit.workState = 'idle';
      return false;
    }

    unit.dropoffTargetId = dropoff.id;
    unit.workState = 'moving_to_dropoff';

    const point = this.getDropoffPointNearBuilding(dropoff, unit);
    this.commandMoveUnit(unit, point.x, point.y);

    return true;
  }

  getCarryColor(resourceType) {
    switch (resourceType) {
      case 'wood': return 0xc49a5a;
      case 'stone': return 0xaaaaaa;
      case 'copper': return 0xcd7f32;
      case 'iron': return 0x555555;
      default: return 0xffffcc;
    }
  }

  findNearestResourceEntity(unit, resourceType, maxDistancePx = 500) {
    let best = null;
    let bestDist = Infinity;

    for (const entity of this.resourceEntities) {
      if (!entity.canBeGathered) continue;
      if (entity.resourceType !== resourceType) continue;
      if (entity.amount <= 0) continue;

      const ex = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
      const ey = entity.position.y * SCALE.TERRAIN_TILE_SIZE;

      const dx = ex - unit.x;
      const dy = ey - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);

      if (d < bestDist && d <= maxDistancePx) {
        best = entity;
        bestDist = d;
      }
    }

    return best;
  }

  continueGatheringSameResource(unit) {
    const resourceType = unit.gatherResourceType || unit.carryResource;

    if (!resourceType) {
      unit.workState = 'idle';
      unit.gatherTargetId = null;
      return false;
    }

    const next = this.findNearestResourceEntity(unit, resourceType, 500);

    if (next) {
      this.assignGatherTask(unit, next);
      return true;
    }

    unit.workState = 'idle';
    unit.gatherTargetId = null;
    unit.gatherResourceType = null;
    return false;
  }

  updateVillagerWork(unit, delta) {
    if (unit.type !== 'villager') return;

    if (unit.workState === 'moving_to_resource' && unit.state === 'idle') {
      unit.workState = 'gathering';
      unit.gatherTimer = 0;
    }

    if (unit.workState === 'gathering') {
      this.updateGathering(unit, delta);
    }

    if (unit.workState === 'moving_to_dropoff' && unit.state === 'idle') {
      this.depositCarriedResources(unit);
    }
  }

  updateGathering(unit, delta) {
    const entity = this.getResourceEntityById(unit.gatherTargetId);

    if (!entity || entity.amount <= 0) {
      this.continueGatheringSameResource(unit);
      return;
    }

    const resourceType = entity.resourceType;
    const rules = RESOURCE_GATHER_RULES[resourceType];

    if (!rules) {
      console.warn('No gather rules for:', resourceType);
      unit.workState = 'idle';
      unit.gatherTargetId = null;
      unit.gatherResourceType = null;
      return;
    }

    unit.gatherTimer += delta;

    if (unit.gatherTimer < rules.gatherIntervalMs) return;

    unit.gatherTimer = 0;

    const remainingCapacity = unit.carryCapacity - unit.carryAmount;

    if (remainingCapacity <= 0) {
      this.sendUnitToDropoff(unit);
      return;
    }

    const amount = Math.min(rules.gatherAmount, entity.amount, remainingCapacity);

    entity.amount -= amount;
    unit.carryResource = resourceType;
    unit.carryAmount += amount;

    if (entity.amount <= 0) {
      this.removeResourceEntity(entity.id);
    }

    if (unit.carryAmount >= unit.carryCapacity) {
      this.sendUnitToDropoff(unit);
    }
  }

  depositCarriedResources(unit) {
    if (!unit.carryResource || unit.carryAmount <= 0) {
      unit.workState = 'idle';
      return;
    }

    const depositedResource = unit.carryResource;
    const oldTargetId = unit.gatherTargetId;

    this.playerResources[depositedResource] += unit.carryAmount;

    unit.carryResource = null;
    unit.carryAmount = 0;
    unit.dropoffTargetId = null;

    const oldTarget = this.getResourceEntityById(oldTargetId);

    if (oldTarget && oldTarget.amount > 0) {
      this.assignGatherTask(unit, oldTarget);
      return;
    }

    unit.gatherResourceType = depositedResource;
    this.continueGatheringSameResource(unit);
  }

  unblockBuildCellsForEntity(entityId) {
    for (let y = 0; y < this.buildGridHeight; y++) {
      for (let x = 0; x < this.buildGridWidth; x++) {
        const cell = this.buildGrid[y][x];

        if (cell.blockedBy === entityId) {
          cell.blockedBy = null;

          if (!cell.occupiedBy) {
            cell.buildable = true;
            cell.pathable = true;
          }
        }
      }
    }
  }

  removeResourceEntity(id) {
    const index = this.resourceEntities.findIndex(e => e.id === id);
    if (index === -1) return;

    this.resourceEntities.splice(index, 1);

    this.unblockBuildCellsForEntity(id);

    this.renderEntities();

    if (this.placementMode) {
      this.ghostValid = this.isBuildable(
        this.ghostBuildX,
        this.ghostBuildY,
        this.placementMode.w,
        this.placementMode.h
      );
      this.renderBuildingGhost();
    }

    console.log(`Resource depleted and build cells freed: ${id}`);
  }

  create() {
    if (!this.tiles) {
      this.add.text(this.scale.width / 2, this.scale.height / 2, 'Error: No map data', {
        fontSize: '24px', color: '#f00', fontFamily: 'monospace'
      }).setOrigin(0.5);
      return;
    }

    this.cameras.main.setBackgroundColor(0x111111);
    this.cameras.main.setZoom(1);

    this.terrainGraphics = this.add.graphics().setDepth(0);
    this.siteGraphics = this.add.graphics().setDepth(5);
    this.placementGraphics = this.add.graphics().setDepth(7);
    this.entityGraphics = this.add.graphics().setDepth(10);
    this.buildingGraphics = this.add.graphics().setDepth(12);
    this.spawnGraphics = this.add.graphics().setDepth(20);
    this.pathGraphics = this.add.graphics().setDepth(25);
    this.unitGraphics = this.add.graphics().setDepth(30);
    this.selectionGraphics = this.add.graphics().setDepth(40);

    this.debugVisible = true;
    this.showSiteBounds = false;
    this.showEntityIcons = true;
    this.placementMode = null;
    this.ghostBuildX = 0;
    this.ghostBuildY = 0;
    this.ghostValid = false;

    this.renderTerrain();
    this.renderEntities();
    this.renderSiteBounds();
    this.renderSpawns();

    this.setupCamera();
    this.createUI();

    this.input.mouse.disableContextMenu();

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.showSiteBounds = !this.showSiteBounds; this.renderSiteBounds(); });
    this.input.keyboard.on('keydown-TWO', () => { this.showEntityIcons = !this.showEntityIcons; this.renderEntities(); });

    for (const [key, def] of Object.entries(BUILDING_DEFS)) {
      this.input.keyboard.on(`keydown-${def.hotkey}`, () => this.startBuildingPlacement(key));
    }
    this.input.keyboard.on('keydown-ESC', () => this.cancelBuildingPlacement());

    this.input.keyboard.on('keydown-F', () => this.jumpToFirstSite('forest'));
    this.input.keyboard.on('keydown-C', () => this.jumpToFirstResource('copper'));
    this.input.keyboard.on('keydown-I', () => this.jumpToFirstResource('iron'));
    this.input.keyboard.on('keydown-O', () => this.jumpToFirstResource('stone'));

    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
  }

  getPointerWorldPx(pointer = this.input.activePointer) {
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    return { x: worldPoint.x, y: worldPoint.y };
  }

  renderTerrain() {
    const g = this.terrainGraphics;
    g.clear();

    const total = this.tiles.length;
    for (let i = 0; i < total; i++) {
      const tile = this.tiles[i];
      const x = (i % this.width) * SCALE.TERRAIN_TILE_SIZE;
      const y = Math.floor(i / this.width) * SCALE.TERRAIN_TILE_SIZE;
      const s = SCALE.TERRAIN_TILE_SIZE;

      const color = TERRAIN_COLORS[tile.t] || 0x4a8c3f;
      g.fillStyle(color, 1);
      g.fillRect(x, y, s, s);

      if (tile.t === 1) {
        g.lineStyle(1, 0x1a4a7a, 0.3);
        g.strokeRect(x, y, s, s);
      }

      if (tile.t === 2) {
        g.fillStyle(0x5a4a3f, 0.4);
        g.fillCircle(x + s / 2, y + s / 2, 3);
      }
    }
  }

  renderEntities() {
    this.entityGraphics.clear();
    if (!this.showEntityIcons) return;

    const eg = this.entityGraphics;

    for (const entity of this.resourceEntities) {
      const px = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
      const py = entity.position.y * SCALE.TERRAIN_TILE_SIZE;
      const r = Math.max(entity.radius * SCALE.TERRAIN_TILE_SIZE, 12);

      switch (entity.type) {
        case 'tree': {
          eg.fillStyle(0x000000, 0.25);
          eg.fillEllipse(px + 3, py + r * 0.35, r * 1.2, r * 0.3);
          eg.fillStyle(0x6b3f1d, 1);
          eg.fillRect(px - r * 0.1, py + r * 0.15, r * 0.2, r * 0.45);
          eg.fillStyle(0x0f8f2f, 1);
          eg.fillCircle(px, py, r * 1.0);
          eg.fillStyle(0x38c950, 0.6);
          eg.fillCircle(px - r * 0.2, py - r * 0.18, r * 0.4);
          break;
        }
        case 'ore_node': {
          const color = ENTITY_COLORS[entity.resourceType] || 0xffffff;
          eg.fillStyle(0x000000, 0.25);
          eg.fillEllipse(px + 2, py + r * 0.4, r * 1.3, r * 0.4);
          eg.fillStyle(color, 1);
          eg.fillCircle(px - r * 0.3, py + r * 0.1, r * 0.45);
          eg.fillCircle(px + r * 0.25, py, r * 0.5);
          eg.fillCircle(px, py - r * 0.25, r * 0.4);
          eg.lineStyle(2, 0x111111, 0.4);
          eg.strokeCircle(px + r * 0.25, py, r * 0.5);
          break;
        }
      }
    }
  }

  renderSiteBounds() {
    this.siteGraphics.clear();
    if (!this.showSiteBounds) return;

    const sg = this.siteGraphics;
    for (const site of this.resourceSites) {
      const px = site.center.x * SCALE.TERRAIN_TILE_SIZE;
      const py = site.center.y * SCALE.TERRAIN_TILE_SIZE;
      const r = site.radius * SCALE.TERRAIN_TILE_SIZE;
      const color = SITE_COLORS[site.type] || 0xffffff;

      sg.lineStyle(1, color, 0.35);
      sg.strokeCircle(px, py, r);
      sg.fillStyle(color, 0.05);
      sg.fillCircle(px, py, r);
    }
  }

  renderSpawns() {
    this.spawnGraphics.clear();
    if (!this.spawns) return;

    const sg = this.spawnGraphics;
    for (const spawn of this.spawns) {
      const x = spawn.x * SCALE.TERRAIN_TILE_SIZE + SCALE.TERRAIN_TILE_SIZE / 2;
      const y = spawn.y * SCALE.TERRAIN_TILE_SIZE + SCALE.TERRAIN_TILE_SIZE / 2;
      sg.lineStyle(2, 0x00ff00, 0.8);
      sg.strokeCircle(x, y, SCALE.TERRAIN_TILE_SIZE * 1.5);
      sg.lineStyle(1, 0x00ff00, 0.3);
      sg.strokeCircle(x, y, SCALE.TERRAIN_TILE_SIZE * 4);
    }
  }

  renderBuildings() {
    this.buildingGraphics.clear();

    for (const b of this.buildings) {
      const px = b.buildX * SCALE.BUILD_CELL_SIZE;
      const py = b.buildY * SCALE.BUILD_CELL_SIZE;
      const pw = b.footprintW * SCALE.BUILD_CELL_SIZE;
      const ph = b.footprintH * SCALE.BUILD_CELL_SIZE;
      const pad = SCALE.BUILD_CELL_SIZE;
      const color = BUILDING_DEFS[b.type]?.color || 0xb08a55;

      this.buildingGraphics.fillStyle(0x000000, 0.2);
      this.buildingGraphics.fillRect(px + 3, py + 3, pw, ph);

      this.buildingGraphics.fillStyle(color, 1);
      this.buildingGraphics.fillRect(px, py, pw, ph);

      this.buildingGraphics.fillStyle(0x000000, 0.08);
      this.buildingGraphics.fillRect(px + pad, py + pad, pw - pad * 2, ph - pad * 2);

      this.buildingGraphics.lineStyle(1, 0x222222, 0.8);
      this.buildingGraphics.strokeRect(px, py, pw, ph);
    }
  }

  renderUnits() {
    this.unitGraphics.clear();
    this.selectionGraphics.clear();

    for (const u of this.units) {
      let fill = 0xffffcc;
      if (u.workState === 'gathering') fill = 0x66ff66;
      if (u.carryResource) fill = this.getCarryColor(u.carryResource);
      if (u.selected) fill = 0xffffff;

      this.unitGraphics.fillStyle(fill, 1);
      this.unitGraphics.fillCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);
      this.unitGraphics.lineStyle(1, 0x333333, 1);
      this.unitGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);

      if (u.selected) {
        this.selectionGraphics.lineStyle(3, 0x00ff00, 1);
        this.selectionGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_SELECTION_RADIUS_PX + 4);
      }
    }
  }

  setupCamera() {
    const worldW = this.width * SCALE.TERRAIN_TILE_SIZE;
    const worldH = this.height * SCALE.TERRAIN_TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && pointer.downElement === this.game.canvas) {
        this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
        this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
      }

      const wp = this.getPointerWorldPx(pointer);
      this.ghostBuildX = Math.floor(wp.x / SCALE.BUILD_CELL_SIZE);
      this.ghostBuildY = Math.floor(wp.y / SCALE.BUILD_CELL_SIZE);
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      const zoom = this.cameras.main.zoom;
      const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.5, 4);
      this.cameras.main.setZoom(newZoom);
    });
  }

  createUI() {
    this.resourceHud = this.add.container(10, 10);
    this.resourceHud.setScrollFactor(0);
    this.resourceHud.setDepth(200);

    const hudBg = this.add.rectangle(0, 0, 360, 34, 0x000000, 0.65).setOrigin(0, 0);
    this.resourceHudText = this.add.text(10, 8, '', {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    });
    this.resourceHud.add([hudBg, this.resourceHudText]);

    this.debugPanel = this.add.container(10, 50);
    this.debugPanel.setScrollFactor(0);
    this.debugPanel.setDepth(100);

    const bg = this.add.rectangle(0, 0, 360, 270, 0x000000, 0.7).setOrigin(0, 0);
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '11px', color: '#0f0', fontFamily: 'monospace', lineSpacing: 3, wordWrap: { width: 340 }
    });
    this.debugPanel.add([bg, this.debugText]);
    this.debugPanel.visible = this.debugVisible;

    const hotkeyList = Object.values(BUILDING_DEFS).map(d => `${d.hotkey}:${d.label.split(' ')[0]}`).join('  ');
    this.add.text(10, this.scale.height - 95,
      '` : Debug  |  1 : Bounds  |  2 : Entities\n' +
      `${hotkeyList}\n` +
      'F:Forest  O:Stone  C:Copper  I:Iron  | ESC:Cancel', {
      fontSize: '11px', color: '#555', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(100);
  }

  updateResourceHud() {
    if (!this.resourceHudText) return;
    this.resourceHudText.setText(
      `Wood: ${this.playerResources.wood}   Stone: ${this.playerResources.stone}   Copper: ${this.playerResources.copper}   Iron: ${this.playerResources.iron}`
    );
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.visible = this.debugVisible;
  }

  getEntityAtPointer(pointer = this.input.activePointer) {
    const wp = this.getPointerWorldPx(pointer);
    let closest = null;
    let closestDist = 15;
    for (const entity of this.resourceEntities) {
      const ex = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
      const ey = entity.position.y * SCALE.TERRAIN_TILE_SIZE;
      const dx = ex - wp.x;
      const dy = ey - wp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closest = entity;
        closestDist = d;
      }
    }
    return closest;
  }

  getUnitAtPointer(pointer = this.input.activePointer) {
    const wp = this.getPointerWorldPx(pointer);
    let closest = null;
    let closestDist = SCALE.UNIT_SELECTION_RADIUS_PX + 8;
    for (const u of this.units) {
      const dx = u.x - wp.x;
      const dy = u.y - wp.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closest = u;
        closestDist = d;
      }
    }
    return closest;
  }

  onPointerDown(pointer) {
    const wp = this.getPointerWorldPx(pointer);
    const isLeftClick = pointer.button === 0;
    const isRightClick = pointer.button === 2;

    console.log('POINTER DOWN:', {
      button: pointer.button,
      worldX: wp.x.toFixed(1),
      worldY: wp.y.toFixed(1),
      units: this.units.length,
      selected: this.selectedUnits.length,
    });

    if (isLeftClick) {
      if (this.placementMode) {
        if (!this.ghostValid) {
          console.log('Cannot place building:', {
            type: this.placementMode.type,
            cost: this.placementMode.cost,
            resources: this.playerResources,
          });
          return;
        }

        const cost = this.placementMode.cost || {};

        if (!this.spendCost(cost)) {
          console.log(`Not enough resources for ${this.placementMode.label}. Cost: ${this.formatCost(cost)}`);
          this.showFloatingMessage(`Need: ${this.formatCost(cost)}`);
          return;
        }

        this.placeBuilding(this.placementMode.type, this.ghostBuildX, this.ghostBuildY);
        this.cancelBuildingPlacement();
        return;
      }

      this.clearUnitSelection();

      const unit = this.getUnitAtPointer(pointer);
      console.log('Clicked unit:', unit);

      if (unit) {
        unit.selected = true;
        this.selectedUnits = [unit];
        this.renderUnits();
        return;
      }

      const entity = this.getEntityAtPointer(pointer);
      if (entity) {
        let siteInfo = '';
        if (entity.depositId) {
          const site = this.resourceSites.find(s => s.id === entity.depositId);
          if (site) siteInfo = ` deposit: ${site.id}`;
        }
        console.log(`Resource: ${entity.id} type=${entity.type} res=${entity.resourceType} amt=${entity.amount} at (${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)})${siteInfo}`);
      }

      this.renderUnits();
    }

    if (isRightClick) {
      const entity = this.getEntityAtPointer(pointer);

      if (
        this.selectedUnits.length > 0 &&
        entity &&
        entity.canBeGathered &&
        entity.amount > 0 &&
        entity.resourceType
      ) {
        for (const unit of this.selectedUnits) {
          if (unit.type === 'villager') {
            this.assignGatherTask(unit, entity);
          }
        }
        this.renderUnits();
        this.renderPaths();
        return;
      }

      if (this.selectedUnits.length > 0) {
        console.log('Move command:', {
          selectedUnits: this.selectedUnits.length,
          targetX: wp.x.toFixed(1),
          targetY: wp.y.toFixed(1),
        });

        for (const unit of this.selectedUnits) {
          this.clearUnitWork(unit);
          this.commandMoveUnit(unit, wp.x, wp.y);
        }

        this.renderUnits();
        this.renderPaths();
      }
    }
  }

  clearUnitSelection() {
    for (const u of this.units) {
      u.selected = false;
    }
    this.selectedUnits = [];
  }

  placeBuilding(type, buildX, buildY) {
    const def = BUILDING_DEFS[type];
    const building = {
      id: `building_${this.nextBuildingId++}`,
      ownerId: this.playerId,
      type,
      buildX, buildY,
      footprintW: def.w, footprintH: def.h,
      worldX: buildX * SCALE.BUILD_CELL_SIZE,
      worldY: buildY * SCALE.BUILD_CELL_SIZE,
      hp: def.hp,
    };

    for (let dx = 0; dx < def.w; dx++) {
      for (let dy = 0; dy < def.h; dy++) {
        const gx = buildX + dx;
        const gy = buildY + dy;
        if (gx >= 0 && gx < this.buildGridWidth && gy >= 0 && gy < this.buildGridHeight) {
          const cell = this.buildGrid[gy][gx];
          cell.buildable = false;
          cell.pathable = false;
          cell.occupiedBy = building.id;
        }
      }
    }

    this.buildings.push(building);
    this.renderBuildings();

    if (type === 'town_center') {
      this.spawnStartingVillagers(building);
    }

    console.log(`BUILD PLACED: ${type} at build (${buildX}, ${buildY}) px (${building.worldX}, ${building.worldY})`);
    return building;
  }

  spawnStartingVillagers(tc) {
    const cx = tc.buildX + tc.footprintW / 2;
    const cy = tc.buildY + tc.footprintH / 2;
    const offsets = [
      { x: -2, y: tc.footprintH / 2 },
      { x: tc.footprintW + 2, y: tc.footprintH / 2 },
      { x: tc.footprintW / 2, y: tc.footprintH + 2 },
    ];

    for (const off of offsets) {
      const sx = (cx + off.x) * SCALE.BUILD_CELL_SIZE;
      const sy = (cy + off.y) * SCALE.BUILD_CELL_SIZE;

      // validate: check the build cell is pathable
      const bgx = Math.floor((cx + off.x));
      const bgy = Math.floor((cy + off.y));
      let px = sx;
      let py = sy;
      if (bgx >= 0 && bgx < this.buildGridWidth && bgy >= 0 && bgy < this.buildGridHeight) {
        const cell = this.buildGrid[bgy][bgx];
        if (!cell.pathable) {
          // find nearest pathable
          let found = false;
          for (let r = 1; r < 8 && !found; r++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              for (let dy = -r; dy <= r && !found; dy++) {
                const nx = bgx + dx;
                const ny = bgy + dy;
                if (nx >= 0 && nx < this.buildGridWidth && ny >= 0 && ny < this.buildGridHeight && this.buildGrid[ny][nx].pathable) {
                  px = nx * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
                  py = ny * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
                  found = true;
                }
              }
            }
          }
        }
      }

      this.units.push({
        id: `unit_${this.nextUnitId++}`,
        ownerId: this.playerId,
        type: 'villager',
        x: px, y: py,
        targetX: px, targetY: py,
        speed: 80,
        selected: false,
        state: 'idle',
        path: [],
        pathIndex: 0,
        carryResource: null,
        carryAmount: 0,
        carryCapacity: 10,
        workState: 'idle',
        gatherTargetId: null,
        gatherResourceType: null,
        dropoffTargetId: null,
        gatherTimer: 0,
      });
    }

    this.renderUnits();
  }

  startBuildingPlacement(type) {
    const def = BUILDING_DEFS[type];
    if (!def) return;
    this.placementMode = { type, ...def };
    this.ghostValid = false;
    console.log(`Placement: ${def.label} (${def.w}x${def.h}) Cost: ${this.formatCost(def.cost || {})}`);
  }

  cancelBuildingPlacement() {
    this.placementMode = null;
    this.placementGraphics.clear();
  }

  jumpToFirstSite(siteType) {
    const site = this.resourceSites.find(s => s.type === siteType);
    if (!site) {
      console.warn('No site found:', siteType);
      return;
    }
    this.cameras.main.centerOn(site.center.x * SCALE.TERRAIN_TILE_SIZE, site.center.y * SCALE.TERRAIN_TILE_SIZE);
    this.cameras.main.setZoom(2);
    console.log('Jumped to site:', site);
  }

  jumpToFirstResource(resourceType) {
    const entity = this.resourceEntities.find(e => e.resourceType === resourceType);
    if (!entity) {
      console.warn('No resource entity found:', resourceType);
      return;
    }
    this.cameras.main.centerOn(entity.position.x * SCALE.TERRAIN_TILE_SIZE, entity.position.y * SCALE.TERRAIN_TILE_SIZE);
    this.cameras.main.setZoom(2);
    console.log('Jumped to resource entity:', entity);
  }

  isBuildable(buildX, buildY, fw, fh) {
    for (let dx = 0; dx < fw; dx++) {
      for (let dy = 0; dy < fh; dy++) {
        const gx = buildX + dx;
        const gy = buildY + dy;
        if (gx < 0 || gx >= this.buildGridWidth || gy < 0 || gy >= this.buildGridHeight) return false;
        const cell = this.buildGrid[gy][gx];
        if (!cell.buildable) return false;
        if (cell.occupiedBy) return false;
      }
    }
    return true;
  }

  renderBuildingGhost() {
    this.placementGraphics.clear();
    if (!this.placementMode) return;

    const landValid = this.isBuildable(this.ghostBuildX, this.ghostBuildY, this.placementMode.w, this.placementMode.h);
    const canAfford = this.canAffordCost(this.placementMode.cost || {});

    let color = 0x00ff00;
    if (!landValid) color = 0xff0000;
    else if (!canAfford) color = 0xffaa00;

    const px = this.ghostBuildX * SCALE.BUILD_CELL_SIZE;
    const py = this.ghostBuildY * SCALE.BUILD_CELL_SIZE;
    const pw = this.placementMode.w * SCALE.BUILD_CELL_SIZE;
    const ph = this.placementMode.h * SCALE.BUILD_CELL_SIZE;

    this.placementGraphics.lineStyle(1, 0xffffff, 0.3);
    this.placementGraphics.strokeRect(px, py, pw, ph);
    this.placementGraphics.fillStyle(color, 0.15);
    this.placementGraphics.fillRect(px, py, pw, ph);
    this.placementGraphics.lineStyle(2, color, 0.8);
    this.placementGraphics.strokeRect(px, py, pw, ph);
  }

  updateUnits(delta) {
    let anyMoved = false;

    for (const u of this.units) {
      if (u.state !== 'moving') continue;

      if (!u.path || u.pathIndex >= u.path.length) {
        u.state = 'idle';
        u.path = [];
        u.pathIndex = 0;
        anyMoved = true;
        continue;
      }

      const waypoint = u.path[u.pathIndex];

      const dx = waypoint.x - u.x;
      const dy = waypoint.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        u.x = waypoint.x;
        u.y = waypoint.y;
        u.pathIndex++;

        if (u.pathIndex >= u.path.length) {
          u.state = 'idle';
          u.path = [];
          u.pathIndex = 0;
        }

        anyMoved = true;
        continue;
      }

      const step = (u.speed * delta) / 1000;
      u.x += (dx / dist) * Math.min(step, dist);
      u.y += (dy / dist) * Math.min(step, dist);
      anyMoved = true;
    }

    for (const u of this.units) {
      this.updateVillagerWork(u, delta);
    }

    if (anyMoved) {
      this.renderUnits();
      this.renderPaths();
    }
  }

  update(time, delta) {
    this.updateUnits(delta);
    this.updateResourceHud();

    if (this.placementMode) {
      const landValid = this.isBuildable(this.ghostBuildX, this.ghostBuildY, this.placementMode.w, this.placementMode.h);
      const canAfford = this.canAffordCost(this.placementMode.cost || {});
      this.ghostValid = landValid && canAfford;
      this.renderBuildingGhost();
    }

    if (!this.debugVisible || !this.debugText) return;

    const cam = this.cameras.main;
    const zoom = cam.zoom.toFixed(1);
    const scrollX = Math.floor(cam.scrollX);
    const scrollY = Math.floor(cam.scrollY);
    const wp = this.getPointerWorldPx();

    const tileX = Math.floor(wp.x / SCALE.TERRAIN_TILE_SIZE);
    const tileY = Math.floor(wp.y / SCALE.TERRAIN_TILE_SIZE);
    const buildX = Math.floor(wp.x / SCALE.BUILD_CELL_SIZE);
    const buildY = Math.floor(wp.y / SCALE.BUILD_CELL_SIZE);

    const idx = tileY * this.width + tileX;
    let tileInfo = '';
    if (idx >= 0 && idx < this.tiles.length) {
      const t = this.tiles[idx];
      const names = { 0: 'grass', 1: 'water', 2: 'rocky' };
      tileInfo = `Tile: (${tileX}, ${tileY}) ${names[t.t] || '?'}  Cell: (${buildX}, ${buildY})`;
    }

    let entityInfo = '';
    const entity = this.getEntityAtPointer();
    if (entity) {
      entityInfo = `${entity.type}[${entity.resourceType}] amt:${entity.amount} at (${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)})`;
    }

    let unitInfo = '';
    if (this.selectedUnits.length > 0) {
      const u = this.selectedUnits[0];
      unitInfo = `${u.type}#${u.id.slice(-3)} ${u.state}/${u.workState} carry:${u.carryAmount}/${u.carryCapacity} ${u.carryResource || ''} job:${u.gatherResourceType || ''}`;
    }

    let placementInfo = '';
    if (this.placementMode) {
      const def = this.placementMode;
      placementInfo = `\nPlace: ${def.label} (${def.w}x${def.h}) Cost: ${this.formatCost(def.cost || {})} at cell (${this.ghostBuildX}, ${this.ghostBuildY}) ${this.ghostValid ? 'VALID' : 'BLOCKED'}`;
    }

    const trees = this.resourceEntities.filter(e => e.type === 'tree').length;
    const stone = this.resourceEntities.filter(e => e.resourceType === 'stone').length;
    const copper = this.resourceEntities.filter(e => e.resourceType === 'copper').length;
    const iron = this.resourceEntities.filter(e => e.resourceType === 'iron').length;

    this.debugText.setText([
      `Seed: ${this.seed}`,
      `Terrain: ${this.width}x${this.height} tiles, ${SCALE.TERRAIN_TILE_SIZE}px`,
      `Build grid: ${this.buildGridWidth}x${this.buildGridHeight} cells, ${SCALE.BUILD_CELL_SIZE}px`,
      `Zoom: ${zoom}x  Scroll: (${scrollX}, ${scrollY})`,
      `FPS: ${Math.round(this.game.loop.actualFps)}`,
      ``,
      `Entities: ${this.resourceEntities.length}  Sites: ${this.resourceSites.length}`,
      `trees ${trees}, stone ${stone}, copper ${copper}, iron ${iron}`,
      ``,
      `Map: ${this.stats.openBuildablePercent}% open  ${this.stats.waterPercent}% water  ${this.stats.rockyPercent}% rocky`,
      `Forests: ${this.stats.forests} sites, avg ${this.stats.avgTreesPerForest} trees`,
      `Ore: ${this.stats.oreDepositCount} deposits`,
      `Spawns: ${this.stats.validSpawns}`,
      ``,
      `Resources: W:${this.playerResources.wood} S:${this.playerResources.stone} C:${this.playerResources.copper} I:${this.playerResources.iron}`,
      `Buildings: ${this.buildings.length}  Units: ${this.units.length}`,
      tileInfo,
      entityInfo,
      unitInfo,
      placementInfo,
    ].join('\n'));
  }
}
