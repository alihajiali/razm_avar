// Real WebGL integration test with private hooks confined to a disposable fixture.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  fixture = fs.mkdtempSync(path.join(root, '.maps-test-'));
let code = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
for (const name of ['vendor/three.module.js', 'graphics.mjs', 'arena.mjs', 'operations.mjs'])
  code = code.replaceAll(`'./${name}'`, `'../${name}'`);
code += `\nwindow.testMaps={tick:update,pause,clear:()=>bots.forEach(b=>b.hp=0),quiet:()=>bots.forEach(b=>b.attack=9999),finish:endRound,move:(x,z)=>{player.x=x;player.z=z;player.yaw=0;player.pitch=0;},hold:v=>keys.KeyE=v,fuse:v=>bomb.fuse=v,damage:applyDamage};`;
fs.writeFileSync(path.join(fixture, 'game.js'), code);
fs.writeFileSync(
  path.join(fixture, 'index.html'),
  fs
    .readFileSync(path.join(root, 'index.html'), 'utf8')
    .replace('href="style.css"', 'href="../style.css"'),
);
const clean = () => fs.rmSync(fixture, { recursive: true, force: true });
app.on('will-quit', clean);
app
  .whenReady()
  .then(async () => {
    const errors = [],
      w = new BrowserWindow({
        width: 1440,
        height: 1000,
        show: false,
        webPreferences: { sandbox: true, partition: 'maps-smoke' },
      });
    w.webContents.on('console-message', (e) => {
      if (e.level === 'error' && !/pointer|EGL/.test(e.message)) errors.push(e.message);
    });
    const run = (s) => w.webContents.executeJavaScript(s),
      wait = (ms) => new Promise((r) => setTimeout(r, ms));
    async function ready() {
      for (let i = 0; i < 80; i++) {
        if (await run('Boolean(window.testMaps)')) return;
        await wait(150);
      }
      throw Error('Game did not initialize');
    }
    await w.loadFile(path.join(fixture, 'index.html'));
    await ready();
    await wait(100);
    assert.equal(await run('document.getElementById("map").options.length'), 5);
    const baseline = (await run('sectorZero.snapshot()')).memory;
    assert.ok(
      await run('document.getElementById("viewport").getBoundingClientRect().bottom<=innerHeight'),
      'HUD fits window height',
    );
    for (const id of ['dust', 'mirage', 'inferno', 'nuke', 'train']) {
      await run(
        `testMaps.pause();document.getElementById('map').value=${JSON.stringify(id)};document.getElementById('map').dispatchEvent(new Event('change'));document.getElementById('mode').value='clear';document.getElementById('botcount').value=3;document.getElementById('applysettings').click();testMaps.quiet();void 0`,
      );
      await wait(100);
      let snap = await run('sectorZero.snapshot()');
      assert.equal(snap.map, id);
      assert.equal(snap.worldCount, 1);
      assert.equal(snap.alive, 3);
      assert.equal(snap.state, 'playing');
      assert.ok(snap.renderer.triangles > 1000);
      assert.ok(snap.colliderCount > 100);
      const start = snap.position;
      await run('testMaps.damage(1000);testMaps.tick(3.1);void 0');
      snap = await run('sectorZero.snapshot()');
      assert.equal(snap.position.x, start.x);
      assert.equal(snap.position.z, start.z);
      assert.equal(snap.health, 100);
      await run('testMaps.clear();testMaps.tick(.025);testMaps.tick(3.1);void 0');
      assert.equal((await run('sectorZero.snapshot()')).state, 'won');
      for (const role of ['plant', 'defuse']) {
        await run(
          `document.getElementById('mode').value='bomb';document.getElementById('bomb-role').value=${JSON.stringify(role)};document.getElementById('play').click();testMaps.clear();void 0`,
        );
        snap = await run('sectorZero.snapshot()');
        const site = role === 'plant' ? snap.sites[0] : snap.bomb.site;
        await run(
          `testMaps.move(${site.x},${site.z});testMaps.hold(true);for(let i=0;i<${role === 'plant' ? 121 : 201};i++)testMaps.tick(.025);testMaps.hold(false);void 0`,
        );
        if (role === 'plant') {
          assert.ok((await run('sectorZero.snapshot()')).bomb.planted);
          await run('testMaps.fuse(.01);testMaps.tick(.025);void 0');
        }
        assert.equal((await run('sectorZero.snapshot()')).state, 'won');
      }
      await run(
        `document.getElementById('mode').value='survival';document.getElementById('play').click();testMaps.clear();testMaps.tick(.025);testMaps.tick(3.1);testMaps.tick(8);testMaps.quiet();void 0`,
      );
      snap = await run('sectorZero.snapshot()');
      assert.equal(snap.wave, 2);
      assert.equal(snap.alive, 5);
      assert.equal(snap.map, id);
      const views = {
        dust: [14, 62],
        mirage: [46, 42],
        inferno: [46, 42],
        nuke: [22, 26],
        train: [26, 26],
      };
      await run(`testMaps.move(${views[id][0]},${views[id][1]});void 0`);
      await wait(120);
      fs.writeFileSync(
        `/private/tmp/sector-zero-map-${id}.png`,
        (await w.webContents.capturePage()).toPNG(),
      );
      await run('testMaps.finish(false,"تست نقشه");void 0');
      const saved = await run('JSON.parse(localStorage.getItem("sector-zero-records"))');
      for (const mode of ['clear', 'bomb', 'survival']) assert.ok(saved[`${id}:${mode}`]);
      console.log(
        `PASS: ${id} render, respawn, clear, plant, defuse, survival and per-map records`,
      );
    }
    // A pending selection must not alter a paused round; applying starts a fresh map.
    await run(
      `document.getElementById('mode').value='clear';document.getElementById('play').click();testMaps.pause();document.getElementById('map').value='dust';document.getElementById('map').dispatchEvent(new Event('change'));document.getElementById('play').click();void 0`,
    );
    assert.equal((await run('sectorZero.snapshot()')).map, 'train');
    await run('testMaps.pause();document.getElementById("applysettings").click();void 0');
    await wait(100);
    let snap = await run('sectorZero.snapshot()');
    assert.equal(snap.map, 'dust');
    assert.equal(snap.worldCount, 1);
    assert.ok(
      snap.memory.geometries <= baseline.geometries + 10,
      `Geometry leak: ${JSON.stringify({ baseline, current: snap.memory })}`,
    );
    assert.ok(snap.memory.textures <= baseline.textures + 2, 'Textures released on map switch');
    await run(
      `testMaps.pause();document.getElementById('map').value='nuke';document.getElementById('applysettings').click();testMaps.pause();void 0`,
    );
    await new Promise((resolve) => {
      w.webContents.once('did-finish-load', resolve);
      w.reload();
    });
    await ready();
    await wait(150);
    snap = await run('sectorZero.snapshot()');
    assert.equal(snap.map, 'nuke');
    assert.equal(await run('document.getElementById("map").value'), 'nuke');
    fs.writeFileSync(
      '/private/tmp/sector-zero-map-menu.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: selection/apply/resume, saved map reload, world disposal and stable GPU resources',
    );
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    clean();
    app.exit(1);
  });
