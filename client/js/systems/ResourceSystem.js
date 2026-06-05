class ResourceSystem {
  constructor(scene) {
    this.scene = scene;
  }

  getResourceEntityById(id) {
    return this.scene.resourceEntities.find(e => e.id === id);
  }

  getNearestDropoff(unit, resourceType) {
    const rules = RESOURCE_GATHER_RULES[resourceType];

    if (!rules) {
      console.warn('No dropoff rules for resource:', resourceType);
      return null;
    }

    let best = null;
    let bestDist = Infinity;

    for (const b of this.scene.buildings) {
      if (b.ownerId !== this.scene.playerId) continue;
      if (!b.constructed) continue;
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

  hashUnitIdToAngle(unitId) {
    let hash = 0;
    for (let i = 0; i < unitId.length; i++) {
      hash = ((hash << 5) - hash) + unitId.charCodeAt(i);
      hash |= 0;
    }
    const normalized = Math.abs(hash % 360);
    return (normalized / 360) * Math.PI * 2;
  }

  getGatherPointNearEntity(entity, unit = null) {
    const px = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
    const py = entity.position.y * SCALE.TERRAIN_TILE_SIZE;

    const radius = Math.max(
      entity.collisionRadiusPx || 10,
      (entity.radius || 0.5) * SCALE.TERRAIN_TILE_SIZE
    );

    const standDistance = radius + UNIT_COLLISION.SEPARATION_RADIUS;

    const baseAngle = unit
      ? this.hashUnitIdToAngle(unit.id)
      : 0;

    const attempts = 12;

    for (let i = 0; i < attempts; i++) {
      const angle = baseAngle + i * ((Math.PI * 2) / attempts);
      const x = px + Math.cos(angle) * standDistance;
      const y = py + Math.sin(angle) * standDistance;

      const cell = this.scene.worldPxToBuildCell(x, y);

      if (this.scene.isCellPathable(cell.x, cell.y)) {
        return this.scene.buildCellToWorldPx(cell.x, cell.y);
      }
    }

    return { x: px, y: py };
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

    for (const entity of this.scene.resourceEntities) {
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

  unblockBuildCellsForEntity(entityId) {
    const scene = this.scene;
    for (let y = 0; y < scene.buildGridHeight; y++) {
      for (let x = 0; x < scene.buildGridWidth; x++) {
        const cell = scene.buildGrid[y][x];

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
    const scene = this.scene;
    const index = scene.resourceEntities.findIndex(e => e.id === id);
    if (index === -1) return;

    scene.resourceEntities.splice(index, 1);

    this.unblockBuildCellsForEntity(id);

    scene.renderEntities();

    if (scene.placementMode) {
      scene.ghostValid = scene.isBuildable(
        scene.ghostBuildX,
        scene.ghostBuildY,
        scene.placementMode.w,
        scene.placementMode.h
      );
      scene.renderBuildingGhost();
    }

    console.log(`Resource depleted and build cells freed: ${id}`);
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
    unit.jobRetryTimer = 0;

    const point = this.getGatherPointNearEntity(entity, unit);
    this.scene.commandMoveUnit(unit, point.x, point.y, { stopOnFail: false });

    if (this.scene.verboseLogs) console.log(`${unit.id} assigned to ${rules.actionName} ${entity.resourceType} from ${entity.id}`);
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
    unit.jobRetryTimer = 0;

    const point = this.getDropoffPointNearBuilding(dropoff, unit);
    this.scene.commandMoveUnit(unit, point.x, point.y, { stopOnFail: false });

    return true;
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

    this.scene.playerResources[depositedResource] += unit.carryAmount;

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

  updateVillagerWork(unit, delta) {
    if (unit.type !== 'villager') return;

    if (unit.workState === 'moving_to_resource' && unit.state === 'idle') {
      unit.jobRetryTimer = (unit.jobRetryTimer || 0) + delta;

      if (unit.jobRetryTimer > 800) {
        unit.jobRetryTimer = 0;

        const entity = this.getResourceEntityById(unit.gatherTargetId);
        if (entity && entity.amount > 0) {
          const gatherPoint = this.getGatherPointNearEntity(entity, unit);
          this.scene.commandMoveUnit(unit, gatherPoint.x, gatherPoint.y, { stopOnFail: false });
        }
      }
    } else if (unit.workState === 'moving_to_resource' && unit.state !== 'idle') {
      unit.jobRetryTimer = 0;
    }

    if (unit.workState === 'moving_to_resource' && unit.state === 'idle') {
      unit.workState = 'gathering';
      unit.gatherTimer = 0;
      unit.jobRetryTimer = 0;
    }

    if (unit.workState === 'gathering') {
      this.updateGathering(unit, delta);
    }

    if (unit.workState === 'moving_to_dropoff' && unit.state === 'idle') {
      this.depositCarriedResources(unit);
    }
  }
}
