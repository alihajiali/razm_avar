const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.join(__dirname, '..'),
  fixture = fs.mkdtempSync(path.join(root, '.operations-test-'));
let code = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
for (const name of ['vendor/three.module.js', 'graphics.mjs', 'arena.mjs', 'operations.mjs'])
  code = code.replaceAll(`'./${name}'`, `'../${name}'`);
code += `\nwindow.testOps={tick:update,utilities:tickUtilities,throw:throwGrenade,teleport:(x,z)=>{player.x=x;player.z=z;},clear:()=>bots.forEach(b=>{b.hp=0;}),quiet:()=>bots.forEach(b=>b.attack=9999),finish:endRound,bomb:()=>bomb,hold:(v)=>keys.KeyE=v,detonate:(type,x,z)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.1),new THREE.MeshBasicMaterial());mesh.position.set(x,1.6,z);detonate({mesh,type});}};`;
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
        width: 1280,
        height: 900,
        show: false,
        webPreferences: { sandbox: true, partition: 'operations-smoke' },
      });
    w.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !/pointer|EGL/.test(event.message)) errors.push(event.message);
    });
    await w.loadFile(path.join(fixture, 'index.html'));
    const run = (s) => w.webContents.executeJavaScript(s);
    for (let i = 0; i < 60; i++) {
      if (await run('Boolean(window.testOps)')) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(await run('Boolean(window.testOps)'));
    await run(
      `document.getElementById('economy').value='shop';document.getElementById('botcount').value=3;document.getElementById('play').click();testOps.quiet();void 0`,
    );
    let snap = await run('sectorZero.snapshot()');
    assert.equal(snap.weapon, 'Desert Eagle');
    assert.deepEqual(snap.owned, [false, false, false, true]);
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'Digit3'}));void 0`);
    assert.equal((await run('sectorZero.snapshot()')).weapon, 'Desert Eagle');
    await run(`document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB'}));void 0`);
    assert.equal((await run('sectorZero.snapshot()')).shopOpen, true);
    await run(
      `document.querySelector('#shop-items button').click();document.getElementById('shop-close').click();void 0`,
    );
    snap = await run('sectorZero.snapshot()');
    assert.equal(snap.money, 600);
    assert.ok(snap.owned[0]);
    assert.equal(snap.state, 'playing');
    await run(`testOps.throw('smoke');testOps.utilities(1.5);void 0`);
    snap = await run('sectorZero.snapshot()');
    assert.equal(snap.inventory.smoke, 0);
    assert.equal(snap.clouds, 1);
    await run(`testOps.utilities(13);void 0`);
    assert.equal((await run('sectorZero.snapshot()')).clouds, 0);
    await run(`const b=sectorZero.snapshot().bots[0];testOps.detonate('flash',b.x,b.z);void 0`);
    assert.ok((await run('sectorZero.snapshot()')).bots[0].blind > 0);
    await run(
      `document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape'}));document.getElementById('mode').value='bomb';document.getElementById('bomb-role').value='plant';document.getElementById('applysettings').click();testOps.clear();testOps.teleport(50,10);testOps.hold(true);for(let i=0;i<121;i++)testOps.tick(.025);testOps.hold(false);void 0`,
    );
    snap = await run('sectorZero.snapshot()');
    assert.ok(snap.bomb.planted);
    assert.equal(snap.state, 'playing');
    await run('testOps.bomb().fuse=.01;testOps.tick(.025);void 0');
    assert.equal((await run('sectorZero.snapshot()')).state, 'won');
    assert.ok(await run('!document.getElementById("report").hidden'));
    await run(
      `document.getElementById('bomb-role').value='defuse';document.getElementById('play').click();testOps.clear();const site=testOps.bomb().site;testOps.teleport(site.x,site.z);testOps.hold(true);for(let i=0;i<201;i++)testOps.tick(.025);testOps.hold(false);void 0`,
    );
    assert.equal((await run('sectorZero.snapshot()')).state, 'won');
    await run(
      `document.getElementById('mode').value='survival';document.getElementById('play').click();testOps.clear();testOps.tick(.025);testOps.tick(3);void 0`,
    );
    assert.ok((await run('sectorZero.snapshot()')).intermission > 0);
    await run('testOps.tick(8);void 0');
    snap = await run('sectorZero.snapshot()');
    assert.equal(snap.wave, 2);
    assert.equal(snap.alive, 5);
    assert.equal(new Set(snap.bots.map((b) => b.role)).size, 4);
    fs.writeFileSync(
      '/private/tmp/sector-zero-operations.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, []);
    console.log(
      'PASS: shop ownership/funds, smoke lifetime, flash blindness, bomb planting/explosion/defusal, report, survival intermission and enemy roles',
    );
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    clean();
    app.exit(1);
  });
