class UISystem {
  constructor(scene) {
    this.scene = scene;
  }

  create() {
    this.createResourceHud();
    this.createSelectedPanel();
    this.createCommandPanel();
    this.createActionPanel();
    this.createDebugPanel();
    this.createHotkeyHelp();
    this.createMessageLog();
    this.layout();

    this.scene.scale.on('resize', (gameSize) => {
      if (this.scene.uiCamera) {
        this.scene.uiCamera.setSize(gameSize.width, gameSize.height);
      }
      this.layout();
    });
  }

  update() {
    this.updateResourceHud();
    this.updateSelectedPanel();
    this.updateCommandPanel();
    this.updateActionPanel();
    this.updateMessageLog();
  }

  // helpers
  pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  // resource hud
  createResourceHud() {
    const scene = this.scene;
    this.resourceHud = scene.registerUIObject(scene.add.container(12, 10));
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
      const chip = scene.add.container(x, 0);

      const bg = scene.add.rectangle(0, 0, 118, 32, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
        .setOrigin(0, 0);

      const border = scene.add.rectangle(0, 0, 118, 32)
        .setOrigin(0, 0)
        .setStrokeStyle(1, UI_STYLE.panelBorder, 0.8);

      const dot = scene.add.circle(14, 16, 5, res.color, 1);

      const text = scene.add.text(26, 8, `${res.label} 0`, {
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
    const scene = this.scene;
    scene.refreshPopulationUsed();

    const idleCount = scene.getIdleVillagers ? scene.getIdleVillagers().length : 0;

    for (const [key, text] of Object.entries(this.resourceTexts)) {
      if (key === 'population') {
        text.setText(`Pop ${scene.populationUsed}/${scene.populationCap} I ${idleCount}`);
      } else {
        const label = key.charAt(0).toUpperCase() + key.slice(1);
        text.setText(`${label} ${scene.playerResources[key] || 0}`);
      }
    }
  }

  // selected panel
  createSelectedPanel() {
    const scene = this.scene;
    const panelWidth = 260;
    const panelHeight = 112;
    const x = 12;
    const y = scene.scale.height - panelHeight - 12;

    this.selectedPanel = scene.registerUIObject(scene.add.container(x, y));
    this.selectedPanel.setScrollFactor(0);
    this.selectedPanel.setDepth(UI_DEPTH);

    const bg = scene.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = scene.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    this.selectedTitleText = scene.add.text(12, 10, 'No selection', {
      fontSize: '15px',
      color: UI_STYLE.textPrimary,
      fontFamily: UI_STYLE.fontFamily,
    });

    this.selectedBodyText = scene.add.text(12, 34, 'Select a villager or building', {
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

    if (unit.workState === 'moving_to_build') {
      return 'Going to build';
    }

    if (unit.workState === 'building') {
      return 'Constructing';
    }

    if (unit.workState === 'moving_to_crop_plot') return 'Going to farm';
    if (unit.workState === 'planting') return 'Planting';
    if (unit.workState === 'growing_crop') return 'Tending crops';
    if (unit.workState === 'harvesting_crop') return 'Harvesting';

    return unit.workState;
  }

  getBuildingInfoLines(building) {
    const def = BUILDING_DEFS[building.type];
    const lines = [];
    const scene = this.scene;

    if (!building.constructed) {
      const progress = building.constructionRequiredMs > 0
        ? Phaser.Math.Clamp(
            Math.floor((building.constructionProgressMs / building.constructionRequiredMs) * 100),
            0, 100
          )
        : 100;

      lines.push('State: Foundation');
      lines.push(`Progress: ${progress}%`);
      lines.push(`Builders: ${building.assignedBuilderIds?.length || 0}`);
    } else {
      lines.push('State: Active');
    }

    lines.push(`HP: ${building.hp}`);

    if (building.type === 'house') {
      lines.push(`Provides: +${POPULATION.PER_HOUSE} Pop`);
    }

    if (building.type === 'town_center') {
      lines.push(`Pop: ${scene.populationUsed}/${scene.populationCap}`);
      lines.push(`Train: ${scene.formatCost(VILLAGER_COST)}`);
    }

    if (building.type === 'farm' && building.constructed) {
      const plots = scene.buildingSystem.getCropPlotsForFarm(building.id);
      const worked = plots.filter(p => p.assignedWorkerId).length;

      lines.push(`Plots: ${plots.length}`);
      lines.push(`Worked: ${worked}/${plots.length}`);
      lines.push('Assign: right-click hub');
    }

    if (building.type === 'crop_plot') {
      lines.push(`State: ${building.cropState || 'empty'}`);
      lines.push(`Worker: ${building.assignedWorkerId ? 'Yes' : 'No'}`);

      if (building.farmHubId) {
        lines.push('Connected: Yes');
      } else {
        lines.push('Connected: No');
      }
    }

    return lines;
  }

  getPlacementStatusText() {
    const scene = this.scene;
    if (!scene.placementMode) return '';

    if (scene.placementMode?.type === 'crop_plot') {
      const connected = scene.buildingSystem.isValidCropPlotPlacement(
        scene.ghostBuildX,
        scene.ghostBuildY,
        scene.placementMode.w,
        scene.placementMode.h
      );
      if (!connected) return 'Must touch Farm/Plot';
    }

    const landValid = scene.isBuildable(scene.ghostBuildX, scene.ghostBuildY, scene.placementMode.w, scene.placementMode.h);
    const canAfford = scene.canAffordCost(scene.placementMode.cost || {});

    if (!landValid) return 'Blocked';
    if (!canAfford) return `Need ${scene.formatCost(scene.placementMode.cost || {})}`;
    return 'Valid';
  }

  updateSelectedPanel() {
    if (!this.selectedTitleText || !this.selectedBodyText) return;

    const scene = this.scene;

    if (scene.placementMode) {
      this.selectedTitleText.setText(`Placing ${scene.placementMode.label}`);
      this.selectedBodyText.setText([
        `Cost: ${scene.formatCost(scene.placementMode.cost || {})}`,
        `Size: ${scene.placementMode.w}x${scene.placementMode.h}`,
        `Status: ${this.getPlacementStatusText()}`,
        'Left-click to place',
        'Esc to cancel',
      ].join('\n'));
      return;
    }

    if (scene.selectedBuilding) {
      this.selectedTitleText.setText(BUILDING_DEFS[scene.selectedBuilding.type]?.label || scene.selectedBuilding.type);
      this.selectedBodyText.setText(this.getBuildingInfoLines(scene.selectedBuilding).join('\n'));
      return;
    }

    if (!scene.selectedUnits || scene.selectedUnits.length === 0) {
      this.selectedTitleText.setText('No selection');
      this.selectedBodyText.setText('Select a villager or building');
      return;
    }

    if (scene.selectedUnits.length > 1) {
      this.selectedTitleText.setText(`${scene.selectedUnits.length} units selected`);
      this.selectedBodyText.setText('Right-click to move or gather');
      return;
    }

    const u = scene.selectedUnits[0];

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

  // command / build panel
  createCommandPanel() {
    const scene = this.scene;
    const panelWidth = 620;
    const panelHeight = 112;
    const x = Math.floor((scene.scale.width - panelWidth) / 2);
    const y = scene.scale.height - panelHeight - 12;

    this.commandPanel = scene.registerUIObject(scene.add.container(x, y));
    this.commandPanel.setScrollFactor(0);
    this.commandPanel.setDepth(UI_DEPTH);

    const bg = scene.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = scene.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    const title = scene.add.text(12, 8, 'Build', {
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
    const scene = this.scene;
    const container = scene.add.container(x, y);

    const bg = scene.add.rectangle(0, 0, 186, 28, UI_STYLE.buttonBg, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });

    const border = scene.add.rectangle(0, 0, 186, 28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.buttonBorder, 0.8);

    const label = scene.add.text(8, 6, '', {
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
      scene.startBuildingPlacement(type);
    });

    bg.on('pointerover', () => {
      const canAfford = scene.canAffordCost(def.cost || {});
      if (canAfford) {
        bg.setFillStyle(UI_STYLE.buttonBgHover, 1);
      }
    });

    bg.on('pointerout', () => {
      const canAfford = scene.canAffordCost(def.cost || {});
      bg.setFillStyle(canAfford ? UI_STYLE.buttonBg : UI_STYLE.buttonBgDisabled, canAfford ? 0.95 : 0.9);
    });

    return { type, def, container, bg, border, label };
  }

  updateCommandPanel() {
    if (!this.buildButtons) return;
    const scene = this.scene;

    for (const button of this.buildButtons) {
      const cost = button.def.cost || {};
      const canAfford = scene.canAffordCost(cost);

      const hotkey = button.def.hotkey;
      const shortName = button.def.shortLabel || button.def.label;
      const costText = scene.formatCost(cost);

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

  // action panel
  createActionPanel() {
    const scene = this.scene;
    const panelWidth = 260;
    const panelHeight = 112;

    this.actionPanel = scene.registerUIObject(
      scene.add.container(scene.scale.width - panelWidth - 12, scene.scale.height - panelHeight - 12)
    );
    this.actionPanel.setScrollFactor(0);
    this.actionPanel.setDepth(UI_DEPTH);

    const bg = scene.add.rectangle(0, 0, panelWidth, panelHeight, UI_STYLE.panelBg, UI_STYLE.panelBgAlpha)
      .setOrigin(0, 0);

    const border = scene.add.rectangle(0, 0, panelWidth, panelHeight)
      .setOrigin(0, 0)
      .setStrokeStyle(1, UI_STYLE.panelBorder, 0.9);

    const title = scene.add.text(12, 8, 'Actions', {
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
    const scene = this.scene;
    const container = scene.registerUIObject(scene.add.container(x, y));

    const bgColor = enabled ? UI_STYLE.buttonBg : UI_STYLE.buttonBgDisabled;

    const bg = scene.add.rectangle(0, 0, 236, 28, bgColor, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: enabled });

    const border = scene.add.rectangle(0, 0, 236, 28)
      .setOrigin(0, 0)
      .setStrokeStyle(1, enabled ? UI_STYLE.buttonBorder : 0x333333, 0.8);

    const label = scene.add.text(8, 6, labelText, {
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

    scene.syncCameraIgnores();

    return container;
  }

  updateActionPanel() {
    if (!this.actionPanel) return;
    const scene = this.scene;

    let key = 'none';

    if (scene.selectedBuilding && scene.selectedBuilding.type === 'town_center' && scene.selectedBuilding.constructed) {
      const canAfford = scene.canAffordCost(VILLAGER_COST);
      const hasPop = scene.populationUsed < scene.populationCap;
      key = `train_${canAfford}_${hasPop}`;
    } else if (scene.selectedBuilding && !scene.selectedBuilding.constructed) {
      key = `foundation_${scene.selectedBuilding.type}`;
    } else if (scene.selectedBuilding) {
      key = `building_${scene.selectedBuilding.type}`;
    }

    if (key === this.lastActionPanelKey) return;
    this.lastActionPanelKey = key;

    this.clearActionPanelButtons();

    if (
      scene.selectedBuilding &&
      scene.selectedBuilding.type === 'town_center' &&
      scene.selectedBuilding.constructed
    ) {
      const canAfford = scene.canAffordCost(VILLAGER_COST);
      const hasPop = scene.populationUsed < scene.populationCap;
      const enabled = canAfford && hasPop;

      let label = `R Train Villager - ${scene.formatCost(VILLAGER_COST)}`;

      if (!hasPop) label = 'R Train Villager - Pop full';
      else if (!canAfford) label = `R Train Villager - Need ${scene.formatCost(VILLAGER_COST)}`;

      this.createActionButton(label, 12, 34, enabled, () => {
        scene.trainVillager(scene.selectedBuilding);
        scene.lastActionPanelKey = null;
        scene.uiSystem?.updateActionPanel();
      });

      return;
    }

    if (scene.selectedBuilding && !scene.selectedBuilding.constructed) {
      this.createActionButton('Foundation - needs builders', 12, 34, false, () => {});
      return;
    }

    this.createActionButton('No actions', 12, 34, false, () => {});
  }

  // debug panel
  createDebugPanel() {
    const scene = this.scene;
    const panelWidth = 360;
    const panelHeight = 270;

    this.debugPanel = scene.registerUIObject(scene.add.container(scene.scale.width - panelWidth - 12, 50));
    this.debugPanel.setScrollFactor(0);
    this.debugPanel.setDepth(UI_DEPTH + 10);

    const bg = scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x000000, 0.75)
      .setOrigin(0, 0);

    this.debugText = scene.add.text(10, 10, '', {
      fontSize: '11px',
      color: '#00ff66',
      fontFamily: UI_STYLE.fontFamily,
      lineSpacing: 3,
      wordWrap: { width: panelWidth - 20 },
    });

    this.debugPanel.add([bg, this.debugText]);
    this.debugPanel.visible = scene.debugVisible;
  }

  // hotkey help
  createHotkeyHelp() {
    const scene = this.scene;
    this.hotkeyHelpText = scene.registerUIObject(scene.add.text(
      scene.scale.width - 12,
      12,
      '` Debug   . Idle   RMB Move/Gather   Drag Select   Shift+Click   3 Collision   Esc Clear   Tab Grid',
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

  // message log
  addGameMessage(text, color = UI_STYLE.textPrimary) {
    this.eventLog.unshift({ text, color, timestamp: Date.now() });
    this.eventLog = this.eventLog.slice(0, 4);
    this.updateMessageLog?.();
  }

  createMessageLog() {
    const scene = this.scene;
    this.eventLog = [];
    this.messageLogPanel = scene.registerUIObject(scene.add.container(12, 50));
    this.messageLogPanel.setDepth(UI_DEPTH);

    this.messageLogTexts = [];

    for (let i = 0; i < 4; i++) {
      const t = scene.add.text(0, i * 18, '', {
        fontSize: '12px',
        color: UI_STYLE.textMuted,
        fontFamily: UI_STYLE.fontFamily,
      });

      this.messageLogPanel.add(t);
      this.messageLogTexts.push(t);
    }
  }

  updateMessageLog() {
    if (!this.messageLogTexts) return;

    for (let i = 0; i < this.messageLogTexts.length; i++) {
      const msg = this.eventLog[i];

      if (!msg) {
        this.messageLogTexts[i].setText('');
        continue;
      }

      this.messageLogTexts[i].setText(msg.text);
      this.messageLogTexts[i].setColor(msg.color);
    }
  }

  // floating message
  showFloatingMessage(text, x, y, color) {
    const scene = this.scene;
    if (x === undefined) x = scene.scale.width / 2;
    if (y === undefined) y = 58;
    if (color === undefined) color = '#ffcc00';

    const msg = scene.registerUIObject(scene.add.text(x, y, text, {
      fontSize: '14px',
      color,
      fontFamily: UI_STYLE.fontFamily,
      backgroundColor: '#000000cc',
      padding: { x: 10, y: 6 },
    }));

    msg.setOrigin(0.5, 0);
    msg.setScrollFactor(0);
    msg.setDepth(UI_DEPTH + 50);

    scene.syncCameraIgnores();

    scene.tweens.add({
      targets: msg,
      alpha: 0,
      y: y - 18,
      duration: 1300,
      onComplete: () => msg.destroy(),
    });
  }

  // pointer over UI check
  isPointerOverUI(pointer) {
    const scene = this.scene;
    const x = pointer.x;
    const y = pointer.y;

    if (this.pointInRect(x, y, 12, 10, 744, 34)) return true;

    if (this.pointInRect(x, y, scene.scale.width - 360, 8, 350, 24)) return true;

    if (this.pointInRect(x, y, 12, scene.scale.height - 124, 260, 112)) return true;

    if (this.pointInRect(x, y, Math.floor((scene.scale.width - 620) / 2), scene.scale.height - 124, 620, 112)) return true;

    if (this.pointInRect(x, y, scene.scale.width - 272, scene.scale.height - 124, 260, 112)) return true;

    if (scene.debugVisible && this.pointInRect(x, y, scene.scale.width - 372, 50, 360, 270)) return true;

    return false;
  }

  // layout
  layout() {
    const scene = this.scene;

    if (this.selectedPanel) {
      this.selectedPanel.setPosition(12, scene.scale.height - 124);
    }

    if (this.commandPanel) {
      this.commandPanel.setPosition(
        Math.floor((scene.scale.width - 620) / 2),
        scene.scale.height - 124
      );
    }

    if (this.actionPanel) {
      this.actionPanel.setPosition(scene.scale.width - 272, scene.scale.height - 124);
    }

    if (this.hotkeyHelpText) {
      this.hotkeyHelpText.setPosition(scene.scale.width - 12, 12);
    }

    if (this.debugPanel) {
      this.debugPanel.setPosition(scene.scale.width - 372, 50);
    }

    if (this.messageLogPanel) {
      this.messageLogPanel.setPosition(12, 50);
    }
  }
}
