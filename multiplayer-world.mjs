import { MAPS, normalizeMap } from './maps.mjs';
import { WEAPONS, loadouts, finishReload } from './arena.mjs';
const T = 4;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function cleanName(value, fallback = 'آرش') {
  return typeof value === 'string'
    ? value
        .replace(/[\x00-\x1f\x7f]/g, '')
        .trim()
        .slice(0, 24) || fallback
    : fallback;
}
export function sanitizeInput(value = {}) {
  const bool = (key) => value[key] === true;
  return {
    seq: Number.isSafeInteger(value.seq) && value.seq >= 0 ? value.seq : 0,
    forward: clamp(Number.isFinite(value.forward) ? value.forward : 0, -1, 1),
    right: clamp(Number.isFinite(value.right) ? value.right : 0, -1, 1),
    yaw: Number.isFinite(value.yaw) ? value.yaw % (Math.PI * 2) : 0,
    pitch: clamp(Number.isFinite(value.pitch) ? value.pitch : 0, -1.4, 1.4),
    weapon: Number.isInteger(value.weapon) ? clamp(value.weapon, 0, 3) : 0,
    crouch: bool('crouch'),
    walk: bool('walk'),
    jump: bool('jump'),
    fire: bool('fire'),
    reload: bool('reload'),
    scope: bool('scope'),
  };
}
export function blockedIn(map, x, z, r = 0.32, feet = 0) {
  for (const dx of [-r, r])
    for (const dz of [-r, r]) {
      const cell = map.grid[Math.floor((z + dz) / T)]?.[Math.floor((x + dx) / T)];
      if (!cell || cell === '#') return true;
    }
  return map.crates.some(
    ([cx, cz, w, d, h]) =>
      feet < h - 0.05 && Math.abs(x - cx) < w / 2 + r && Math.abs(z - cz) < d / 2 + r,
  );
}
export function rayBox(origin, direction, box, limit = 110) {
  let near = 0,
    far = limit;
  for (const axis of ['x', 'y', 'z']) {
    const [min, max] = box[axis],
      d = direction[axis];
    if (Math.abs(d) < 1e-9) {
      if (origin[axis] < min || origin[axis] > max) return Infinity;
      continue;
    }
    let a = (min - origin[axis]) / d,
      b = (max - origin[axis]) / d;
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return Infinity;
  }
  return near;
}
function collisionBoxes(map) {
  const boxes = [];
  for (let z = 0; z < map.grid.length; z++)
    for (let x = 0; x < map.grid[z].length; x++)
      if (map.grid[z][x] === '#')
        boxes.push({
          x: [x * T, (x + 1) * T],
          y: [
            0,
            x === 0 || z === 0 || x === map.grid[0].length - 1 || z === map.grid.length - 1
              ? 7.6
              : 5.7,
          ],
          z: [z * T, (z + 1) * T],
        });
  for (const [x, z, w, d, h] of map.crates)
    boxes.push({ x: [x - w / 2, x + w / 2], y: [0, h], z: [z - d / 2, z + d / 2] });
  for (const [x, z, w, d] of map.roofs) boxes.push({ x: [x, x + w], y: [6, 6.3], z: [z, z + d] });
  if (map.id === 'dust') boxes.push({ x: [12, 20], y: [4.9, 5.4], z: [26, 36] });
  return boxes;
}
export class MultiplayerWorld {
  constructor({ map = 'dust', maxPlayers = 8, duration = 180, random = Math.random } = {}) {
    this.map = MAPS[normalizeMap(map)];
    this.maxPlayers = Number.isInteger(maxPlayers) ? clamp(maxPlayers, 2, 8) : 8;
    this.duration = duration;
    this.time = duration;
    this.round = 1;
    this.phase = 'playing';
    this.players = new Map();
    this.events = [];
    this.elapsed = 0;
    this.nextId = 1;
    this.random = random;
    this.boxes = collisionBoxes(this.map);
    this.spawns = [];
    for (let z = 1; z < this.map.grid.length - 1; z++)
      for (let x = 1; x < this.map.grid[z].length - 1; x++) {
        const p = { x: (x + 0.5) * T, z: (z + 0.5) * T };
        if (!blockedIn(this.map, p.x, p.z, 0.4)) this.spawns.push(p);
      }
  }
  addPlayer(name) {
    if (this.players.size >= this.maxPlayers) throw Error('سرور پر است.');
    const p = {
      id: String(this.nextId++),
      name: cleanName(name),
      kills: 0,
      deaths: 0,
      headshots: 0,
      weapon: 0,
      slots: loadouts(),
      input: sanitizeInput(),
      lastInputAt: this.elapsed,
      seq: -1,
      generation: 0,
      respawn: 0,
      protection: 0,
      reload: 0,
      cooldown: 0,
      recoil: 0,
      fireHeld: false,
      jumpHeld: false,
      reloadHeld: false,
    };
    this.players.set(p.id, p);
    this.revive(p);
    this.events.push({ type: 'joined', id: p.id, name: p.name });
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      this.players.delete(id);
      this.events.push({ type: 'left', id, name: p.name });
    }
  }
  revive(p) {
    const alive = [...this.players.values()].filter((q) => q.id !== p.id && q.health > 0);
    let best = this.map.spawn,
      score = -Infinity;
    for (let i = 0; i < this.spawns.length; i++) {
      const candidate =
        this.spawns[(i + Number(p.id) * 17 + p.generation * 31) % this.spawns.length];
      const distance = alive.length
        ? Math.min(...alive.map((q) => Math.hypot(q.x - candidate.x, q.z - candidate.z)))
        : Math.hypot(candidate.x - this.map.spawn.x, candidate.z - this.map.spawn.z);
      if (distance > score) {
        score = distance;
        best = candidate;
      }
    }
    Object.assign(p, {
      ...best,
      y: 0,
      vy: 0,
      yaw: 0,
      pitch: 0,
      health: 100,
      armor: 100,
      slots: loadouts(),
      respawn: 0,
      protection: 2,
      reload: 0,
      cooldown: 0,
      recoil: 0,
    });
    p.pendingFire = p.pendingJump = p.pendingReload = false;
    p.generation++;
  }
  input(id, message) {
    const p = this.players.get(id);
    if (!p) return;
    const input = sanitizeInput(message);
    if (input.seq <= p.seq) return;
    if (input.fire && !p.input.fire) p.pendingFire = true;
    if (input.jump && !p.input.jump) p.pendingJump = true;
    if (input.reload && !p.input.reload) p.pendingReload = true;
    p.seq = input.seq;
    p.input = input;
    p.lastInputAt = this.elapsed;
  }
  hurt(target, damage, attacker, head) {
    if (target.health <= 0 || target.protection > 0) return false;
    const absorbed = Math.min(target.armor, damage * 0.55);
    target.armor -= absorbed;
    target.health = Math.max(0, target.health - (damage - absorbed));
    this.events.push({
      type: 'hit',
      attacker: attacker.id,
      target: target.id,
      head,
      damage: damage - absorbed,
      source: { x: attacker.x, z: attacker.z },
    });
    if (target.health === 0) {
      target.deaths++;
      target.respawn = 3;
      attacker.kills++;
      if (head) attacker.headshots++;
      this.events.push({
        type: 'kill',
        attacker: attacker.id,
        target: target.id,
        name: attacker.name,
        victim: target.name,
        weapon: WEAPONS[attacker.weapon].name,
        head,
      });
    }
    return true;
  }
  shoot(p) {
    const w = WEAPONS[p.weapon],
      slot = p.slots[p.weapon];
    if (p.cooldown || p.reload || p.health <= 0) return;
    if (!slot.ammo) {
      this.reload(p);
      return;
    }
    slot.ammo--;
    p.cooldown = w.rate;
    const input = p.input,
      spread =
        (p.weapon === 2 && input.scope ? 0.0008 : w.spread) *
          (input.forward || input.right ? 2.6 : 1) *
          (input.crouch ? 0.65 : 1) +
        p.recoil * 0.17;
    const yaw = p.yaw + (this.random() - 0.5) * spread,
      pitch = p.pitch + (this.random() - 0.5) * spread;
    const origin = { x: p.x, y: p.y + (input.crouch ? 1.12 : 1.8), z: p.z },
      direction = {
        x: -Math.sin(yaw) * Math.cos(pitch),
        y: Math.sin(pitch),
        z: -Math.cos(yaw) * Math.cos(pitch),
      };
    let distance = 110,
      target = null,
      head = false;
    for (const box of this.boxes)
      distance = Math.min(distance, rayBox(origin, direction, box, distance));
    for (const other of this.players.values()) {
      if (other.id === p.id || other.health <= 0) continue;
      const height = other.input.crouch ? 0.65 : 1;
      for (const [isHead, box] of [
        [
          true,
          {
            x: [other.x - 0.2, other.x + 0.2],
            y: [other.y + 1.65 * height, other.y + 2.05 * height],
            z: [other.z - 0.2, other.z + 0.2],
          },
        ],
        [
          false,
          {
            x: [other.x - 0.32, other.x + 0.32],
            y: [other.y + 0.15, other.y + 1.65 * height],
            z: [other.z - 0.32, other.z + 0.32],
          },
        ],
      ]) {
        const hit = rayBox(origin, direction, box, distance);
        if (hit < distance) {
          distance = hit;
          target = other;
          head = isHead;
        }
      }
    }
    const end = {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance,
    };
    this.events.push({ type: 'shot', id: p.id, weapon: p.weapon, from: origin, to: end });
    p.recoil = Math.min(0.16, p.recoil + w.recoil);
    if (target) this.hurt(target, w.damage * (head ? 3 : 1), p, head);
  }
  reload(p) {
    const w = WEAPONS[p.weapon],
      slot = p.slots[p.weapon];
    if (!p.reload && slot.ammo < w.mag && slot.reserve > 0) p.reload = w.reload;
  }
  tick(dt) {
    dt = clamp(dt, 0, 0.1);
    this.elapsed += dt;
    this.time = Math.max(0, this.time - dt);
    if (this.time === 0) {
      if (this.phase === 'playing') {
        this.phase = 'intermission';
        this.time = 8;
        this.events.push({ type: 'roundEnd', scores: this.scores() });
      } else {
        this.phase = 'playing';
        this.time = this.duration;
        this.round++;
        for (const p of this.players.values()) {
          p.kills = p.deaths = p.headshots = 0;
          this.revive(p);
        }
        this.events.push({ type: 'roundStart', round: this.round });
      }
    }
    for (const p of this.players.values()) {
      if (p.respawn > 0) {
        p.respawn = Math.max(0, p.respawn - dt);
        if (p.respawn === 0) this.revive(p);
        continue;
      }
      if (this.phase !== 'playing') continue;
      p.protection = Math.max(0, p.protection - dt);
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.recoil = Math.max(0, p.recoil - dt * 0.1);
      if (p.reload > 0) {
        p.reload = Math.max(0, p.reload - dt);
        if (!p.reload) finishReload(p.slots[p.weapon], WEAPONS[p.weapon]);
      }
      const input =
        this.elapsed - p.lastInputAt > 0.3
          ? sanitizeInput({ seq: p.seq, yaw: p.yaw, pitch: p.pitch, weapon: p.weapon })
          : p.input;
      p.yaw = input.yaw;
      p.pitch = input.pitch;
      if (input.weapon !== p.weapon) {
        p.weapon = input.weapon;
        p.reload = 0;
        p.cooldown = 0.25;
      }
      if (((input.jump && !p.jumpHeld) || p.pendingJump) && p.y === 0) p.vy = 5.8;
      p.jumpHeld = input.jump;
      p.pendingJump = false;
      const speed =
        ((input.crouch ? 1.8 : input.walk ? 2.5 : 4.7) * (p.weapon === 2 ? 0.86 : 1) * dt) /
        Math.max(1, Math.hypot(input.forward, input.right));
      const dx = (-Math.sin(p.yaw) * input.forward + Math.cos(p.yaw) * input.right) * speed,
        dz = (-Math.cos(p.yaw) * input.forward - Math.sin(p.yaw) * input.right) * speed;
      if (!blockedIn(this.map, p.x + dx, p.z, 0.32, p.y)) p.x += dx;
      if (!blockedIn(this.map, p.x, p.z + dz, 0.32, p.y)) p.z += dz;
      p.vy -= 16 * dt;
      p.y = Math.max(0, p.y + p.vy * dt);
      if (p.y === 0) p.vy = 0;
      if ((input.reload && !p.reloadHeld) || p.pendingReload) this.reload(p);
      p.reloadHeld = input.reload;
      p.pendingReload = false;
      if (
        (input.fire || p.pendingFire) &&
        (WEAPONS[p.weapon].automatic || !p.fireHeld || p.pendingFire)
      )
        this.shoot(p);
      p.fireHeld = input.fire;
      p.pendingFire = false;
    }
  }
  scores() {
    return [...this.players.values()]
      .map((p) => ({
        id: p.id,
        name: p.name,
        kills: p.kills,
        deaths: p.deaths,
        headshots: p.headshots,
      }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }
  snapshot() {
    return {
      type: 'snapshot',
      map: this.map.id,
      time: this.time,
      round: this.round,
      phase: this.phase,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        z: p.z,
        yaw: p.yaw,
        pitch: p.pitch,
        crouch: p.input.crouch,
        health: p.health,
        armor: p.armor,
        weapon: p.weapon,
        slots: p.slots,
        kills: p.kills,
        deaths: p.deaths,
        headshots: p.headshots,
        respawn: p.respawn,
        protection: p.protection,
        reload: p.reload,
        generation: p.generation,
        ack: p.seq,
      })),
      scores: this.scores(),
      events: this.events.splice(0),
    };
  }
}
