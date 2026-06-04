class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.playerId = data.playerId;
    this.seed = data.seed;
    this.width = data.width;
    this.height = data.height;
    this.tiles = data.tiles;
    this.spawns = data.spawns;
    this.stats = data.stats;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x111111);
    this.cameras.main.setZoom(2);

    this.graphics = this.add.graphics();
    this.resourceGraphics = this.add.graphics();
    this.spawnGraphics = this.add.graphics();
    this.debugGraphics = this.add.graphics();

    this.renderMap();

    this.setupCamera();

    this.createUI();

    this.debugVisible = true;
    this.resourceOverlay = true;
    this.spawnOverlay = true;

    this.input.keyboard.on('keydown-BACKTICK', () => this.toggleDebug());
    this.input.keyboard.on('keydown-ONE', () => { this.resourceOverlay = !this.resourceOverlay; this.renderMap(); });
    this.input.keyboard.on('keydown-TWO', () => { this.spawnOverlay = !this.spawnOverlay; this.renderSpawns(); });
  }

  renderMap() {
    const g = this.graphics;
    g.clear();
    this.resourceGraphics.clear();

    const tilesPerCall = 5000;
    let drawn = 0;

    const drawBatch = () => {
      const end = Math.min(drawn + tilesPerCall, this.tiles.length);
      for (let i = drawn; i < end; i++) {
        const tile = this.tiles[i];
        const x = (i % this.width) * TILE_SIZE;
        const y = Math.floor(i / this.width) * TILE_SIZE;

        g.fillStyle(TERRAIN_COLORS[tile.t] || 0x4a8c3f, 1);
        g.fillRect(x, y, TILE_SIZE, TILE_SIZE);

        if (tile.t === 1) {
          g.lineStyle(1, 0x1a4a7a, 0.3);
          g.strokeRect(x, y, TILE_SIZE, TILE_SIZE);
        }

        if (this.resourceOverlay && tile.r) {
          this.drawResource(tile.r, x, y);
        }
      }
      drawn = end;
      if (drawn < this.tiles.length) {
        this.time.delayedCall(0, drawBatch);
      } else {
        this.renderSpawns();
      }
    };

    drawBatch();
  }

  drawResource(resource, x, y) {
    const rg = this.resourceGraphics;
    const cx = x + TILE_SIZE / 2;
    const cy = y + TILE_SIZE / 2;
    const s = TILE_SIZE * 0.35;

    switch (resource.t) {
      case 'tree':
        rg.fillStyle(RESOURCE_COLORS.tree, 0.8);
        rg.fillTriangle(cx, cy - s, cx - s, cy + s, cx + s, cy + s);
        break;
      case 'stone':
        rg.fillStyle(RESOURCE_COLORS.stone, 0.9);
        rg.fillCircle(cx, cy, s * 0.7);
        break;
      case 'iron':
        rg.fillStyle(RESOURCE_COLORS.iron, 1);
        rg.fillRect(cx - s * 0.5, cy - s * 0.5, s, s);
        rg.fillStyle(0x440000, 0.5);
        rg.fillRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6);
        break;
    }
  }

  renderSpawns() {
    this.spawnGraphics.clear();
    if (!this.spawnOverlay || !this.spawns) return;

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

    const bg = this.add.rectangle(0, 0, 300, 200, 0x000000, 0.7).setOrigin(0, 0);
    this.debugText = this.add.text(10, 10, '', {
      fontSize: '12px', color: '#0f0', fontFamily: 'monospace', lineSpacing: 4, wordWrap: { width: 280 }
    });
    this.debugPanel.add([bg, this.debugText]);
    this.debugPanel.visible = this.debugVisible;

    this.instructions = this.add.text(10, this.scale.height - 80, '` : Debug  |  1 : Resources  |  2 : Spawns  |  Drag : Pan  |  Scroll : Zoom', {
      fontSize: '11px', color: '#555', fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(100);
  }

  toggleDebug() {
    this.debugVisible = !this.debugVisible;
    this.debugPanel.visible = this.debugVisible;
  }

  update() {
    if (!this.debugVisible) return;

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
      const terrainNames = { 0: 'grass', 1: 'water', 2: 'dirt', 3: 'sand' };
      tileInfo = `Tile: (${tileX}, ${tileY}) ${terrainNames[t.t] || '?'}`;
      if (t.r) tileInfo += ` [${t.r.t}: ${t.r.a}]`;
    }

    this.debugText.setText([
      `Seed: ${this.seed}`,
      `Size: ${this.width}x${this.height}`,
      `Zoom: ${zoom}x  Scroll: (${scrollX}, ${scrollY})`,
      `FPS: ${Math.round(this.game.loop.actualFps)}`,
      ``,
      `Stats:`,
      `  Water: ${this.stats.water}`,
      `  Trees: ${this.stats.tree}`,
      `  Stone: ${this.stats.stone}`,
      `  Iron: ${this.stats.iron}`,
      `  Spawns: ${this.stats.validSpawns}`,
      ``,
      tileInfo,
    ].join('\n'));

    this.debugPanel.list[1].setText(this.debugText.text);
  }
}
