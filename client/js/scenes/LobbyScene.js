class LobbyScene extends Phaser.Scene {
  constructor() {
    super('LobbyScene');
    this.cleanups = [];
  }

  init(data) {
    this.roomCode = data.roomCode;
    this.playerId = data.playerId;
    this.hostId = data.hostId;
    this.playerName = data.playerName;
    this.players = data.players || [];
    this.seed = '';
  }

  create() {
    const cx = this.scale.width / 2;

    this.add.text(cx, 50, 'LOBBY', { fontSize: '36px', color: '#4fc3f7', fontFamily: 'monospace' }).setOrigin(0.5);
    this.add.text(cx, 90, `Room: ${this.roomCode}`, { fontSize: '18px', color: '#ffd54f', fontFamily: 'monospace' }).setOrigin(0.5);
    this.add.text(cx, 115, 'Share this code with friends', { fontSize: '12px', color: '#888', fontFamily: 'monospace' }).setOrigin(0.5);

    this.playersText = this.add.text(cx, 170, '', { fontSize: '16px', color: '#ccc', fontFamily: 'monospace', lineSpacing: 8 }).setOrigin(0.5);

    this.add.text(cx, 310, 'Map Seed (optional)', { fontSize: '14px', color: '#aaa', fontFamily: 'monospace' }).setOrigin(0.5);
    this.seedInput = this.createInput(cx, 340, 32, (text) => { this.seed = text; });

    this.startBtn = this.add.text(cx, 410, '[ START GAME ]', {
      fontSize: '22px', color: '#4caf50', fontFamily: 'monospace', backgroundColor: '#1a3b1a', padding: { x: 20, y: 10 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.startGame())
      .on('pointerover', () => this.startBtn.setColor('#81c784'))
      .on('pointerout', () => this.startBtn.setColor('#4caf50'));

    this.startBtn.visible = this.playerId === this.hostId;

    this.statusText = this.add.text(cx, 480, 'Waiting for host to start...', {
      fontSize: '14px', color: '#888', fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.connText = this.add.text(cx, 510, '', {
      fontSize: '12px', color: '#666', fontFamily: 'monospace'
    }).setOrigin(0.5);

    this.updatePlayers();

    this.cleanups = [
      network.on('player_joined', (data) => { this.players = data.players; this.updatePlayers(); }),
      network.on('player_left', (data) => { this.players = data.players; this.updatePlayers(); }),
      network.on('lobby_update', (data) => {
        this.hostId = data.hostId;
        this.players = data.players;
        if (this.startBtn) this.startBtn.visible = this.playerId === this.hostId;
        this.updatePlayers();
      }),
      network.on('game_starting', (data) => this.onGameStarting(data)),
      network.on('map_data', (data) => this.onMapData(data)),
      network.on('room_error', (data) => { if (this.statusText) this.statusText.setText(data.error); }),
      network.on('disconnected', () => { if (this.connText) this.connText.setText('Disconnected! Refresh page.'); }),
    ];

    this.events.on('shutdown', () => this.cleanups.forEach(fn => fn()));
  }

  createInput(x, y, maxLength, onChange) {
    const bg = this.add.rectangle(x, y, 300, 40, 0x333333).setStrokeStyle(1, 0x555555);
    const text = this.add.text(x, y, '', { fontSize: '20px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5);
    const placeholder = this.add.text(x, y, 'random seed', { fontSize: '20px', color: '#555', fontFamily: 'monospace' }).setOrigin(0.5);

    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = maxLength;
    el.style.cssText = 'position:fixed;opacity:0;pointer-events:none;font-size:16px;';
    document.body.appendChild(el);

    bg.setInteractive().on('pointerdown', () => {
      el.style.opacity = '1';
      el.style.pointerEvents = 'auto';
      el.focus();
      el.value = text.text;
      placeholder.visible = false;
    });

    el.addEventListener('input', () => {
      text.setText(el.value);
      placeholder.visible = el.value.length === 0;
      if (onChange) onChange(el.value);
    });

    el.addEventListener('blur', () => {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });

    this.events.on('shutdown', () => el.remove());
    return { bg, text, el, placeholder };
  }

  updatePlayers() {
    let list = '';
    this.players.forEach((p, i) => {
      const isHost = p.id === this.hostId;
      const isMe = p.id === this.playerId;
      const suffix = isHost ? ' (host)' : '';
      const marker = isMe ? '\u2192 ' : '  ';
      list += `${marker}${p.name}${suffix}\n`;
    });
    if (this.playersText) this.playersText.setText(list);
  }

  startGame() {
    network.send('start_game', { seed: this.seed || undefined });
    if (this.statusText) this.statusText.setText('Generating map...');
  }

  onGameStarting(data) {
    if (this.statusText) this.statusText.setText(`Map seed: ${data.seed} (${data.width}x${data.height})`);
  }

  onMapData(data) {
    try {
      this.scene.start('GameScene', {
        playerId: data.playerId,
        seed: data.seed,
        width: data.width,
        height: data.height,
        tiles: data.tiles,
        resourceSites: data.resourceSites,
        resourceEntities: data.resourceEntities,
        spawns: data.spawns,
        stats: data.stats,
      });
    } catch (e) {
      console.error('Failed to start game scene:', e);
      if (this.statusText) this.statusText.setText('Error loading map!');
    }
  }
}
