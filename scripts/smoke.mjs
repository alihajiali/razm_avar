import assert from 'node:assert/strict';
import {
  GRID,
  TILE,
  SPAWN,
  BOT_SPAWNS,
  WEAPONS,
  CRATES,
  blocked,
  moveBody,
  pathTo,
  loadouts,
  finishReload,
} from '../arena.mjs';
assert.ok(
  GRID.every((row) => row.length === GRID[0].length),
  'Map must be rectangular',
);
assert.ok(!blocked(SPAWN.x, SPAWN.z), 'Spawn must be clear');
for (const bot of BOT_SPAWNS) {
  assert.ok(!blocked(bot.x, bot.z), 'Bot spawn must be clear');
  assert.ok(pathTo(SPAWN, bot).length, 'Every bot must be reachable');
}
for (const [x, z] of [
  [50, 10],
  [34, 46],
  [16, 30],
])
  assert.ok(pathTo(SPAWN, { x, z }).length, 'Sites and tunnels must be reachable');
const body = { x: 5, z: 6, y: 0 };
moveBody(body, -2, 0);
assert.equal(body.x, 5, 'Outer wall blocks movement');
moveBody(body, 1, 0);
assert.equal(body.x, 6, 'Clear ground permits movement');
for (const [x, z, w, d, h] of CRATES) {
  assert.ok(blocked(x, z), 'Crate blocks movement');
  assert.ok(!blocked(x, z, 0.1, h), 'Body above crate clears it');
}
const slots = loadouts();
slots[0].ammo = 7;
slots[0].reserve = 5;
assert.equal(finishReload(slots[0], WEAPONS[0]), 5);
assert.deepEqual(slots[0], { ammo: 12, reserve: 0 }, 'Reload preserves ammo and respects reserve');
assert.equal(slots[1].ammo, 30, 'Weapon ammo remains independent');
assert.ok(WEAPONS[2].damage >= 100, 'AWP is lethal on torso');
assert.equal(WEAPONS[3].automatic, false);
assert.notEqual(WEAPONS[0].rate, WEAPONS[1].rate);
console.log(
  'PASS: map, spawns, routes, wall/crate collision, independent ammo, reload conservation and weapon differences',
);

const { normalizeSettings, spawnPositions, MAX_BOTS, DIFFICULTIES, revivePlayer } =
  await import('../arena.mjs');
assert.deepEqual(normalizeSettings({ count: 999, difficulty: 'invalid' }), {
  count: MAX_BOTS,
  difficulty: 'normal',
});
assert.equal(normalizeSettings({ count: -2 }).count, 1);
assert.equal(normalizeSettings({ count: 'bad' }).count, 12);
for (const count of [1, 6, 12, 24]) {
  const positions = spawnPositions(count);
  assert.equal(positions.length, count);
  assert.equal(new Set(positions.map((p) => `${p.x},${p.z}`)).size, count);
  for (const p of positions) {
    assert.ok(!blocked(p.x, p.z, 0.4));
    assert.ok(pathTo(SPAWN, p).length);
  }
}
assert.ok(DIFFICULTIES.easy.damage < DIFFICULTIES.expert.damage);
assert.ok(DIFFICULTIES.easy.interval > DIFFICULTIES.hard.interval);
const dead = { x: 40, z: 20, y: 1, vy: 4, yaw: 2, pitch: 0.5, health: 0, armor: 0 };
revivePlayer(dead);
assert.equal(dead.health, 100);
assert.equal(dead.armor, 100);
assert.equal(dead.x, SPAWN.x);
assert.equal(dead.z, SPAWN.z);
assert.equal(dead.vy, 0);
console.log('PASS: settings bounds, unique reachable spawns, difficulty profiles and revival');
