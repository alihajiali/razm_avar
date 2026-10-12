// Fixture adds access to private game functions only in a temporary test module.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  fixture = fs.mkdtempSync(path.join(root, '.settings-test-'));
let code = fs
  .readFileSync(path.join(root, 'game.js'), 'utf8')
  .replaceAll("'./vendor/", "'../vendor/")
  .replaceAll("'./graphics.mjs'", "'../graphics.mjs'")
  .replaceAll("'./arena.mjs'", "'../arena.mjs'")
  .replaceAll("'./operations.mjs'", "'../operations.mjs'");
code +=
  '\nwindow.testGame={damage:applyDamage,tick:update,killOne:()=>{bots[0].hp=0;},clearMap:()=>{bots.forEach(b=>b.hp=0);time=.01;}};';
fs.writeFileSync(path.join(fixture, 'game.js'), code);
fs.writeFileSync(
  path.join(fixture, 'index.html'),
  fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('href="style.css"', 'href="../style.css"'),
);
const cleanup = () => fs.rmSync(fixture, { recursive: true, force: true });
app.on('will-quit', cleanup);
app
  .whenReady()
  .then(async () => {
    const w = new BrowserWindow({
        width: 1280,
        height: 820,
        show: false,
        webPreferences: { sandbox: true, partition: 'settings-smoke' },
      }),
      errors = [];
    w.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !event.message.includes('pointer')) errors.push(event.message);
    });
    await w.loadFile(path.join(fixture, 'index.html'));
    const run = (s) => w.webContents.executeJavaScript(s);
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await run('Boolean(window.testGame)')) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(await run('Boolean(window.testGame)'), 'Game initialized');
    await run(
      'document.getElementById("difficulty").value="easy";document.getElementById("botcount").value="3";document.getElementById("play").click();void 0',
    );
    let current = await run('sectorZero.snapshot()');
    assert.equal(current.alive, 3);
    assert.equal(current.settings.difficulty, 'easy');
    await run('testGame.killOne();testGame.damage(1000);void 0');
    current = await run('sectorZero.snapshot()');
    assert.equal(current.state, 'playing');
    assert.equal(current.health, 0);
    assert.equal(current.deaths, 1);
    assert.ok(current.respawnTimer > 0);
    assert.equal(current.alive, 2);
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape"}));void 0');
    const paused = await run('sectorZero.snapshot()');
    await run('testGame.tick(1);void 0');
    assert.equal(
      (await run('sectorZero.snapshot()')).respawnTimer,
      paused.respawnTimer,
      'Pause freezes respawn',
    );
    await run(
      'document.getElementById("play").click();for(let i=0;i<121;i++)testGame.tick(.025);void 0',
    );
    current = await run('sectorZero.snapshot()');
    assert.equal(current.health, 100);
    assert.equal(current.armor, 100);
    assert.equal(current.ammo, 30);
    assert.equal(current.deaths, 1);
    assert.equal(current.alive, 2);
    assert.equal(current.position.z, 62);
    assert.ok(current.protection > 0);
    await run('testGame.damage(1000);void 0');
    assert.equal(
      (await run('sectorZero.snapshot()')).health,
      100,
      'Spawn protection prevents damage',
    );
    await run(
      'document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape"}));document.getElementById("difficulty").value="expert";document.getElementById("botcount").value="6";document.getElementById("applysettings").click();void 0',
    );
    current = await run('sectorZero.snapshot()');
    assert.equal(current.alive, 6);
    assert.equal(current.settings.difficulty, 'expert');
    assert.equal(current.deaths, 0);
    assert.equal(current.state, 'playing');
    await run('testGame.clearMap();testGame.tick(.025);void 0');
    current = await run('sectorZero.snapshot()');
    assert.equal(current.state, 'playing', 'Final kill does not end round immediately');
    assert.ok(current.victoryTimer > 2.9, 'Victory countdown starts');
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape"}));void 0');
    const victoryPaused = await run('sectorZero.snapshot()');
    await run('testGame.tick(1);void 0');
    assert.equal(
      (await run('sectorZero.snapshot()')).victoryTimer,
      victoryPaused.victoryTimer,
      'Pause freezes victory countdown',
    );
    await run('document.getElementById("play").click();testGame.tick(1);void 0');
    assert.equal(
      (await run('sectorZero.snapshot()')).state,
      'playing',
      'Round continues during delay',
    );
    await run('testGame.tick(2.1);void 0');
    assert.equal(
      (await run('sectorZero.snapshot()')).state,
      'won',
      'Delayed victory overrides expiring round clock',
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: settings apply, death countdown, pause/resume, revival, retained kills, protection, new round and delayed victory',
    );
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    cleanup();
    app.exit(1);
  });
