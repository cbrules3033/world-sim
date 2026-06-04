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

    console.log('MAP DATA RECEIVED:', {
      seed: this.seed,
      size: `${this.width}x${this.height}`,
      tiles: this.tiles?.length,
      resourceSites: this.resourceSites?.length,
      resourceEntities: this.resourceEntities?.length,
      stats: this.stats,
    });
    console.log('First 10 resource entities:', this.resourceEntities.slice(0, 10));
    console.log('First 10 resource sites:', this.resourceSites.slice(0, 10));
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
    this.spawnGraphics = this.add.graphics().setDepth(20);

    this.debugVisible = true;
    this.showSiteBounds = false;
    this.showEntityIcons = true;
    this.placementMode = null;
    this.ghostTileX = 0;
    this.ghostTileY = 0;
    this.ghostValid = false;

    this.renderTerrain();
    this.renderEntities();
    this.renderSiteBounds();
    this.renderSpawns();

    this.setupCamera();
    this.createUI();

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.showSiteBounds = !this.showSiteBounds; this.renderSiteBounds(); });
    this.input.keyboard.on('keydown-TWO', () => { this.showEntityIcons = !this.showEntityIcons; this.renderEntities(); });

    this.input.keyboard.on('keydown-T', () => this.startBuildingPlacement('town_center', 6, 6));
    this.input.keyboard.on('keydown-H', () => this.startBuildingPlacement('house', 2, 2));
    this.input.keyboard.on('keydown-L', () => this.startBuildingPlacement('lumber_camp', 3, 3));
    this.input.keyboard.on('keydown-M', () => this.startBuildingPlacement('mining_camp', 3, 3));
    this.input.keyboard.on('keydown-ESC', () => this.cancelBuildingPlacement());

    this.input.keyboard.on('keydown-F', () => this.jumpToFirstSite('forest'));
    this.input.keyboard.on('keydown-C', () => this.jumpToFirstResource('copper'));
    this.input.keyboard.on('keydown-I', () => this.jumpToFirstResource('iron'));
    this.input.keyboard.on('keydown-O', () => this.jumpToFirstResource('stone'));

    this.input.on('pointerdown', (pointer) => this.onPointerDown(pointer));
  }

  renderTerrain() {
    const g = this.terrainGraphics;
    g.clear();

    const total = this.tiles.length;
    for (let i = 0; i < total; i++) {
      const tile = this.tiles[i];
      const x = (i % this.width) * TILE_SIZE;
      const y = Math.floor(i / this.width) * TILE_SIZE;

      const color = TERRAIN_COLORS[tile.t] || 0x4a8c3f;
      g.fillStyle(color, 1);
      g.fillRect(x, y, TILE_SIZE, TILE_SIZE);

      if (tile.t === 1) {
        g.lineStyle(1, 0x1a4a7a, 0.3);
        g.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
      }

      if (tile.t === 2) {
        g.fillStyle(0x5a4a3f, 0.4);
        g.fillCircle(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 3);
      }
    }
  }

  renderEntities() {
    this.entityGraphics.clear();
    if (!this.showEntityIcons) return;

    const eg = this.entityGraphics;

    for (const entity of this.resourceEntities) {
      const px = entity.position.x * TILE_SIZE;
      const py = entity.position.y * TILE_SIZE;
      const r = Math.max(entity.radius * TILE_SIZE, 10);

      switch (entity.type) {
        case 'tree': {
          eg.fillStyle(0x000000, 0.25);
          eg.fillEllipse(px + 2, py + r * 0.45, r * 1.1, r * 0.35);

          eg.fillStyle(0x6b3f1d, 1);
          eg.fillRect(px - r * 0.12, py + r * 0.2, r * 0.24, r * 0.55);

          eg.fillStyle(0x0f8f2f, 1);
          eg.fillCircle(px, py, r * 0.75);

          eg.fillStyle(0x38c950, 0.7);
          eg.fillCircle(px - r * 0.22, py - r * 0.18, r * 0.32);
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
      const px = site.center.x * TILE_SIZE;
      const py = site.center.y * TILE_SIZE;
      const r = site.radius * TILE_SIZE;

      const color = SITE_COLORS[site.type] || 0xffffff;

      sg.lineStyle(1, color, 0.35);
      sg.strokeCircle(px, py, r);

      sg.fillStyle(color, 0.05);
      sg.fillCircle(px, py, r);

      const label = site.resourceType === 'wood' ? 'FOREST' : site.resourceType.toUpperCase();
      sg.fillStyle(0x000000, 0.5);
      sg.fillRect(px - 20, py - 5, 40, 10);
    }
  }

  renderSpawns() {
    this.spawnGraphics.clear();
    if (!this.spawns) return;

    const sg = this.spawnGraphics;
    for (const spawn of this.spawns) {
      const x = spawn.x * TILE_SIZE + TILE_SIZE / 2;
      const y = spawn.y * TILE_SIZE + TILE_SIZE / 2;
      sg.lineStyle(2, 0x00ff00, 0.8);
      sg.strokeCircle(x, y, TILE_SIZE * 1.5);
      sg.lineStyle(1, 0x00ff00, 0.3);
      sg.strokeCircle(x, y, TILE_SIZE * 4);
    }
  }

  setupCamera() {
    const worldW = this.width * TILE_SIZE;
    const worldH = this.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    this.input.on('pointermove', (pointer) => {
      if (pointer.isDown && pointer.downElement === this.game.canvas) {
        this.cameras.main.scrollX -= (pointer.x - pointer.prevPosition.x) / this.cameras.main.zoom;
        this.cameras.main.scrollY -= (pointer.y - pointer.prevPosition.y) / this.cameras.main.zoom;
      }

      const cam = this.cameras.main;
      this.ghostTileX = Math.floor((pointer.x / this.scale.width * cam.width + cam.scrollX) / TILE_SIZE);
      this.ghostTileY = Math.floor((pointer.y / this.scale.height * cam.height + cam.scrollY) / TILE_SIZE);
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

    const bg = this.add.rectangle(0, 0, 340, 240, 0x000000, 0.7).setOrigin(0, 0);
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '11px', color: '#0f0', fontFamily: 'monospace', lineSpacing: 3, wordWrap: { width: 320 }
    });
    this.debugPanel.add([bg, this.debugText]);
    this.debugPanel.visible = this.debugVisible;

    this.add.text(10, this.scale.height - 108,
      '` : Debug  |  1 : Site Bounds  |  2 : Entities\n' +
      'T : TC(6x6)  H : House(2x2)  L : Camp(3x3)  M : Mining(3x3)\n' +
      'F : Forest  |  O : Stone  |  C : Copper  |  I : Iron  |  ESC : Cancel', {
      fontSize: '11px', color: '#555', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(100);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.visible = this.debugVisible;
  }

  getEntityAtPointer() {
    const cam = this.cameras.main;
    const pointer = this.input.activePointer;
    const mx = (pointer.x / this.scale.width * cam.width + cam.scrollX) / TILE_SIZE;
    const my = (pointer.y / this.scale.height * cam.height + cam.scrollY) / TILE_SIZE;

    let closest = null;
    let closestDist = 0.8;
    for (const entity of this.resourceEntities) {
      const dx = entity.position.x - mx;
      const dy = entity.position.y - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < closestDist) {
        closest = entity;
        closestDist = d;
      }
    }
    return closest;
  }

  onPointerDown(pointer) {
    if (pointer.rightButtonDown()) return;

    if (this.placementMode) {
      if (this.ghostValid) {
        console.log(`BUILD PLACED: ${this.placementMode.type} at (${this.ghostTileX}, ${this.ghostTileY})`);
      } else {
        console.log(`BUILD BLOCKED: ${this.placementMode.type} cannot be placed at (${this.ghostTileX}, ${this.ghostTileY})`);
      }
      return;
    }

    const entity = this.getEntityAtPointer();
    if (entity) {
      let siteInfo = '';
      if (entity.depositId) {
        const site = this.resourceSites.find(s => s.id === entity.depositId);
        if (site) siteInfo = ` deposit: ${site.id}`;
      }
      console.log(`Selected resource entity: ${entity.id} type=${entity.type} resourceType=${entity.resourceType} amt=${entity.amount} at (${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)})${siteInfo}`);
    }
  }

  startBuildingPlacement(type, w, h) {
    this.placementMode = { type, width: w, height: h };
    this.ghostValid = false;
    console.log(`Placement mode: ${type} (${w}x${h})`);
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
    this.cameras.main.centerOn(site.center.x * TILE_SIZE, site.center.y * TILE_SIZE);
    this.cameras.main.setZoom(2);
    console.log('Jumped to site:', site);
  }

  jumpToFirstResource(resourceType) {
    const entity = this.resourceEntities.find(e => e.resourceType === resourceType);
    if (!entity) {
      console.warn('No resource entity found:', resourceType);
      return;
    }
    this.cameras.main.centerOn(entity.position.x * TILE_SIZE, entity.position.y * TILE_SIZE);
    this.cameras.main.setZoom(2);
    console.log('Jumped to resource entity:', entity);
  }

  isBuildable(tileX, tileY, w, h) {
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const x = tileX + dx;
        const y = tileY + dy;
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

        const idx = y * this.width + x;
        const tile = this.tiles[idx];
        if (!tile || tile.t === 1) return false;

        for (const entity of this.resourceEntities) {
          if (entity.blocksBuilding &&
              Math.abs(entity.position.x - (x + 0.5)) < 1 &&
              Math.abs(entity.position.y - (y + 0.5)) < 1) {
            return false;
          }
        }
      }
    }
    return true;
  }

  renderBuildingGhost() {
    this.placementGraphics.clear();
    if (!this.placementMode) return;

    const { width: w, height: h } = this.placementMode;
    const px = this.ghostTileX * TILE_SIZE;
    const py = this.ghostTileY * TILE_SIZE;
    const color = this.ghostValid ? 0x00ff00 : 0xff0000;

    this.placementGraphics.fillStyle(color, 0.15);
    this.placementGraphics.fillRect(px, py, w * TILE_SIZE, h * TILE_SIZE);
    this.placementGraphics.lineStyle(2, color, 0.8);
    this.placementGraphics.strokeRect(px, py, w * TILE_SIZE, h * TILE_SIZE);
  }

  update() {
    if (this.placementMode) {
      this.ghostValid = this.isBuildable(this.ghostTileX, this.ghostTileY, this.placementMode.width, this.placementMode.height);
      this.renderBuildingGhost();
    }

    if (!this.debugVisible || !this.debugText) return;

    const cam = this.cameras.main;
    const zoom = cam.zoom.toFixed(1);
    const scrollX = Math.floor(cam.scrollX);
    const scrollY = Math.floor(cam.scrollY);

    const mouse = this.input.activePointer;
    const tileX = Math.floor((mouse.x / this.scale.width * cam.width + cam.scrollX) / TILE_SIZE);
    const tileY = Math.floor((mouse.y / this.scale.height * cam.height + cam.scrollY) / TILE_SIZE);

    const idx = tileY * this.width + tileX;
    let tileInfo = '';
    if (idx >= 0 && idx < this.tiles.length) {
      const t = this.tiles[idx];
      const terrainNames = { 0: 'grass', 1: 'water', 2: 'rocky' };
      tileInfo = `Tile: (${tileX}, ${tileY}) ${terrainNames[t.t] || '?'}`;
    }

    let entityInfo = '';
    const entity = this.getEntityAtPointer();
    if (entity) {
      entityInfo = `${entity.type}[${entity.resourceType}] amt:${entity.amount} at (${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)})`;
    }

    let placementInfo = '';
    if (this.placementMode) {
      placementInfo = `\nPlace: ${this.placementMode.type} (${this.placementMode.width}x${this.placementMode.height}) at (${this.ghostTileX}, ${this.ghostTileY}) ${this.ghostValid ? 'VALID' : 'BLOCKED'}`;
    }

    const trees = this.resourceEntities.filter(e => e.type === 'tree').length;
    const stone = this.resourceEntities.filter(e => e.resourceType === 'stone').length;
    const copper = this.resourceEntities.filter(e => e.resourceType === 'copper').length;
    const iron = this.resourceEntities.filter(e => e.resourceType === 'iron').length;

    this.debugText.setText([
      `Seed: ${this.seed}`,
      `Size: ${this.width}x${this.height}`,
      `Zoom: ${zoom}x  Scroll: (${scrollX}, ${scrollY})`,
      `FPS: ${Math.round(this.game.loop.actualFps)}`,
      ``,
      `Entities received: ${this.resourceEntities.length}`,
      `Sites received: ${this.resourceSites.length}`,
      `Entities: trees ${trees}, stone ${stone}, copper ${copper}, iron ${iron}`,
      ``,
      `Stats:`,
      `  Forests: ${this.stats.forests}  Trees: ${this.stats.trees}`,
      `  Stone: ${this.stats.stoneDeposits} deposits, ${this.stats.stoneNodes} nodes`,
      `  Copper: ${this.stats.copperDeposits} deposits, ${this.stats.copperNodes} nodes`,
      `  Iron: ${this.stats.ironDeposits} deposits, ${this.stats.ironNodes} nodes`,
      `  Spawns: ${this.stats.validSpawns}`,
      ``,
      tileInfo,
      entityInfo,
      placementInfo,
    ].join('\n'));
  }
}
