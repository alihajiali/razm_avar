import assert from 'node:assert/strict';
import {
  MultiplayerWorld,
  sanitizeInput,
  cleanName,
  rayBox,
  blockedIn,
} from '../multiplayer-world.mjs';
import { MAPS } from '../maps.mjs';
assert.equal(cleanName('  x\n\0y '), 'xy');
assert.equal(cleanName('<script>'), '<script>');
assert.deepEqual(
  sanitizeInput({
    forward: 999,
    right: -999,
    yaw: NaN,
    pitch: Infinity,
    weapon: 999,
    fire: 'true',
  }),
  {
    seq: 0,
    forward: 1,
    right: -1,
    yaw: 0,
    pitch: 0,
    weapon: 3,
    crouch: false,
    walk: false,
    jump: false,
    fire: false,
    reload: false,
    scope: false,
  },
);
assert.equal(
  rayBox({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: [2, 3], y: [0, 2], z: [-1, 1] }),
  2,
);
assert.equal(
  rayBox({ x: 0, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, { x: [2, 3], y: [0, 2], z: [-1, 1] }),
  Infinity,
);
for (const map of Object.keys(MAPS)) {
  const w = new MultiplayerWorld({ map });
  for (let i = 0; i < 8; i++) {
    const p = w.addPlayer('P' + i);
    assert.ok(!blockedIn(w.map, p.x, p.z));
  }
  assert.throws(() => w.addPlayer('ninth'));
  const p = w.players.get('1');
  w.input(p.id, { seq: 1, forward: 1, yaw: 0, x: 9999, health: 9999 });
  w.input(p.id, { seq: 0, forward: -1 });
  assert.equal(p.input.forward, 1);
  for (let i = 0; i < 80; i++) w.tick(0.025);
  assert.ok(!blockedIn(w.map, p.x, p.z));
  assert.ok(p.health <= 100);
  w.removePlayer('1');
  assert.equal(w.players.size, 7);
  console.log(`PASS: ${map} multiplayer spawns, capacity, collision and input ownership`);
}
const w = new MultiplayerWorld({ map: 'dust', random: () => 0.5 }),
  a = w.addPlayer('A'),
  b = w.addPlayer('B');
Object.assign(a, { x: 14, z: 14, y: 0, yaw: 0, pitch: 0, weapon: 0, protection: 0 });
Object.assign(b, { x: 14, z: 6, y: 0, protection: 0 });
a.input = sanitizeInput({ yaw: 0, pitch: 0 });
w.shoot(a);
assert.ok(b.health < 100, 'Authoritative hit');
assert.equal(a.slots[0].ammo, 29);
const health = b.health;
w.shoot(a);
assert.equal(b.health, health, 'Fire rate enforced');
for (let i = 0; i < 10 && b.health > 0; i++) {
  a.cooldown = 0;
  w.shoot(a);
}
assert.equal(b.health, 0);
assert.equal(a.kills, 1);
assert.equal(b.deaths, 1);
assert.equal(b.respawn, 3);
for (let i = 0; i < 121; i++) w.tick(0.025);
assert.equal(b.health, 100);
assert.ok(b.protection > 0);
// Thin cover and wall occlusion are evaluated by the host.
Object.assign(a, { x: 14, z: 22, yaw: -Math.PI / 2, pitch: 0, cooldown: 0, weapon: 2 });
a.input = sanitizeInput({ yaw: -Math.PI / 2 });
Object.assign(b, { x: 30, z: 22, health: 100, armor: 0, protection: 0 });
w.shoot(a);
assert.equal(b.health, 100, 'Crate blocks bullets');
Object.assign(a, { x: 26, z: 10, yaw: -Math.PI / 2, pitch: 0, cooldown: 0 });
Object.assign(b, { x: 38, z: 10, health: 100 });
w.shoot(a);
assert.equal(b.health, 100, 'Wall blocks bullets');
// A press and release between server ticks still produces one semi-automatic shot.
Object.assign(a, { x: 14, z: 14, weapon: 3, cooldown: 0, health: 100 });
a.input = sanitizeInput({ weapon: 3 });
const ammo = a.slots[3].ammo;
w.input(a.id, { seq: 10, weapon: 3, fire: true });
w.input(a.id, { seq: 11, weapon: 3, fire: false });
w.tick(0.025);
assert.equal(a.slots[3].ammo, ammo - 1);
w.tick(0.025);
assert.equal(a.slots[3].ammo, ammo - 1);
a.slots[3] = { ammo: 0, reserve: 2 };
a.cooldown = 0;
w.reload(a);
for (let i = 0; i < 70; i++) w.tick(0.025);
assert.deepEqual(a.slots[3], { ammo: 2, reserve: 0 });
const z = a.z;
w.input(a.id, { seq: 12, forward: 1, weapon: 3 });
for (let i = 0; i < 30; i++) w.tick(0.025);
const stopped = a.z;
for (let i = 0; i < 30; i++) w.tick(0.025);
assert.equal(a.z, stopped, 'Missing input expires');
w.time = 0.01;
w.tick(0.025);
assert.equal(w.phase, 'intermission');
w.time = 0.01;
w.tick(0.025);
assert.equal(w.phase, 'playing');
assert.equal(w.round, 2);
assert.equal(a.kills, 0);
console.log(
  'PASS: authoritative hits, cadence, kills, respawn protection, wall/cover occlusion, tap input, reload, stale input and match rotation',
);
