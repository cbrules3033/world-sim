class UnitSystem {
  constructor(scene) {
    this.scene = scene;
  }

  removeBuilderFromBuildings(unit) {
    const scene = this.scene;
    for (const building of scene.buildings) {
      if (!building.assignedBuilderIds) continue;
      building.assignedBuilderIds = building.assignedBuilderIds.filter(id => id !== unit.id);
    }
  }

  clearUnitWork(unit) {
    this.removeBuilderFromBuildings(unit);
    unit.workState = 'idle';
    unit.gatherTargetId = null;
    unit.gatherResourceType = null;
    unit.dropoffTargetId = null;
    unit.gatherTimer = 0;
    unit.buildTargetId = null;
    unit.buildTimer = 0;
  }

  stopUnit(unit) {
    unit.state = 'idle';
    unit.path = [];
    unit.pathIndex = 0;
    unit.targetX = unit.x;
    unit.targetY = unit.y;
    unit.stuckTimer = 0;
    unit.lastProgressDist = Infinity;
  }

  getUnitAtPointer(pointer = this.scene.input.activePointer) {
    const scene = this.scene;
    const wp = scene.getPointerWorldPx(pointer);
    let closest = null;
    let closestDist = SCALE.UNIT_SELECTION_RADIUS_PX + 8;
    for (const u of scene.units) {
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

  clearUnitSelection() {
    const scene = this.scene;
    for (const u of scene.units) {
      u.selected = false;
    }
    scene.selectedUnits = [];
  }

  renderUnits() {
    const scene = this.scene;
    scene.unitGraphics.clear();
    scene.selectionGraphics.clear();

    for (const u of scene.units) {
      let fill = 0xffffcc;
      if (u.workState === 'gathering') fill = 0x66ff66;
      if (u.carryResource) fill = scene.resourceSystem.getCarryColor(u.carryResource);
      if (u.selected) fill = 0xffffff;

      scene.unitGraphics.fillStyle(fill, 1);
      scene.unitGraphics.fillCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);
      scene.unitGraphics.lineStyle(1, 0x333333, 1);
      scene.unitGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);

      if (scene.showUnitCollision) {
        scene.unitGraphics.lineStyle(1, 0x00ffff, 0.25);
        scene.unitGraphics.strokeCircle(u.x, u.y, UNIT_COLLISION.SEPARATION_RADIUS);
      }

      if (u.selected) {
        scene.selectionGraphics.lineStyle(3, 0x00ff00, 1);
        scene.selectionGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_SELECTION_RADIUS_PX + 4);
      }
    }
  }

  getDistance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  isWorldPointPathable(x, y) {
    const scene = this.scene;
    const cell = scene.worldPxToBuildCell(x, y);
    return scene.isCellPathable(cell.x, cell.y);
  }

  clampPush(pushX, pushY) {
    const max = UNIT_COLLISION.MAX_PUSH_PER_FRAME;
    const len = Math.sqrt(pushX * pushX + pushY * pushY);

    if (len <= max || len === 0) {
      return { x: pushX, y: pushY };
    }

    return {
      x: (pushX / len) * max,
      y: (pushY / len) * max,
    };
  }

  getSeparationWeight(unit) {
    if (!unit.workState || unit.workState === 'idle') return 1.0;

    if (
      unit.workState === 'moving_to_resource' ||
      unit.workState === 'moving_to_dropoff' ||
      unit.workState === 'moving_to_build'
    ) {
      return 0.65;
    }

    if (
      unit.workState === 'gathering' ||
      unit.workState === 'building'
    ) {
      return 0.35;
    }

    return 1.0;
  }

  getUnitWorkAnchor(unit) {
    const scene = this.scene;

    if (
      unit.gatherTargetId &&
      (unit.workState === 'gathering' || unit.workState === 'moving_to_resource')
    ) {
      const entity = scene.getResourceEntityById(unit.gatherTargetId);
      if (entity) {
        return {
          x: entity.position.x * SCALE.TERRAIN_TILE_SIZE,
          y: entity.position.y * SCALE.TERRAIN_TILE_SIZE,
          maxDistance: 34,
        };
      }
    }

    if (
      unit.dropoffTargetId &&
      unit.workState === 'moving_to_dropoff'
    ) {
      const building = scene.getBuildingById(unit.dropoffTargetId);
      if (building) {
        return {
          x: building.worldX + (building.footprintW * SCALE.BUILD_CELL_SIZE) / 2,
          y: building.worldY + (building.footprintH * SCALE.BUILD_CELL_SIZE) / 2,
          maxDistance: Math.max(building.footprintW, building.footprintH) * SCALE.BUILD_CELL_SIZE / 2 + 28,
        };
      }
    }

    if (
      unit.buildTargetId &&
      (unit.workState === 'building' || unit.workState === 'moving_to_build')
    ) {
      const building = scene.getBuildingById(unit.buildTargetId);
      if (building) {
        return {
          x: building.worldX + (building.footprintW * SCALE.BUILD_CELL_SIZE) / 2,
          y: building.worldY + (building.footprintH * SCALE.BUILD_CELL_SIZE) / 2,
          maxDistance: Math.max(building.footprintW, building.footprintH) * SCALE.BUILD_CELL_SIZE / 2 + 24,
        };
      }
    }

    return null;
  }

  applyUnitSeparation() {
    const scene = this.scene;
    const units = scene.units.filter(u => u.ownerId === scene.playerId);

    const pushes = new Map();

    for (const unit of units) {
      pushes.set(unit.id, { x: 0, y: 0 });
    }

    for (let i = 0; i < units.length; i++) {
      for (let j = i + 1; j < units.length; j++) {
        const a = units[i];
        const b = units[j];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;

        if (distSq === 0) {
          const pa = pushes.get(a.id);
          const pb = pushes.get(b.id);

          pa.x -= 0.5;
          pb.x += 0.5;
          continue;
        }

        const dist = Math.sqrt(distSq);
        const minDist = UNIT_COLLISION.SEPARATION_RADIUS;

        if (dist >= minDist) continue;

        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;

        const push = overlap * UNIT_COLLISION.SEPARATION_STRENGTH * 0.5;

        const pa = pushes.get(a.id);
        const pb = pushes.get(b.id);

        pa.x -= nx * push;
        pa.y -= ny * push;

        pb.x += nx * push;
        pb.y += ny * push;
      }
    }

    let moved = false;

    for (const unit of units) {
      const push = pushes.get(unit.id);
      if (!push) continue;

      const currentCell = scene.worldPxToBuildCell(unit.x, unit.y);

      if (!scene.isCellPathable(currentCell.x, currentCell.y)) {
        const nearby = scene.findNearestPathableCell(currentCell.x, currentCell.y, 4);

        if (nearby) {
          const wp = scene.buildCellToWorldPx(nearby.x, nearby.y);
          unit.x = wp.x;
          unit.y = wp.y;
          moved = true;
        }

        continue;
      }

      const weight = this.getSeparationWeight(unit);
      const clamped = this.clampPush(push.x * weight, push.y * weight);

      if (Math.abs(clamped.x) < 0.01 && Math.abs(clamped.y) < 0.01) continue;

      const nextX = unit.x + clamped.x;
      const nextY = unit.y + clamped.y;

      const anchor = this.getUnitWorkAnchor(unit);

      if (anchor) {
        const ax = nextX - anchor.x;
        const ay = nextY - anchor.y;
        const dist = Math.sqrt(ax * ax + ay * ay);

        if (dist > anchor.maxDistance) {
          continue;
        }
      }

      if (this.isWorldPointPathable(nextX, nextY)) {
        unit.x = nextX;
        unit.y = nextY;
        moved = true;
      } else if (this.isWorldPointPathable(unit.x + clamped.x, unit.y)) {
        unit.x += clamped.x;
        moved = true;
      } else if (this.isWorldPointPathable(unit.x, unit.y + clamped.y)) {
        unit.y += clamped.y;
        moved = true;
      }
    }

    return moved;
  }

  getRemainingPathDistance(unit) {
    if (!unit.path || unit.pathIndex >= unit.path.length) return 0;

    let total = 0;
    let px = unit.x;
    let py = unit.y;

    for (let i = unit.pathIndex; i < unit.path.length; i++) {
      const wp = unit.path[i];
      const dx = wp.x - px;
      const dy = wp.y - py;
      total += Math.sqrt(dx * dx + dy * dy);
      px = wp.x;
      py = wp.y;
    }

    return total;
  }

  tryRecoverStuckUnit(unit) {
    const scene = this.scene;

    unit.stuckTimer = 0;
    unit.lastProgressDist = Infinity;

    if (unit.gatherTargetId || unit.buildTargetId || unit.dropoffTargetId) {
      unit.state = 'idle';
      unit.path = [];
      unit.pathIndex = 0;

      if (scene.verboseLogs) console.log('Gentle stuck recovery for job unit:', unit.id);
      return;
    }

    if (unit.path && unit.path.length > 0) {
      const final = unit.path[unit.path.length - 1];
      const ok = scene.commandMoveUnit(unit, final.x, final.y);

      if (ok !== false) {
        if (scene.verboseLogs) console.log('Recovered stuck unit by repathing:', unit.id);
        return;
      }
    }

    const current = scene.worldPxToBuildCell(unit.x, unit.y);
    const nearby = scene.findNearestPathableCell(current.x, current.y, 4);

    if (nearby) {
      const wp = scene.buildCellToWorldPx(nearby.x, nearby.y);
      unit.x = wp.x;
      unit.y = wp.y;
      this.stopUnit(unit);

      if (scene.verboseLogs) console.log('Recovered stuck unit by nudging:', unit.id);
      return;
    }

    this.stopUnit(unit);

    if (scene.verboseLogs) console.log('Stopped stuck unit:', unit.id);
  }

  commandMoveSelectedUnits(targetX, targetY) {
    const scene = this.scene;
    const selected = scene.selectedUnits || [];

    if (selected.length === 0) return;

    for (const unit of selected) {
      unit.stuckTimer = 0;
      unit.lastProgressDist = Infinity;
    }

    if (selected.length === 1) {
      scene.clearUnitWork(selected[0]);
      scene.commandMoveUnit(selected[0], targetX, targetY);
      return;
    }

    const spacing = UNIT_COLLISION.SEPARATION_RADIUS;
    const cols = Math.ceil(Math.sqrt(selected.length));

    selected.forEach((unit, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;

      const offsetX = (col - (cols - 1) / 2) * spacing;
      const offsetY = (row - (cols - 1) / 2) * spacing;

      const destX = targetX + offsetX;
      const destY = targetY + offsetY;

      const cell = scene.worldPxToBuildCell(destX, destY);

      if (!scene.isCellPathable(cell.x, cell.y)) {
        scene.clearUnitWork(unit);
        scene.commandMoveUnit(unit, targetX, targetY);
        return;
      }

      scene.clearUnitWork(unit);
      scene.commandMoveUnit(unit, destX, destY);
    });
  }

  updateUnits(delta) {
    const scene = this.scene;
    let anyMoved = false;

    for (const u of scene.units) {
      if (u.state !== 'moving') continue;

      if (!u.path || u.pathIndex >= u.path.length) {
        u.state = 'idle';
        u.path = [];
        u.pathIndex = 0;
        anyMoved = true;
        continue;
      }

      const waypoint = u.path[u.pathIndex];

      const remaining = this.getRemainingPathDistance(u);

      if (u.lastProgressDist !== Infinity && remaining >= u.lastProgressDist - 0.2) {
        u.stuckTimer = (u.stuckTimer || 0) + delta;
      } else {
        u.stuckTimer = 0;
      }

      u.lastProgressDist = remaining;

      if (u.stuckTimer > 900) {
        this.tryRecoverStuckUnit(u);
        anyMoved = true;
        continue;
      }

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

    for (const u of scene.units) {
      scene.updateVillagerWork(u, delta);
      scene.buildingSystem?.updateBuilderWork(u, delta);
    }

    const separated = this.applyUnitSeparation();

    if (anyMoved || separated) {
      this.renderUnits();
      scene.renderPaths();
    }
  }
}
