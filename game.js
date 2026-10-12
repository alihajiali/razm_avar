import { PLAYER_NAMES } from './dialogues.mjs';
import { BattleVoice } from './voice.mjs';
import {
  MODES,
  SITES,
  CHALLENGES,
  newStats,
  challengeDone,
  grenadeDamage,
  smokeBlocks,
  buyItem,
  waveCount,
} from './operations.mjs';
import * as THREE from './vendor/three.module.js';
import {
  createArt,
  buildEnvironment,
  disposeEnvironment,
  buildSoldier,
  buildWeapon,
  animateSoldier,
  animateWeapon,
  setSoldierName,
} from './graphics.mjs';
import {
  TILE,
  GRID,
  SPAWN,
  CRATES,
  WEAPONS,
  blocked,
  moveBody,
  pathTo,
  loadouts,
  finishReload,
  DIFFICULTIES,
  normalizeSettings,
  spawnPositions,
  revivePlayer,
  MAPS,
  ACTIVE_MAP,
  setMap,
  normalizeMap,
  locationName,
} from './arena.mjs';

const $ = (id) => document.getElementById(id);
const weaponName = (name) => WEAPONS.find((w) => w.name === name)?.displayName || name;
const canvas = $('game'),
  viewport = $('viewport');
const battleVoice = new BattleVoice($('dialogue'));
function say(event, speaker = 'تو', options = {}) {
  battleVoice.play(event, speaker, options);
}
try {
  const preferences = JSON.parse(localStorage.getItem('sector-zero-voice') || '{}');
  battleVoice.enabled = preferences.enabled !== false;
  battleVoice.volume = Math.max(
    0,
    Math.min(1, Number.isFinite(preferences.volume) ? preferences.volume : 0.8),
  );
} catch {}
$('voice-enabled').checked = battleVoice.enabled;
$('voice-volume').value = Math.round(battleVoice.volume * 100);
function saveVoice() {
  try {
    localStorage.setItem(
      'sector-zero-voice',
      JSON.stringify({ enabled: battleVoice.enabled, volume: battleVoice.volume }),
    );
  } catch {}
}
$('voice-enabled').onchange = () => {
  battleVoice.setEnabled($('voice-enabled').checked);
  saveVoice();
};
$('voice-volume').oninput = () => {
  battleVoice.volume = Number($('voice-volume').value) / 100;
  if (battleVoice.current) battleVoice.current.volume = battleVoice.volume;
  saveVoice();
};
$('voice-preview').onclick = () => say('start', 'آرش', { priority: 3, variant: 'حریفت منم!' });
let mapPreference = 'dust';
try {
  mapPreference = normalizeMap(localStorage.getItem('sector-zero-map'));
} catch {}
setMap(mapPreference);
for (const map of Object.values(MAPS)) {
  const option = document.createElement('option');
  option.value = map.id;
  option.textContent = map.label;
  $('map').append(option);
}
$('map').value = mapPreference;
function mapPreview() {
  const map = MAPS[normalizeMap($('map').value)],
    canvas = $('map-preview'),
    c = canvas.getContext('2d');
  const size = Math.min(
      (canvas.width - 8) / map.grid[0].length,
      (canvas.height - 8) / map.grid.length,
    ),
    ox = (canvas.width - map.grid[0].length * size) / 2,
    oz = (canvas.height - map.grid.length * size) / 2;
  c.clearRect(0, 0, canvas.width, canvas.height);
  for (let z = 0; z < map.grid.length; z++)
    for (let x = 0; x < map.grid[z].length; x++) {
      c.fillStyle = map.grid[z][x] === '#' ? '#716e61' : '#273d45';
      c.fillRect(ox + x * size, oz + z * size, size - 0.4, size - 0.4);
    }
  for (const [x, z, w, d] of map.crates) {
    c.fillStyle = '#86938c';
    c.fillRect(
      ox + ((x - w / 2) / TILE) * size,
      oz + ((z - d / 2) / TILE) * size,
      (w / TILE) * size,
      (d / TILE) * size,
    );
  }
  for (const site of map.sites) {
    c.fillStyle = '#ffd075';
    c.font = 'bold 9px monospace';
    c.fillText(site.name, ox + (site.x / TILE) * size - 3, oz + (site.z / TILE) * size + 3);
  }
  c.fillStyle = '#9edcee';
  c.beginPath();
  c.arc(ox + (map.spawn.x / TILE) * size, oz + (map.spawn.z / TILE) * size, 2.8, 0, Math.PI * 2);
  c.fill();
  $('map-name').textContent = map.name;
  $('map-description').textContent = map.description;
}
$('map').addEventListener('change', () => {
  mapPreview();
  showRecords($('map').value, $('mode').value);
});
mapPreview();

