import assert from 'node:assert/strict';
import {
  buyItem,
  smokeBlocks,
  grenadeDamage,
  challengeDone,
  newStats,
  waveCount,
  SITES,
} from '../operations.mjs';
import { blocked, pathTo, SPAWN } from '../arena.mjs';
assert.deepEqual(buyItem(2400, 'ak'), { ok: true, money: 600 });
assert.deepEqual(buyItem(200, 'awp'), { ok: false, money: 200 });
assert.deepEqual(buyItem(1000, 'invalid'), { ok: false, money: 1000 });
assert.equal(grenadeDamage(0), 140);
assert.equal(grenadeDamage(9), 0);
assert.equal(grenadeDamage(20), 0);
assert.ok(smokeBlocks({ x: 0, z: 0 }, { x: 10, z: 0 }, [{ x: 5, z: 1, radius: 2 }]));
assert.ok(!smokeBlocks({ x: 0, z: 0 }, { x: 10, z: 0 }, [{ x: 15, z: 0, radius: 2 }]));
assert.ok(smokeBlocks({ x: 0, z: 0 }, { x: 0, z: 0 }, [{ x: 0, z: 0, radius: 2 }]));
assert.ok(!challengeDone('heads', newStats(), 0, true));
assert.ok(challengeDone('heads', { headshots: 5 }, 2, false));
assert.ok(challengeDone('clean', newStats(), 0, true));
assert.ok(!challengeDone('clean', newStats(), 1, true));
assert.ok(!challengeDone('pistol', newStats(), 0, true));
assert.ok(challengeDone('pistol', { pistolOnly: true, kills: 2 }, 1, true));
assert.equal(waveCount(12, 20), 24);
assert.equal(waveCount(3, 2), 5);
for (const site of SITES) {
  assert.ok(!blocked(site.x, site.z));
  assert.ok(pathTo(SPAWN, site).length);
}
console.log(
  'PASS: purchase funds, blast falloff, smoke intersection, challenges, waves and reachable bomb sites',
);
