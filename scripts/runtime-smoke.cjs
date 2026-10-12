// Run with: env -u ELECTRON_RUN_AS_NODE node_modules/.bin/electron scripts/runtime-smoke.cjs
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
app
  .whenReady()
  .then(async () => {
    const errors = [];
    const w = new BrowserWindow({
      width: 1280,
      height: 820,
      show: false,
      webPreferences: { sandbox: true, partition: 'runtime-smoke' },
    });
    w.webContents.on('console-message', (event) => {
      if (event.level === 'error' && !event.message.includes('pointer')) errors.push(event.message);
    });
    await w.loadFile(path.join(__dirname, '../index.html'));
    await new Promise((r) => setTimeout(r, 1800));
    const run = (script) => w.webContents.executeJavaScript(script);
    const menu = await run('window.sectorZero?.snapshot()');
    assert.ok(menu, '3D game initialized');
    assert.ok(menu.renderer.triangles > 100, 'Actual geometry rendered');
    assert.equal(menu.alive, 12);
    assert.equal(menu.materials, 8, 'New texture atlases loaded');
    assert.ok(menu.characters.triangles > 4000, 'Detailed human model loaded');
    fs.writeFileSync(
      '/private/tmp/sector-zero-dust-menu.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    await run('document.getElementById("play").click()');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal((await run('sectorZero.snapshot()')).state, 'playing');
    fs.writeFileSync(
      '/private/tmp/sector-zero-dust-ak47.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyW"}))');
    await new Promise((r) => setTimeout(r, 250));
    await run('document.dispatchEvent(new KeyboardEvent("keyup",{code:"KeyW"}))');
    const moved = await run('sectorZero.snapshot()');
    assert.ok(moved.position.z < 62, 'Forward movement works');
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit3"}))');
    assert.equal((await run('sectorZero.snapshot()')).weapon, 'AWP');
    // Simulate pointer capture for deterministic mouse event tests in a hidden window.
    await run(
      'Object.defineProperty(document,"pointerLockElement",{configurable:true,get:()=>document.getElementById("game")});void 0',
    );
    await run(
      'document.getElementById("game").dispatchEvent(new MouseEvent("mousedown",{button:2}))',
    );
    assert.equal((await run('sectorZero.snapshot()')).scoped, true, 'Scope toggles');
    await new Promise((r) => setTimeout(r, 400));
    fs.writeFileSync(
      '/private/tmp/sector-zero-dust-scope.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    await run(
      'document.getElementById("game").dispatchEvent(new MouseEvent("mousedown",{button:0}));document.dispatchEvent(new MouseEvent("mouseup"))',
    );
    assert.equal((await run('sectorZero.snapshot()')).ammo, 9, 'Shooting consumes ammo');
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"KeyR"}))');
    assert.ok((await run('sectorZero.snapshot()')).reloading > 0, 'Reload starts');
    await new Promise((r) => setTimeout(r, 3500));
    const loaded = await run('sectorZero.snapshot()');
    assert.equal(loaded.ammo, 10, 'Reload fills magazine');
    assert.equal(loaded.reserve, 29, 'Reload draws from reserve');

    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Digit4"}))');
    assert.equal((await run('sectorZero.snapshot()')).weapon, 'Desert Eagle');
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Space"}))');
    await new Promise((r) => setTimeout(r, 80));
    assert.ok((await run('sectorZero.snapshot()')).position.y > 0, 'Jump works');
    await new Promise((r) => setTimeout(r, 1000));
    fs.writeFileSync(
      '/private/tmp/sector-zero-dust-game.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    if ((await run('sectorZero.snapshot()')).state !== 'playing')
      await run('document.getElementById("play").click()');
    await run('document.dispatchEvent(new KeyboardEvent("keydown",{code:"Escape"}))');
    assert.equal((await run('sectorZero.snapshot()')).state, 'paused');
    await run(`(async()=>{
 const THREE=await import(new URL('vendor/three.module.js',location.href).href);
 const artModule=await import(new URL('graphics.mjs',location.href).href);
 const preview=document.createElement('canvas');preview.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(preview);
 const r=new THREE.WebGLRenderer({canvas:preview,antialias:true});r.setSize(innerWidth,innerHeight);r.setPixelRatio(1);r.toneMapping=THREE.ACESFilmicToneMapping;r.toneMappingExposure=1.08;
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x989b90);scene.add(new THREE.HemisphereLight(0xe1e9ed,0x615d48,2));const light=new THREE.DirectionalLight(0xffebd0,2.5);light.position.set(-3,6,-4);scene.add(light);
 const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.05,50);camera.position.set(0,1.3,-4.9);camera.lookAt(0,1.1,0);
 const a=await artModule.createArt(r);for(let i=0;i<2;i++){const bot=artModule.buildSoldier(i,a);bot.root.position.x=i? .73:-.73;scene.add(bot.root);artModule.animateSoldier(bot,i===1,1.4,.02);}
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:0x9a927d,roughness:1}));ground.rotation.x=-Math.PI/2;scene.add(ground);r.render(scene,camera);
 return true;
 })()`);
    await new Promise((r) => setTimeout(r, 150));
    fs.writeFileSync(
      '/private/tmp/sector-zero-soldiers.png',
      (await w.webContents.capturePage()).toPNG(),
    );
    assert.deepEqual(errors, [], 'No renderer JavaScript errors');
    console.log(
      'PASS: real WebGL geometry, round start, movement, weapon selection, scope, shooting, reload, jump, pause',
    );
    console.log(JSON.stringify(moved));
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
