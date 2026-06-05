class UnitSystem {
  constructor(scene) {
    this.scene = scene;
  }

  clearUnitWork(unit) {
    unit.workState = 'idle';
    unit.gatherTargetId = null;
    unit.gatherResourceType = null;
    unit.dropoffTargetId = null;
    unit.gatherTimer = 0;
  }

  getUnitAtPointer(pointer = this.scene.input.activePointer) {
    const scene = this.scene;
    const wp = scene.getPointerWorldPx(pointer);
    let closest = null;
    let closestDist = SCALE.UNIT_SELECTION_RADIUS_PX + 8;
    for (const u of scene.units) {
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

  clearUnitSelection() {
    const scene = this.scene;
    for (const u of scene.units) {
      u.selected = false;
    }
    scene.selectedUnits = [];
  }

  renderUnits() {
    const scene = this.scene;
    scene.unitGraphics.clear();
    scene.selectionGraphics.clear();

    for (const u of scene.units) {
      let fill = 0xffffcc;
      if (u.workState === 'gathering') fill = 0x66ff66;
      if (u.carryResource) fill = scene.resources.getCarryColor(u.carryResource);
      if (u.selected) fill = 0xffffff;

      scene.unitGraphics.fillStyle(fill, 1);
      scene.unitGraphics.fillCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);
      scene.unitGraphics.lineStyle(1, 0x333333, 1);
      scene.unitGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_RADIUS_PX);

      if (u.selected) {
        scene.selectionGraphics.lineStyle(3, 0x00ff00, 1);
        scene.selectionGraphics.strokeCircle(u.x, u.y, SCALE.UNIT_SELECTION_RADIUS_PX + 4);
      }
    }
  }

  updateUnits(delta) {
    const scene = this.scene;
    let anyMoved = false;

    for (const u of scene.units) {
      if (u.state !== 'moving') continue;

      if (!u.path || u.pathIndex >= u.path.length) {
        u.state = 'idle';
        u.path = [];
        u.pathIndex = 0;
        anyMoved = true;
        continue;
      }

      const waypoint = u.path[u.pathIndex];

      const dx = waypoint.x - u.x;
      const dy = waypoint.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        u.x = waypoint.x;
        u.y = waypoint.y;
        u.pathIndex++;

        if (u.pathIndex >= u.path.length) {
          u.state = 'idle';
          u.path = [];
          u.pathIndex = 0;
        }

        anyMoved = true;
        continue;
      }

      const step = (u.speed * delta) / 1000;
      u.x += (dx / dist) * Math.min(step, dist);
      u.y += (dy / dist) * Math.min(step, dist);
      anyMoved = true;
    }

    for (const u of scene.units) {
      scene.updateVillagerWork(u, delta);
    }

    if (anyMoved) {
      this.renderUnits();
      scene.renderPaths();
    }
  }
}
