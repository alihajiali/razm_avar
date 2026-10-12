const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  { installNetworkIPC } = require('../network-ipc.cjs'),
  { GameClient, GameHost } = require('../network.cjs');
const profile = fs.mkdtempSync(path.join(app.getPath('temp'), 'sector-zero-online-'));
app.setPath('userData', profile);
const attach = installNetworkIPC(ipcMain, root),
  wait = (ms) => new Promise((r) => setTimeout(r, ms));
let stage = 'loading';
setTimeout(() => {
  console.error('Test timeout at ' + stage);
  process.exit(1);
}, 120000).unref();
async function until(fn, message, timeout = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(message);
}
function event(emitter, type, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const listener = (value) => {
      if (!predicate(value)) return;
      clearTimeout(timer);
      emitter.removeListener(type, listener);
      resolve(value);
    };
    const timer = setTimeout(() => {
      emitter.removeListener(type, listener);
      reject(Error('Timed out: ' + type));
    }, 5000);
    emitter.on(type, listener);
  });
}
app
  .whenReady()
  .then(async () => {
    const errors = [],
      w = new BrowserWindow({
        width: 1280,
        height: 820,
        show: false,
        webPreferences: {
          preload: path.join(root, 'preload.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          partition: 'online-runtime',
        },
      }),
      service = attach(w),
      guest = new GameClient();
    let remoteHost;
    w.webContents.on('console-message', (e) => {
      if (e.level === 'error' && !/pointer|EGL/.test(e.message)) errors.push(e.message);
    });
    const run = (s) => w.webContents.executeJavaScript(s);
    try {
      await w.loadFile(path.join(root, 'index.html'));
      await until(
        () => run('Boolean(window.sectorZero&&window.sectorNetwork)'),
        'Game failed to load',
      );
      stage = 'host';
      await run(
        `document.getElementById('map').value='mirage';document.getElementById('map').dispatchEvent(new Event('change'));document.getElementById('network-open').click();document.getElementById('player-name').value='Host Ali';document.getElementById('server-name').value='Friends Room';document.getElementById('server-port').value='0';document.getElementById('server-capacity').value='2';document.getElementById('network-host').click();void 0`,
      );
      await until(() => run('sectorZero.snapshot().online.active'), 'Host UI did not connect');
      let current = await run('sectorZero.snapshot()');
      assert.equal(current.map, 'mirage');
      assert.ok(current.online.hosting);
      assert.equal(current.alive, 0);
      const id = current.online.id;
      const peer = await guest.connect('127.0.0.1:' + service.host.port, 'Guest Sara');
      await until(() => run('sectorZero.snapshot().online.remotes===1'), 'Peer not rendered');
      console.log('PASS: host UI and live peer replication');
      stage = 'combat';
      const world = service.host.world,
        p1 = world.players.get(id),
        p2 = world.players.get(peer.id);
      Object.assign(p1, { x: 18, z: 22, y: 0, protection: 0 });
      Object.assign(p2, { x: 18, z: 14, y: 0, protection: 0 });
      await wait(200);
      await run(
        `if(sectorZero.snapshot().state!=='playing')document.getElementById('play').click();Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.getElementById('game')});document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit3'}));void 0`,
      );
      await until(async () => p1.weapon === 2 && p1.cooldown === 0, 'Weapon not ready');
      const killed = event(
        guest,
        'snapshot',
        (s) => s.players.find((p) => p.id === peer.id)?.deaths === 1,
      );
      await run(
        `document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:0}));document.dispatchEvent(new MouseEvent('mouseup'));void 0`,
      );
      await killed;
      await until(() => run('sectorZero.snapshot().wins===1'), 'Score did not replicate');
      await event(
        guest,
        'snapshot',
        (s) => s.players.find((p) => p.id === peer.id)?.generation === 2,
      );
      console.log('PASS: rendered PvP shot, kill, score and peer respawn');
      stage = 'scoreboard';
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'Tab'}));void 0`);
      assert.ok(await run(`!document.getElementById('scoreboard').hidden`));
      assert.ok(
        (await run(`document.getElementById('score-rows').textContent`)).includes('Guest Sara'),
      );
      await wait(100);
      fs.writeFileSync(
        '/private/tmp/sector-zero-online-scoreboard.png',
        (await w.webContents.capturePage()).toPNG(),
      );
      await run(
        `document.dispatchEvent(new KeyboardEvent('keyup',{code:'Tab'}));document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));void 0`,
      );
      assert.equal((await run('sectorZero.snapshot()')).state, 'paused');
      const time = world.time;
      await until(() => world.time < time, 'Server continues during menu');
      stage = 'host leave';
      const disconnected = event(guest, 'disconnect');
      await run(`document.getElementById('network-leave').click();void 0`);
      await disconnected;
      await until(() => run('!sectorZero.snapshot().online.active'), 'Host did not leave');
      assert.ok((await run('sectorZero.snapshot()')).alive > 0);
      stage = 'server browser';
      remoteHost = await GameHost.start({ port: 0, map: 'train', serverName: 'Remote Depot' });
      await guest.connect('127.0.0.1:' + remoteHost.port, 'Depot Peer');
      await run(
        `document.getElementById('network-open').click();document.getElementById('network-scan').click();void 0`,
      );
      await until(
        () => run(`!document.getElementById('network-scan').disabled`),
        'Scan did not finish',
      );
      assert.ok(
        (await run(`document.getElementById('server-list').textContent`)).includes('Remote Depot'),
      );
      fs.writeFileSync(
        '/private/tmp/sector-zero-online-browser.png',
        (await w.webContents.capturePage()).toPNG(),
      );
      await run(`document.querySelector('#server-list button').click();void 0`);
      await until(() => run('sectorZero.snapshot().online.active'), 'Browser join failed');
      current = await run('sectorZero.snapshot()');
      assert.equal(current.map, 'train');
      assert.ok(!current.online.hosting);
      await until(
        () => run('sectorZero.snapshot().online.remotes===1'),
        'Remote depot peer not rendered',
      );
      stage = 'client controls';
      const local = remoteHost.world.players.get(current.online.id);
      Object.assign(local, { x: 50, z: 70, y: 0 });
      await wait(150);
      await run(
        `if(sectorZero.snapshot().state!=='playing')document.getElementById('play').click();document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}));void 0`,
      );
      await wait(200);
      await run(`document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));void 0`);
      assert.ok(local.z < 70, 'Client input moves authoritative player');
      await run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'Space'}));void 0`);
      await wait(100);
      assert.ok(local.y > 0, 'Online jump');
      await run(`document.dispatchEvent(new KeyboardEvent('keyup',{code:'Space'}));void 0`);
      stage = 'remote shutdown';
      await remoteHost.stop();
      await until(() => run('!sectorZero.snapshot().online.active'), 'Remote shutdown not handled');
      assert.equal((await run('sectorZero.snapshot()')).state, 'menu');
      await run(
        `document.getElementById('network-open').click();document.getElementById('server-address').value='127.0.0.1:1';document.getElementById('network-join').click();void 0`,
      );
      await until(
        () => run(`!document.getElementById('network-join').disabled`),
        'Error left UI busy',
      );
      assert.ok(
        (await run(`document.getElementById('network-message').textContent`)).includes('پورت'),
      );
      assert.deepEqual(errors, []);
      console.log(
        'PASS: sandboxed UI, LAN browser, joining another host/map, remote models, controls, scoreboard, live menu, departures, solo restoration and errors',
      );
    } catch (error) {
      console.error('Failed at ' + stage, error, errors, service.host?.world.snapshot());
      console.error('Renderer state', await run('sectorZero.snapshot()'));
      throw error;
    } finally {
      stage = 'cleanup';
      guest.close();
      await remoteHost?.stop();
      await service.close();
      console.log('PASS: network cleanup');
      await run(`delete document.pointerLockElement;void 0`);
      w.destroy();
      console.log('PASS: window cleanup');
    } // Electron can stall its native shutdown after destroying the test window on macOS.
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
