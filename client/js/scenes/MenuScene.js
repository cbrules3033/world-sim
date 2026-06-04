class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
    this.playerName = '';
    this.roomCode = '';
    this.cleanups = [];
  }

  create() {
    const cx = this.scale.width / 2;

    this.add.text(cx, 80, 'WORLD SIM', { fontSize: '48px', color: '#4fc3f7', fontFamily: 'monospace' }).setOrigin(0.5);
    this.add.text(cx, 130, 'Multiplayer Colony RTS', { fontSize: '16px', color: '#888', fontFamily: 'monospace' }).setOrigin(0.5);

    this.add.text(cx, 200, 'Your Name', { fontSize: '14px', color: '#aaa', fontFamily: 'monospace' }).setOrigin(0.5);
    this.nameInput = this.createInput(cx, 230, 16, (text) => { this.playerName = text; });

    this.add.text(cx, 300, 'Room Code (to join)', { fontSize: '14px', color: '#aaa', fontFamily: 'monospace' }).setOrigin(0.5);
    this.codeInput = this.createInput(cx, 330, 4, (text) => { this.roomCode = text.toUpperCase(); });

    this.createButton(cx, 400, 'CREATE GAME', () => this.createRoom());
    this.createButton(cx, 450, 'JOIN GAME', () => this.joinRoom());

    this.statusText = this.add.text(cx, 520, '', { fontSize: '14px', color: '#ff6b6b', fontFamily: 'monospace' }).setOrigin(0.5);
    this.connText = this.add.text(cx, 550, '', { fontSize: '12px', color: '#666', fontFamily: 'monospace' }).setOrigin(0.5);

    network.connect();

    this.cleanups = [
      network.on('room_created', (data) => this.onRoomCreated(data)),
      network.on('joined_room', (data) => this.onJoinedRoom(data)),
      network.on('room_error', (data) => this.showError(data.error)),
      network.on('connected', () => { this.statusText.setText('Connected'); this.connText.setText(''); }),
      network.on('disconnected', () => { this.connText.setText('Reconnecting...'); }),
    ];

    if (!network.connected) this.connText.setText('Connecting...');
    else this.connText.setText('');

    this.events.on('shutdown', () => this.cleanups.forEach(fn => fn()));
  }

  createInput(x, y, maxLength, onChange) {
    const bg = this.add.rectangle(x, y, 300, 40, 0x333333).setStrokeStyle(1, 0x555555);
    const text = this.add.text(x, y, '', { fontSize: '20px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5);

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
    });

    el.addEventListener('input', () => {
      text.setText(el.value);
      if (onChange) onChange(el.value);
    });

    el.addEventListener('blur', () => {
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });

    this.events.on('shutdown', () => el.remove());
    return { bg, text, el };
  }

  createButton(x, y, label, onClick) {
    const bg = this.add.rectangle(x, y, 250, 45, 0x1a6b3c).setStrokeStyle(1, 0x2d8a4e);
    const txt = this.add.text(x, y, label, { fontSize: '18px', color: '#fff', fontFamily: 'monospace' }).setOrigin(0.5);
    bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => bg.setFillStyle(0x2d8a4e))
      .on('pointerout', () => bg.setFillStyle(0x1a6b3c))
      .on('pointerdown', onClick);
    return { bg, txt };
  }

  showError(msg) {
    this.statusText.setText(msg);
    this.time.delayedCall(3000, () => { if (this.statusText && this.statusText.text === msg) this.statusText.setText(''); });
  }

  createRoom() {
    if (!this.playerName) { this.showError('Enter a name'); return; }
    network.send('create_room', { playerName: this.playerName });
  }

  joinRoom() {
    if (!this.playerName) { this.showError('Enter a name'); return; }
    if (!this.roomCode) { this.showError('Enter a room code'); return; }
    network.send('join_room', { roomCode: this.roomCode, playerName: this.playerName });
  }

  onRoomCreated(data) {
    this.scene.start('LobbyScene', { ...data, playerName: this.playerName });
  }

  onJoinedRoom(data) {
    this.scene.start('LobbyScene', { ...data, playerName: this.playerName });
  }
}