let renderer, worldRenderStats;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch {
  $('story').textContent =
    'برای اجرای سه‌بعدی، WebGL باید فعال باشد. بازی را با npm start در Electron اجرا کن.';
  $('play').disabled = true;
  throw Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#a7bac4');
scene.fog = new THREE.Fog('#b8b6a8', 55, 155);
const camera = new THREE.PerspectiveCamera(76, 16 / 9, 0.06, 160);
camera.rotation.order = 'YXZ';
const weaponScene = new THREE.Scene(),
  weaponCamera = new THREE.PerspectiveCamera(60, 16 / 9, 0.01, 10);
const hemi = new THREE.HemisphereLight(0xd5dfe6, 0x867459, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffebd1, 2.3);
sun.position.set(-12, 65, 42);
scene.add(sun);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -65;
sun.shadow.camera.right = 65;
sun.shadow.camera.top = 65;
sun.shadow.camera.bottom = -65;
sun.shadow.camera.far = 150;
sun.shadow.normalBias = 0.045;
sun.target.position.set(40, 0, 34);
scene.add(sun.target);
weaponScene.add(new THREE.HemisphereLight(0xdce7ef, 0x414449, 2.1));
const gunlight = new THREE.DirectionalLight(0xffecd6, 2.6);
gunlight.position.set(-2, 4, 1);
weaponScene.add(gunlight);
const colliders = [],
  bots = [],
  effects = [],
  botPool = [];
let mode = 'clear',
  economy = 'free',
  challenge = 'heads',
  bombRole = 'plant',
  money = 2400,
  owned = [true, true, true, true],
  inventory = { he: 2, flash: 2, smoke: 1 },
  wave = 1,
  intermission = 0,
  activeCount = 12,
  stats = newStats(),
  bomb = null,
  interaction = 0,
  flashBlind = 0,
  damageAngle = 0,
  shopResume = false,
  shopOpen = false;
const projectiles = [],
  clouds = [];
let records = {};
try {
  records = JSON.parse(localStorage.getItem('sector-zero-records') || '{}') || {};
} catch {}
try {
  const saved = JSON.parse(localStorage.getItem('sector-zero-operations') || '{}');
  mode = Object.hasOwn(MODES, saved.mode) ? saved.mode : 'clear';
  economy = saved.economy === 'shop' ? 'shop' : 'free';
  challenge = CHALLENGES.some((c) => c.id === saved.challenge) ? saved.challenge : 'heads';
} catch {}
owned = economy === 'shop' ? [false, false, false, true] : [true, true, true, true];
$('mode').value = mode;
$('economy').value = economy;
$('challenge').value = challenge;
function recordKey(mapId = ACTIVE_MAP.id, modeId = mode) {
  return `${mapId}:${modeId}`;
}
function showRecords(mapId = ACTIVE_MAP.id, modeId = mode) {
  const r = records?.[recordKey(mapId, modeId)] || (mapId === 'dust' ? records?.[modeId] : null);
  $('records').textContent = r
    ? `رکورد ${MAPS[mapId].name} / ${MODES[modeId]}: ${r.kills || 0} حذف · ${r.headshots || 0} تیر به سر · موج ${r.wave || 1} · زمان ${r.bestTime?.toFixed(1) || '—'} ثانیه`
    : 'رکوردی برای این نقشه و حالت ثبت نشده است.';
}
$('mode').addEventListener('change', () => showRecords($('map').value, $('mode').value));
showRecords();
function operationSettings() {
  const nextEconomy = $('economy').value;
  if (nextEconomy !== economy) {
    money = 2400;
    owned = nextEconomy === 'shop' ? [false, false, false, true] : [true, true, true, true];
  }
  mode = $('mode').value;
  bombRole = $('bomb-role').value;
  economy = nextEconomy;
  challenge = $('challenge').value;
  try {
    localStorage.setItem('sector-zero-operations', JSON.stringify({ mode, economy, challenge }));
  } catch {}
}
function killed(b, head = false, source = 'bullet') {
  if (b.rewarded) return;
  b.rewarded = true;
  b.hp = 0;
  b.death = 0;
  stats.kills++;
  if (head) stats.headshots++;
  if (source !== 'bullet' || weaponIndex !== 3) stats.pistolOnly = false;
  money += 300;
  if (Math.random() < 0.5)
    say('death', b.name, { priority: 2, pitch: 0.94 + (b.index % 3) * 0.05 });
  else say('kill', 'تو', { priority: 1 });
}
function throwGrenade(type) {
  if (online.active) {
    notice('مبارزهٔ آنلاین با چهار اسلحه انجام می‌شود', 2);
    return;
  }
  if (state !== 'playing' || respawnTimer || shopOpen || intermission || !inventory[type]) return;
  inventory[type]--;
  say('grenade', 'تو', {
    priority: 1,
    variant:
      type === 'smoke'
        ? 'دود شد، راه رو عوض کن!'
        : type === 'flash'
          ? 'چشماتو ببند، نور میاد!'
          : null,
  });
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshStandardMaterial({
      color: type === 'he' ? 0x687744 : type === 'flash' ? 0xded5ab : 0x77818b,
    }),
  );
  mesh.position.copy(camera.position);
  const velocity = new THREE.Vector3(0, 0, -13).applyQuaternion(camera.quaternion);
  velocity.y += 3;
  scene.add(mesh);
  projectiles.push({ mesh, velocity, type, fuse: 1.4 });
  notice({ he: 'نارنجک پرتاب شد', flash: 'فلش پرتاب شد', smoke: 'دود پرتاب شد' }[type]);
}
function detonate(g) {
  const pos = g.mesh.position.clone();
  scene.remove(g.mesh);
  g.mesh.geometry.dispose();
  g.mesh.material.dispose();
  if (g.type === 'smoke') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 12, 8),
      new THREE.MeshBasicMaterial({
        color: 0xa5a6a0,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    mesh.position.set(pos.x, 1.5, pos.z);
    scene.add(mesh);
    clouds.push({ x: pos.x, z: pos.z, radius: 4.5, life: 12, mesh });
    return;
  }
  if (g.type === 'flash') {
    for (const b of bots)
      if (
        b.hp > 0 &&
        Math.hypot(b.x - pos.x, b.z - pos.z) < 18 &&
        visible(pos.clone().setY(1.6), new THREE.Vector3(b.x, 1.6, b.z))
      )
        b.blind = 4;
    const d = pos.clone().sub(camera.position),
      f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (
      d.length() < 18 &&
      visible(camera.position, pos.clone().setY(1.6)) &&
      d.normalize().dot(f) > 0.2
    )
      flashBlind = 2.5;
    tone(2200, 0.3, 'sine', 0.06);
    return;
  }
  tone(55, 0.5, 'sawtooth', 0.12);
  const burst = new THREE.Mesh(
    new THREE.SphereGeometry(2, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8 }),
  );
  burst.position.copy(pos);
  scene.add(burst);
  effects.push({ mesh: burst, life: 0.35, max: 0.35 });
  for (const b of bots) {
    const damage = grenadeDamage(Math.hypot(b.x - pos.x, b.z - pos.z));
    if (b.hp > 0 && damage && visible(pos.clone().setY(1.6), new THREE.Vector3(b.x, 1.6, b.z))) {
      b.hp -= damage;
      if (b.hp <= 0) {
        killed(b, false, 'grenade');
        addFeed('YOU [GRENADE] BOT ' + (b.index + 1));
      }
    }
  }
  const damage = grenadeDamage(Math.hypot(player.x - pos.x, player.z - pos.z));
  if (damage && visible(camera.position, pos.clone().setY(1.6))) applyDamage(damage * 0.6, pos);
}
function tickUtilities(dt) {
  flashBlind = Math.max(0, flashBlind - dt);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const g = projectiles[i];
    g.fuse -= dt;
    g.velocity.y -= 12 * dt;
    const next = g.mesh.position.clone().addScaledVector(g.velocity, dt);
    if (!blocked(next.x, next.z, 0.15, next.y)) {
      g.mesh.position.x = next.x;
      g.mesh.position.z = next.z;
    } else {
      g.velocity.x *= -0.35;
      g.velocity.z *= -0.35;
    }
    g.mesh.position.y = Math.max(0.15, next.y);
    if (next.y < 0.15) {
      g.velocity.y = Math.abs(g.velocity.y) * 0.3;
      g.velocity.x *= 0.96;
      g.velocity.z *= 0.96;
    }
    if (g.fuse <= 0) {
      detonate(g);
      projectiles.splice(i, 1);
    }
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i];
    c.life -= dt;
    c.mesh.material.opacity = Math.min(0.75, c.life / 2);
    if (c.life <= 0) {
      scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      c.mesh.material.dispose();
      clouds.splice(i, 1);
    }
  }
}
function clearUtilities() {
  for (const g of [...projectiles, ...clouds]) {
    scene.remove(g.mesh);
    g.mesh.geometry.dispose();
    g.mesh.material.dispose();
  }
  projectiles.length = clouds.length = 0;
  flashBlind = 0;
}
function canShop() {
  return (
    ['menu', 'won', 'lost'].includes(state) ||
    intermission > 0 ||
    (stats.elapsed < 20 && Math.hypot(player.x - SPAWN.x, player.z - SPAWN.z) < 7 && !respawnTimer)
  );
}
function renderShop() {
  $('shop-wallet').textContent =
    `موجودی: $${money} · ${economy === 'free' ? 'تجهیزات آزاد؛ خرید مصرفی‌ها' : 'تجهیزات خریدنی'}`;
  const items = [
    ['ak', 'AK-47', 1800, 0],
    ['m4', 'M4A1', 2200, 1],
    ['awp', 'AWP', 3500, 2],
    ['deagle', 'Desert Eagle', 700, 3],
    ['armor', 'زره کامل', 650],
    ['ammo', 'مهمات کامل', 300],
    ['he', 'نارنجک', 300],
    ['flash', 'فلش', 200],
    ['smoke', 'دود', 300],
  ];
  $('shop-items').replaceChildren();
  for (const [id, label, price, index] of items) {
    const button = document.createElement('button');
    button.textContent = `${weaponName(label)} · $${price}${index !== undefined && owned[index] ? ' ✓' : ''}`;
    button.disabled =
      money < price ||
      (index !== undefined && owned[index]) ||
      inventory[id] >= 3 ||
      (id === 'armor' && player.armor >= 100) ||
      (id === 'ammo' &&
        slots.every(
          (slot, i) => slot.ammo === WEAPONS[i].mag && slot.reserve === WEAPONS[i].reserve,
        ));
    button.onclick = () => {
      const purchase = buyItem(money, id);
      if (!purchase.ok) return;
      money = purchase.money;
      if (index !== undefined) {
        owned[index] = true;
        slots[index] = loadouts()[index];
      } else if (id === 'armor') player.armor = 100;
      else if (id === 'ammo') slots = loadouts();
      else inventory[id]++;
      renderShop();
      updateHUD();
    };
    $('shop-items').append(button);
  }
}
function openShop() {
  if (online.active) {
    notice('در مبارزهٔ آنلاین همهٔ اسلحه‌ها آزادند', 2);
    return;
  }
  if (['menu', 'won', 'lost'].includes(state)) operationSettings();
  if (!canShop()) {
    notice('خرید فقط در محل شروع و ۲۰ ثانیهٔ اول راند');
    return;
  }
  shopResume = state === 'playing';
  if (shopResume) pause();
  shopOpen = true;
  $('shop').hidden = false;
  renderShop();
}
function closeShop() {
  shopOpen = false;
  $('shop').hidden = true;
  if (shopResume) {
    shopResume = false;
    start();
  }
}
$('shop-open').onclick = openShop;
$('shop-close').onclick = closeShop;
function initBots() {
  const positions = spawnPositions(activeCount);
  bots.forEach((b, i) => {
    Object.assign(b, {
      ...positions[i],
      y: 0,
      hp: 100,
      attack: 1 + i * 0.15,
      think: 0.1 * i,
      path: [],
      hit: 0,
      blind: 0,
      rewarded: false,
      role: ['assault', 'flanker', 'sniper', 'cover'][i % 4],
    });
    setSoldierName(b, PLAYER_NAMES[i % PLAYER_NAMES.length]);
    b.root.position.set(b.x, 0, b.z);
    b.root.rotation.set(0, 0, 0);
    b.body.rotation.set(0, 0, 0);
    b.body.position.set(0, 0, 0);
    b.death = 0;
  });
}
function objectiveTick(dt) {
  if (mode !== 'bomb') return;
  if (!bomb.planted) {
    const site = SITES.find((s) => Math.hypot(player.x - s.x, player.z - s.z) < 4);
    if (keys.KeyE && site && !respawnTimer) {
      interaction += dt;
      notice(`کاشت در ${site.name}: ${Math.min(100, Math.round((interaction / 3) * 100))}٪`, 0.15);
      if (interaction >= 3) {
        bomb.planted = true;
        bomb.site = site;
        bomb.fuse = 40;
        interaction = 0;
        notice('بمب فعال شد؛ ۴۰ ثانیه از آن محافظت کن', 4);
      }
    } else interaction = 0;
  } else {
    bomb.fuse = Math.max(0, bomb.fuse - dt);
    if (bomb.fuse <= 0) {
      endRound(bombRole === 'plant', 'بمب منفجر شد.');
      return;
    }
    const close = Math.hypot(player.x - bomb.site.x, player.z - bomb.site.z) < 4;
    if (bombRole === 'defuse' && keys.KeyE && close && !respawnTimer) {
      interaction += dt;
      notice(`خنثی‌سازی: ${Math.min(100, Math.round((interaction / 5) * 100))}٪`, 0.15);
      if (interaction >= 5) {
        endRound(bombRole === 'defuse', 'بمب خنثی شد.');
        return;
      }
    } else interaction = 0;
    const defender =
      bombRole === 'plant' &&
      bots.find(
        (b) => b.hp > 0 && !b.blind && Math.hypot(b.x - bomb.site.x, b.z - bomb.site.z) < 3,
      );
    bomb.defuse = defender ? bomb.defuse + dt : 0;
    if (bomb.defuse >= 8) endRound(false, 'دشمن بمب را خنثی کرد.');
  }
}

