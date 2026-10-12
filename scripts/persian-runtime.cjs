// env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron scripts/persian-runtime.cjs
const { app, BrowserWindow } = require('electron');
const path = require('node:path'),
  fs = require('node:fs'),
  assert = require('node:assert/strict');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let stage = 'loading';
const watchdog = setTimeout(() => {
  console.error('Timeout: ' + stage);
  process.exit(1);
}, 60000);
async function until(fn, msg) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await fn()) return;
    await wait(100);
  }
  throw Error(msg);
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
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
          partition: 'persian-voice-test',
        },
      });
    w.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !/pointer|EGL/.test(event.message)) errors.push(event.message);
    });
    const run = (s) => w.webContents.executeJavaScript(s, true);
    await w.loadFile(path.join(__dirname, '../index.html'));
    await until(() => run('!!window.sectorZero'), 'Game initialization');
    stage = 'Persian UI';
    assert.ok((await run('document.title')).startsWith('رزم‌آور'));
    assert.equal(await run(`document.getElementById('player-name').value`), 'آرش');
    const state = await run('sectorZero.snapshot()');
    assert.equal(state.bots[0].name, 'رستم');
    assert.equal(new Set(state.bots.map((b) => b.name)).size, 12);
    stage = 'audio';
    await run(`document.getElementById('voice-preview').click();void 0`);
    await until(
      () => run('sectorZero.snapshot().voice.currentTime>.2'),
      'Bundled Persian audio not playing',
    );
    assert.match((await run('sectorZero.snapshot()')).voice.subtitle, /حریفت منم/);
    await run(`document.getElementById('sound').click();void 0`);
    assert.ok((await run('sectorZero.snapshot()')).voice.muted);
    assert.ok(!(await run('sectorZero.snapshot()')).voice.playing);
    await run(
      `document.getElementById('sound').click();document.getElementById('voice-volume').value='35';document.getElementById('voice-volume').dispatchEvent(new Event('input'));document.getElementById('voice-enabled').click();void 0`,
    );
    assert.equal((await run('sectorZero.snapshot()')).voice.volume, 0.35);
    assert.ok(!(await run('sectorZero.snapshot()')).voice.enabled);
    stage = 'reload preferences';
    await w.reload();
    await until(() => run('!!window.sectorZero'), 'Reload failed');
    assert.equal((await run('sectorZero.snapshot()')).voice.volume, 0.35);
    assert.ok(!(await run('sectorZero.snapshot()')).voice.enabled);
    await run(
      `document.getElementById('voice-enabled').click();document.getElementById('voice-preview').click();void 0`,
    );
    await until(() => run('sectorZero.snapshot().voice.currentTime>.2'), 'Audio after reload');
    fs.writeFileSync(
      '/private/tmp/razm-avar-menu.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    stage = 'gameplay';
    await run(`document.getElementById('play').click();void 0`);
    assert.equal((await run('sectorZero.snapshot()')).state, 'playing');
    await wait(300);
    fs.writeFileSync(
      '/private/tmp/razm-avar-game.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: Persian branding, Iranian opponent names, real offline audio playback, mute, volume, saved voice preferences, reload and gameplay',
    );
    clearTimeout(watchdog);
    app.quit();
  })
  .catch((e) => {
    console.error(stage, e);
    process.exit(1);
  });
