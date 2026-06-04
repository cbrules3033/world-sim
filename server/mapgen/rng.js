export function hashSeed(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++)
    hash = ((hash << 5) + hash) + str.charCodeAt(i) | 0;
  return hash >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6d2b79f5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function createRng(seedStr) {
  const seed = hashSeed(seedStr);
  return mulberry32(seed);
}