let settings = normalizeSettings();
try {
  settings = normalizeSettings(JSON.parse(localStorage.getItem('sector-zero-settings') || '{}'));
} catch {}
$('difficulty').value = settings.difficulty;
$('botcount').value = settings.count;
let respawnTimer = 0,
  protection = 0,
  deaths = 0,
  victoryTimer = null;
function readSettings() {
  return normalizeSettings({ difficulty: $('difficulty').value, count: $('botcount').value });
}
function settingsSummary() {
  const chosen = readSettings();
  $('settings-summary').textContent =
    `${chosen.count} دشمن · ${DIFFICULTIES[chosen.difficulty].label} · بازگشت پس از ۳ ثانیه`;
  $('botcount').value = chosen.count;
}
$('difficulty').addEventListener('change', settingsSummary);
$('botcount').addEventListener('change', settingsSummary);
settingsSummary();
function saveSettings() {
  settings = readSettings();
  operationSettings();
  try {
    localStorage.setItem('sector-zero-settings', JSON.stringify(settings));
  } catch {}
}
function configureBots() {
  while (botPool.length < activeCount) {
    const bot = buildSoldier(botPool.length, art);
    bot.root.traverse((o) => {
      if (o.isMesh) o.userData.bot = bot;
    });
    scene.add(bot.root);
    botPool.push(bot);
  }
  bots.splice(0, bots.length, ...botPool.slice(0, activeCount));
  botPool.forEach((b, i) => {
    b.root.visible = i < activeCount;
  });
}

const ray = new THREE.Raycaster(),
  center = new THREE.Vector2();
let state = 'menu',
  keys = {},
  player,
  slots,
  weaponIndex = 0,
  reloading = 0,
  cooldown = 0,
  recoil = 0,
  flashTime = 0,
  hitTime = 0,
  hurtTime = 0,
  time = 150,
  round = 1,
  wins = 0,
  losses = 0;
let trigger = false,
  scoped = false,
  muted = false,
  audio,
  noticeTime = 0,
  footstep = 0,
  frames = 0,
  fpsTime = 0,
  simulationTime = 0;
$('play').disabled = true;
$('status').textContent = 'در حال آماده‌سازی';
let art;
try {
  art = await createArt(renderer);
} catch (error) {
  $('story').textContent = 'بارگذاری بافت‌ها ناموفق بود. وجود فایل‌های assets را بررسی کن.';
  throw error;
}
let environment = buildEnvironment(scene, art, colliders);
function applyMap() {
  const id = normalizeMap($('map').value);
  if (id !== ACTIVE_MAP.id) {
    disposeEnvironment(environment, colliders, art);
    setMap(id);
    environment = buildEnvironment(scene, art, colliders);
  }
  mapPreference = id;
  try {
    localStorage.setItem('sector-zero-map', id);
  } catch {}
  const palette = ACTIVE_MAP.palette;
  scene.background.set(palette.sky);
  scene.fog.color.set(palette.fog);
  sun.color.setHex(palette.sun);
  hemi.color.setHex(palette.ambient);
  $('map-brand').textContent = ' / ' + ACTIVE_MAP.name;
  $('map-footer').textContent = ACTIVE_MAP.name + ' / نقشهٔ اختصاصی';
  document.title = 'رزم‌آور · ' + ACTIVE_MAP.name;
}

configureBots();
let gun = new THREE.Group(),
  gunModels = [];
weaponScene.add(gun);
$('weapons').innerHTML = WEAPONS.map((w, i) => `<span>${i + 1} ${w.displayName}</span>`).join('');
for (let i = 0; i < WEAPONS.length; i++) {
  const model = buildWeapon(i, art);
  model.visible = i === 0;
  gun.add(model);
  gunModels.push(model);
}
const flameCanvas = document.createElement('canvas');
flameCanvas.width = flameCanvas.height = 128;
const flameContext = flameCanvas.getContext('2d'),
  flameGradient = flameContext.createRadialGradient(64, 64, 0, 64, 64, 64);
