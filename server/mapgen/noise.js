export function makeNoise(rng, octaves = 4, scale = 1) {
  const gridCache = {};
  const valCache = {};

  function getGridVal(cx, cy) {
    const key = `${cx},${cy}`;
    if (gridCache[key] !== undefined) return gridCache[key];
    const val = rng();
    gridCache[key] = val;
    return val;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smoothstep(t) {
    return t * t * (3 - 2 * t);
  }

  return function noise(x, y) {
    const key = `${x},${y}`;
    if (valCache[key] !== undefined) return valCache[key];

    let value = 0;
    let amplitude = 1;
    let maxValue = 0;
    let freq = scale;

    for (let o = 0; o < octaves; o++) {
      const sx = x * freq;
      const sy = y * freq;
      const cx = Math.floor(sx);
      const cy = Math.floor(sy);
      const fx = sx - cx;
      const fy = sy - cy;
      const sx2 = smoothstep(fx);
      const sy2 = smoothstep(fy);

      const v00 = getGridVal(cx, cy);
      const v10 = getGridVal(cx + 1, cy);
      const v01 = getGridVal(cx, cy + 1);
      const v11 = getGridVal(cx + 1, cy + 1);

      const top = lerp(v00, v10, sx2);
      const bot = lerp(v01, v11, sx2);
      const octaveVal = lerp(top, bot, sy2);

      value += octaveVal * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      freq *= 2;
    }

    const result = value / maxValue;
    valCache[key] = result;
    return result;
  };
}
