const UI_DEPTH = 1000;

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
      food: 100,
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

    this.populationCap = 0;
    this.populationUsed = 0;
    this.selectedBuilding = null;
    this.farmTickTimer = 0;

    this.dragSelect = {
      active: false,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      moved: false,
    };

    this.lastClickTime = 0;
    this.lastClickedUnitType = null;
    this.lastClickedUnitId = null;
    this.doubleClickMs = 300;

    this.idleVillagerIndex = 0;

    this.lastActionPanelKey = null;

    this.eventLog = [];
    this.verboseLogs = false;

    this.worldObjects = [];
    this.uiObjects = [];

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

    this.pathfindingSystem = new PathfindingSystem(this);
    this.resourceSystem = new ResourceSystem(this);
    this.buildingSystem = new BuildingSystem(this);
    this.unitSystem = new UnitSystem(this);
    this.uiSystem = new UISystem(this);

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
    this.buildingSystem.blockBuildCellsForEntity(entity);
  }

  worldPxToBuildCell(x, y) {
    return this.pathfindingSystem.worldPxToBuildCell(x, y);
  }

  buildCellToWorldPx(x, y) {
    return this.pathfindingSystem.buildCellToWorldPx(x, y);
  }

  isCellPathable(x, y) {
    return this.pathfindingSystem.isCellPathable(x, y);
  }

  findPath(startX, startY, goalX, goalY) {
    return this.pathfindingSystem.findPath(startX, startY, goalX, goalY);
  }

  simplifyPath(path) {
    return this.pathfindingSystem.simplifyPath(path);
  }

  pathCellsToWaypoints(path) {
    return this.pathfindingSystem.pathCellsToWaypoints(path);
  }

  findNearestPathableCell(cx, cy, maxRadius = 12) {
    return this.pathfindingSystem.findNearestPathableCell(cx, cy, maxRadius);
  }

  commandMoveUnit(unit, targetWorldX, targetWorldY) {
    return this.pathfindingSystem.commandMoveUnit(unit, targetWorldX, targetWorldY);
  }

  commandMoveSelectedUnits(targetX, targetY) {
    this.unitSystem.commandMoveSelectedUnits(targetX, targetY);
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
    this.resourceSystem.assignGatherTask(unit, entity);
  }

  getResourceEntityById(id) {
    return this.resourceSystem.getResourceEntityById(id);
  }

  getBuildingById(id) {
    return this.buildings.find(b => b.id === id);
  }

  getPopulationUsed() {
    return this.units.filter(u => u.ownerId === this.playerId).length;
  }

  refreshPopulationUsed() {
    this.populationUsed = this.getPopulationUsed();
    return this.populationUsed;
  }

  hasPopulationRoom(amount = 1) {
    return this.getPopulationUsed() + amount <= this.populationCap;
  }

  clearUnitWork(unit) {
    this.unitSystem.clearUnitWork(unit);
  }

  canAffordCost(cost = {}) {
    return this.buildingSystem.canAffordCost(cost);
  }

  spendCost(cost = {}) {
    return this.buildingSystem.spendCost(cost);
  }

  formatCost(cost = {}) {
    return this.buildingSystem.formatCost(cost);
  }

  sendUnitToDropoff(unit) {
    return this.resourceSystem.sendUnitToDropoff(unit);
  }

  removeResourceEntity(id) {
    this.resourceSystem.removeResourceEntity(id);
  }

  updateVillagerWork(unit, delta) {
    this.resourceSystem.updateVillagerWork(unit, delta);
  }

  create() {
    if (!this.tiles) {
      this.add.text(this.scale.width / 2, this.scale.height / 2, 'Error: No map data', {
        fontSize: '24px', color: '#f00', fontFamily: 'monospace'
      }).setOrigin(0.5);
      return;
    }

    this.debugVisible = false;
    this.showSiteBounds = false;
    this.showEntityIcons = true;
    this.showTerrainGrid = false;
    this.showUnitCollision = false;
    this.placementMode = null;
    this.ghostBuildX = 0;
    this.ghostBuildY = 0;
    this.ghostValid = false;

    this.selectedBuilding = null;

    this.worldCamera = this.cameras.main;
    this.worldCamera.setBackgroundColor(0x111111);
    this.worldCamera.setZoom(1);

    this.terrainGraphics = this.add.graphics().setDepth(0);
    this.siteGraphics = this.add.graphics().setDepth(5);
    this.placementGraphics = this.add.graphics().setDepth(7);
    this.entityGraphics = this.add.graphics().setDepth(10);
    this.buildingGraphics = this.add.graphics().setDepth(12);
    this.spawnGraphics = this.add.graphics().setDepth(20);
    this.pathGraphics = this.add.graphics().setDepth(25);
    this.unitGraphics = this.add.graphics().setDepth(30);
    this.selectionGraphics = this.add.graphics().setDepth(40);
    this.selectionBoxGraphics = this.add.graphics().setDepth(42);

    this.selectedBuildingGraphics = this.add.graphics().setDepth(45);

    this.pathfindingSystem ||= new PathfindingSystem(this);
    this.resourceSystem ||= new ResourceSystem(this);
    this.buildingSystem ||= new BuildingSystem(this);
    this.unitSystem ||= new UnitSystem(this);
    this.uiSystem ||= new UISystem(this);

    this.worldObjects = (this.worldObjects || []).concat([
      this.terrainGraphics, this.siteGraphics, this.placementGraphics,
      this.entityGraphics, this.buildingGraphics, this.spawnGraphics,
      this.pathGraphics, this.unitGraphics, this.selectionGraphics,
      this.selectionBoxGraphics, this.selectedBuildingGraphics,
    ]);

    this.renderTerrain();
    this.renderEntities();
    this.renderSiteBounds();
    this.renderSpawns();

    this.setupCameras();

    this.uiSystem.create();
    this.syncCameraIgnores();

    this.input.mouse.disableContextMenu();

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.showSiteBounds = !this.showSiteBounds; this.renderSiteBounds(); });
    this.input.keyboard.on('keydown-TWO', () => { this.showEntityIcons = !this.showEntityIcons; this.renderEntities(); });
    this.input.keyboard.on('keydown-THREE', () => {
      this.showUnitCollision = !this.showUnitCollision;
      this.renderUnits();
      this.addGameMessage(`Collision overlay ${this.showUnitCollision ? 'on' : 'off'}`, UI_STYLE.textMuted);
    });

    for (const [key, def] of Object.entries(BUILDING_DEFS)) {
      this.input.keyboard.on(`keydown-${def.hotkey}`, () => this.startBuildingPlacement(key));
    }
    this.input.keyboard.on('keydown-ESC', () => {
      if (this.placementMode) {
        this.cancelBuildingPlacement();
        return;
      }
      this.clearUnitSelection();
      this.deselectBuilding();
      this.renderUnits();
      this.renderPaths();
      this.addGameMessage('Selection cleared', UI_STYLE.textMuted);
    });

    this.input.keyboard.on('keydown-PERIOD', () => this.selectNextIdleVillager());
    this.input.keyboard.on('keydown-R', () => {
      if (this.selectedBuilding && this.selectedBuilding.type === 'town_center' && this.selectedBuilding.constructed) {
        this.trainVillager(this.selectedBuilding);
      }
    });

    this.input.keyboard.on('keydown-F', () => this.jumpToFirstSite('forest'));
    this.input.keyboard.on('keydown-C', () => this.jumpToFirstResource('copper'));
    this.input.keyboard.on('keydown-I', () => this.jumpToFirstResource('iron'));
    this.input.keyboard.on('keydown-O', () => this.jumpToFirstResource('stone'));

    this.input.keyboard.on('keydown-V', () => {
      this.verboseLogs = !this.verboseLogs;
      this.uiSystem?.addGameMessage(`Verbose logs ${this.verboseLogs ? 'on' : 'off'}`, UI_STYLE.textMuted);
    });

    this.input.keyboard.on('keydown-TAB', (event) => {
      event.event?.preventDefault?.();
      this.showTerrainGrid = !this.showTerrainGrid;
      this.renderTerrain();
    });

    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
    this.input.on('pointerup', (pointer) => this.onPointerUp(pointer));

    console.log('GameScene sanity:', {
      buildingsIsArray: Array.isArray(this.buildings),
      unitsIsArray: Array.isArray(this.units),
      hasBuildingSystem: !!this.buildingSystem,
      hasUnitSystem: !!this.unitSystem,
      hasResourceSystem: !!this.resourceSystem,
      hasPathfindingSystem: !!this.pathfindingSystem,
      hasUISystem: !!this.uiSystem,
    });
  }

  getPointerWorldPx(pointer = this.input.activePointer) {
    const worldPoint = this.worldCamera.getWorldPoint(pointer.x, pointer.y);
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

      const bleed = this.showTerrainGrid ? 0 : 0.75;
      g.fillRect(x - bleed, y - bleed, s + bleed * 2, s + bleed * 2);

      if (this.showTerrainGrid) {
        g.lineStyle(1, 0x000000, 0.16);
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

      if (!b.constructed) {
        const progress = b.constructionRequiredMs > 0
          ? b.constructionProgressMs / b.constructionRequiredMs
          : 1;
        const clampedProgress = Phaser.Math.Clamp(progress, 0, 1);
        this.buildingGraphics.fillStyle(0x000000, 0.15);
        this.buildingGraphics.fillRect(px + 3, py + 3, pw, ph);
        this.buildingGraphics.fillStyle(color, 0.4);
        this.buildingGraphics.fillRect(px, py, pw, ph);
        this.buildingGraphics.lineStyle(1, 0x444444, 0.5);
        this.buildingGraphics.strokeRect(px, py, pw, ph);
        const barH = 4;
        this.buildingGraphics.fillStyle(0x000000, 0.6);
        this.buildingGraphics.fillRect(px, py + ph - barH, pw, barH);
        this.buildingGraphics.fillStyle(0x00ff00, 0.8);
        this.buildingGraphics.fillRect(px, py + ph - barH, pw * clampedProgress, barH);
        continue;
      }

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
    this.unitSystem.renderUnits();
  }

  setupCameras() {
    const worldW = this.width * SCALE.TERRAIN_TILE_SIZE;
    const worldH = this.height * SCALE.TERRAIN_TILE_SIZE;

    this.worldCamera = this.cameras.main;
    this.worldCamera.setBounds(0, 0, worldW, worldH);
    this.worldCamera.setZoom(1);
    this.worldCamera.roundPixels = false;

    this.uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.uiCamera.roundPixels = false;

    this.input.on('pointermove', (pointer) => {
      const isPan = pointer.isDown && !this.dragSelect?.active && pointer.downElement === this.game.canvas && !this.isPointerOverUI(pointer);
      if (isPan) {
        this.worldCamera.scrollX -= (pointer.x - pointer.prevPosition.x) / this.worldCamera.zoom;
        this.worldCamera.scrollY -= (pointer.y - pointer.prevPosition.y) / this.worldCamera.zoom;
      }

      if (this.dragSelect?.active) {
        const wp = this.getPointerWorldPx(pointer);
        this.dragSelect.currentX = wp.x;
        this.dragSelect.currentY = wp.y;
        const dx = this.dragSelect.currentX - this.dragSelect.startX;
        const dy = this.dragSelect.currentY - this.dragSelect.startY;
        if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
          this.dragSelect.moved = true;
        }
        this.renderSelectionBox();
      }

      const wp = this.getPointerWorldPx(pointer);
      this.ghostBuildX = Math.floor(wp.x / SCALE.BUILD_CELL_SIZE);
      this.ghostBuildY = Math.floor(wp.y / SCALE.BUILD_CELL_SIZE);
    });

    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (this.isPointerOverUI(pointer)) return;
      const zoom = this.worldCamera.zoom;
      const newZoom = Phaser.Math.Clamp(zoom - deltaY * 0.001, 0.5, 4);
      this.worldCamera.setZoom(newZoom);
    });
  }

  registerUIObject(obj) {
    if (!this.uiObjects) this.uiObjects = [];
    this.uiObjects.push(obj);
    return obj;
  }

  syncCameraIgnores() {
    if (!this.worldCamera || !this.uiCamera) return;
    if (this.uiObjects?.length) this.worldCamera.ignore(this.uiObjects);
    if (this.worldObjects?.length) this.uiCamera.ignore(this.worldObjects);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    if (this.uiSystem) this.uiSystem.debugPanel.visible = this.debugVisible;
  }

  showFloatingMessage(text, x, y, color) {
    return this.uiSystem?.showFloatingMessage(text, x, y, color);
  }

  addGameMessage(text, color) {
    return this.uiSystem?.addGameMessage(text, color);
  }

  isPointerOverUI(pointer) {
    return this.uiSystem?.isPointerOverUI(pointer) ?? false;
  }

  updateResourceHud() {
    this.uiSystem?.updateResourceHud();
  }



  getBuildingAtPointer(pointer) {
    return this.buildingSystem.getBuildingAtPointer(pointer);
  }

  selectBuilding(building) {
    this.buildingSystem.selectBuilding(building);
  }

  deselectBuilding() {
    this.buildingSystem.deselectBuilding();
  }

  trainVillager(building) {
    this.buildingSystem.trainVillager(building);
  }

  assignBuilderToBuilding(unit, building) {
    return this.buildingSystem.assignBuilderToBuilding(unit, building);
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
    return this.unitSystem.getUnitAtPointer(pointer);
  }

  onPointerDown(pointer) {
    if (this.isPointerOverUI(pointer)) return;

    const wp = this.getPointerWorldPx(pointer);
    const isLeftClick = pointer.button === 0;
    const isRightClick = pointer.button === 2;

    if (this.verboseLogs) console.log('POINTER DOWN:', { button: pointer.button, worldX: wp.x.toFixed(1), worldY: wp.y.toFixed(1), units: this.units.length, selected: this.selectedUnits.length });

    if (isLeftClick) {

      if (this.placementMode) {
        if (!this.ghostValid) {
          if (this.verboseLogs) console.log('Cannot place building:', { type: this.placementMode.type, cost: this.placementMode.cost, resources: this.playerResources });
          return;
        }

        const cost = this.placementMode.cost || {};

        if (!this.spendCost(cost)) {
          if (this.verboseLogs) console.log(`Not enough resources for ${this.placementMode.label}. Cost: ${this.formatCost(cost)}`);
          this.showFloatingMessage(`Need: ${this.formatCost(cost)}`);
          this.addGameMessage(`Need ${this.formatCost(cost)}`, UI_STYLE.textWarn);
          return;
        }

        const placed = this.placeBuilding(this.placementMode.type, this.ghostBuildX, this.ghostBuildY);

        if (placed && !placed.constructed && this.selectedUnits.length > 0) {
          let assigned = 0;
          for (const unit of this.selectedUnits) {
            if (unit.type === 'villager') {
              if (this.assignBuilderToBuilding(unit, placed)) {
                assigned++;
              }
            }
          }
          if (assigned > 0) {
            this.addGameMessage(`${assigned} builder${assigned === 1 ? '' : 's'} assigned`, UI_STYLE.textGood);
          }
        }

        this.cancelBuildingPlacement();
        return;
      }

      if (!this.placementMode) {
        this.dragSelect.active = true;
        this.dragSelect.startX = wp.x;
        this.dragSelect.startY = wp.y;
        this.dragSelect.currentX = wp.x;
        this.dragSelect.currentY = wp.y;
        this.dragSelect.moved = false;
      }

      const unit = this.getUnitAtPointer(pointer);
      if (this.verboseLogs) console.log('Clicked unit:', unit);

      if (unit) {
        const now = performance.now();
        const isDoubleClick =
          this.lastClickedUnitId === unit.id &&
          now - this.lastClickTime <= this.doubleClickMs;

        this.lastClickTime = now;
        this.lastClickedUnitId = unit.id;
        this.lastClickedUnitType = unit.type;

        if (isDoubleClick) {
          this.selectUnitsOfTypeOnScreen(unit.type);
          return;
        }

        const additive = pointer.event?.shiftKey || false;

        if (!additive) {
          this.clearUnitSelection();
          this.deselectBuilding();
        }

        if (additive && unit.selected) {
          unit.selected = false;
          this.selectedUnits = this.selectedUnits.filter(u => u.id !== unit.id);
        } else {
          unit.selected = true;
          if (additive) {
            this.selectedUnits = Array.from(new Set([...this.selectedUnits, unit]));
          } else {
            this.selectedUnits = [unit];
          }
        }

        this.renderUnits();
        return;
      }

      if (!pointer.event?.shiftKey) {
        this.clearUnitSelection();
        this.deselectBuilding();
      }

      const building = this.getBuildingAtPointer(pointer);
      if (building) {
        this.selectBuilding(building);
        return;
      }

      const entity = this.getEntityAtPointer(pointer);
      if (entity && this.verboseLogs) {
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

      const clickedBuilding = this.getBuildingAtPointer(pointer);

      if (
        this.selectedUnits.length > 0 &&
        clickedBuilding &&
        !clickedBuilding.constructed
      ) {
        let assigned = 0;
        for (const unit of this.selectedUnits) {
          if (unit.type === 'villager') {
            if (this.assignBuilderToBuilding(unit, clickedBuilding)) {
              assigned++;
            }
          }
        }
        if (assigned > 0) {
          this.addGameMessage(`${assigned} builder${assigned === 1 ? '' : 's'} assigned`, UI_STYLE.textGood);
          this.renderUnits();
          this.renderPaths();
          return;
        }
      }

      if (this.selectedUnits.length > 0) {
        if (this.verboseLogs) console.log('Move command:', { selectedUnits: this.selectedUnits.length, targetX: wp.x.toFixed(1), targetY: wp.y.toFixed(1) });

        this.commandMoveSelectedUnits(wp.x, wp.y);

        this.renderUnits();
        this.renderPaths();
      }
    }
  }

  renderSelectionBox() {
    this.selectionBoxGraphics.clear();
    if (!this.dragSelect?.active || !this.dragSelect.moved) return;

    const x1 = this.dragSelect.startX;
    const y1 = this.dragSelect.startY;
    const x2 = this.dragSelect.currentX;
    const y2 = this.dragSelect.currentY;
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    this.selectionBoxGraphics.fillStyle(0x00ff88, 0.08);
    this.selectionBoxGraphics.fillRect(x, y, w, h);
    this.selectionBoxGraphics.lineStyle(2, 0x00ff88, 0.9);
    this.selectionBoxGraphics.strokeRect(x, y, w, h);
  }

  onPointerUp(pointer) {
    if (!this.dragSelect?.active) return;

    const wasDrag = this.dragSelect.moved;

    this.dragSelect.active = false;
    this.selectionBoxGraphics.clear();

    if (!wasDrag) return;

    this.selectUnitsInBox(
      this.dragSelect.startX, this.dragSelect.startY,
      this.dragSelect.currentX, this.dragSelect.currentY,
      pointer.event?.shiftKey || false
    );
  }

  selectUnitsInBox(x1, y1, x2, y2, additive = false) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    if (!additive) {
      this.clearUnitSelection();
      this.deselectBuilding();
    }

    const selected = [];

    for (const unit of this.units) {
      if (unit.ownerId !== this.playerId) continue;
      if (unit.x >= minX && unit.x <= maxX && unit.y >= minY && unit.y <= maxY) {
        unit.selected = true;
        selected.push(unit);
      }
    }

    this.selectedUnits = additive
      ? Array.from(new Set([...this.selectedUnits, ...selected]))
      : selected;

    this.renderUnits();
    this.renderPaths();

    if (selected.length > 0) {
      this.addGameMessage(`Selected ${selected.length} unit${selected.length === 1 ? '' : 's'}`, UI_STYLE.textMuted);
    }
  }

  isUnitVisibleOnScreen(unit) {
    const cam = this.worldCamera;
    const view = cam.worldView;
    return (
      unit.x >= view.x &&
      unit.x <= view.x + view.width &&
      unit.y >= view.y &&
      unit.y <= view.y + view.height
    );
  }

  selectUnitsOfTypeOnScreen(type) {
    this.clearUnitSelection();
    this.deselectBuilding();

    const selected = [];

    for (const unit of this.units) {
      if (unit.ownerId !== this.playerId) continue;
      if (unit.type !== type) continue;
      if (!this.isUnitVisibleOnScreen(unit)) continue;
      unit.selected = true;
      selected.push(unit);
    }

    this.selectedUnits = selected;
    this.renderUnits();
    this.renderPaths();

    this.addGameMessage(`Selected ${selected.length} ${type}${selected.length === 1 ? '' : 's'}`, UI_STYLE.textMuted);
  }

  isIdleVillager(unit) {
    return (
      unit.ownerId === this.playerId &&
      unit.type === 'villager' &&
      (!unit.workState || unit.workState === 'idle') &&
      (!unit.state || unit.state === 'idle') &&
      !unit.carryResource
    );
  }

  getIdleVillagers() {
    return this.units.filter(u => this.isIdleVillager(u));
  }

  selectNextIdleVillager() {
    const idle = this.getIdleVillagers();
    if (idle.length === 0) {
      this.addGameMessage('No idle villagers', UI_STYLE.textMuted);
      return;
    }

    this.idleVillagerIndex = this.idleVillagerIndex % idle.length;
    const unit = idle[this.idleVillagerIndex];
    this.idleVillagerIndex = (this.idleVillagerIndex + 1) % idle.length;

    this.clearUnitSelection();
    this.deselectBuilding();

    unit.selected = true;
    this.selectedUnits = [unit];

    this.worldCamera.centerOn(unit.x, unit.y);

    this.renderUnits();
    this.renderPaths();

    this.addGameMessage(`Idle villager ${this.idleVillagerIndex}/${idle.length}`, UI_STYLE.textMuted);
  }

  clearUnitSelection() {
    this.unitSystem.clearUnitSelection();
  }

  placeBuilding(type, buildX, buildY) {
    return this.buildingSystem.placeBuilding(type, buildX, buildY);
  }

  spawnStartingVillagers(tc) {
    this.buildingSystem.spawnStartingVillagers(tc);
  }

  startBuildingPlacement(type) {
    this.buildingSystem.startBuildingPlacement(type);
  }

  cancelBuildingPlacement() {
    this.buildingSystem.cancelBuildingPlacement();
  }

  jumpToFirstSite(siteType) {
    const site = this.resourceSites.find(s => s.type === siteType);
    if (!site) {
      console.warn('No site found:', siteType);
      return;
    }
    this.worldCamera.centerOn(site.center.x * SCALE.TERRAIN_TILE_SIZE, site.center.y * SCALE.TERRAIN_TILE_SIZE);
    this.worldCamera.setZoom(2);
    console.log('Jumped to site:', site);
  }

  jumpToFirstResource(resourceType) {
    const entity = this.resourceEntities.find(e => e.resourceType === resourceType);
    if (!entity) {
      console.warn('No resource entity found:', resourceType);
      return;
    }
    this.worldCamera.centerOn(entity.position.x * SCALE.TERRAIN_TILE_SIZE, entity.position.y * SCALE.TERRAIN_TILE_SIZE);
    this.worldCamera.setZoom(2);
    console.log('Jumped to resource entity:', entity);
  }

  isBuildable(buildX, buildY, fw, fh) {
    return this.buildingSystem.isBuildable(buildX, buildY, fw, fh);
  }

  getPlacementStatusText() {
    return this.buildingSystem.getPlacementStatusText();
  }

  renderSelectedBuilding() {
    this.buildingSystem.renderSelectedBuilding();
  }

  renderBuildingGhost() {
    this.buildingSystem.renderBuildingGhost();
  }

  updateUnits(delta) {
    this.unitSystem.updateUnits(delta);
  }

  update(time, delta) {
    this.updateUnits(delta);
    this.buildingSystem.update(delta);
    this.uiSystem.update();

    if (!this.debugText) return;

    const cam = this.worldCamera;
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
      `Resources: F:${this.playerResources.food} W:${this.playerResources.wood} S:${this.playerResources.stone} C:${this.playerResources.copper} I:${this.playerResources.iron}`,
      `Buildings: ${this.buildings.length}  Units: ${this.units.length}`,
      tileInfo,
      entityInfo,
      unitInfo,
      placementInfo,
    ].join('\n'));
  }
}
