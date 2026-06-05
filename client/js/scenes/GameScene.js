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
    this.selectedBuilding = null;
    this.farmTickTimer = 0;

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
    this.buildings.blockBuildCellsForEntity(entity);
  }

  worldPxToBuildCell(x, y) {
    return this.pathfinding.worldPxToBuildCell(x, y);
  }

  buildCellToWorldPx(x, y) {
    return this.pathfinding.buildCellToWorldPx(x, y);
  }

  isCellPathable(x, y) {
    return this.pathfinding.isCellPathable(x, y);
  }

  findPath(startX, startY, goalX, goalY) {
    return this.pathfinding.findPath(startX, startY, goalX, goalY);
  }

  simplifyPath(path) {
    return this.pathfinding.simplifyPath(path);
  }

  pathCellsToWaypoints(path) {
    return this.pathfinding.pathCellsToWaypoints(path);
  }

  findNearestPathableCell(cx, cy, maxRadius = 12) {
    return this.pathfinding.findNearestPathableCell(cx, cy, maxRadius);
  }

  commandMoveUnit(unit, targetWorldX, targetWorldY) {
    this.pathfinding.commandMoveUnit(unit, targetWorldX, targetWorldY);
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
    this.resources.assignGatherTask(unit, entity);
  }

  getResourceEntityById(id) {
    return this.resources.getResourceEntityById(id);
  }

  getBuildingById(id) {
    return this.buildings.find(b => b.id === id);
  }

  clearUnitWork(unit) {
    this.units.clearUnitWork(unit);
  }

  canAffordCost(cost = {}) {
    return this.buildings.canAffordCost(cost);
  }

  spendCost(cost = {}) {
    return this.buildings.spendCost(cost);
  }

  formatCost(cost = {}) {
    return this.buildings.formatCost(cost);
  }

  sendUnitToDropoff(unit) {
    return this.resources.sendUnitToDropoff(unit);
  }

  removeResourceEntity(id) {
    this.resources.removeResourceEntity(id);
  }

  updateVillagerWork(unit, delta) {
    this.resources.updateVillagerWork(unit, delta);
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

    this.selectedBuildingGraphics = this.add.graphics().setDepth(45);

    this.pathfinding = new PathfindingSystem(this);
    this.resources = new ResourceSystem(this);
    this.buildings = new BuildingSystem(this);
    this.units = new UnitSystem(this);
    this.ui = new UISystem(this);

    this.worldObjects = (this.worldObjects || []).concat([
      this.terrainGraphics, this.siteGraphics, this.placementGraphics,
      this.entityGraphics, this.buildingGraphics, this.spawnGraphics,
      this.pathGraphics, this.unitGraphics, this.selectionGraphics,
      this.selectedBuildingGraphics,
    ]);

    this.renderTerrain();
    this.renderEntities();
    this.renderSiteBounds();
    this.renderSpawns();

    this.setupCameras();

    this.ui.create();
    this.syncCameraIgnores();

    this.input.mouse.disableContextMenu();

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.showSiteBounds = !this.showSiteBounds; this.renderSiteBounds(); });
    this.input.keyboard.on('keydown-TWO', () => { this.showEntityIcons = !this.showEntityIcons; this.renderEntities(); });

    for (const [key, def] of Object.entries(BUILDING_DEFS)) {
      this.input.keyboard.on(`keydown-${def.hotkey}`, () => this.startBuildingPlacement(key));
    }
    this.input.keyboard.on('keydown-ESC', () => this.cancelBuildingPlacement());
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
      this.ui?.addGameMessage(`Verbose logs ${this.verboseLogs ? 'on' : 'off'}`, UI_STYLE.textMuted);
    });

    this.input.keyboard.on('keydown-TAB', (event) => {
      event.event?.preventDefault?.();
      this.showTerrainGrid = !this.showTerrainGrid;
      this.renderTerrain();
    });

    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
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
        const progress = b.constructionTimer > 0 ? 1 - b.constructionTimer / (BUILDING_DEFS[b.type]?.buildTimeMs || 1) : 0;
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
        this.buildingGraphics.fillRect(px, py + ph - barH, pw * Math.min(progress, 1), barH);
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
    this.units.renderUnits();
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
      if (pointer.isDown && pointer.downElement === this.game.canvas && !this.isPointerOverUI(pointer)) {
        this.worldCamera.scrollX -= (pointer.x - pointer.prevPosition.x) / this.worldCamera.zoom;
        this.worldCamera.scrollY -= (pointer.y - pointer.prevPosition.y) / this.worldCamera.zoom;
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
    if (this.ui) this.ui.debugPanel.visible = this.debugVisible;
  }

  showFloatingMessage(text, x, y, color) {
    return this.ui?.showFloatingMessage(text, x, y, color);
  }

  addGameMessage(text, color) {
    return this.ui?.addGameMessage(text, color);
  }

  isPointerOverUI(pointer) {
    return this.ui?.isPointerOverUI(pointer) ?? false;
  }

  updateResourceHud() {
    this.ui?.updateResourceHud();
  }

  createResourceHud() {
    this.resourceHud = this.registerUIObject(this.add.container(12, 10));
    this.resourceHud.setScrollFactor(0);
    this.resourceHud.setDepth(UI_DEPTH);

    this.resourceTexts = {};

    const resources = [
      { key: 'food', label: 'Food', color: 0x80ff9f },
      { key: 'wood', label: 'Wood', color: 0xc49a5a },
      { key: 'stone', label: 'Stone', color: 0xaaaaaa },
      { key: 'copper', label: 'Copper', color: 0xcd7f32 },
      { key: 'iron', label: 'Iron', color: 0x777777 },
      { key: 'population', label: 'Pop', color: 0x80bfff },
    ];

    let x = 0;

    for (const res of resources) {
      const chip = this.add.container(x, 0);

      const bg = this.add.rectangle(0, 0, 118, 32, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
        .setOrigin(0, 0);

      const border = this.add.rectangle(0, 0, 118, 32)
        .setOrigin(0, 0)
        .setStrokeStyle(1, UI_STYLE.panelBorder, 0.8);

      const dot = this.add.circle(14, 16, 5, res.color, 1);

      const text = this.add.text(26, 8, `${res.label}: 0`, {
        fontSize: '13px',
        color: UI_STYLE.textPrimary,
        fontFamily: UI_STYLE.fontFamily,
      });

      chip.add([bg, border, dot, text]);
      this.resourceHud.add(chip);

      this.resourceTexts[res.key] = text;
      x += 124;
    }
  }

  updateResourceHud() {
    if (!this.resourceTexts) return;
    this.populationUsed = this.units.filter(u => u.ownerId === this.playerId).length;

    for (const [key, text] of Object.entries(this.resourceTexts)) {
      if (key === 'population') {
        text.setText(`Pop ${this.populationUsed}/${this.populationCap}`);
      } else {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        text.setText(`${label} ${this.playerResources[key] || 0}`);
      }
    }
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.visible = this.debugVisible;
  }

  createCommandPanel() {
    const panelWidth = 620;
    const panelHeight = 112;
    const x = Math.floor((this.scale.width - panelWidth) / 2);
    const y = this.scale.height - panelHeight - 12;

    this.commandPanel = this.registerUIObject(this.add.container(x, y));
    this.commandPanel.setScrollFactor(0);
    this.commandPanel.setDepth(UI_DEPTH);

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = this.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    const title = this.add.text(12, 8, 'Build', {
      fontSize: '14px',
      color: UI_STYLE.textPrimary,
      fontFamily: UI_STYLE.fontFamily,
    });

    this.commandPanel.add([bg, border, title]);

    this.buildButtons = [];

    const entries = Object.entries(BUILDING_DEFS);

    entries.forEach(([type, def], index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);

      const bx = 12 + col * 198;
      const by = 32 + row * 34;

      const button = this.createBuildButton(type, def, bx, by);
      this.commandPanel.add(button.container);
      this.buildButtons.push(button);
    });
  }

  createBuildButton(type, def, x, y) {
    const container = this.add.container(x, y);

    const bg = this.add.rectangle(0, 0, 186, 28, UI_STYLE.buttonBg, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const border = this.add.rectangle(0, 0, 186, 28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.buttonBorder, 0.8);

    const label = this.add.text(8, 6, '', {
      fontSize: '11px',
      color: UI_STYLE.textPrimary,
      fontFamily: UI_STYLE.fontFamily,
    });

    container.add([bg, border, label]);

    bg.on('pointerdown', (pointer, localX, localY, event) => {
      if (event) event.stopPropagation();
      pointer.event?.preventDefault?.();
      pointer.event?.stopPropagation?.();
      console.log('UI build button clicked:', type);
      this.startBuildingPlacement(type);
    });

    bg.on('pointerover', () => {
      const canAfford = this.canAffordCost(def.cost || {});
      if (canAfford) {
        bg.setFillStyle(UI_STYLE.buttonBgHover, 1);
      }
    });

    bg.on('pointerout', () => {
      const canAfford = this.canAffordCost(def.cost || {});
      bg.setFillStyle(canAfford ? UI_STYLE.buttonBg : UI_STYLE.buttonBgDisabled, canAfford ? 0.95 : 0.9);
    });

    return { type, def, container, bg, border, label };
  }

  updateCommandPanel() {
    if (!this.buildButtons) return;

    for (const button of this.buildButtons) {
      const cost = button.def.cost || {};
      const canAfford = this.canAffordCost(cost);

      const hotkey = button.def.hotkey;
      const shortName = button.def.shortLabel || button.def.label;
      const costText = this.formatCost(cost);

      button.label.setText(`${hotkey} ${shortName} · ${costText}`);

      if (canAfford) {
        button.bg.setFillStyle(UI_STYLE.buttonBg, 0.95);
        button.label.setColor(UI_STYLE.textPrimary);
        button.border.setStrokeStyle(1, UI_STYLE.buttonBorder, 0.8);
      } else {
        button.bg.setFillStyle(UI_STYLE.buttonBgDisabled, 0.9);
        button.label.setColor(UI_STYLE.textMuted);
        button.border.setStrokeStyle(1, 0x333333, 0.6);
      }
    }
  }

  createActionPanel() {
    const panelWidth = 260;
    const panelHeight = 112;

    this.actionPanel = this.registerUIObject(
      this.add.container(this.scale.width - panelWidth - 12, this.scale.height - panelHeight - 12)
    );
    this.actionPanel.setScrollFactor(0);
    this.actionPanel.setDepth(UI_DEPTH);

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = this.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    const title = this.add.text(12, 8, 'Actions', {
      fontSize: '14px',
      color: UI_STYLE.textPrimary,
      fontFamily: UI_STYLE.fontFamily,
    });

    this.actionPanel.add([bg, border, title]);

    this.actionButtons = [];
  }

  clearActionPanelButtons() {
    if (!this.actionButtons) return;
    for (const btn of this.actionButtons) {
      btn.container.destroy();
    }
    this.actionButtons = [];
  }

  createActionButton(labelText, x, y, enabled, onClick) {
    const container = this.registerUIObject(this.add.container(x, y));

    const bgColor = enabled ? UI_STYLE.buttonBg : UI_STYLE.buttonBgDisabled;

    const bg = this.add.rectangle(0, 0, 236, 28, bgColor, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: enabled });

    const border = this.add.rectangle(0, 0, 236, 28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, enabled ? UI_STYLE.buttonBorder : 0x333333, 0.8);

    const label = this.add.text(8, 6, labelText, {
      fontSize: '11px',
      color: enabled ? UI_STYLE.textPrimary : UI_STYLE.textMuted,
      fontFamily: UI_STYLE.fontFamily,
    });

    container.add([bg, border, label]);

    if (enabled) {
      bg.on('pointerdown', (pointer, localX, localY, event) => {
        if (event) event.stopPropagation();
        pointer.event?.preventDefault?.();
        pointer.event?.stopPropagation?.();
        console.log('UI action button clicked:', labelText);
        onClick();
      });

      bg.on('pointerover', () => bg.setFillStyle(UI_STYLE.buttonBgHover, 1));
      bg.on('pointerout', () => bg.setFillStyle(UI_STYLE.buttonBg, 0.95));
    }

    this.actionPanel.add(container);
    this.actionButtons.push({ container, bg, label, border });

    this.syncCameraIgnores();

    return container;
  }

  updateActionPanel() {
    if (!this.actionPanel) return;

    let key = 'none';

    if (this.selectedBuilding && this.selectedBuilding.type === 'town_center' && this.selectedBuilding.constructed) {
      const canAfford = this.canAffordCost(VILLAGER_COST);
      const hasPop = this.populationUsed < this.populationCap;
      key = `train_${canAfford}_${hasPop}`;
    } else if (this.selectedBuilding) {
      key = `building_${this.selectedBuilding.type}`;
    }

    if (key === this.lastActionPanelKey) return;
    this.lastActionPanelKey = key;

    this.clearActionPanelButtons();

    if (
      this.selectedBuilding &&
      this.selectedBuilding.type === 'town_center' &&
      this.selectedBuilding.constructed
    ) {
      const canAfford = this.canAffordCost(VILLAGER_COST);
      const hasPop = this.populationUsed < this.populationCap;
      const enabled = canAfford && hasPop;

      let label = `R Train Villager - ${this.formatCost(VILLAGER_COST)}`;

      if (!hasPop) label = 'R Train Villager - Pop full';
      else if (!canAfford) label = `R Train Villager - Need ${this.formatCost(VILLAGER_COST)}`;

      this.createActionButton(label, 12, 34, enabled, () => {
        this.trainVillager(this.selectedBuilding);
        this.lastActionPanelKey = null;
        this.updateActionPanel();
      });

      return;
    }

    this.createActionButton('No actions', 12, 34, false, () => {});
  }

  createSelectedPanel() {
    const panelWidth = 260;
    const panelHeight = 112;
    const x = 12;
    const y = this.scale.height - panelHeight - 12;

    this.selectedPanel = this.registerUIObject(this.add.container(x, y));
    this.selectedPanel.setScrollFactor(0);
    this.selectedPanel.setDepth(UI_DEPTH);

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = this.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    this.selectedTitleText = this.add.text(12, 10, 'No selection', {
      fontSize: '15px',
      color: UI_STYLE.textPrimary,
      fontFamily: UI_STYLE.fontFamily,
    });

    this.selectedBodyText = this.add.text(12, 34, 'Select a villager or building', {
      fontSize: '12px',
      color: UI_STYLE.textMuted,
      fontFamily: UI_STYLE.fontFamily,
      lineSpacing: 4,
    });

    this.selectedPanel.add([bg, border, this.selectedTitleText, this.selectedBodyText]);
  }

  getVillagerTaskText(unit) {
    if (!unit.workState || unit.workState === 'idle') return 'Idle';

    if (unit.workState === 'moving_to_resource') {
      return `Going to ${unit.gatherResourceType || 'resource'}`;
    }

    if (unit.workState === 'gathering') {
      return `Gathering ${unit.gatherResourceType || unit.carryResource || 'resource'}`;
    }

    if (unit.workState === 'moving_to_dropoff') {
      return `Returning ${unit.carryResource || 'resources'}`;
    }

    return unit.workState;
  }

  getBuildingInfoLines(building) {
    const def = BUILDING_DEFS[building.type];
    const lines = [];

    if (!building.constructed) {
      const total = def.buildTimeMs || 1;
      const progress = Phaser.Math.Clamp(
        Math.floor((1 - building.constructionTimer / total) * 100),
        0, 100
      );

      lines.push('State: Building...');
      lines.push(`Progress: ${progress}%`);
    } else {
      lines.push('State: Active');
    }

    lines.push(`HP: ${building.hp}`);

    if (building.type === 'house') {
      lines.push(`Provides: +${POPULATION.PER_HOUSE} Pop`);
    }

    if (building.type === 'town_center') {
      lines.push(`Pop: ${this.populationUsed}/${this.populationCap}`);
      lines.push(`Train: ${this.formatCost(VILLAGER_COST)}`);
    }

    if (building.type === 'farm') {
      lines.push(`Produces: +${FOOD_PER_FARM_TICK} food / ${FARM_TICK_INTERVAL_MS / 1000}s`);
    }

    return lines;
  }

  updateSelectedPanel() {
    if (!this.selectedTitleText || !this.selectedBodyText) return;

    if (this.placementMode) {
      this.selectedTitleText.setText(`Placing ${this.placementMode.label}`);
      this.selectedBodyText.setText([
        `Cost: ${this.formatCost(this.placementMode.cost || {})}`,
        `Size: ${this.placementMode.w}x${this.placementMode.h}`,
        `Status: ${this.getPlacementStatusText()}`,
        'Left-click to place',
        'Esc to cancel',
      ].join('\n'));
      return;
    }

    if (this.selectedBuilding) {
      this.selectedTitleText.setText(BUILDING_DEFS[this.selectedBuilding.type]?.label || this.selectedBuilding.type);
      this.selectedBodyText.setText(this.getBuildingInfoLines(this.selectedBuilding).join('\n'));
      return;
    }

    if (!this.selectedUnits || this.selectedUnits.length === 0) {
      this.selectedTitleText.setText('No selection');
      this.selectedBodyText.setText('Select a villager or building');
      return;
    }

    if (this.selectedUnits.length > 1) {
      this.selectedTitleText.setText(`${this.selectedUnits.length} units selected`);
      this.selectedBodyText.setText('Right-click to move or gather');
      return;
    }

    const u = this.selectedUnits[0];

    const carryText = u.carryAmount > 0
      ? `${u.carryAmount}/${u.carryCapacity} ${u.carryResource}`
      : `0/${u.carryCapacity || 10}`;

    this.selectedTitleText.setText(u.type === 'villager' ? 'Villager' : u.type);

    this.selectedBodyText.setText([
      `Move: ${u.state || 'idle'}`,
      `Task: ${this.getVillagerTaskText(u)}`,
      `Carry: ${carryText}`,
      `HP: ${u.hp || '—'}`,
    ].join('\n'));
  }

  createDebugPanel() {
    const panelWidth = 360;
    const panelHeight = 270;

    this.debugPanel = this.registerUIObject(this.add.container(this.scale.width - panelWidth - 12, 50));
    this.debugPanel.setScrollFactor(0);
    this.debugPanel.setDepth(UI_DEPTH + 10);

    const bg = this.add.rectangle(0, 0, panelWidth, panelHeight, 0x000000, 0.75)
      .setOrigin(0, 0);

    this.debugText = this.add.text(10, 10, '', {
      fontSize: '11px',
      color: '#00ff66',
      fontFamily: UI_STYLE.fontFamily,
      lineSpacing: 3,
      wordWrap: { width: panelWidth - 20 },
    });

    this.debugPanel.add([bg, this.debugText]);
    this.debugPanel.visible = this.debugVisible;
  }

  createHotkeyHelp() {
    this.hotkeyHelpText = this.registerUIObject(this.add.text(
      this.scale.width - 12,
      12,
      '` Debug   RMB Move/Gather   Wheel Zoom   Drag Pan   Tab Grid',
      {
        fontSize: '11px',
        color: UI_STYLE.textMuted,
        fontFamily: UI_STYLE.fontFamily,
      }
    ));

    this.hotkeyHelpText.setOrigin(1, 0);
    this.hotkeyHelpText.setScrollFactor(0);
    this.hotkeyHelpText.setDepth(UI_DEPTH);
  }

  layoutUI() {
    if (this.selectedPanel) {
      this.selectedPanel.setPosition(12, this.scale.height - 124);
    }

    if (this.commandPanel) {
      this.commandPanel.setPosition(
        Math.floor((this.scale.width - 620) / 2),
        this.scale.height - 124
      );
    }

    if (this.actionPanel) {
      this.actionPanel.setPosition(this.scale.width - 272, this.scale.height - 124);
    }

    if (this.hotkeyHelpText) {
      this.hotkeyHelpText.setPosition(this.scale.width - 12, 12);
    }

    if (this.debugPanel) {
      this.debugPanel.setPosition(this.scale.width - 372, 50);
    }

    if (this.messageLogPanel) {
      this.messageLogPanel.setPosition(12, 50);
    }
  }

  getBuildingAtPointer(pointer) {
    return this.buildings.getBuildingAtPointer(pointer);
  }

  selectBuilding(building) {
    this.buildings.selectBuilding(building);
  }

  deselectBuilding() {
    this.buildings.deselectBuilding();
  }

  trainVillager(building) {
    this.buildings.trainVillager(building);
  }

  pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  isPointerOverUI(pointer) {
    const x = pointer.x;
    const y = pointer.y;

    if (this.pointInRect(x, y, 12, 10, 744, 34)) return true;

    if (this.pointInRect(x, y, this.scale.width - 360, 8, 350, 24)) return true;

    if (this.pointInRect(x, y, 12, this.scale.height - 124, 260, 112)) return true;

    if (this.pointInRect(x, y, Math.floor((this.scale.width - 620) / 2), this.scale.height - 124, 620, 112)) return true;

    if (this.pointInRect(x, y, this.scale.width - 272, this.scale.height - 124, 260, 112)) return true;

    if (this.debugVisible && this.pointInRect(x, y, this.scale.width - 372, 50, 360, 270)) return true;

    return false;
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
    return this.units.getUnitAtPointer(pointer);
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

        this.placeBuilding(this.placementMode.type, this.ghostBuildX, this.ghostBuildY);
        this.cancelBuildingPlacement();
        return;
      }

      this.clearUnitSelection();
      this.deselectBuilding();

      const unit = this.getUnitAtPointer(pointer);
      if (this.verboseLogs) console.log('Clicked unit:', unit);

      if (unit) {
        unit.selected = true;
        this.selectedUnits = [unit];
        this.renderUnits();
        return;
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

      if (this.selectedUnits.length > 0) {
        if (this.verboseLogs) console.log('Move command:', { selectedUnits: this.selectedUnits.length, targetX: wp.x.toFixed(1), targetY: wp.y.toFixed(1) });

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
    this.units.clearUnitSelection();
  }

  placeBuilding(type, buildX, buildY) {
    return this.buildings.placeBuilding(type, buildX, buildY);
  }

  spawnStartingVillagers(tc) {
    this.buildings.spawnStartingVillagers(tc);
  }

  startBuildingPlacement(type) {
    this.buildings.startBuildingPlacement(type);
  }

  cancelBuildingPlacement() {
    this.buildings.cancelBuildingPlacement();
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
    return this.buildings.isBuildable(buildX, buildY, fw, fh);
  }

  getPlacementStatusText() {
    return this.buildings.getPlacementStatusText();
  }

  renderSelectedBuilding() {
    this.buildings.renderSelectedBuilding();
  }

  renderBuildingGhost() {
    this.buildings.renderBuildingGhost();
  }

  updateUnits(delta) {
    this.units.updateUnits(delta);
  }

  update(time, delta) {
    this.updateUnits(delta);
    this.buildings.update(delta);
    this.ui.update();

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
