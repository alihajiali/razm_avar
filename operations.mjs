export const MODES = { clear: 'پاک‌سازی', bomb: 'عملیات بمب', survival: 'بقا' };
export { SITES } from './arena.mjs';
export const PRICES = [1800, 2200, 3500, 700];
export const CHALLENGES = [
  { id: 'heads', label: '۵ تیر به سر در یک راند', goal: 5 },
  { id: 'clean', label: 'برد بدون مرگ', goal: 1 },
  { id: 'pistol', label: 'برد فقط با کلت', goal: 1 },
];
export function newStats() {
  return { shots: 0, hits: 0, kills: 0, headshots: 0, elapsed: 0, pistolOnly: true };
}
export function challengeDone(id, stats, deaths, won) {
  return id === 'heads'
    ? stats.headshots >= 5
    : id === 'clean'
      ? won && deaths === 0
      : won && stats.pistolOnly && stats.kills > 0;
}
export function grenadeDamage(distance) {
  return Math.max(0, Math.round(140 * (1 - distance / 9)));
}
export function smokeBlocks(from, to, clouds) {
  const dx = to.x - from.x,
    dz = to.z - from.z,
    len = dx * dx + dz * dz;
  return clouds.some((c) => {
    const t = len ? Math.max(0, Math.min(1, ((c.x - from.x) * dx + (c.z - from.z) * dz) / len)) : 0;
    return Math.hypot(from.x + t * dx - c.x, from.z + t * dz - c.z) < c.radius;
  });
}
export function buyItem(wallet, item) {
  const prices = {
    ak: 1800,
    m4: 2200,
    awp: 3500,
    deagle: 700,
    armor: 650,
    ammo: 300,
    he: 300,
    flash: 200,
    smoke: 300,
  };
  return Object.hasOwn(prices, item) && wallet >= prices[item]
    ? { ok: true, money: wallet - prices[item] }
    : { ok: false, money: wallet };
}
export function waveCount(base, wave) {
  return Math.min(24, base + (wave - 1) * 2);
}
