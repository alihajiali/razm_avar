const assert = require('node:assert/strict'),
  net = require('node:net');
const {
  GameHost,
  GameClient,
  NetworkSession,
  discoverServers,
  endpoint,
} = require('../network.cjs');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function event(emitter, type, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const listener = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      emitter.removeListener(type, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      emitter.removeListener(type, listener);
      reject(Error('Timed out waiting for ' + type));
    }, timeout);
    emitter.on(type, listener);
  });
}
(async () => {
  assert.deepEqual(endpoint('127.0.0.1:27777'), { host: '127.0.0.1', port: 27777 });
  assert.throws(() => endpoint('file:///etc/passwd'));
  assert.throws(() => endpoint('localhost:999999'));
  assert.throws(() => endpoint('localhost:22'));
  const hosts = [],
    clients = [];
  try {
    const host = await GameHost.start({
      map: 'dust',
      port: 0,
      maxPlayers: 2,
      serverName: 'Test Room',
    });
    hosts.push(host);
    const address = '127.0.0.1:' + host.port;
    const a = new GameClient(),
      b = new GameClient();
    clients.push(a, b);
    const wa = await a.connect(address, 'Ali'),
      wb = await b.connect(address, 'Guest');
    assert.notEqual(wa.id, wb.id);
    assert.equal(wa.map, 'dust');
    const initial = await event(a, 'snapshot', (s) => s.players.length === 2);
    assert.equal(initial.scores.length, 2);
    const full = new GameClient();
    clients.push(full);
    await assert.rejects(full.connect(address, 'Third'), /پر/);
    const found = await discoverServers({ timeout: 1400 });
    assert.ok(
      found.some((s) => s.id === host.id && s.players === 2 && s.name === 'Test Room'),
      'LAN discovery finds live host',
    );
    const pa = host.world.players.get(wa.id),
      pb = host.world.players.get(wb.id);
    Object.assign(pa, { x: 14, z: 14, y: 0, health: 100, protection: 0 });
    Object.assign(pb, { x: 14, z: 6, y: 0, health: 100, protection: 0 });
    a.input({ seq: 1, weapon: 2, yaw: 0, pitch: 0, scope: true });
    await wait(350);
    const kill = event(b, 'snapshot', (s) =>
      s.events.some((e) => e.type === 'kill' && e.target === wb.id),
    );
    a.input({ seq: 2, weapon: 2, yaw: 0, pitch: 0, scope: true, fire: true });
    a.input({ seq: 3, weapon: 2, yaw: 0, pitch: 0, scope: true, fire: false });
    const dead = await kill;
    assert.equal(dead.players.find((p) => p.id === wb.id).health, 0);
    assert.equal(dead.players.find((p) => p.id === wa.id).kills, 1);
    const revived = await event(
      b,
      'snapshot',
      (s) => s.players.find((p) => p.id === wb.id)?.generation === 2,
    );
    assert.equal(revived.players.find((p) => p.id === wb.id).health, 100);
    const hostile = net.createConnection({ host: '127.0.0.1', port: host.port });
    await event(hostile, 'connect');
    const closed = event(hostile, 'close');
    hostile.write('x'.repeat(3000) + '\n');
    await closed;
    const invalid = net.createConnection({ host: '127.0.0.1', port: host.port });
    await event(invalid, 'connect');
    const rejected = event(invalid, 'data', (s) => s.toString().includes('error'));
    invalid.write(JSON.stringify({ type: 'hello', version: 999 }) + '\n');
    await rejected;
    invalid.destroy();
    const second = await GameHost.start({ map: 'train', port: 0, maxPlayers: 2 });
    hosts.push(second);
    const c = new GameClient();
    clients.push(c);
    await c.connect('127.0.0.1:' + second.port, 'Train');
    assert.equal(host.world.map.id, 'dust');
    assert.equal(second.world.map.id, 'train');
    const disconnect = event(a, 'disconnect');
    await host.stop();
    await disconnect;
    const replacement = await GameHost.start({ port: host.port });
    hosts.push(replacement);
    await replacement.stop();
    console.log(
      'PASS: TCP handshake, unique players, capacity, LAN discovery, replicated PvP headshot/kill/respawn, malformed input, version mismatch, map isolation and shutdown/rebind',
    );
  } finally {
    clients.forEach((c) => c.close());
    await Promise.all(hosts.map((h) => h.stop()));
  }
  const owner = new NetworkSession(),
    guest = new NetworkSession();
  try {
    const info = await owner.hostGame({ port: 0, map: 'mirage', playerName: 'Host' });
    assert.ok(info.hosting);
    assert.ok(Array.isArray(info.addresses));
    const peer = await guest.joinGame({ address: '127.0.0.1:' + info.port, playerName: 'Peer' });
    assert.equal(peer.map, 'mirage');
    const snapshot = await event(
      owner,
      'event',
      (s) => s.type === 'snapshot' && s.players.length === 2,
    );
    assert.equal(snapshot.map, 'mirage');
    const lost = event(guest, 'event', (s) => s.type === 'disconnect');
    await owner.leave();
    await lost;
    console.log('PASS: player-hosted session, peer join and host departure propagation');
  } finally {
    await owner.close();
    await guest.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