flameGradient.addColorStop(0, '#fff9e5ff');
flameGradient.addColorStop(0.2, '#ffe6a5dd');
flameGradient.addColorStop(0.5, '#ff983677');
flameGradient.addColorStop(1, '#ff660000');
flameContext.fillStyle = flameGradient;
flameContext.fillRect(0, 0, 128, 128);
const muzzle = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(flameCanvas),
    blending: THREE.AdditiveBlending,
    depthTest: false,
    transparent: true,
  }),
);
muzzle.scale.set(0.23, 0.23, 1);
muzzle.visible = false;
gun.add(muzzle);
const muzzleLight = new THREE.PointLight(0xffbd61, 0, 2);
weaponScene.add(muzzleLight);
const bombModel = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.55, 0.22, 0.38),
  new THREE.MeshStandardMaterial({ color: 0x414538 }),
);
bombBody.position.y = 0.16;
bombModel.add(bombBody);
const bombLed = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 6, 5),
  new THREE.MeshBasicMaterial({ color: 0xff4433 }),
);
bombLed.position.set(0.2, 0.3, 0);
bombModel.add(bombLed);
scene.add(bombModel);
bombModel.visible = false;
$('play').disabled = false;
$('network-open').disabled = false;
const online = {
  active: false,
  id: null,
  info: null,
  snapshot: null,
  remotes: new Map(),
  pool: [],
  seq: 0,
  sendTime: 0,
  ping: 0,
  generation: 0,
  busy: false,
};
function updateScores() {
  $('network-resume').hidden = state !== 'paused';
  const snap = online.snapshot;
  if (!snap) return;
  $('score-rows').replaceChildren();
  for (const entry of snap.scores) {
    const row = document.createElement('tr');
    if (entry.id === online.id) row.className = 'self';
    for (const value of [entry.name, entry.kills, entry.deaths, entry.headshots]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    $('score-rows').append(row);
  }
  const info = online.info;
  $('network-info').textContent =
    `${info?.serverName || ''} · ${ACTIVE_MAP.name} · ${snap.players.length}/${info?.maxPlayers || 8} بازیکن · ${online.ping} میلی‌ثانیه${info?.hosting ? '\nآدرس اتصال: ' + (info.addresses.length ? info.addresses.join(' ، ') : '127.0.0.1:' + info.port) : ''}`;
}
function networkInput() {
  return {
    seq: online.seq++,
    forward: state === 'playing' ? (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) : 0,
    right: state === 'playing' ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0,
    yaw: player.yaw,
    pitch: player.pitch,
    weapon: weaponIndex,
    crouch: state === 'playing' && !!(keys.ControlLeft || keys.ControlRight),
    walk: state === 'playing' && !!(keys.ShiftLeft || keys.ShiftRight),
    jump: state === 'playing' && !!keys.Space,
    reload: state === 'playing' && !!keys.KeyR,
    scope: scoped,
    fire: state === 'playing' && trigger,
  };
}
function sendOnline() {
  if (online.active) window.sectorNetwork.input(networkInput());
}
function onlineSnapshot(snapshot) {
  online.snapshot = snapshot;
  if (!online.active) return;
  const self = snapshot.players.find((p) => p.id === online.id);
  if (!self) return;
  if (self.generation !== online.generation) {
    if (online.generation) say('respawn', 'تو', { priority: 2 });
    online.generation = self.generation;
    Object.assign(player, { x: self.x, y: self.y, z: self.z, vy: 0 });
    trigger = false;
    keys = {};
    scoped = false;
    notice('ورود به میدان · ۲ ثانیه محافظت', 2);
  }
  if (self.reload > 0 && reloading <= 0) say('reload');
  player.health = self.health;
  player.armor = self.armor;
  slots = self.slots.map((slot) => ({ ...slot }));
  reloading = self.reload;
  respawnTimer = self.respawn;
  protection = self.protection;
  deaths = self.deaths;
  time = snapshot.time;
  round = snapshot.round;
  wins = self.kills;
  losses = self.deaths;
  viewport.classList.toggle('respawning', self.health === 0);
  const present = new Set();
  for (const entry of snapshot.players) {
    if (entry.id === online.id) continue;
    present.add(entry.id);
    let remote = online.remotes.get(entry.id);
    if (!remote) {
      remote = online.pool.find((b) => !b.netId);
      if (!remote) {
        remote = buildSoldier(online.pool.length, art);
        scene.add(remote.root);
        online.pool.push(remote);
      }
      remote.netId = entry.id;
      remote.x = entry.x;
      remote.y = entry.y;
      remote.z = entry.z;
      remote.death = 0;
      remote.body.rotation.set(0, 0, 0);
      remote.body.position.set(0, 0, 0);
      online.remotes.set(entry.id, remote);
    }
    setSoldierName(remote, entry.name);
    remote.target = entry;
    remote.root.visible = true;
    remote.hp = entry.health;
  }
  for (const [id, remote] of online.remotes)
    if (!present.has(id)) {
      remote.root.visible = false;
      remote.netId = null;
      online.remotes.delete(id);
    }
  for (const event of snapshot.events) {
    if (event.type === 'shot') {
      tracer(
        new THREE.Vector3(event.from.x, event.from.y, event.from.z),
        new THREE.Vector3(event.to.x, event.to.y, event.to.z),
        event.id === online.id ? 0xffda8a : 0xff9360,
      );
      if (event.id === online.id) {
        flashTime = 0.07;
        recoil = Math.min(0.16, recoil + WEAPONS[event.weapon].recoil);
        shotSound(event.weapon);
      }
    }
    if (event.type === 'hit' && event.attacker === online.id) {
      hitTime = 0.15;
      $('hitmarker').classList.toggle('headshot', event.head);
      tone(event.head ? 1200 : 800, 0.04, 'triangle', 0.025);
    }
    if (event.type === 'hit' && event.target === online.id) {
      hurtTime = 0.3;
      damageAngle =
        Math.atan2(event.source.x - player.x, event.source.z - player.z) + player.yaw + Math.PI;
      tone(80, 0.13, 'sawtooth', 0.04);
      say('hurt', 'تو', { priority: 1 });
    }
    if (event.type === 'kill') {
      addFeed(
        `${event.name} [${weaponName(event.weapon)}] ${event.victim}${event.head ? ' · تیر به سر' : ''}`,
      );
      if (event.target === online.id) say('death', event.victim, { priority: 3 });
      else if (event.attacker === online.id) say('kill', event.name, { priority: 1 });
      else {
        const victim = snapshot.players.find((p) => p.id === event.target);
        if (victim && Math.hypot(victim.x - player.x, victim.z - player.z) < 18)
          say('death', event.victim, { priority: 0 });
      }
    }
    if (event.type === 'joined') addFeed(event.name + ' · وارد میدان شد');
    if (event.type === 'left') addFeed(event.name + ' · از میدان رفت');
    if (event.type === 'roundEnd') {
      say(snapshot.scores[0]?.id === online.id ? 'victory' : 'defeat', 'تو', { priority: 3 });
      trigger = false;
      $('scoreboard').hidden = false;
      notice('پایان مسابقه · دور بعد تا ۸ ثانیه', 8);
    }
    if (event.type === 'roundStart') {
      $('scoreboard').hidden = true;
      notice('مسابقهٔ جدید', 3);
      say('start');
    }
  }
  updateScores();
  updateHUD();
}
function updateOnline(dt) {
  simulationTime += dt;
  online.sendTime += dt;
  if (online.sendTime >= 1 / 30) {
    online.sendTime = 0;
    sendOnline();
  }
  const self = online.snapshot?.players.find((p) => p.id === online.id);
  if (self) {
    const blend = Math.min(1, dt * 20);
    if (Math.hypot(player.x - self.x, player.z - self.z) > 3) {
      player.x = self.x;
      player.z = self.z;
    } else {
      player.x += (self.x - player.x) * blend;
      player.z += (self.z - player.z) * blend;
    }
    player.y += (self.y - player.y) * blend;
  }
  for (const remote of online.remotes.values()) {
    remote.nameTag.visible =
      remote.hp > 0 && Math.hypot(remote.x - player.x, remote.z - player.z) < 22;
    const target = remote.target,
      blend = Math.min(1, dt * 15);
    remote.x += (target.x - remote.x) * blend;
    remote.z += (target.z - remote.z) * blend;
    remote.y += (target.y - remote.y) * blend;
    remote.root.position.set(remote.x, remote.y, remote.z);
    remote.root.rotation.y = target.yaw;
    remote.body.scale.y = target.crouch ? 0.65 : 1;
    if (target.health > 0 && remote.death) {
      remote.death = 0;
      remote.body.rotation.z = 0;
    }
    animateSoldier(
      remote,
      Math.hypot(target.x - remote.x, target.z - remote.z) > 0.03,
      simulationTime,
      dt,
    );
  }
  cooldown = Math.max(0, cooldown - dt);
  recoil = Math.max(0, recoil - dt * 0.1);
  flashTime = Math.max(0, flashTime - dt);
  hitTime = Math.max(0, hitTime - dt);
  hurtTime = Math.max(0, hurtTime - dt);
  if (noticeTime > 0) {
    noticeTime -= dt;
    if (noticeTime <= 0) $('notice').textContent = '';
  }
  if (state === 'playing' && !respawnTimer) {
    player.yaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.9;
    player.pitch = THREE.MathUtils.clamp(
      player.pitch + ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)) * dt,
      -1.4,
      1.4,
    );
  }
  if (respawnTimer > 0) notice(`بازگشت تا ${Math.ceil(respawnTimer)} ثانیه`, 0.1);
  updateHUD();
}
function enterOnline(info) {
  online.active = true;
  online.id = info.id;
  online.info = info;
  online.generation = 0;
  online.seq = 0;
  online.sendTime = 0;
  online.ping = 0;
  owned = [true, true, true, true];
  economy = 'free';
  $('map').value = info.map;
  mapPreview();
  applyMap();
  clearUtilities();
  activeCount = 0;
  configureBots();
  bots.length = 0;
  player = { ...SPAWN, y: 0, vy: 0, yaw: 0, pitch: 0, health: 100, armor: 100 };
  slots = loadouts();
  weaponIndex = 0;
  gunModels.forEach((g, i) => (g.visible = i === 0));
  inventory = { he: 0, flash: 0, smoke: 0 };
  victoryTimer = null;
  bomb = null;
  respawnTimer = protection = deaths = 0;
  keys = {};
  trigger = scoped = false;
  reloading = cooldown = recoil = 0;
  $('feed').replaceChildren();
  $('report').hidden = true;
  $('network-panel').hidden = true;
  $('scoreboard').hidden = true;
  $('overlay').style.display = 'none';
  viewport.classList.add('online');
  state = 'playing';
  if (online.snapshot) onlineSnapshot(online.snapshot);
  say('start');
  notice(
    info.hosting ? 'سرور ساخته شد؛ آدرس اتصال در Tab نمایش داده می‌شود' : 'به سرور وصل شدی',
    4,
  );
  lock();
}
function exitOnline(message = 'از سرور خارج شدی.') {
  if (!online.active) return;
  battleVoice.stop();
  online.active = false;
  online.id = null;
  online.info = null;
  online.snapshot = null;
  for (const remote of online.remotes.values()) {
    remote.root.visible = false;
    remote.netId = null;
  }
  online.remotes.clear();
  viewport.classList.remove('online', 'respawning');
  $('scoreboard').hidden = true;
  trigger = false;
  keys = {};
  scoped = false;
  document.exitPointerLock?.();
  state = 'menu';
  settings = readSettings();
  operationSettings();
  reset();
  show('رزم‌آور', message, 'ورود تک‌نفره ←');
  $('hostiles-label').textContent = 'دشمن‌ها';
}
async function leaveOnline() {
  try {
    await window.sectorNetwork?.leave();
  } finally {
    exitOnline();
  }
}
function networkBusy(value) {
  online.busy = value;
  for (const id of ['network-host', 'network-join', 'network-scan', 'network-close'])
    $(id).disabled = value;
}
async function connectOnline(host, address) {
  if (online.busy) return;
  networkBusy(true);
  $('network-message').textContent = host ? 'در حال ساخت سرور…' : 'در حال اتصال…';
  try {
    const playerName = $('player-name').value;
    try {
      localStorage.setItem('sector-zero-player-name', playerName);
    } catch {}
    online.snapshot = null;
    const info = host
      ? await window.sectorNetwork.host({
          playerName,
          serverName: $('server-name').value,
          port: Number($('server-port').value),
          maxPlayers: Number($('server-capacity').value),
          map: $('map').value,
        })
      : await window.sectorNetwork.join({
          playerName,
          address: address || $('server-address').value,
        });
    enterOnline(info);
  } catch (error) {
    $('network-message').textContent = error.message;
  } finally {
    networkBusy(false);
  }
}
function openNetwork() {
  if (!window.sectorNetwork) {
    notice('چندنفره را با npm start در Electron اجرا کن', 3);
    return;
  }
  if (state === 'playing') pause();
  $('host-map').textContent = 'نقشهٔ میزبان: ' + MAPS[$('map').value].name;
  $('network-message').textContent = '';
  $('network-panel').hidden = false;
}
$('network-open').onclick = openNetwork;
$('network-close').onclick = () => {
  $('network-panel').hidden = true;
};
$('network-host').onclick = () => connectOnline(true);
$('network-join').onclick = () => connectOnline(false);
$('network-leave').onclick = leaveOnline;
$('network-resume').onclick = start;
$('network-scan').onclick = async () => {
  if (online.busy) return;
  networkBusy(true);
  $('network-message').textContent = 'در حال یافتن سرورها…';
  $('server-list').replaceChildren();
  try {
    const servers = await window.sectorNetwork.scan();
    for (const server of servers) {
      const row = document.createElement('div');
      row.className = 'server-row';
      const text = document.createElement('div');
      text.textContent = `${server.name} · ${server.players}/${server.maxPlayers} · ${MAPS[server.map]?.name || server.map}`;
      const small = document.createElement('small');
      small.dir = 'ltr';
      small.textContent = server.address;
      text.append(small);
      const join = document.createElement('button');
      join.textContent = 'اتصال';
      join.disabled = server.players >= server.maxPlayers;
      join.onclick = () => {
        if (!online.busy) {
          $('server-address').value = server.address;
          connectOnline(false, server.address);
        }
      };
      row.append(text, join);
      $('server-list').append(row);
    }
    $('network-message').textContent = servers.length
      ? `${servers.length} سرور پیدا شد.`
      : 'سروری پیدا نشد؛ هر دو دستگاه باید در یک شبکه باشند. می‌توانی با آدرس هم متصل شوی.';
  } catch (error) {
    $('network-message').textContent = error.message;
  } finally {
    networkBusy(false);
  }
};
try {
  $('player-name').value = localStorage.getItem('sector-zero-player-name') || 'آرش';
} catch {}
if (window.sectorNetwork)
  window.sectorNetwork.onEvent((event) => {
    if (event.type === 'snapshot') onlineSnapshot(event);
    else if (event.type === 'ping') {
      online.ping = event.ping;
      updateScores();
    } else if (event.type === 'disconnect') exitOnline(event.message);
  });

