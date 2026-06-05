class PathfindingSystem {
  constructor(scene) {
    this.scene = scene;
  }

  worldPxToBuildCell(x, y) {
    return { x: Math.floor(x / SCALE.BUILD_CELL_SIZE), y: Math.floor(y / SCALE.BUILD_CELL_SIZE) };
  }

  buildCellToWorldPx(x, y) {
    return { x: x * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2, y: y * SCALE.BUILD_CELL_SIZE + SCALE.BUILD_CELL_SIZE / 2 };
  }

  isCellPathable(x, y) {
    const scene = this.scene;
    if (x < 0 || x >= scene.buildGridWidth || y < 0 || y >= scene.buildGridHeight) return false;
    const cell = scene.buildGrid[y][x];
    return !!cell && cell.pathable && !cell.occupiedBy;
  }

  findPath(startX, startY, goalX, goalY) {
    const open = [];
    const closed = new Set();

    const key = (x, y) => `${x},${y}`;

    const heuristic = (x, y) => {
      const dx = Math.abs(x - goalX);
      const dy = Math.abs(y - goalY);
      return Math.min(dx, dy) * 14 + Math.abs(dx - dy) * 10;
    };

    open.push({ x: startX, y: startY, g: 0, f: heuristic(startX, startY), parent: null });

    const dirs = [
      { x: 0, y: -1, cost: 10 },
      { x: 1, y: 0, cost: 10 },
      { x: 0, y: 1, cost: 10 },
      { x: -1, y: 0, cost: 10 },
      { x: 1, y: -1, cost: 14 },
      { x: 1, y: 1, cost: 14 },
      { x: -1, y: 1, cost: 14 },
      { x: -1, y: -1, cost: 14 },
    ];

    const maxIterations = 50000;
    let iterations = 0;

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;

      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }

      const current = open.splice(bestIdx, 1)[0];
      const ck = key(current.x, current.y);

      if (current.x === goalX && current.y === goalY) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      closed.add(ck);

      for (const d of dirs) {
        const nx = current.x + d.x;
        const ny = current.y + d.y;

        if (!this.isCellPathable(nx, ny)) continue;

        if (d.cost === 14) {
          if (!this.isCellPathable(current.x + d.x, current.y) || !this.isCellPathable(current.x, current.y + d.y)) continue;
        }

        const nk = key(nx, ny);
        if (closed.has(nk)) continue;

        const ng = current.g + d.cost;

        const existing = open.find(o => o.x === nx && o.y === ny);
        if (existing) {
          if (ng < existing.g) {
            existing.g = ng;
            existing.f = ng + heuristic(nx, ny);
            existing.parent = current;
          }
        } else {
          open.push({ x: nx, y: ny, g: ng, f: ng + heuristic(nx, ny), parent: current });
        }
      }
    }

    return null;
  }

  simplifyPath(path) {
    if (!path || path.length <= 2) return path;

    const result = [path[0]];
    let lastDx = null;
    let lastDy = null;

    for (let i = 1; i < path.length; i++) {
      const prev = path[i - 1];
      const cur = path[i];

      const dx = Math.sign(cur.x - prev.x);
      const dy = Math.sign(cur.y - prev.y);

      if (lastDx !== null && (dx !== lastDx || dy !== lastDy)) {
        result.push(prev);
      }

      lastDx = dx;
      lastDy = dy;
    }

    result.push(path[path.length - 1]);
    return result;
  }

  pathCellsToWaypoints(path) {
    return path.map(p => this.buildCellToWorldPx(p.x, p.y));
  }

  findNearestPathableCell(cx, cy, maxRadius = 12) {
    if (this.isCellPathable(cx, cy)) return { x: cx, y: cy };

    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = cx + dx;
          const y = cy + dy;
          if (this.isCellPathable(x, y)) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }

  commandMoveUnit(unit, targetWorldX, targetWorldY) {
    const start = this.worldPxToBuildCell(unit.x, unit.y);
    const goal = this.worldPxToBuildCell(targetWorldX, targetWorldY);

    let finalGoal = goal;

    if (!this.isCellPathable(goal.x, goal.y)) {
      finalGoal = this.findNearestPathableCell(goal.x, goal.y, 12);
      if (!finalGoal) {
        console.warn('No pathable target near clicked location');
        this.scene.unitSystem?.stopUnit(unit);
        return false;
      }
    }

    const path = this.findPath(start.x, start.y, finalGoal.x, finalGoal.y);

    if (!path || path.length === 0) {
      console.warn('No path found', { start, finalGoal });
      this.scene.unitSystem?.stopUnit(unit);
      return false;
    }

    const simplified = this.simplifyPath(path);
    const waypoints = this.pathCellsToWaypoints(simplified);

    unit.path = waypoints;
    unit.pathIndex = 0;
    unit.state = 'moving';

    const first = waypoints[0];
    unit.targetX = first.x;
    unit.targetY = first.y;

    return true;
  }
}
