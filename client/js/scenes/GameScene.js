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
      const fill = u.selected ? 0xffffff : 0xffffcc;
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
    this.debugPanel = this.add.container(10, 10);
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
        if (this.ghostValid) {
          this.placeBuilding(this.placementMode.type, this.ghostBuildX, this.ghostBuildY);
          this.cancelBuildingPlacement();
        }
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
      if (this.selectedUnits.length > 0) {
        console.log('Move command:', {
          selectedUnits: this.selectedUnits.length,
          targetX: wp.x.toFixed(1),
          targetY: wp.y.toFixed(1),
        });

        for (const unit of this.selectedUnits) {
          unit.targetX = wp.x;
          unit.targetY = wp.y;
          unit.state = 'moving';
        }

        this.renderUnits();
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
      });
    }

    this.renderUnits();
  }

  startBuildingPlacement(type) {
    const def = BUILDING_DEFS[type];
    if (!def) return;
    this.placementMode = { type, ...def };
    this.ghostValid = false;
    console.log(`Placement: ${def.label} (${def.w}x${def.h} cells = ${(def.w * SCALE.BUILD_CELL_SIZE).toFixed(0)}x${(def.h * SCALE.BUILD_CELL_SIZE).toFixed(0)} px)`);
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

    const px = this.ghostBuildX * SCALE.BUILD_CELL_SIZE;
    const py = this.ghostBuildY * SCALE.BUILD_CELL_SIZE;
    const pw = this.placementMode.w * SCALE.BUILD_CELL_SIZE;
    const ph = this.placementMode.h * SCALE.BUILD_CELL_SIZE;
    const color = this.ghostValid ? 0x00ff00 : 0xff0000;

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

      const dx = u.targetX - u.x;
      const dy = u.targetY - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 1) {
        u.x = u.targetX;
        u.y = u.targetY;
        u.state = 'idle';
        anyMoved = true;
        continue;
      }

      const step = (u.speed * delta) / 1000;
      u.x += (dx / dist) * Math.min(step, dist);
      u.y += (dy / dist) * Math.min(step, dist);
      anyMoved = true;
    }

    if (anyMoved) {
      this.renderUnits();
    }
  }

  update(time, delta) {
    this.updateUnits(delta);

    if (this.placementMode) {
      this.ghostValid = this.isBuildable(this.ghostBuildX, this.ghostBuildY, this.placementMode.w, this.placementMode.h);
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
      unitInfo = `${u.type}#${u.id.slice(-3)} px(${u.x.toFixed(0)}, ${u.y.toFixed(0)}) ${u.state}`;
    }

    let placementInfo = '';
    if (this.placementMode) {
      const def = this.placementMode;
      placementInfo = `\nPlace: ${def.label} (${def.w}x${def.h}) at cell (${this.ghostBuildX}, ${this.ghostBuildY}) ${this.ghostValid ? 'VALID' : 'BLOCKED'}`;
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
      `Buildings: ${this.buildings.length}  Units: ${this.units.length}`,
      tileInfo,
      entityInfo,
      unitInfo,
      placementInfo,
    ].join('\n'));
  }
}