function switchWeapon(index) {
  if (state !== 'playing' || index < 0 || index >= 4 || index === weaponIndex || !owned[index])
    return;
  weaponIndex = index;
  reloading = 0;
  cooldown = 0.25;
  scoped = false;
  recoil = 0;
  gunModels.forEach((g, i) => (g.visible = i === index));
  tone(900, 0.04, 'triangle', 0.025);
  if (online.active) sendOnline();
  updateHUD();
}
function tone(freq, duration, type = 'square', volume = 0.04) {
  if (muted) return;
  try {
    audio ||= new AudioContext();
    audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq / 5), audio.currentTime + duration);
    g.gain.setValueAtTime(volume, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + duration);
  } catch {}
}
function shotSound(index) {
  tone(
    [130, 190, 65, 100][index],
    [0.16, 0.12, 0.35, 0.2][index],
    'sawtooth',
    index === 2 ? 0.1 : 0.07,
  );
}
function notice(text, duration = 2) {
  $('notice').textContent = text;
  noticeTime = duration;
}
function addFeed(text) {
  const row = document.createElement('div');
  row.textContent = text;
  $('feed').prepend(row);
  while ($('feed').children.length > 4) $('feed').lastChild.remove();
  setTimeout(() => row.remove(), 6500);
}
function tracer(from, to, color = 0xffda8a) {
  const mesh = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.65 }),
  );
  scene.add(mesh);
  effects.push({ mesh, life: 0.08, max: 0.08 });
}
function impact(position) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd295 }),
  );
  mesh.position.copy(position);
  scene.add(mesh);
  effects.push({ mesh, life: 0.16, max: 0.16 });
}
function shoot() {
  if (online.active) {
    sendOnline();
    return;
  }
  if (state !== 'playing' || respawnTimer > 0 || intermission || cooldown > 0 || reloading > 0)
    return;
  const w = WEAPONS[weaponIndex],
    slot = slots[weaponIndex];
  if (slot.ammo === 0) {
    startReload();
    return;
  }
  stats.shots++;
  if (weaponIndex !== 3) stats.pistolOnly = false;
  slot.ammo--;
  cooldown = w.rate;
  flashTime = 0.055;
  shotSound(weaponIndex);
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
  const spread =
    (weaponIndex === 2 && scoped ? 0.0008 : w.spread) *
      (moving ? 2.6 : 1) *
      (keys.ControlLeft ? 0.65 : 1) +
    recoil * 0.17;
  const direction = new THREE.Vector3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    -1,
  )
    .normalize()
    .applyQuaternion(camera.quaternion);
  ray.set(camera.position, direction);
  ray.far = 110;
  const hit = ray.intersectObjects(
    [...colliders, ...bots.filter((b) => b.hp > 0).map((b) => b.root)],
    true,
  )[0];
  const end = hit ? hit.point : camera.position.clone().addScaledVector(direction, 100);
  tracer(
    camera.position
      .clone()
      .add(new THREE.Vector3(0.15, -0.18, 0).applyQuaternion(camera.quaternion)),
    end,
  );
  if (hit) {
    const bot = hit.object.userData.bot;
    if (bot) {
      const head = hit.object.userData.head || hit.point.y > bot.root.position.y + 1.7;
      stats.hits++;
      $('hitmarker').classList.toggle('headshot', !!head);
      bot.hp -= w.damage * (head ? 3 : 1);
      bot.hit = 0.12;
      hitTime = 0.15;
      if (bot.hp > 0) say('hurt', bot.name, { priority: 0, pitch: 0.94 + (bot.index % 3) * 0.05 });
      tone(head ? 1200 : 800, 0.04, 'triangle', 0.025);
      if (bot.hp <= 0) {
        killed(bot, head);
        addFeed(`تو [${w.displayName}] ${bot.name}${head ? ' · تیر به سر' : ''}`);
      }
    } else impact(hit.point);
  }
  recoil = Math.min(0.16, recoil + w.recoil);
  player.pitch = Math.min(1.35, player.pitch + w.recoil * 0.3);
  if (bots.every((b) => b.hp <= 0)) scheduleVictory();
  updateHUD();
}
function scheduleVictory() {
  if (mode === 'bomb') return;
  if (victoryTimer === null) {
    victoryTimer = 3;
    notice('پاک‌سازی کامل · پایان راند تا ۳ ثانیه', 4);
  }
}
function startReload() {
  if (online.active) {
    sendOnline();
    return;
  }
  const w = WEAPONS[weaponIndex],
    slot = slots[weaponIndex];
  if (state === 'playing' && !respawnTimer && !reloading && slot.ammo < w.mag && slot.reserve > 0) {
    reloading = w.reload;
    scoped = false;
    notice('خشاب‌گذاری…', w.reload);
    say('reload');
    tone(750, 0.08, 'triangle');
  }
}
function applyDamage(damage, source) {
  if (state !== 'playing' || respawnTimer > 0 || protection > 0) return;
  const absorbed = Math.min(player.armor, damage * 0.55);
  player.armor -= absorbed;
  player.health = Math.max(0, player.health - (damage - absorbed));
  hurtTime = 0.3;
  if (source)
    damageAngle = Math.atan2(source.x - player.x, source.z - player.z) + player.yaw + Math.PI;
  tone(80, 0.13, 'sawtooth', 0.04);
  if (player.health > 0) say('hurt', 'تو', { priority: 1 });
  if (player.health <= 0) {
    deaths++;
    respawnTimer = 3;
    trigger = scoped = false;
    reloading = cooldown = flashTime = 0;
    keys = {};
    viewport.classList.add('respawning');
    say('death', 'تو', { priority: 3 });
    addFeed('زمین خوردی · بازگشت تا ۳ ثانیه');
    updateHUD();
  }
}
function visible(from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  ray.set(from, direction.normalize());
  ray.far = distance;
  return !smokeBlocks(from, to, clouds) && !ray.intersectObjects(colliders, false).length;
}
function respawn() {
  say('respawn', 'تو', { priority: 2 });
  revivePlayer(player);
  slots = loadouts();
  protection = 3;
  respawnTimer = 0;
  reloading = cooldown = recoil = flashTime = hitTime = hurtTime = 0;
  trigger = scoped = false;
  keys = {};
  viewport.classList.remove('respawning');
  notice('دوباره زنده شدی · ۳ ثانیه محافظت', 3);
  updateHUD();
}
function reset() {
  battleVoice.stop();
  clearUtilities();
  applyMap();
  wave = 1;
  intermission = 0;
  activeCount = settings.count;
  stats = newStats();
  bomb = {
    planted: mode === 'bomb' && bombRole === 'defuse',
    site: mode === 'bomb' && bombRole === 'defuse' ? SITES[round % 2] : null,
    fuse: 90,
    defuse: 0,
  };
  interaction = 0;
  inventory = {
    he: Math.max(2, inventory.he),
    flash: Math.max(2, inventory.flash),
    smoke: Math.max(1, inventory.smoke),
  };
  $('report').hidden = true;
  showRecords();
  configureBots();
  victoryTimer = null;
  respawnTimer = protection = deaths = 0;
  viewport.classList.remove('respawning');

  player = { ...SPAWN, y: 0, vy: 0, yaw: 0, pitch: 0, health: 100, armor: 100 };
  slots = loadouts();
  weaponIndex = owned[0] ? 0 : 3;
  time = 150;
  reloading = cooldown = recoil = flashTime = hitTime = hurtTime = simulationTime = 0;
  trigger = scoped = false;
  keys = {};
  gunModels.forEach((m, i) => (m.visible = i === weaponIndex));
  $('feed').replaceChildren();
  initBots();
  for (const e of effects) {
    scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
  }
  effects.length = 0;
  updateHUD();
}
function lock() {
  try {
    const promise = canvas.requestPointerLock();
    promise?.catch(() => notice('داخل تصویر کلیک کن تا کنترل ماوس فعال شود', 3));
  } catch {
    notice('برای نگاه از کلیدهای جهت استفاده کن', 3);
  }
}
function show(title, text, button) {
  $('applysettings').hidden = state === 'menu';
  $('overlay').style.display = 'flex';
  document.querySelector('h1').textContent = title;
  $('story').textContent = text;
  $('play').textContent = button;
}
function start() {
  if (online.active) {
    state = 'playing';
    $('overlay').style.display = 'none';
    $('scoreboard').hidden = true;
    lock();
    say('start');
    sendOnline();
    return;
  }
  if (shopOpen) return;
  if (state !== 'paused') {
    saveSettings();
    if (state === 'won' || state === 'lost') round++;
    reset();
  }
  state = 'playing';
  $('overlay').style.display = 'none';
  say('start');
  notice(`راند ${round} · ${settings.count} دشمن · ${DIFFICULTIES[settings.difficulty].label}`, 3);
  lock();
}
function pause() {
  if (state !== 'playing') return;
  if (!online.active) battleVoice.stop();
  state = 'paused';
  trigger = false;
  keys = {};
  scoped = false;
  document.exitPointerLock?.();
  if (online.active) {
    sendOnline();
    show('نبرد آنلاین', 'مسابقه ادامه دارد؛ بازیکن تو همچنان در میدان است.', 'ادامهٔ بازی ←');
    $('scoreboard').hidden = false;
    updateScores();
    return;
  }
  show('مکث در نبرد', 'بازی متوقف است. زمان و دشمن‌ها پس از ادامه حرکت می‌کنند.', 'ادامهٔ راند ←');
}
function endRound(won, reason) {
  if (state !== 'playing') return;
  money += won ? 1800 : 800;
  const completed = challengeDone(challenge, stats, deaths, won);
  if (completed) money += 1000;
  const old = records[recordKey()] || (ACTIVE_MAP.id === 'dust' ? records[mode] : null) || {};
  records[recordKey()] = {
    kills: Math.max(old.kills || 0, stats.kills),
    headshots: Math.max(old.headshots || 0, stats.headshots),
    wave: Math.max(old.wave || 1, wave),
    bestTime: won ? Math.min(old.bestTime || Infinity, stats.elapsed) : old.bestTime,
  };
  try {
    localStorage.setItem('sector-zero-records', JSON.stringify(records));
  } catch {}
  $('report').hidden = false;
  $('report').textContent =
    `${stats.kills} حذف · ${stats.headshots} تیر به سر · دقت ${stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0}٪ · زمان ${stats.elapsed.toFixed(1)} ثانیه · ${deaths} مرگ · موج ${wave} — ${completed ? 'چالش کامل شد: $1000' : 'چالش کامل نشد'}`;
  showRecords();
  state = won ? 'won' : 'lost';
  won ? wins++ : losses++;
  trigger = false;
  keys = {};
  scoped = false;
  document.exitPointerLock?.();
  tone(won ? 650 : 120, 0.45, 'triangle', 0.06);
  say(won ? 'victory' : 'defeat', 'تو', { priority: 3 });
  show(
    won ? 'پیروز میدان شدی' : 'این دست از دست رفت',
    `${reason} ${stats.kills} دشمن حذف شد. امتیاز: ${wins} برد و ${losses} باخت.`,
    'راند بعدی ←',
  );
  updateHUD();
}
$('play').addEventListener('click', start);
$('applysettings').addEventListener('click', () => {
  if (online.active) return;
  saveSettings();
  round++;
  reset();
  state = 'playing';
  $('overlay').style.display = 'none';
  notice('راند جدید با تنظیمات انتخابی شروع شد', 3);
  lock();
});
$('sound').addEventListener('click', () => {
  muted = !muted;
  battleVoice.setMuted(muted);
  $('sound').textContent = muted ? 'صدا خاموش' : 'صدا روشن';
});
document.addEventListener('keydown', (e) => {
  if (!$('network-panel').hidden) {
    if (e.code === 'Escape' && !online.busy) $('network-panel').hidden = true;
    return;
  }
  if (e.target?.matches?.('input,select')) return;
  if (online.active && e.code === 'Tab') {
    e.preventDefault();
    $('scoreboard').hidden = false;
    updateScores();
    return;
  }
  if (shopOpen) {
    if (e.code === 'Escape' || e.code === 'KeyB') closeShop();
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code))
    e.preventDefault();
  keys[e.code] = true;
  if (e.code === 'KeyB' && !e.repeat) {
    openShop();
    return;
  }
  if (e.code === 'Escape') pause();
  if (state !== 'playing' || respawnTimer > 0) return;
  if (!e.repeat && e.code === 'KeyG') throwGrenade('he');
  if (!e.repeat && e.code === 'KeyF') throwGrenade('flash');
  if (!e.repeat && e.code === 'KeyV') throwGrenade('smoke');
  if (e.code === 'KeyR') startReload();
  if (/^Digit[1-4]$/.test(e.code)) switchWeapon(Number(e.code.slice(-1)) - 1);
  if (!online.active && e.code === 'Space' && !e.repeat && player.y === 0) {
    player.vy = 5.8;
    tone(120, 0.04, 'triangle', 0.015);
  }
  if (online.active) sendOnline();
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (
    online.active &&
    e.code === 'Tab' &&
    state === 'playing' &&
    online.snapshot?.phase === 'playing'
  )
    $('scoreboard').hidden = true;
  if (online.active) sendOnline();
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || respawnTimer > 0) return;
  if (document.pointerLockElement !== canvas) {
    lock();
    return;
  }
  if (e.button === 0) {
    trigger = true;
    shoot();
  }
  if (e.button === 2 && weaponIndex === 2 && !reloading) {
    scoped = !scoped;
    if (online.active) sendOnline();
    tone(950, 0.035, 'triangle', 0.02);
  }
});
document.addEventListener('mouseup', () => {
  trigger = false;
  if (online.active) sendOnline();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    if (state === 'playing') switchWeapon((weaponIndex + (e.deltaY > 0 ? 1 : 3)) % 4);
    e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('mousemove', (e) => {
  if (state === 'playing' && !respawnTimer && document.pointerLockElement === canvas) {
    const sensitivity = scoped ? 0.00065 : 0.002;
    player.yaw -= e.movementX * sensitivity;
    player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * sensitivity, -1.4, 1.4);
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && state === 'playing') pause();
});
window.addEventListener('blur', pause);

function update(dt) {
  if (online.active) {
    updateOnline(dt);
    return;
  }
  if (state !== 'playing') return;
  simulationTime += dt;
  stats.elapsed += dt;
  tickUtilities(dt);
  objectiveTick(dt);
  if (state !== 'playing') return;
  if (intermission > 0) {
    intermission = Math.max(0, intermission - dt);
    notice(`موج ${wave + 1} تا ${Math.ceil(intermission)} ثانیه · B خرید`, 0.1);
    if (intermission === 0) {
      wave++;
      activeCount = waveCount(settings.count, wave);
      configureBots();
      initBots();
      time = 150;
      victoryTimer = null;
      protection = 3;
      notice(`موج ${wave} آغاز شد`, 3);
    }
    updateHUD();
    return;
  }
  if (victoryTimer === null && bots.every((b) => b.hp <= 0)) scheduleVictory();
  if (victoryTimer !== null) {
    victoryTimer = Math.max(0, victoryTimer - dt);
    if (victoryTimer === 0) {
      if (mode === 'survival') {
        intermission = 8;
        victoryTimer = null;
        money += 1200;
        player.health = 100;
        player.armor = 100;
        slots = loadouts();
        inventory = { he: 2, flash: 2, smoke: 1 };
        notice('موج تمام شد · ۸ ثانیه تجهیز', 3);
      } else endRound(true, 'تمام دشمن‌ها از میدان خارج شدند.');
      return;
    }
  } else if (!(mode === 'bomb' && bomb.planted)) {
    time = Math.max(0, time - dt);
    if (time === 0) {
      endRound(false, 'زمان راند تمام شد.');
      return;
    }
  }
  if (respawnTimer > 0) {
    respawnTimer = Math.max(0, respawnTimer - dt);
    notice(`کشته شدی · بازگشت تا ${Math.ceil(respawnTimer)} ثانیه`, 0.1);
    if (respawnTimer === 0) respawn();
    updateHUD();
    return;
  }
  protection = Math.max(0, protection - dt);
  const difficulty = DIFFICULTIES[settings.difficulty];
  cooldown = Math.max(0, cooldown - dt);
  recoil = Math.max(0, recoil - dt * 0.1);
  flashTime = Math.max(0, flashTime - dt);
  hitTime = Math.max(0, hitTime - dt);
  hurtTime = Math.max(0, hurtTime - dt);
  if (noticeTime > 0) {
    noticeTime -= dt;
    if (noticeTime <= 0) $('notice').textContent = '';
  }
  if (reloading > 0) {
    reloading -= dt;
    if (reloading <= 0) {
      reloading = 0;
      finishReload(slots[weaponIndex], WEAPONS[weaponIndex]);
      tone(550, 0.06, 'triangle');
    }
  }
  player.yaw += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * dt * 1.9;
  player.pitch = THREE.MathUtils.clamp(
    player.pitch + ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0)) * dt,
    -1.4,
    1.4,
  );
  const crouching = keys.ControlLeft || keys.ControlRight;
  let forward = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0),
    right = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const speed =
    ((crouching ? 1.8 : keys.ShiftLeft || keys.ShiftRight ? 2.5 : 4.7) *
      (weaponIndex === 2 ? 0.86 : 1) *
      dt) /
    Math.max(1, Math.hypot(forward, right));
  moveBody(
    player,
    (-Math.sin(player.yaw) * forward + Math.cos(player.yaw) * right) * speed,
    (-Math.cos(player.yaw) * forward - Math.sin(player.yaw) * right) * speed,
  );
  player.vy -= 16 * dt;
  player.y += player.vy * dt;
  if (player.y <= 0) {
    player.y = 0;
    player.vy = 0;
  }
  if ((forward || right) && player.y === 0) {
    footstep -= dt;
    if (footstep <= 0) {
      footstep = crouching ? 0.65 : keys.ShiftLeft ? 0.5 : 0.32;
      tone(75 + Math.random() * 20, 0.045, 'triangle', keys.ShiftLeft ? 0.005 : 0.016);
    }
  }
  camera.position.set(player.x, player.y + (crouching ? 1.12 : 1.8), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  camera.updateMatrixWorld(true);
  if (trigger && WEAPONS[weaponIndex].automatic) shoot();
  const eye = camera.position.clone();
  for (const b of bots) {
    if (b.hp <= 0) {
      animateSoldier(b, false, simulationTime, dt);
      continue;
    }
    b.blind = Math.max(0, b.blind - dt);
    b.hit = Math.max(0, b.hit - dt);
    b.attack -= dt;
    b.think -= dt;
    const distance = Math.hypot(player.x - b.x, player.z - b.z);
    const hasSight =
      !b.blind &&
      distance < (b.role === 'sniper' ? 60 : 36) &&
      visible(new THREE.Vector3(b.x, 1.65, b.z), eye);
    let goal = mode === 'bomb' && bomb.planted && bombRole === 'plant' ? bomb.site : player;
    if (b.role === 'flanker' && !(mode === 'bomb' && bomb.planted)) {
      const flank = {
        x: player.x + Math.cos(player.yaw) * 8 * (b.index % 2 ? 1 : -1),
        z: player.z - Math.sin(player.yaw) * 8 * (b.index % 2 ? 1 : -1),
      };
      if (!blocked(flank.x, flank.z)) goal = flank;
    }
    if (b.role === 'cover' && hasSight && b.hp < 75) {
      const covers = CRATES.flatMap(([x, z, w, d]) => [
        { x: x + w / 2 + 1, z },
        { x: x - w / 2 - 1, z },
        { x, z: z + d / 2 + 1 },
        { x, z: z - d / 2 - 1 },
      ]).filter(
        (p) => !blocked(p.x, p.z, 0.36) && !visible(new THREE.Vector3(p.x, 1.65, p.z), eye),
      );
      covers.sort((a, c) => Math.hypot(a.x - b.x, a.z - b.z) - Math.hypot(c.x - b.x, c.z - b.z));
      if (covers[0]) goal = covers[0];
    }
    if (b.think <= 0) {
      b.think = 0.65 + Math.random() * 0.2;
      b.path = pathTo(b, goal);
    }
    let target = hasSight && goal === player ? player : b.path[0];
    let moving = false;
    if (
      !b.blind &&
      target &&
      (goal !== player || !hasSight || distance > (b.role === 'sniper' ? 26 : 10))
    ) {
      const dx = target.x - b.x,
        dz = target.z - b.z,
        len = Math.hypot(dx, dz);
      if (len > 0.2) {
        const beforeX = b.x,
          beforeZ = b.z;
        moveBody(
          b,
          (dx / len) * dt * difficulty.speed * (b.role === 'flanker' ? 1.3 : 1),
          (dz / len) * dt * difficulty.speed * (b.role === 'flanker' ? 1.3 : 1),
          0.36,
        );
        moving = Math.hypot(b.x - beforeX, b.z - beforeZ) > 0.001;
      } else if (!hasSight) b.path.shift();
    }
    b.root.position.set(b.x, 0, b.z);
    b.root.rotation.y = Math.atan2(b.x - player.x, b.z - player.z);
    animateSoldier(b, moving, simulationTime, dt);
    if (hasSight && b.attack <= 0) {
      b.attack = (0.7 + Math.random() * 0.6) * difficulty.interval * (b.role === 'sniper' ? 2 : 1);
      tracer(new THREE.Vector3(b.x, 1.4, b.z), eye.clone(), 0xff9360);
      const chance = distance < 9 ? 0.75 : distance < 20 ? 0.5 : 0.3;
      if (Math.random() < Math.min(0.98, chance * difficulty.accuracy))
        applyDamage(
          (10 + Math.random() * 5) * difficulty.damage * (b.role === 'sniper' ? 2 : 1),
          b,
        );
      if (state !== 'playing') break;
    }
  }
  if (victoryTimer !== null)
    notice(`پاک‌سازی کامل · پایان راند تا ${Math.ceil(victoryTimer)} ثانیه`, 1);
  scene.updateMatrixWorld(true);
  updateHUD();
}
function updateHUD() {
  $('objective').textContent =
    `${MODES[mode]}${mode === 'survival' ? ' · موج ' + wave : ''} · $${money} | G نارنجک ${inventory.he} · F فلش ${inventory.flash} · V دود ${inventory.smoke}\n${mode === 'bomb' ? (bomb?.planted ? 'بمب ' + bomb.site.name + ' · ' + Math.ceil(bomb.fuse) + ' ثانیه · ' + (bombRole === 'defuse' ? 'E خنثی‌سازی' : 'محافظت از بمب') + ' · دشمن ' + Math.round((bomb.defuse / 8) * 100) + '٪' : 'به A یا B برو؛ E را ۳ ثانیه نگه دار') : CHALLENGES.find((c) => c.id === challenge)?.label + ' · ' + stats.headshots + ' تیر به سر'}`;
  $('health').textContent = Math.ceil(player.health);
  $('armor').textContent = Math.ceil(player.armor);
  $('ammo').textContent = reloading > 0 ? '—' : slots[weaponIndex].ammo;
  $('reserve').textContent = slots[weaponIndex].reserve;
  $('weaponname').textContent = WEAPONS[weaponIndex].displayName;
  $('score-left-label').textContent = online.active ? 'حذف' : 'برد';
  $('score-right-label').textContent = online.active ? 'مرگ' : 'باخت';
  $('deaths').textContent = deaths;
  $('remaining').textContent = bots.filter((b) => b.hp > 0).length;
  $('wins').textContent = wins;
  $('losses').textContent = losses;
  $('timer').textContent =
    `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
  $('status').textContent =
    `راند ${round} / ${{ menu: 'آماده', playing: 'در نبرد', paused: 'مکث', won: 'پیروزی', lost: 'شکست' }[state] || 'آماده'}`;
  if (online.active) {
    $('objective').textContent =
      `مبارزهٔ آزاد · ${online.snapshot?.players.length || 1}/${online.info?.maxPlayers || 8} بازیکن · ${online.ping} میلی‌ثانیه\n${online.info?.hosting ? 'میزبان هستی · ' : ''}Tab امتیازها · Esc منوی سرور`;
    $('hostiles-label').textContent = 'بازیکنان';
    $('remaining').textContent = online.snapshot?.players.length || 1;
    $('status').textContent =
      `آنلاین / راند ${round} / ${online.snapshot?.phase === 'intermission' ? 'بین دو نبرد' : 'مبارزهٔ آزاد'}`;
  }
  $('location').textContent = ACTIVE_MAP.name + ' / ' + locationName(player);
  [...$('weapons').children].forEach(
    (element, i) => (
      element.classList.toggle('active', i === weaponIndex),
      (element.style.opacity = owned[i] ? '1' : '.3')
    ),
  );
}
function radar() {
  const c = $('radar').getContext('2d'),
    s = Math.min(170 / GRID[0].length, 143 / GRID.length),
    ox = (180 - GRID[0].length * s) / 2,
    oz = (153 - GRID.length * s) / 2;
  c.clearRect(0, 0, 180, 153);
  for (let z = 0; z < GRID.length; z++)
    for (let x = 0; x < GRID[z].length; x++) {
      c.fillStyle = GRID[z][x] === '#' ? '#7c7766' : '#282f30';
      c.fillRect(ox + x * s, oz + z * s, s - 1, s - 1);
      if ('AB'.includes(GRID[z][x])) {
        c.fillStyle = '#f3bd5d';
        c.font = 'bold 9px monospace';
        c.fillText(GRID[z][x], ox + x * s + 1, oz + z * s + 7);
      }
    }
  for (const [x, z, w, d] of CRATES) {
    c.fillStyle = '#a59c82';
    c.fillRect(
      ox + ((x - w / 2) / TILE) * s,
      oz + ((z - d / 2) / TILE) * s,
      (w / TILE) * s,
      (d / TILE) * s,
    );
  }
  for (const b of online.active ? [...online.remotes.values()] : bots) {
    if (b.hp > 0 && Math.hypot(b.x - player.x, b.z - player.z) < 18) {
      c.fillStyle = '#d76545';
      c.fillRect(ox + (b.x / TILE) * s - 1.5, oz + (b.z / TILE) * s - 1.5, 3, 3);
    }
  }
  c.fillStyle = '#c1e0f2';
  c.beginPath();
  const x = ox + (player.x / TILE) * s,
    z = oz + (player.z / TILE) * s;
  c.arc(x, z, 3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#c1e0f2';
  c.beginPath();
  c.moveTo(x, z);
  c.lineTo(x - Math.sin(player.yaw) * 9, z - Math.cos(player.yaw) * 9);
  c.stroke();
}
function resize() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = weaponCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  weaponCamera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.15, (now - last) / 1000);
  last = now;
  for (let remaining = dt; remaining > 0; remaining -= 0.025) update(Math.min(0.025, remaining));
  const crouching = online.active
    ? !!online.snapshot?.players.find((p) => p.id === online.id)?.crouch
    : keys.ControlLeft || keys.ControlRight;
  camera.position.set(player.x, player.y + (crouching ? 1.12 : 1.8), player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  const targetFov = scoped ? 24 : 76;
  camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 16));
  camera.updateProjectionMatrix();
  const moving = state === 'playing' && (keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD);
  gun.position.set(
    moving ? Math.sin(simulationTime * 10) * 0.008 : 0,
    moving ? Math.cos(simulationTime * 20) * 0.008 : 0,
    recoil * 0.6,
  );
  gun.rotation.set(recoil * 0.9, 0, moving ? Math.sin(simulationTime * 10) * 0.012 : 0);
  if (reloading > 0) {
    const phase = 1 - reloading / WEAPONS[weaponIndex].reload;
    gun.position.y -= Math.sin(phase * Math.PI) * 0.3;
    gun.rotation.z -= Math.sin(phase * Math.PI) * 0.4;
  }
  const model = gunModels[weaponIndex],
    progress = reloading > 0 ? 1 - reloading / WEAPONS[weaponIndex].reload : 0;
  animateWeapon(model, progress, recoil, simulationTime, dt);
  model.updateMatrix();
  const muzzlePosition = model.userData.muzzle.clone().applyMatrix4(model.matrix);
  muzzle.visible = flashTime > 0 && !scoped;
  muzzle.position.copy(muzzlePosition);
  muzzle.material.rotation = Math.random() * Math.PI;
  muzzleLight.intensity = flashTime > 0 ? 3 : 0;
  muzzleLight.position.copy(muzzlePosition);

  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    e.mesh.material.opacity = Math.max(0, e.life / e.max);
    if (e.life <= 0) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      effects.splice(i, 1);
    }
  }
  for (const b of bots)
    if (b.nameTag) b.nameTag.visible = b.hp > 0 && Math.hypot(b.x - player.x, b.z - player.z) < 22;
  bombModel.visible = mode === 'bomb' && !!bomb?.planted;
  if (bombModel.visible) {
    bombModel.position.set(bomb.site.x, 0, bomb.site.z);
    bombLed.visible = Math.sin(simulationTime * 9) > 0;
  }
  renderer.autoClear = true;
  renderer.render(scene, camera);
  const worldStats = { ...renderer.info.render };
  if (!scoped) {
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(weaponScene, weaponCamera);
  }
  $('flash-screen').style.opacity = Math.min(1, flashBlind);
  $('damage-direction').style.opacity = hurtTime > 0 ? 1 : 0;
  $('damage-direction').style.transform = `rotate(${damageAngle}rad)`;
  $('scope').style.display = scoped ? 'block' : 'none';
  $('crosshair').style.display = scoped ? 'none' : 'block';
  $('crosshair').style.width = $('crosshair').style.height = 24 + recoil * 160 + 'px';
  $('hitmarker').style.opacity = hitTime > 0 ? 1 : 0;
  $('damage').style.opacity = hurtTime * 2;
  worldRenderStats = worldStats;
  radar();
  frames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    $('fps').textContent = `${Math.round(frames / fpsTime)} فریم`;
    frames = fpsTime = 0;
  }
  requestAnimationFrame(frame);
}
const botModelStats = { meshes: 0, triangles: 0 };
bots[0].root.traverse((o) => {
  if (o.isMesh) {
    botModelStats.meshes++;
    botModelStats.triangles +=
      (o.geometry.index?.count || o.geometry.attributes.position.count) / 3;
  }
});
reset();
resize();
requestAnimationFrame(frame);
// Read-only diagnostic state for local runtime verification.
window.sectorZero = {
  snapshot: () => ({
    state,
    voice: {
      enabled: battleVoice.enabled,
      volume: battleVoice.volume,
      muted: battleVoice.muted,
      subtitle: $('dialogue').textContent,
      playing: !!battleVoice.current && !battleVoice.current.paused,
      currentTime: battleVoice.current?.currentTime || 0,
    },
    wins,
    losses,
    round,
    time,
    online: {
      active: online.active,
      id: online.id,
      hosting: !!online.info?.hosting,
      ping: online.ping,
      players:
        online.snapshot?.players.map((p) => ({
          id: p.id,
          name: p.name,
          x: p.x,
          y: p.y,
          z: p.z,
          health: p.health,
          kills: p.kills,
          deaths: p.deaths,
          weapon: p.weapon,
        })) || [],
      remotes: online.remotes.size,
      phase: online.snapshot?.phase,
    },
    map: ACTIVE_MAP.id,
    mapName: ACTIVE_MAP.name,
    sites: SITES.map((s) => ({ ...s })),
    colliderCount: colliders.length,
    worldCount: scene.children.filter((o) => o === environment.world || o.name.startsWith('map-'))
      .length,
    mode,
    economy,
    money,
    owned: [...owned],
    inventory: { ...inventory },
    wave,
    intermission,
    stats: { ...stats },
    bomb: bomb ? { ...bomb } : null,
    clouds: clouds.length,
    projectiles: projectiles.length,
    shopOpen,
    weapon: WEAPONS[weaponIndex].name,
    health: player.health,
    armor: player.armor,
    ammo: slots[weaponIndex].ammo,
    reserve: slots[weaponIndex].reserve,
    alive: bots.filter((b) => b.hp > 0).length,
    position: { x: player.x, y: player.y, z: player.z },
    view: { yaw: player.yaw, pitch: player.pitch },
    scoped,
    reloading,
    settings: { ...settings },
    respawnTimer,
    protection,
    deaths,
    victoryTimer,
    bots: bots.map((b) => ({
      name: b.name,
      x: b.x,
      z: b.z,
      hp: b.hp,
      role: b.role,
      blind: b.blind,
    })),
    memory: { ...renderer.info.memory },
    renderer: worldRenderStats || renderer.info.render,
    materials: environment.textureCount,
    characters: botModelStats,
    webgl: renderer.capabilities.isWebGL2 !== false,
  }),
};
