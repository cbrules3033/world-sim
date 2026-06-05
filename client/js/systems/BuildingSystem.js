class BuildingSystem {
  constructor(scene) {
    this.scene = scene;
  }

  blockBuildCellsForEntity(entity) {
    const scene = this.scene;
    const px = entity.position.x * SCALE.TERRAIN_TILE_SIZE;
    const py = entity.position.y * SCALE.TERRAIN_TILE_SIZE;
    const radius = entity.collisionRadiusPx || 6;

    const minBX = Math.max(0, Math.floor((px - radius) / SCALE.BUILD_CELL_SIZE));
    const maxBX = Math.min(scene.buildGridWidth - 1, Math.floor((px + radius) / SCALE.BUILD_CELL_SIZE));
    const minBY = Math.max(0, Math.floor((py - radius) / SCALE.BUILD_CELL_SIZE));
    const maxBY = Math.min(scene.buildGridHeight - 1, Math.floor((py + radius) / SCALE.BUILD_CELL_SIZE));

    for (let gy = minBY; gy <= maxBY; gy++) {
      for (let gx = minBX; gx <= maxBX; gx++) {
        const cellCX = gx * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        const cellCY = gy * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        const dx = cellCX - px;
        const dy = cellCY - py;
        if (dx * dx + dy * dy <= radius * radius) {
          scene.buildGrid[gy][gx].buildable = false;
          scene.buildGrid[gy][gx].pathable = false;
          scene.buildGrid[gy][gx].blockedBy = entity.id;
        }
      }
    }
  }

  canAffordCost(cost = {}) {
    const res = this.scene.playerResources;
    for (const [resource, amount] of Object.entries(cost)) {
      if ((res[resource] || 0) < amount) return false;
    }
    return true;
  }

  spendCost(cost = {}) {
    if (!this.canAffordCost(cost)) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      this.scene.playerResources[resource] -= amount;
    }
    this.scene.updateResourceHud();
    if (this.scene.uiSystem) this.scene.uiSystem.lastActionPanelKey = null;
    this.scene.uiSystem?.updateActionPanel();
    this.scene.uiSystem?.updateCommandPanel();
    return true;
  }

  formatCost(cost = {}) {
    const parts = [];
    for (const [resource, amount] of Object.entries(cost)) {
      parts.push(`${amount}${resource[0]}`);
    }
    return parts.length > 0 ? parts.join(' ') : 'free';
  }

  getBuildingAtPointer(pointer) {
    const scene = this.scene;
    const wp = scene.getPointerWorldPx(pointer);
    let closest = null;
    let closestDist = 30;
    for (const b of scene.buildings) {
      if (b.ownerId !== scene.playerId) continue;
      const cx = b.worldX + (b.footprintW * SCALE.BUILD_CELL_SIZE) / 2;
      const cy = b.worldY + (b.footprintH * SCALE.BUILD_CELL_SIZE) / 2;
      const hw = (b.footprintW * SCALE.BUILD_CELL_SIZE) / 2;
      const hh = (b.footprintH * SCALE.BUILD_CELL_SIZE) / 2;
      const dx = Math.abs(wp.x - cx);
      const dy = Math.abs(wp.y - cy);
      if (dx <= hw && dy <= hh) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closest = b;
          closestDist = dist;
        }
      }
    }
    return closest;
  }

  selectBuilding(building) {
    const scene = this.scene;
    scene.selectedBuilding = building;
    scene.clearUnitSelection();
    scene.renderUnits();
    scene.renderSelectedBuilding();
    if (scene.verboseLogs) console.log('Building selected:', building.type, building.id);
  }

  deselectBuilding() {
    this.scene.selectedBuilding = null;
    this.scene.renderSelectedBuilding();
  }

  isBuildable(buildX, buildY, fw, fh) {
    const grid = this.scene.buildGrid;
    for (let dx = 0; dx < fw; dx++) {
      for (let dy = 0; dy < fh; dy++) {
        const gx = buildX + dx;
        const gy = buildY + dy;
        if (gx < 0 || gx >= this.scene.buildGridWidth || gy < 0 || gy >= this.scene.buildGridHeight) return false;
        const cell = grid[gy][gx];
        if (!cell.buildable) return false;
        if (cell.occupiedBy) return false;
      }
    }
    return true;
  }

  getPlacementStatusText() {
    if (!this.scene.placementMode) return '';
    const landValid = this.isBuildable(this.scene.ghostBuildX, this.scene.ghostBuildY, this.scene.placementMode.w, this.scene.placementMode.h);
    const canAfford = this.canAffordCost(this.scene.placementMode.cost || {});
    if (!landValid) return 'Blocked';
    if (!canAfford) return `Need ${this.formatCost(this.scene.placementMode.cost || {})}`;
    return 'Valid';
  }

  renderSelectedBuilding() {
    const scene = this.scene;
    scene.selectedBuildingGraphics.clear();
    if (!scene.selectedBuilding) return;
    const b = scene.selectedBuilding;
    const px = b.buildX * SCALE.BUILD_CELL_SIZE;
    const py = b.buildY * SCALE.BUILD_CELL_SIZE;
    const pw = b.footprintW * SCALE.BUILD_CELL_SIZE;
    const ph = b.footprintH * SCALE.BUILD_CELL_SIZE;
    scene.selectedBuildingGraphics.lineStyle(3, 0x00ff00, 1);
    scene.selectedBuildingGraphics.strokeRect(px - 2, py - 2, pw + 4, ph + 4);
  }

  renderBuildingGhost() {
    const scene = this.scene;
    scene.placementGraphics.clear();
    if (!scene.placementMode) return;

    const landValid = this.isBuildable(scene.ghostBuildX, scene.ghostBuildY, scene.placementMode.w, scene.placementMode.h);
    const canAfford = this.canAffordCost(scene.placementMode.cost || {});

    let color = 0x00ff00;
    if (!landValid) color = 0xff0000;
    else if (!canAfford) color = 0xffaa00;

    const px = scene.ghostBuildX * SCALE.BUILD_CELL_SIZE;
    const py = scene.ghostBuildY * SCALE.BUILD_CELL_SIZE;
    const pw = scene.placementMode.w * SCALE.BUILD_CELL_SIZE;
    const ph = scene.placementMode.h * SCALE.BUILD_CELL_SIZE;

    scene.placementGraphics.lineStyle(1, 0xffffff, 0.3);
    scene.placementGraphics.strokeRect(px, py, pw, ph);
    scene.placementGraphics.fillStyle(color, 0.15);
    scene.placementGraphics.fillRect(px, py, pw, ph);
    scene.placementGraphics.lineStyle(2, color, 0.8);
    scene.placementGraphics.strokeRect(px, py, pw, ph);
  }

  placeBuilding(type, buildX, buildY) {
    const scene = this.scene;
    const def = BUILDING_DEFS[type];
    const building = {
      id: `building_${scene.nextBuildingId++}`,
      ownerId: scene.playerId,
      type,
      buildX, buildY,
      footprintW: def.w, footprintH: def.h,
      worldX: buildX * SCALE.BUILD_CELL_SIZE,
      worldY: buildY * SCALE.BUILD_CELL_SIZE,
      hp: def.hp,
      constructionTimer: def.buildTimeMs || 0,
      constructed: (def.buildTimeMs || 0) <= 0,
    };

    for (let dx = 0; dx < def.w; dx++) {
      for (let dy = 0; dy < def.h; dy++) {
        const gx = buildX + dx;
        const gy = buildY + dy;
        if (gx >= 0 && gx < scene.buildGridWidth && gy >= 0 && gy < scene.buildGridHeight) {
          const cell = scene.buildGrid[gy][gx];
          cell.buildable = false;
          cell.pathable = false;
          cell.occupiedBy = building.id;
        }
      }
    }

    scene.buildings.push(building);
    scene.renderBuildings();

    if (type === 'town_center' && building.constructed) {
      scene.populationCap += POPULATION.BASE_CAP;
      this.spawnStartingVillagers(building);
    }

    scene.addGameMessage(`${def.label} placed`, UI_STYLE.textGood);
    if (scene.verboseLogs) console.log(`BUILD PLACED: ${type} at build (${buildX}, ${buildY}) px (${building.worldX}, ${building.worldY}) constructed:${building.constructed}`);
    return building;
  }

  spawnStartingVillagers(tc) {
    const scene = this.scene;
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

      const bgx = Math.floor((cx + off.x));
      const bgy = Math.floor((cy + off.y));
      let px = sx;
      let py = sy;
      if (bgx >= 0 && bgx < scene.buildGridWidth && bgy >= 0 && bgy < scene.buildGridHeight) {
        const cell = scene.buildGrid[bgy][bgx];
        if (!cell.pathable) {
          let found = false;
          for (let r = 1; r < 8 && !found; r++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              for (let dy = -r; dy <= r && !found; dy++) {
                const nx = bgx + dx;
                const ny = bgy + dy;
                if (nx >= 0 && nx < scene.buildGridWidth && ny >= 0 && ny < scene.buildGridHeight && scene.buildGrid[ny][nx].pathable) {
                  px = nx * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
                  py = ny * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
                  found = true;
                }
              }
            }
          }
        }
      }

      scene.units.push({
        id: `unit_${scene.nextUnitId++}`,
        ownerId: scene.playerId,
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

    scene.renderUnits();
  }

  startBuildingPlacement(type) {
    const scene = this.scene;
    const def = BUILDING_DEFS[type];
    if (!def) return;
    scene.placementMode = { type, ...def };
    scene.ghostValid = false;
    console.log(`Placement: ${def.label} (${def.w}x${def.h}) Cost: ${this.formatCost(def.cost || {})}`);
  }

  cancelBuildingPlacement() {
    const scene = this.scene;
    if (scene.placementMode) {
      scene.addGameMessage('Placement cancelled', UI_STYLE.textMuted);
    }
    scene.placementMode = null;
    scene.placementGraphics.clear();
  }

  trainVillager(building) {
    const scene = this.scene;
    if (!building) return;

    if (scene.populationUsed >= scene.populationCap) {
      if (scene.verboseLogs) console.log('Train blocked: population cap reached');
      scene.showFloatingMessage('Population cap reached!');
      scene.addGameMessage('Population cap reached!', UI_STYLE.textWarn);
      return;
    }

    if (!this.spendCost(VILLAGER_COST)) {
      if (scene.verboseLogs) console.log('Train blocked: not enough food');
      scene.showFloatingMessage(`Need: ${this.formatCost(VILLAGER_COST)}`);
      scene.addGameMessage(`Need ${this.formatCost(VILLAGER_COST)}`, UI_STYLE.textWarn);
      return;
    }

    if (scene.verboseLogs) console.log('Train villager:', { food: scene.playerResources.food, pop: `${scene.populationUsed}/${scene.populationCap}`, tc: building.id });

    const cx = building.buildX + building.footprintW / 2;
    const cy = building.buildY + building.footprintH / 2;
    const spawnDist = Math.max(building.footprintW, building.footprintH) / 2 + 2;
    let px, py;

    const directions = [
      { x: cx, y: cy + spawnDist },
      { x: cx, y: cy - spawnDist },
      { x: cx + spawnDist, y: cy },
      { x: cx - spawnDist, y: cy },
    ];

    let found = false;
    for (const dir of directions) {
      const bgx = Math.floor(dir.x);
      const bgy = Math.floor(dir.y);
      if (bgx >= 0 && bgx < scene.buildGridWidth && bgy >= 0 && bgy < scene.buildGridHeight && scene.buildGrid[bgy][bgx].pathable) {
        px = bgx * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        py = bgy * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2;
        found = true;
        break;
      }
    }

    if (!found) {
      px = cx * SCALE.BUILD_CELL_SIZE;
      py = (cy + spawnDist) * SCALE.BUILD_CELL_SIZE;
    }

    const villager = {
      id: `unit_${scene.nextUnitId++}`,
      ownerId: scene.playerId,
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
    };

    scene.units.push(villager);
    scene.renderUnits();
    scene.showFloatingMessage('Villager trained!', scene.scale.width / 2, 58, UI_STYLE.textGood);
    scene.addGameMessage('Villager trained', UI_STYLE.textGood);
    if (scene.uiSystem) scene.uiSystem.lastActionPanelKey = null;
    scene.uiSystem?.updateActionPanel();
    if (scene.verboseLogs) console.log('Villager trained at:', building.id, { x: px, y: py });
  }

  update(delta) {
    const scene = this.scene;

    scene.farmTickTimer += delta;
    if (scene.farmTickTimer >= FARM_TICK_INTERVAL_MS) {
      scene.farmTickTimer -= FARM_TICK_INTERVAL_MS;
      let producedFood = 0;
      for (const b of scene.buildings) {
        if (b.constructed && b.type === 'farm' && b.ownerId === scene.playerId) {
          producedFood += FOOD_PER_FARM_TICK;
        }
      }
      if (producedFood > 0) {
        scene.playerResources.food += producedFood;
        scene.updateResourceHud();
        if (scene.uiSystem) scene.uiSystem.lastActionPanelKey = null;
        scene.uiSystem?.updateActionPanel();
        scene.uiSystem?.updateCommandPanel();
        scene.showFloatingMessage(`+${producedFood} food`, scene.scale.width / 2, 92, UI_STYLE.textGood);
        scene.addGameMessage(`+${producedFood} food from farms`, UI_STYLE.textGood);
      }
    }

    let buildingUpdated = false;
    for (const b of scene.buildings) {
      if (b.constructed) continue;
      b.constructionTimer -= delta;
      if (b.constructionTimer <= 0) {
        b.constructionTimer = 0;
        b.constructed = true;
        if (b.type === 'house') {
          scene.populationCap += POPULATION.PER_HOUSE;
        }
        if (b.type === 'town_center') {
          scene.populationCap += POPULATION.BASE_CAP;
          this.spawnStartingVillagers(b);
        }
        buildingUpdated = true;
        const def = BUILDING_DEFS[b.type];
        if (def) {
          scene.showFloatingMessage(`${def.label} complete`, scene.scale.width / 2, 92, UI_STYLE.textGood);
          scene.addGameMessage(`${def.label} complete`, UI_STYLE.textGood);
        }
      }
    }
    if (buildingUpdated) {
      scene.renderBuildings();
    }

    if (scene.placementMode) {
      const landValid = this.isBuildable(scene.ghostBuildX, scene.ghostBuildY, scene.placementMode.w, scene.placementMode.h);
      const canAfford = this.canAffordCost(scene.placementMode.cost || {});
      scene.ghostValid = landValid && canAfford;
      this.renderBuildingGhost();
    }
  }
}
