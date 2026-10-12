import assert from 'node:assert/strict';
import {
  MAPS,
  normalizeMap,
  setMap,
  ACTIVE_MAP,
  GRID,
  TILE,
  SPAWN,
  SITES,
  CRATES,
  BOT_SPAWNS,
  blocked,
  pathTo,
  spawnPositions,
  revivePlayer,
  locationName,
} from '../arena.mjs';
import { SITES as bombSites } from '../operations.mjs';
assert.equal(normalizeMap('unknown'), 'dust');
assert.equal(normalizeMap('__proto__'), 'dust');
const signatures = new Set();
for (const id of Object.keys(MAPS)) {
  setMap(id);
  assert.equal(ACTIVE_MAP.id, id);
  assert.equal(bombSites, SITES, 'Bomb objectives follow the live map');
  assert.ok(
    GRID.every((row) => row.length === GRID[0].length),
    'Rectangular grid',
  );
  assert.ok(GRID[0].split('').every((c) => c === '#'));
  assert.ok(
    GRID.at(-1)
      .split('')
      .every((c) => c === '#'),
  );
  assert.ok(GRID.every((row) => row[0] === '#' && row.at(-1) === '#'));
  signatures.add(GRID.join('\n'));
  assert.ok(!blocked(SPAWN.x, SPAWN.z));
  assert.equal(locationName(SPAWN), 'محل شروع');
  for (const site of SITES) {
    assert.ok(!blocked(site.x, site.z), `${id} ${site.name} clear`);
    assert.ok(pathTo(SPAWN, site).length, `${id} ${site.name} reachable`);
    assert.equal(locationName(site), `محوطهٔ ${site.name}`);
    assert.equal(GRID[Math.floor(site.z / TILE)][Math.floor(site.x / TILE)], site.name);
  }
  for (const count of [1, 12, 24]) {
    const spawns = spawnPositions(count);
    assert.equal(spawns.length, count);
    assert.equal(new Set(spawns.map((p) => `${p.x}:${p.z}`)).size, count);
    for (const p of spawns) {
      assert.ok(!blocked(p.x, p.z, 0.4));
      assert.ok(pathTo(SPAWN, p).length, `${id} bot route`);
      assert.ok(Math.hypot(SPAWN.x - p.x, SPAWN.z - p.z) > 16);
    }
  }
  assert.equal(BOT_SPAWNS.length, 12);
  for (let z = 1; z < GRID.length - 1; z++)
    for (let x = 1; x < GRID[0].length - 1; x++) {
      const p = { x: (x + 0.5) * TILE, z: (z + 0.5) * TILE };
      if (!blocked(p.x, p.z, 0.4) && Math.hypot(p.x - SPAWN.x, p.z - SPAWN.z) > 1)
        assert.ok(pathTo(SPAWN, p).length, `${id} disconnected tile ${x},${z}`);
    }
  for (const [x, z, w, d, h] of CRATES) {
    assert.ok(blocked(x, z), `${id} cover collision`);
    assert.ok(!blocked(x, z, 0.1, h), `${id} can jump over cover`);
  }
  const body = { x: 0, z: 0 };
  revivePlayer(body);
  assert.equal(body.x, SPAWN.x);
  assert.equal(body.z, SPAWN.z);
  console.log(`PASS: ${id} layout, sites, all floor routes, 24 unique spawns, cover and revival`);
}
assert.equal(signatures.size, 5);
setMap('invalid');
assert.equal(ACTIVE_MAP.id, 'dust');
