import { MAPS, normalizeMap, botStarts } from './maps.mjs';
export { MAPS, normalizeMap };
export const TILE = 4;
export let ACTIVE_MAP, GRID, SPAWN, BOT_SPAWNS, CRATES, SITES;
export function setMap(id) {
  ACTIVE_MAP = MAPS[normalizeMap(id)];
  GRID = ACTIVE_MAP.grid;
  SPAWN = ACTIVE_MAP.spawn;
  CRATES = ACTIVE_MAP.crates;
  SITES = ACTIVE_MAP.sites;
  BOT_SPAWNS = botStarts(ACTIVE_MAP);
  return ACTIVE_MAP;
}
setMap('dust');
export function locationName(position) {
  if (Math.hypot(position.x - SPAWN.x, position.z - SPAWN.z) < 8) return 'محل شروع';
  for (const site of SITES)
    if (Math.hypot(position.x - site.x, position.z - site.z) < 8) return `محوطهٔ ${site.name}`;
  for (const zone of ACTIVE_MAP.zones)
    if (
      position.x >= zone.x &&
      position.x < zone.x + zone.w &&
      position.z >= zone.z &&
      position.z < zone.z + zone.d
    )
      return zone.name;
  return 'مسیر ارتباطی';
}
export const WEAPONS = [
  {
    name: 'AK-47',
    displayName: 'کلاشینکف',
    label: 'تفنگ تهاجمی',
    mag: 30,
    reserve: 120,
    damage: 36,
    rate: 0.105,
    reload: 2.4,
    spread: 0.012,
    recoil: 0.022,
    automatic: true,
    color: 0x885027,
  },
  {
    name: 'M4A1',
    displayName: 'ام‌چهار',
    label: 'تفنگ تهاجمی',
    mag: 30,
    reserve: 120,
    damage: 29,
    rate: 0.085,
    reload: 2.1,
    spread: 0.008,
    recoil: 0.014,
    automatic: true,
    color: 0x35404a,
  },
  {
    name: 'AWP',
    displayName: 'تک‌تیرانداز',
    label: 'تفنگ تک‌تیرانداز',
    mag: 10,
    reserve: 30,
    damage: 115,
    rate: 1.35,
    reload: 2.8,
    spread: 0.022,
    recoil: 0.055,
    automatic: false,
    color: 0x546440,
  },
  {
    name: 'Desert Eagle',
    displayName: 'دزرت ایگل',
    label: 'کلت',
    mag: 7,
    reserve: 42,
    damage: 62,
    rate: 0.3,
    reload: 1.7,
    spread: 0.014,
    recoil: 0.038,
    automatic: false,
    color: 0xb5b9b6,
  },
];
export function solidCell(x, z) {
  return !GRID[z] || !GRID[z][x] || GRID[z][x] === '#';
}
export function blocked(x, z, r = 0.32, feet = 0) {
  for (const dx of [-r, r])
    for (const dz of [-r, r])
      if (solidCell(Math.floor((x + dx) / TILE), Math.floor((z + dz) / TILE))) return true;
  return CRATES.some(
    ([cx, cz, w, d, h]) =>
      feet < h - 0.05 && Math.abs(x - cx) < w / 2 + r && Math.abs(z - cz) < d / 2 + r,
  );
}
export function moveBody(body, dx, dz, r = 0.32) {
  if (!blocked(body.x + dx, body.z, r, body.y || 0)) body.x += dx;
  if (!blocked(body.x, body.z + dz, r, body.y || 0)) body.z += dz;
}
export function pathTo(from, to) {
  const sx = Math.floor(from.x / TILE),
    sz = Math.floor(from.z / TILE),
    tx = Math.floor(to.x / TILE),
    tz = Math.floor(to.z / TILE);
  const start = `${sx},${sz}`,
    target = `${tx},${tz}`,
    queue = [[sx, sz]],
    parent = new Map([[start, null]]);
  for (let i = 0; i < queue.length; i++) {
    const [x, z] = queue[i],
      key = `${x},${z}`;
    if (key === target) break;
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        nkey = `${nx},${nz}`;
      if (
        !solidCell(nx, nz) &&
        !blocked((nx + 0.5) * TILE, (nz + 0.5) * TILE, 0.3) &&
        !parent.has(nkey)
      ) {
        parent.set(nkey, key);
        queue.push([nx, nz]);
      }
    }
  }
  if (!parent.has(target)) return [];
  const route = [];
  let key = target;
  while (key && key !== start) {
    const [x, z] = key.split(',').map(Number);
    route.unshift({ x: (x + 0.5) * TILE, z: (z + 0.5) * TILE });
    key = parent.get(key);
  }
  return route;
}
export function loadouts() {
  return WEAPONS.map((w) => ({ ammo: w.mag, reserve: w.reserve }));
}
export function finishReload(slot, weapon) {
  const amount = Math.min(weapon.mag - slot.ammo, slot.reserve);
  slot.ammo += amount;
  slot.reserve -= amount;
  return amount;
}

export const MAX_BOTS = 24;
export const DIFFICULTIES = {
  easy: { label: 'آسان', speed: 1.5, accuracy: 0.5, damage: 0.65, interval: 1.65 },
  normal: { label: 'معمولی', speed: 2.15, accuracy: 1, damage: 1, interval: 1 },
  hard: { label: 'سخت', speed: 2.7, accuracy: 1.3, damage: 1.2, interval: 0.8 },
  expert: { label: 'حرفه‌ای', speed: 3.2, accuracy: 1.55, damage: 1.45, interval: 0.65 },
};
export function normalizeSettings(value = {}) {
  const count = Number(value.count);
  return {
    difficulty: Object.hasOwn(DIFFICULTIES, value.difficulty) ? value.difficulty : 'normal',
    count: Number.isFinite(count) ? Math.max(1, Math.min(MAX_BOTS, Math.round(count))) : 12,
  };
}
export function spawnPositions(count) {
  count = normalizeSettings({ count }).count;
  const positions = BOT_SPAWNS.map((p) => ({ ...p })),
    used = new Set(positions.map((p) => `${p.x},${p.z}`));
  for (let z = 1; z < GRID.length - 1; z++)
    for (let x = 1; x < GRID[0].length - 1; x++) {
      const p = { x: (x + 0.5) * TILE, z: (z + 0.5) * TILE },
        key = `${p.x},${p.z}`;
      if (
        !used.has(key) &&
        !blocked(p.x, p.z, 0.4) &&
        Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) > 16
      ) {
        positions.push(p);
        used.add(key);
      }
    }
  return positions.slice(0, count);
}
export function revivePlayer(player) {
  Object.assign(player, { ...SPAWN, y: 0, vy: 0, yaw: 0, pitch: 0, health: 100, armor: 100 });
  return player;
}
