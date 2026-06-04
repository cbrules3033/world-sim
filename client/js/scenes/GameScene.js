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

    this.terrainGraphics = this.add.graphics();
    this.entityGraphics = this.add.graphics();
    this.siteGraphics = this.add.graphics();
    this.spawnGraphics = this.add.graphics();

    this.debugVisible = true;
    this.showSiteBounds = true;
    this.showEntityIcons = true;

    this.renderTerrain();
    this.renderEntities();
    this.renderSiteBounds();
    this.renderSpawns();

    this.setupCamera();
    this.createUI();

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.showSiteBounds = !this.showSiteBounds; this.renderSiteBounds(); });
    this.input.keyboard.on('keydown-TWO', () => { this.showEntityIcons = !this.showEntityIcons; this.renderEntities(); });
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
      const r = entity.radius * TILE_SIZE;

      switch (entity.type) {
        case 'tree': {
          const color = ENTITY_COLORS.tree;
          eg.fillStyle(color, 0.85);
          eg.fillTriangle(px, py - r, px - r * 0.8, py + r * 0.5, px + r * 0.8, py + r * 0.5);
          eg.fillStyle(0x1a3a1a, 0.6);
          eg.fillRect(px - r * 0.1, py + r * 0.3, r * 0.2, r * 0.4);
          break;
        }
        case 'ore_node': {
          const color = ENTITY_COLORS[entity.resourceType] || 0x808080;
          eg.fillStyle(color, 0.9);
          eg.fillCircle(px - r * 0.25, py + r * 0.1, r * 0.55);
          eg.fillCircle(px + r * 0.3, py - r * 0.15, r * 0.5);
          eg.fillCircle(px + r * 0.1, py + r * 0.3, r * 0.4);
          eg.fillStyle(0x000000, 0.15);
          eg.fillCircle(px - r * 0.2, py + r * 0.15, r * 0.55);
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

    this.add.text(10, this.scale.height - 80,
      '` : Debug  |  1 : Site Bounds  |  2 : Entities  |  Drag : Pan  |  Scroll : Zoom', {
      fontSize: '11px', color: '#555', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(100);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.visible = this.debugVisible;
  }

  update() {
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
    const mouseWorldX = (mouse.x / this.scale.width * cam.width + cam.scrollX) / TILE_SIZE;
    const mouseWorldY = (mouse.y / this.scale.height * cam.height + cam.scrollY) / TILE_SIZE;
    for (const entity of this.resourceEntities) {
      const dx = entity.position.x - mouseWorldX;
      const dy = entity.position.y - mouseWorldY;
      if (dx * dx + dy * dy < 0.5) {
        entityInfo = `${entity.type}[${entity.resourceType}] amt:${entity.amount} at (${entity.position.x.toFixed(1)}, ${entity.position.y.toFixed(1)})`;
        break;
      }
    }

    this.debugText.setText([
      `Seed: ${this.seed}`,
      `Size: ${this.width}x${this.height}`,
      `Zoom: ${zoom}x  Scroll: (${scrollX}, ${scrollY})`,
      `FPS: ${Math.round(this.game.loop.actualFps)}`,
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
    ].join('\n'));
  }
}
