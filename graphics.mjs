import * as THREE from './vendor/three.module.js';
import { GRID, TILE, CRATES, ACTIVE_MAP } from './arena.mjs';

const white = new THREE.Color(0xffffff);
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cube(parent, material, x, y, z, w, h, d) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}
function sphere(parent, material, x, y, z, rx, ry, rz, segments = 16) {
  const m = mesh(parent, new THREE.SphereGeometry(1, segments, 12), material, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
}
function cylinder(parent, material, x, y, z, r, h, axis = 'y', top = r, segments = 16) {
  const m = mesh(parent, new THREE.CylinderGeometry(top, r, h, segments), material, x, y, z);
  if (axis === 'z') m.rotation.x = Math.PI / 2;
  if (axis === 'x') m.rotation.z = Math.PI / 2;
  return m;
}
function bevel(parent, material, x, y, z, w, h, d, b = 0.008) {
  b = Math.min(b, w / 5, h / 5, d / 5);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + b, -h / 2 + b);
  s.lineTo(w / 2 - b, -h / 2 + b);
  s.lineTo(w / 2 - b, h / 2 - b);
  s.lineTo(-w / 2 + b, h / 2 - b);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: d - 2 * b,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geo.translate(0, 0, -d / 2 + b);
  return mesh(parent, geo, material, x, y, z);
}
// Extrude a longitudinal silhouette across the weapon's width instead of assembling blocks.
function profile(parent, material, points, width, x = 0, y = 0, z = 0) {
  const shape = new THREE.Shape();
  points.forEach(([l, v], i) => (i ? shape.lineTo(l, v) : shape.moveTo(l, v)));
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(Math.PI / 2);
  return mesh(parent, geo, material, x, y, z);
}
function segment(parent, material, a, b, r1, r2 = r1) {
  const va = new THREE.Vector3(...a),
    vb = new THREE.Vector3(...b),
    direction = vb.clone().sub(va);
  const m = mesh(
    parent,
    new THREE.CylinderGeometry(r2, r1, direction.length(), 12),
    material,
    ...va.clone().add(vb).multiplyScalar(0.5).toArray(),
  );
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return m;
}
function capsule(parent, material, x, y, z, r, length, sx = 1, sz = 1) {
  const m = mesh(parent, new THREE.CapsuleGeometry(r, length, 4, 12), material, x, y, z);
  m.scale.set(sx, 1, sz);
  return m;
}
function clothTex(base, type) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  let seed = 1357;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = rnd() > 0.5 ? '#ffffff10' : '#00000014';
    g.fillRect(
      rnd() * 256,
      rnd() * 256,
      type === 'wood' ? 1 : 1 + rnd() * 14,
      type === 'wood' ? 15 + rnd() * 60 : 1,
    );
  }
  if (type === 'cloth') {
    g.strokeStyle = '#0000001b';
    g.lineWidth = 0.5;
    for (let i = 0; i < 256; i += 3) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 256);
      g.moveTo(0, i);
      g.lineTo(256, i);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function tile(image, q, renderer) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d'),
    half = image.width / 2;
  g.drawImage(image, (q % 2) * half, Math.floor(q / 2) * half, half, half, 0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
async function loadImage(url) {
  const image = new Image();
  image.src = new URL(url, import.meta.url).href;
  await image.decode();
  return image;
}
export async function createArt(renderer) {
  const [environment, soldier] = await Promise.all([
    loadImage('./assets/dust-material-atlas.png'),
    loadImage('./assets/soldier-material-atlas.png'),
  ]);
  const env = Array.from({ length: 4 }, (_, i) => tile(environment, i, renderer)),
    man = Array.from({ length: 4 }, (_, i) => tile(soldier, i, renderer));
  const material = (color, map = null, extras = {}) =>
    new THREE.MeshStandardMaterial({ color, map, roughness: 0.86, ...extras });
  const stone = material(0xc9b89d, env[0], {
    bumpMap: env[0],
    bumpScale: 0.07,
    vertexColors: true,
  });
  const plaster = material(0xe0cfaa, env[3], {
    bumpMap: env[3],
    bumpScale: 0.035,
    vertexColors: true,
  });
  const ground = material(0xd2c5ad, env[1], {
    bumpMap: env[1],
    bumpScale: 0.04,
    vertexColors: true,
  });
  const timber = material(0xbba888, env[2], { bumpMap: env[2], bumpScale: 0.035 });
  const fabric = material(0xddddc4, man[0], { bumpMap: man[0], bumpScale: 0.008 });
  const vest = material(0x9caa87, man[1], { bumpMap: man[1], bumpScale: 0.008 });
  const glove = material(0x878887, man[2], { bumpMap: man[2], bumpScale: 0.006 });
  const metalMap = clothTex('#7e858a', 'metal');
  return {
    stone,
    plaster,
    ground,
    timber,
    fabric,
    vest,
    glove,
    steel: material(0x3f4548, metalMap, { metalness: 0.4, roughness: 0.5 }),
    edge: material(0x697277, metalMap, { metalness: 0.45, roughness: 0.4 }),
    black: material(0x24282c, metalMap, { metalness: 0.15, roughness: 0.58 }),
    silver: material(0xb5b7b8, metalMap, { metalness: 0.6, roughness: 0.35 }),
    wood: material(0xa77849, clothTex('#985931', 'wood'), { roughness: 0.65 }),
    rubber: material(0x292d2d, null, { roughness: 1 }),
    skin: material(0xb89679, clothTex('#b99375', 'cloth')),
    face: material(0xffffff, man[3]),
    trim: material(0xb7a184, env[0], { bumpMap: env[0], bumpScale: 0.03 }),
    pipe: material(0x5e605c, null, { metalness: 0.25 }),
    window: material(0x283438, null, { roughness: 0.45 }),
    belt: material(0x3e4238, man[2]),
    lens: material(0x315557, null, { metalness: 0.4, roughness: 0.15 }),
    dust: material(0xbab19c),
    env,
    man,
  };
}
function project(mesh, scale = 4, dirt = true) {
  // World aligned UVs keep masonry courses continuous across adjacent wall segments.
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry,
    p = geo.attributes.position,
    n = geo.attributes.normal,
    uv = geo.attributes.uv,
    color = new Float32Array(p.count * 3),
    v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    let u, w;
    if (Math.abs(n.getY(i)) > 0.5) {
      u = v.x / scale;
      w = v.z / scale;
    } else {
      u = (Math.abs(n.getX(i)) > 0.5 ? v.z : v.x) / scale;
      w = v.y / scale;
    }
    uv.setXY(i, u, w);
    const value = dirt ? 0.66 + 0.34 * Math.min(1, Math.max(0, v.y) / 2) : 1;
    color[i * 3] = value;
    color[i * 3 + 1] = value;
    color[i * 3 + 2] = value;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return mesh;
}
function mergeMeshes(meshes) {
  const attributes = { position: [], normal: [], uv: [], color: [] };
  let count = 0;
  for (const m of meshes) {
    m.updateMatrixWorld(true);
    const g = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(
      m.matrixWorld,
    );
    count += g.attributes.position.count;
    for (const key of Object.keys(attributes)) {
      let attr = g.getAttribute(key);
      if (!attr) {
        const size = key === 'uv' ? 2 : 3,
          data = new Float32Array(g.attributes.position.count * size);
        data.fill(key === 'color' ? 1 : 0);
        attr = new THREE.BufferAttribute(data, size);
      }
      attributes[key].push(attr.array);
    }
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  for (const [key, arrays] of Object.entries(attributes)) {
    const size = key === 'uv' ? 2 : 3,
      data = new Float32Array(count * size);
    let offset = 0;
    for (const array of arrays) {
      data.set(array, offset);
      offset += array.length;
    }
    geo.setAttribute(key, new THREE.BufferAttribute(data, size));
  }
  geo.computeBoundingSphere();
  return geo;
}
export function batchGroup(group, preserve = new Set()) {
  group.updateMatrixWorld(true);
  const byMaterial = new Map();
  group.traverse((m) => {
    if (m.isMesh && !Array.isArray(m.material) && !m.material.transparent && !preserve.has(m)) {
      const key = m.material.uuid;
      if (!byMaterial.has(key)) byMaterial.set(key, []);
      byMaterial.get(key).push(m);
    }
  });
  const inverse = group.matrixWorld.clone().invert();
  for (const meshes of byMaterial.values()) {
    if (meshes.length < 2) continue;
    const geometry = mergeMeshes(meshes);
    geometry.applyMatrix4(inverse);
    const result = new THREE.Mesh(geometry, meshes[0].material);
    result.castShadow = true;
    result.receiveShadow = true;
    group.add(result);
    for (const m of meshes) {
      m.removeFromParent();
      if (!preserve.has(m)) m.geometry.dispose();
    }
  }
}
function decal(parent, text, position, size, rotation = 0, color = '#854023', board = false) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  if (board) {
    g.fillStyle = '#1e3839';
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#b7b496';
    g.lineWidth = 10;
    g.strokeRect(9, 9, 494, 238);
  }
  g.fillStyle = color;
  g.font = 'bold 124px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 133);
  if (!board) {
    let seed = 47;
    for (let i = 0; i < 320; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 512;
      seed = (seed * 16807) % 2147483647;
      g.clearRect(x, seed % 256, 2 + (seed % 4), 1 + (seed % 2));
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    depthWrite: false,
  });
  const m = mesh(parent, new THREE.PlaneGeometry(...size), material, ...position);
  m.rotation.y = rotation;
  m.castShadow = false;
  return m;
}
function arch(parent, a, x, z, width = 8, base = 1.25, depth = 0.75, colliders = []) {
  const inner = width / 2 - 0.65,
    outer = width / 2 - 0.06;
  for (let i = 0; i < 13; i++) {
    const t0 = (i / 13) * Math.PI + 0.009,
      t1 = ((i + 1) / 13) * Math.PI - 0.009;
    const shape = new THREE.Shape();
    shape.moveTo(Math.cos(t0) * inner, Math.sin(t0) * inner);
    shape.lineTo(Math.cos(t0) * outer, Math.sin(t0) * outer);
    shape.lineTo(Math.cos(t1) * outer, Math.sin(t1) * outer);
    shape.lineTo(Math.cos(t1) * inner, Math.sin(t1) * inner);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    const m = mesh(parent, geo, a.trim, x, base, z);
    colliders.push(m);
  }
  for (const sign of [-1, 1]) {
    const m = cube(
      parent,
      a.trim,
      x + (sign * (inner + outer)) / 2,
      base / 2,
      z,
      outer - inner,
      base,
      depth,
    );
    colliders.push(m);
    cube(
      parent,
      a.trim,
      x + (sign * (inner + outer)) / 2,
      base - 0.06,
      z,
      outer - inner + 0.1,
      0.17,
      depth + 0.1,
    );
  }
}
function crate(parent, a, x, z, w, d, h) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  parent.add(root);
  cube(root, a.timber, 0, h / 2, 0, w, h, d);
  const strip = 0.11;
  for (const side of [-1, 1])
    for (const y of [0.13, h - 0.13])
      cube(root, a.wood, 0, y, side * (d / 2 + 0.018), w, 0.16, 0.06);
  for (const side of [-1, 1])
    for (const edge of [-1, 1])
      cube(root, a.wood, edge * (w / 2 - 0.11), h / 2, side * (d / 2 + 0.018), 0.16, h, 0.06);
  for (const side of [-1, 1])
    for (const y of [0.3, h - 0.3])
      for (const x of [-w / 2 + 0.24, w / 2 - 0.24])
        cylinder(root, a.steel, x, y, side * (d / 2 + 0.058), 0.025, 0.02, 'z', 0.025, 6);
  return root;
}
export function buildEnvironment(scene, a, colliders) {
  if (ACTIVE_MAP.id !== 'dust') return buildThemedEnvironment(scene, a, colliders, ACTIVE_MAP);
  const world = new THREE.Group();
  scene.add(world);
  const blockers = [];
  const solid = (x, y, z, w, h, d, material = a.stone) => {
    const m = cube(world, material, x, y, z, w, h, d);
    project(m, 4);
    blockers.push(m);
    return m;
  };
  const ground = cube(world, a.ground, 40, -0.13, 34, 80, 0.26, 68);
  project(ground, 5, false);
  // Only exposed faces are dressed; structural grid collision remains unchanged.
  for (let z = 0; z < GRID.length; z++)
    for (let x = 0; x < GRID[z].length; x++)
      if (GRID[z][x] === '#') {
        const outer = x === 0 || z === 0 || x === 19 || z === 16,
          h = outer ? 7.6 : 5.7,
          cx = (x + 0.5) * TILE,
          cz = (z + 0.5) * TILE;
        solid(cx, h / 2, cz, 4, h, 4, (x + z) % 7 < 2 ? a.plaster : a.stone);
        const cap = cube(world, a.trim, cx, h + 0.08, cz, 4.13, 0.22, 4.13);
        project(cap, 4, false);
        for (const [dx, dz, rot] of [
          [0, 1, 0],
          [0, -1, Math.PI],
          [1, 0, Math.PI / 2],
          [-1, 0, -Math.PI / 2],
        ]) {
          if (GRID[z + dz]?.[x + dx] === undefined || GRID[z + dz]?.[x + dx] === '#') continue;
          const face = new THREE.Group();
          face.position.set(cx + dx * 2.025, 0, cz + dz * 2.025);
          face.rotation.y = rot;
          world.add(face);
          cube(face, a.trim, 0, 0.17, 0, 4, 0.34, 0.075);
          cube(face, a.trim, 0, h - 0.53, 0, 4, 0.13, 0.11);
          if ((x * 3 + z * 7) % 5 === 0) {
            const windowY = h - 1.85;
            cube(face, a.window, 0, windowY, 0.055, 1.25, 1.45, 0.08);
            cube(face, a.trim, 0, windowY + 0.77, 0.13, 1.5, 0.18, 0.28);
            cube(face, a.trim, 0, windowY - 0.77, 0.13, 1.5, 0.18, 0.3);
            for (const side of [-1, 1])
              cube(face, a.trim, side * 0.72, windowY, 0.12, 0.16, 1.55, 0.2);
            cube(face, a.pipe, 0, windowY, 0.15, 0.065, 1.35, 0.035);
            cube(face, a.pipe, 0, windowY, 0.15, 1.2, 0.065, 0.035);
            if ((x + z) % 2) {
              for (const side of [-1, 1]) {
                cube(face, a.wood, side * 0.58, windowY, 0.19, 0.38, 1.35, 0.08);
                for (let k = 0; k < 8; k++)
                  cube(
                    face,
                    a.black,
                    side * 0.58,
                    windowY - 0.57 + k * 0.16,
                    0.235,
                    0.32,
                    0.025,
                    0.018,
                  );
              }
            }
          } else if ((x + z) % 9 === 0) {
            cube(face, a.pipe, 1.72, 2.5, 0.15, 0.08, 5, 0.08);
            cylinder(face, a.pipe, 1.72, 0.48, 0.15, 0.07, 0.17);
          }
        }
      }
  // Preserve independent invisible shot blockers while batching the visible architecture.
  for (const m of blockers) {
    m.updateMatrixWorld(true);
    const clone = new THREE.Mesh(m.geometry.clone(), m.material);
    clone.matrix.copy(m.matrixWorld);
    clone.matrixAutoUpdate = false;
    clone.updateMatrixWorld(true);
    colliders.push(clone);
  }
  for (const [x, z, w, d, h] of CRATES) {
    crate(world, a, x, z, w, d, h);
    const blocker = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), a.timber);
    blocker.position.set(x, h / 2, z);
    blocker.updateMatrixWorld(true);
    colliders.push(blocker);
  }
  // Segmented stone arches, ceiling ribs and warm practical lamps.
  for (const z of [26, 36]) arch(world, a, 16, z, 8, 1.2, 0.85, colliders);
  const roof = solid(16, 5.15, 31, 8, 0.45, 10, a.stone);
  roof.updateMatrixWorld(true);
  const roofBlocker = new THREE.Mesh(roof.geometry.clone(), roof.material);
  roofBlocker.position.copy(roof.position);
  roofBlocker.updateMatrixWorld(true);
  colliders.push(roofBlocker);
  for (const z of [27, 30, 33, 35]) cube(world, a.trim, 16, 4.88, z, 7.2, 0.18, 0.2);
  for (const z of [29, 34]) {
    cube(world, a.black, 16, 4.86, z, 0.7, 0.1, 0.22);
    const lamp = cube(
      world,
      new THREE.MeshBasicMaterial({ color: 0xffdfac }),
      16,
      4.8,
      z,
      0.5,
      0.035,
      0.13,
    );
    lamp.castShadow = false;
    const light = new THREE.PointLight(0xffc078, 13, 9);
    light.position.set(16, 4.4, z);
    world.add(light);
  }
  // Double doors, modeled planks and metal straps, open away from the center of the route.
  for (const sign of [-1, 1]) {
    const door = new THREE.Group();
    door.position.set(60 + sign * 3.4, 0, 30);
    door.rotation.y = sign * 0.38;
    world.add(door);
    cube(door, a.timber, 0, 2.05, 0, 2.1, 4.1, 0.22);
    for (let i = 0; i < 8; i++)
      cube(door, a.wood, -0.94 + i * 0.265, 2.05, -0.126, 0.017, 4.04, 0.025);
    for (const y of [0.43, 2.05, 3.63]) {
      cube(door, a.black, 0, y, -0.16, 2.12, 0.11, 0.06);
      for (const x of [-0.86, -0.3, 0.3, 0.86])
        cylinder(door, a.edge, x, y, -0.2, 0.025, 0.025, 'z', 0.025, 6);
    }
    const handle = mesh(
      door,
      new THREE.TorusGeometry(0.095, 0.016, 6, 12),
      a.steel,
      -sign * 0.65,
      1.85,
      -0.22,
    );
  }
  arch(world, a, 60, 30, 8, 1.2, 0.55, colliders);
  for (const [label, x, z] of [
    ['A', 50, 10],
    ['B', 34, 46],
  ]) {
    const ring = mesh(
      world,
      new THREE.RingGeometry(3.05, 3.12, 48),
      new THREE.MeshBasicMaterial({ color: 0x814124, side: THREE.DoubleSide }),
      x,
      0.019,
      z,
    );
    ring.rotation.x = -Math.PI / 2;
    const mark = decal(world, label, [x, 0.025, z], [2.9, 2.9]);
    mark.rotation.x = -Math.PI / 2;
  }
  decal(world, 'A →', [30.035, 2.2, 14], [2.8, 1.4], Math.PI / 2);
  decal(world, '← B', [20.035, 2.3, 42], [2.8, 1.4], Math.PI / 2);
  decal(world, 'A', [50, 2.45, 4.035], [2.3, 1.8]);
  decal(world, 'B', [34, 2.45, 51.965], [2.3, 1.8], Math.PI);
  decal(world, 'کویر', [4.035, 3, 58], [2.8, 1.25], Math.PI / 2, '#d7d1bc', true);
  // Sidewalk seams, debris and local contact shadows add ground-scale detail without new obstacles.
  const contactTexture = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d'),
      gradient = g.createRadialGradient(64, 64, 12, 64, 64, 64);
    gradient.addColorStop(0, '#24190bb0');
    gradient.addColorStop(1, '#24190b00');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const contactMat = new THREE.MeshBasicMaterial({
    map: contactTexture,
    transparent: true,
    depthWrite: false,
  });
  for (const [x, z, w, d] of CRATES) {
    const m = mesh(world, new THREE.PlaneGeometry(w + 1.4, d + 1.4), contactMat, x, 0.012, z);
    m.rotation.x = -Math.PI / 2;
    m.castShadow = false;
  }
  let seed = 373;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 140; i++) {
    const x = rnd() * 76 + 2,
      z = rnd() * 64 + 2;
    if (GRID[Math.floor(z / 4)]?.[Math.floor(x / 4)] === '#') continue;
    const m = mesh(
      world,
      new THREE.DodecahedronGeometry(0.018 + rnd() * 0.065, 0),
      a.dust,
      x,
      0.025,
      z,
    );
    m.scale.y = 0.25;
    m.castShadow = false;
  }
  // Rooftop skyline: layered plaster facades, small balconies, cables, dishes and minaret.
  for (let i = 0; i < 10; i++) {
    const x = 4 + i * 8.4,
      h = 8 + (i % 4) * 1.3;
    const building = cube(world, a.plaster, x, h / 2, -5, 7.5, h, 8);
    project(building, 5, false);
    cube(world, a.trim, x, h + 0.12, -5, 7.9, 0.3, 8.4);
    for (let y = 2.8; y < h - 0.8; y += 2.5)
      for (const dx of [-1.7, 1.7]) {
        cube(world, a.window, x + dx, y, -0.985, 1, 1.3, 0.08);
        cube(world, a.trim, x + dx, y - 0.72, -0.83, 1.25, 0.15, 0.38);
      }
  }
  const tower = cylinder(world, a.plaster, 72, 9, -11, 1.8, 18, 'y', 1.4, 16);
  const balcony = cylinder(world, a.trim, 72, 14, -11, 2.1, 0.45);
  const dome = mesh(
    world,
    new THREE.SphereGeometry(1.8, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    a.trim,
    72,
    18,
    -11,
  );
  cylinder(world, a.pipe, 72, 20, -11, 0.045, 1.8);
  for (const [x, z] of [
    [9, 6],
    [73, 22],
    [6, 46],
  ]) {
    cylinder(world, a.pipe, x, 8.2, z, 0.035, 2.3);
    const dish = mesh(
      world,
      new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      a.edge,
      x,
      9.1,
      z,
    );
    dish.rotation.z = 0.6;
  }
  for (const z of [17, 49]) {
    const points = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      points.push(new THREE.Vector3(4 + 72 * t, 7.8 - Math.sin(t * Math.PI) * 1.4, z));
    }
    const cable = mesh(
      world,
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, 0.015, 4, false),
      a.black,
    );
    cable.castShadow = false;
  }
  // Merge static props by material to offset the extra detail's draw-call cost.
  const preserve = new Set(colliders.filter((m) => m.parent));
  batchGroup(world, preserve);
  scene.updateMatrixWorld(true);
  return { world, textureCount: 8 };
}

function surfaceTexture(theme, floor = false) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle =
    theme === 'nuke'
      ? floor
        ? '#979fa0'
        : '#c3cbd0'
      : theme === 'train'
        ? floor
          ? '#929085'
          : '#b2947c'
        : floor
          ? '#c1b7a3'
          : '#ddbda5';
  g.fillRect(0, 0, 256, 256);
  let seed = 273;
  for (let i = 0; i < 1700; i++) {
    seed = (seed * 16807) % 2147483647;
    const x = seed % 256;
    seed = (seed * 16807) % 2147483647;
    g.fillStyle = i % 2 ? '#ffffff12' : '#00000016';
    g.fillRect(x, seed % 256, 2, 2);
  }
  g.strokeStyle = '#252a3038';
  g.lineWidth = 2;
  const step = theme === 'nuke' ? 64 : floor ? 32 : 16;
  for (let z = 0; z <= 256; z += step) {
    g.beginPath();
    g.moveTo(0, z);
    g.lineTo(256, z);
    g.stroke();
    for (let x = 0; x <= 256; x += floor ? 32 : 64) {
      g.beginPath();
      g.moveTo(x + ((z / step) % 2) * 16, z);
      g.lineTo(x + ((z / step) % 2) * 16, z + step);
      g.stroke();
    }
  }
  if (theme === 'nuke' && !floor) {
    g.fillStyle = '#535d66';
    for (let y = 4; y < 256; y += 64) for (let x = 4; x < 256; x += 64) g.fillRect(x, y, 3, 3);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
function buildThemedEnvironment(scene, base, colliders, map) {
  const world = new THREE.Group();
  world.name = `map-${map.id}`;
  scene.add(world);
  const palette = map.palette;
  const a = { ...base };
  for (const key of ['stone', 'plaster', 'ground', 'trim', 'timber', 'steel', 'edge', 'silver'])
    a[key] = base[key].clone();
  a.stone.color.setHex(palette.wall);
  a.plaster.color.setHex(palette.plaster);
  a.ground.color.setHex(palette.floor);
  a.trim.color.setHex(palette.trim);
  if (map.theme === 'nuke') {
    a.trim.map = null;
    a.trim.bumpMap = null;
    a.steel.color.setHex(0x647780);
    a.steel.metalness = 0.15;
    a.steel.emissive.setHex(0x101820);
    a.silver.metalness = 0.15;
    a.silver.roughness = 0.65;
  }
  if (map.theme !== 'mirage') {
    const wall = surfaceTexture(map.theme),
      floor = surfaceTexture(map.theme, true);
    for (const key of ['stone', 'plaster']) {
      a[key].map = a[key].bumpMap = wall;
    }
    a.ground.map = a.ground.bumpMap = floor;
  }
  const accent = new THREE.MeshStandardMaterial({
    color: map.theme === 'nuke' ? 0xe5b94e : map.theme === 'inferno' ? 0x853e31 : 0x65736f,
    roughness: 0.75,
  });
  const solid = (x, y, z, w, h, d, material = a.stone) => {
    const m = project(cube(world, material, x, y, z, w, h, d), 4);
    m.updateMatrixWorld(true);
    const blocker = new THREE.Mesh(m.geometry.clone(), material);
    blocker.matrix.copy(m.matrixWorld);
    blocker.matrixAutoUpdate = false;
    blocker.updateMatrixWorld(true);
    colliders.push(blocker);
    return m;
  };
  const width = map.grid[0].length * TILE,
    depth = map.grid.length * TILE;
  project(
    cube(world, a.ground, width / 2, -0.13, depth / 2, width, 0.26, depth),
    map.theme === 'inferno' ? 2 : 5,
    false,
  );
  for (let z = 0; z < map.grid.length; z++)
    for (let x = 0; x < map.grid[z].length; x++)
      if (map.grid[z][x] === '#') {
        const outer =
            x === 0 || z === 0 || x === map.grid[0].length - 1 || z === map.grid.length - 1,
          h = outer ? 7.6 : 5.7,
          cx = (x + 0.5) * TILE,
          cz = (z + 0.5) * TILE;
        solid(cx, h / 2, cz, TILE, h, TILE, (x + z) % 4 ? a.stone : a.plaster);
        project(cube(world, a.trim, cx, h + 0.08, cz, 4.08, 0.22, 4.08), 4, false);
        for (const [dx, dz, rotation] of [
          [0, 1, 0],
          [0, -1, Math.PI],
          [1, 0, Math.PI / 2],
          [-1, 0, -Math.PI / 2],
        ]) {
          if (!map.grid[z + dz]?.[x + dx] || map.grid[z + dz][x + dx] === '#') continue;
          const face = new THREE.Group();
          face.position.set(cx + dx * 2.015, 0, cz + dz * 2.015);
          face.rotation.y = rotation;
          world.add(face);
          cube(face, a.trim, 0, 0.18, 0, 4, 0.35, 0.06);
          if (map.theme === 'nuke') {
            cube(face, accent, 0, 1.1, 0.04, 4, 0.16, 0.06);
            if ((x + z) % 4 === 0) {
              cube(face, a.steel, 0, 2.5, 0.11, 1.5, 1.2, 0.16);
              cube(face, a.window, 0, 2.6, 0.205, 1.25, 0.65, 0.035);
              cube(face, accent, 0.45, 2.14, 0.22, 0.18, 0.08, 0.03);
            }
            if ((x + z) % 5 === 0) {
              cylinder(face, a.pipe, 1.55, 3, 0.18, 0.1, 5.5);
              for (const y of [0.5, 2, 3.5, 5]) cube(face, a.edge, 1.55, y, 0.17, 0.26, 0.1, 0.26);
            }
          } else if ((x * 5 + z * 3) % 3 === 0) {
            cube(face, a.window, 0, 3.6, 0.04, 1.35, 1.7, 0.05);
            for (const sign of [-1, 1]) {
              cube(face, a.trim, sign * 0.75, 3.6, 0.08, 0.13, 1.9, 0.12);
              cube(
                face,
                map.theme === 'inferno' ? accent : a.wood,
                sign * 0.47,
                3.6,
                0.13,
                0.35,
                1.55,
                0.06,
              );
            }
            cube(face, a.trim, 0, 2.68, 0.13, 1.7, 0.15, 0.35);
            if (map.theme === 'inferno' && (x + z) % 2 === 0) {
              cube(face, a.steel, 0, 2.45, 0.4, 1.8, 0.05, 0.7);
              for (const sign of [-1, 1])
                cube(face, a.steel, sign * 0.85, 2.8, 0.7, 0.05, 0.7, 0.05);
              cube(face, a.steel, 0, 3.13, 0.7, 1.75, 0.045, 0.05);
            }
          }
        }
      }
  for (const [x, z, w, d, h] of map.crates) {
    if (map.theme === 'train') {
      const body = solid(x, h / 2, z, w, h, d, accent);
      cube(world, a.edge, x, h + 0.06, z, w + 0.1, 0.12, d + 0.1);
      for (const side of [-1, 1]) {
        for (let k = 0; k < 5; k++)
          cube(
            world,
            a.steel,
            x + side * (w / 2 + 0.025),
            h / 2,
            z - d / 2 + 0.6 + (k * (d - 1.2)) / 4,
            0.08,
            h - 0.3,
            0.12,
          );
        for (const dz of [-d / 2 + 1, d / 2 - 1])
          cylinder(world, a.black, x + side * (w / 2 - 0.14), 0.38, z + dz, 0.37, 0.2, 'x');
      }
      for (const side of [-1, 1]) cube(world, a.steel, x + side * 0.7, 0.035, z, 0.08, 0.07, d + 4);
      decal(world, 'راه‌آهن', [x - w / 2 - 0.05, 1.8, z], [3, 1], -Math.PI / 2, '#ded8c8', false);
    } else if (map.theme === 'mirage' && x === 54 && z === 46) {
      cylinder(world, a.trim, x, 0.25, z, w / 2, 0.5);
      cylinder(world, a.stone, x, h / 2, z, 0.2, h);
      const water = new THREE.MeshStandardMaterial({
        color: 0x5bacae,
        roughness: 0.25,
        metalness: 0.1,
      });
      cylinder(world, water, x, 0.52, z, w / 2 - 0.12, 0.035);
      cylinder(world, a.trim, x, h - 0.2, z, 0.7, 0.25);
      const blocker = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), a.stone);
      blocker.position.set(x, h / 2, z);
      blocker.updateMatrixWorld(true);
      colliders.push(blocker);
    } else if (map.theme === 'nuke' && h >= 4) {
      solid(x, 0.3, z, w, 0.6, d, a.steel);
      cylinder(world, a.silver, x, h / 2, z, Math.min(w, d) / 2, h - 0.1);
      cylinder(world, accent, x, h - 0.4, z, Math.min(w, d) / 2 + 0.03, 0.2);
      cylinder(world, a.edge, x, h + 0.02, z, Math.min(w, d) / 2, 0.08);
      // Square bounds match arena collision around the cylindrical vessel.
      const blocker = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), a.steel);
      blocker.position.set(x, h / 2, z);
      blocker.updateMatrixWorld(true);
      colliders.push(blocker);
    } else {
      crate(world, a, x, z, w, d, h);
      const blocker = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), a.timber);
      blocker.position.set(x, h / 2, z);
      blocker.updateMatrixWorld(true);
      colliders.push(blocker);
    }
  }
  for (const [x, z, w, d] of map.roofs) {
    solid(x + w / 2, 6.15, z + d / 2, w, 0.3, d, map.theme === 'nuke' ? a.steel : a.stone);
    for (let zz = z + 2; zz < z + d; zz += 6)
      cube(world, a.trim, x + w / 2, 5.86, zz, w, 0.2, 0.17);
    const light = new THREE.PointLight(
      map.theme === 'nuke' ? 0xbde6ff : 0xffd5a1,
      map.theme === 'nuke' ? 65 : 30,
      24,
    );
    light.position.set(x + w / 2, 5.6, z + d / 2);
    world.add(light);
    const lamp = new THREE.MeshBasicMaterial({ color: map.theme === 'nuke' ? 0xd3f3ff : 0xffe3b8 });
    cube(world, lamp, x + w / 2, 5.92, z + d / 2, 1.1, 0.05, 0.32);
  }
  for (const [x, z] of map.arches || []) arch(world, a, x, z, 7.5, 1.25, 0.7, colliders);
  for (const site of map.sites) {
    const ring = mesh(
      world,
      new THREE.RingGeometry(3.05, 3.14, 40),
      new THREE.MeshBasicMaterial({ color: 0xe5ae53, side: THREE.DoubleSide }),
      site.x,
      0.023,
      site.z,
    );
    ring.rotation.x = -Math.PI / 2;
    const mark = decal(world, site.name, [site.x, 0.028, site.z], [3, 3], 0, '#e9bc64');
    mark.rotation.x = -Math.PI / 2;
  }
  const sx = Math.floor(map.spawn.x / TILE),
    sz = Math.floor(map.spawn.z / TILE);
  for (const [x, z, label] of [[sx - 2, sz, map.name.split(' ')[0].toUpperCase()]]) {
    if (map.grid[z]?.[x] === '#')
      decal(
        world,
        label,
        [(x + 1) * TILE + 0.04, 2.6, (z + 0.5) * TILE],
        [3, 1.3],
        Math.PI / 2,
        '#e7d6b6',
        true,
      );
  }
  // Landmark silhouettes outside the closed playable boundary.
  for (let i = 0; i < 8; i++) {
    const x = 6 + (i * (width - 12)) / 7,
      h = 8 + (i % 3) * 1.2;
    project(cube(world, a.plaster, x, h / 2, -5, 8, h, 8), 4, false);
    if (map.theme === 'inferno') {
      const roof = mesh(world, new THREE.ConeGeometry(6.3, 3.2, 4), accent, x, h + 1.5, -5);
      roof.rotation.y = Math.PI / 4;
      for (const dx of [-2, 2]) cube(world, a.window, x + dx, h - 2, -0.96, 1.1, 1.5, 0.08);
    } else if (map.theme === 'nuke') {
      for (const y of [3, 6]) cube(world, accent, x, y, -0.94, 7.8, 0.3, 0.08);
      cylinder(world, a.steel, x, h + 4, -5, 0.9, 8);
    } else if (map.theme === 'train') {
      cube(world, a.edge, x, h, -5, 8.2, 0.25, 8.2);
      cube(world, a.window, x, h - 2, -0.95, 5, 1.4, 0.1);
    } else {
      cube(world, a.trim, x, h, -5, 8.3, 0.3, 8.3);
      for (const dx of [-2, 2]) cube(world, a.window, x + dx, h - 2, -0.96, 1, 1.6, 0.1);
    }
  }
  if (map.theme === 'mirage') {
    const palm = new THREE.MeshStandardMaterial({ color: 0x58744b, roughness: 1 });
    for (const [x, z] of [
      [3, 3],
      [width - 3, depth - 3],
      [width - 3, 3],
    ]) {
      cylinder(world, a.wood, x, 5, z, 0.27, 10, 'y', 0.15);
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const leaf = cube(
          world,
          palm,
          x + Math.cos(angle) * 1.1,
          9.6,
          z + Math.sin(angle) * 1.1,
          0.6,
          0.1,
          3.4,
        );
        leaf.rotation.set(0.35, Math.PI / 2 - angle, 0.15);
      }
    }
  }
  if (map.theme === 'inferno') {
    cube(world, a.plaster, width - 10, 9, -11, 4, 18, 4);
    cube(world, accent, width - 10, 18.6, -11, 5, 1.2, 5);
    for (const dx of [-1, 1]) cube(world, a.window, width - 10 + dx, 15, -8.96, 0.7, 1.8, 0.05);
  }
  if (map.theme === 'train') {
    for (const x of [9, width - 9]) cube(world, a.steel, x, 10, depth + 3, 0.8, 20, 0.8);
    cube(world, accent, width / 2, 19.5, depth + 3, width - 18, 1.2, 1.2);
    for (let x = 12; x < width - 10; x += 4) {
      const beam = cube(world, a.steel, x, 19.5, depth + 3, 0.13, 4.5, 0.13);
      beam.rotation.z = 0.75;
    }
  }
  batchGroup(world, new Set(colliders.filter((m) => m.parent)));
  scene.updateMatrixWorld(true);
  return {
    world,
    textureCount: 8,
    materials: [a.stone, a.plaster, a.ground, a.trim, a.timber, a.steel, a.edge, a.silver, accent],
  };
}
export function disposeEnvironment(environment, colliders, art) {
  const sharedMaterials = new Set(Object.values(art).filter((v) => v?.isMaterial)),
    sharedTextures = new Set([...art.env, ...art.man]);
  for (const material of sharedMaterials)
    for (const value of Object.values(material)) if (value?.isTexture) sharedTextures.add(value);
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  const collect = (m) => {
    if (m.geometry) geometries.add(m.geometry);
    for (const material of Array.isArray(m.material) ? m.material : [m.material])
      if (material && !sharedMaterials.has(material)) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value?.isTexture && !sharedTextures.has(value)) textures.add(value);
      }
  };
  environment.world.traverse(collect);
  colliders.forEach(collect);
  (environment.materials || []).forEach((material) => collect({ material }));
  environment.world.removeFromParent();
  colliders.length = 0;
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}

function finger(parent, a, start, end, r = 0.014) {
  return segment(parent, a.glove, start, end, r, r * 0.9);
}
function hand(parent, a, x, y, z, left = false) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  sphere(g, a.glove, 0, 0, 0, 0.045, 0.058, 0.074, 12);
  bevel(g, a.glove, 0, 0.025, 0.018, 0.072, 0.024, 0.07, 0.008);
  for (let i = 0; i < 4; i++) {
    const fx = -0.03 + i * 0.02;
    finger(g, a, [fx, -0.005, -0.043], [fx, -0.046, -0.071]);
    finger(g, a, [fx, -0.046, -0.071], [fx, -0.061, -0.026], 0.011);
  }
  finger(
    g,
    a,
    [left ? 0.034 : -0.034, 0.007, 0.025],
    [left ? 0.056 : -0.056, -0.03, -0.013],
    0.017,
  );
  return g;
}
function triggerGuard(parent, a, x, y, z, w = 0.072, h = 0.078) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-w / 2, h / 3, 0),
    new THREE.Vector3(-w / 2, -h / 2, 0),
    new THREE.Vector3(w / 2, -h / 2, 0),
    new THREE.Vector3(w / 2, h / 3, 0),
  ]);
  return mesh(parent, new THREE.TubeGeometry(curve, 12, 0.008, 6, false), a.steel, x, y, z);
}
export function buildWeapon(index, a, { view = true } = {}) {
  const root = new THREE.Group(),
    model = new THREE.Group();
  root.add(model);
  let magazine, bolt;
  const steel = index === 3 ? a.silver : a.steel,
    stock = index === 0 ? a.wood : index === 2 ? a.vest : a.black;
  const receiverY = 0.02;
  if (index === 3) {
    profile(
      model,
      a.silver,
      [
        [-0.03, 0.09],
        [0.3, 0.09],
        [0.35, 0.055],
        [0.35, -0.045],
        [0.06, -0.065],
        [-0.06, -0.04],
      ],
      0.08,
    );
    profile(
      model,
      a.black,
      [
        [-0.05, -0.02],
        [0.07, -0.035],
        [0.14, -0.07],
        [0.025, -0.29],
        [-0.075, -0.255],
        [-0.045, -0.12],
      ],
      0.074,
    );
    cylinder(model, a.steel, 0, 0.017, -0.36, 0.028, 0.05, 'z', 0.028);
    cylinder(model, a.black, 0, 0.017, -0.39, 0.019, 0.007, 'z');
    bevel(model, a.black, 0, 0.113, -0.275, 0.035, 0.028, 0.038, 0.002);
    bevel(model, a.black, 0, 0.11, 0.025, 0.052, 0.025, 0.025, 0.002);
    for (let i = 0; i < 7; i++)
      bevel(model, a.edge, 0.042, 0.028, 0.005 - i * 0.018, 0.008, 0.067, 0.006, 0.001);
    triggerGuard(model, a, 0, -0.103, -0.09, 0.08, 0.075);
    const trigger = cylinder(model, a.steel, 0, -0.08, -0.09, 0.007, 0.055);
    trigger.rotation.x = 0.24;
    magazine = bevel(model, a.black, 0, -0.286, 0.025, 0.08, 0.024, 0.09, 0.004);
    bolt = bevel(model, a.edge, 0.043, 0.005, 0.035, 0.018, 0.026, 0.046, 0.002);
  } else {
    profile(
      model,
      steel,
      [
        [-0.1, 0.085],
        [0.35, 0.085],
        [0.38, 0.03],
        [0.33, -0.077],
        [-0.075, -0.08],
      ],
      0.078,
    );
    bevel(model, a.edge, 0, 0.099, -0.11, 0.079, 0.037, 0.37, 0.008);
    profile(
      model,
      stock,
      [
        [-0.08, 0.025],
        [-0.19, 0.055],
        [-0.49, -0.055],
        [-0.49, -0.175],
        [-0.37, -0.16],
        [-0.14, -0.075],
      ],
      0.085,
    );
    bevel(model, a.rubber, 0, -0.112, 0.491, 0.095, 0.12, 0.028, 0.007);
    profile(
      model,
      index === 0 ? a.wood : a.black,
      [
        [-0.015, -0.068],
        [0.058, -0.073],
        [0.012, -0.26],
        [-0.075, -0.236],
      ],
      0.066,
    );
    triggerGuard(model, a, 0, -0.13, -0.107, 0.075, 0.07);
    cylinder(model, a.steel, 0, -0.117, -0.099, 0.006, 0.046);
    magazine = new THREE.Group();
    magazine.position.set(0, -0.075, -0.225);
    model.add(magazine);
    if (index === 0) {
      profile(
        magazine,
        a.steel,
        [
          [0, 0],
          [0.1, 0],
          [0.105, -0.12],
          [0.145, -0.23],
          [0.19, -0.32],
          [0.115, -0.35],
          [0.043, -0.245],
          [0.005, -0.12],
        ],
        0.055,
      );
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++) {
          const strip = new THREE.CatmullRomCurve3([
            new THREE.Vector3(side * 0.031, -0.055, -0.021 - i * 0.018),
            new THREE.Vector3(side * 0.031, -0.16, -0.035 - i * 0.018),
            new THREE.Vector3(side * 0.031, -0.29, -0.093 - i * 0.018),
          ]);
          mesh(magazine, new THREE.TubeGeometry(strip, 6, 0.004, 4, false), a.edge);
        }
      profile(
        model,
        a.wood,
        [
          [0.35, 0.052],
          [0.62, 0.037],
          [0.62, -0.048],
          [0.35, -0.067],
        ],
        0.085,
      );
      cylinder(model, a.steel, 0, 0.064, -0.59, 0.021, 0.42, 'z');
      cylinder(model, a.steel, 0, 0.008, -0.83, 0.018, 0.53, 'z');
      cylinder(model, a.edge, 0, 0.008, -1.1, 0.027, 0.055, 'z');
      cylinder(model, a.black, 0, 0.008, -1.133, 0.016, 0.006, 'z');
      bevel(model, a.steel, 0, 0.063, -0.96, 0.041, 0.095, 0.04, 0.004);
      const sight = mesh(
        model,
        new THREE.TorusGeometry(0.031, 0.009, 6, 12),
        a.steel,
        0,
        0.133,
        -0.96,
      );
      bevel(model, a.edge, 0, 0.123, -0.18, 0.037, 0.019, 0.07, 0.003);
      bolt = bevel(model, a.edge, 0.057, 0.035, -0.2, 0.062, 0.016, 0.043, 0.003);
    } else if (index === 1) {
      bevel(magazine, a.steel, 0, -0.145, -0.02, 0.055, 0.28, 0.09, 0.006).rotation.x = -0.12;
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++)
          bevel(
            magazine,
            a.edge,
            side * 0.032,
            -0.15,
            -0.003 - i * 0.021,
            0.008,
            0.205,
            0.006,
            0.001,
          );
      cylinder(model, a.black, 0, 0.025, -0.52, 0.06, 0.32, 'z', 0.052);
      for (let i = 0; i < 12; i++)
        cylinder(model, a.steel, 0, 0.025, -0.365 - i * 0.026, 0.063, 0.008, 'z');
      cylinder(model, a.edge, 0, 0.025, -0.82, 0.018, 0.32, 'z');
      cylinder(model, a.black, 0, 0.025, -1.047, 0.036, 0.21, 'z');
      cylinder(model, a.steel, 0, 0.025, -1.16, 0.038, 0.023, 'z');
      bevel(model, a.black, 0, 0.135, -0.08, 0.054, 0.115, 0.16, 0.005);
      bevel(model, a.black, 0, 0.184, -0.085, 0.047, 0.018, 0.175, 0.003);
      bevel(model, a.steel, 0, 0.105, -0.75, 0.024, 0.12, 0.027, 0.003);
      cylinder(model, a.steel, 0, 0.182, -0.75, 0.018, 0.043, 'x');
      for (let i = 0; i < 8; i++)
        bevel(model, a.edge, 0, 0.119, -0.2 - i * 0.03, 0.084, 0.012, 0.013, 0.002);
      bolt = bevel(model, a.edge, 0.045, 0.038, -0.06, 0.025, 0.035, 0.13, 0.003);
    } else {
      magazine = bevel(model, a.steel, 0, -0.145, -0.24, 0.065, 0.15, 0.12, 0.005);
      profile(
        model,
        a.vest,
        [
          [-0.46, -0.08],
          [-0.08, 0.015],
          [0.54, 0.035],
          [0.77, 0.001],
          [0.77, -0.06],
          [0.34, -0.106],
          [-0.39, -0.178],
        ],
        0.12,
      );
      cylinder(model, a.edge, 0, 0.085, -0.725, 0.017, 0.72, 'z');
      cylinder(model, a.black, 0, 0.085, -1.1, 0.021, 0.052, 'z');
      for (const l of [0.095, 0.33]) {
        bevel(model, a.steel, 0, 0.15, -l, 0.052, 0.14, 0.044, 0.005);
        const ring = mesh(model, new THREE.TorusGeometry(0.057, 0.009, 8, 16), a.edge, 0, 0.24, -l);
      }
      cylinder(model, a.black, 0, 0.24, -0.21, 0.05, 0.35, 'z');
      cylinder(model, a.black, 0, 0.24, -0.432, 0.071, 0.105, 'z', 0.048);
      cylinder(model, a.lens, 0, 0.24, -0.488, 0.058, 0.008, 'z');
      cylinder(model, a.black, 0, 0.24, 0.015, 0.062, 0.065, 'z');
      cylinder(model, a.lens, 0, 0.24, 0.052, 0.048, 0.005, 'z');
      cylinder(model, a.edge, 0.065, 0.245, -0.22, 0.023, 0.042, 'x');
      cylinder(model, a.edge, 0, 0.3, -0.22, 0.023, 0.035);
      bolt = new THREE.Group();
      bolt.position.set(0.055, 0.054, -0.02);
      model.add(bolt);
      segment(bolt, a.steel, [0, 0, 0], [0.075, -0.035, 0.012], 0.009);
      sphere(bolt, a.black, 0.083, -0.042, 0.014, 0.024, 0.024, 0.024, 10);
      for (const side of [-1, 1]) {
        const leg = cylinder(model, a.black, side * 0.048, -0.125, -0.76, 0.008, 0.19);
        leg.rotation.z = side * 0.22;
      }
    }
  }
  // Small fasteners, stamped receiver detail and charging cover break up the silhouette.
  for (const side of [-1, 1])
    for (const z of [-0.09, -0.26])
      cylinder(model, a.edge, side * 0.043, 0.014, z, 0.008, 0.008, 'x', 0.008, 6);
  if (view) {
    hand(model, a, 0.022, -0.148, 0.018);
    const forearm = segment(
      model,
      a.fabric,
      [0.04, -0.22, 0.085],
      [0.14, -0.37, 0.39],
      0.058,
      0.083,
    );
    cylinder(model, a.belt, 0.04, -0.218, 0.085, 0.061, 0.03);
    if (index !== 3) {
      hand(model, a, -0.035, -0.053, -0.49, true);
      segment(model, a.fabric, [-0.045, -0.105, -0.44], [-0.2, -0.32, -0.14], 0.057, 0.077);
    }
    root.position.set(
      index === 3 ? 0.2 : 0.22,
      index === 3 ? -0.22 : -0.22,
      index === 3 ? -0.61 : -0.63,
    );
    root.rotation.y = index === 3 ? 0.06 : 0.12;
    root.rotation.x = 0.045;
  } else {
    root.scale.setScalar(0.83);
  }
  root.userData = {
    model,
    magazine,
    bolt,
    index,
    muzzle: new THREE.Vector3(0, index === 2 ? 0.085 : 0.008, index === 3 ? -0.395 : -1.14),
  };
  // Batched meshes retain separate movable magazine / bolt pieces for reload animation.
  const preserve = new Set();
  magazine.traverse((o) => {
    if (o.isMesh) preserve.add(o);
  });
  bolt?.traverse((o) => {
    if (o.isMesh) preserve.add(o);
  });
  batchGroup(root, preserve);
  return root;
}
function facePatch(parent, a) {
  const geo = new THREE.PlaneGeometry(0.305, 0.366, 10, 12),
    p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i);
    p.setX(i, x * (1 - 0.3 * (y / 0.183) ** 2));
    p.setZ(i, 0.018 + Math.sqrt(Math.max(0, 1 - (x / 0.19) ** 2 - (y / 0.24) ** 2)) * 0.025);
  }
  geo.computeVertexNormals();
  const m = mesh(parent, geo, a.face, 0, 1.817, -0.15);
  m.rotation.y = Math.PI;
  m.userData.head = true;
  return m;
}
export function buildSoldier(index, a) {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const limbs = [];
  const jacket = index % 2 ? a.fabric : a.vest;
  // Tapered jacket and articulated pelvis, rather than a rectangular torso.
  const torso = cylinder(body, jacket, 0, 1.28, 0, 0.235, 0.59, 'y', 0.29, 12);
  torso.scale.z = 0.66;
  const shoulders = capsule(body, jacket, 0, 1.48, 0, 0.16, 0.34);
  shoulders.rotation.z = Math.PI / 2;
  shoulders.scale.z = 0.8;
  sphere(body, a.fabric, 0, 0.96, 0, 0.24, 0.18, 0.15);
  bevel(body, a.belt, 0, 1.02, -0.015, 0.44, 0.065, 0.3, 0.013);
  bevel(body, a.edge, 0, 1.02, -0.173, 0.07, 0.065, 0.016, 0.003);
  const plate = bevel(body, a.vest, 0, 1.3, -0.177, 0.37, 0.43, 0.08, 0.04);
  for (const side of [-1, 1]) {
    const strap = bevel(body, a.belt, side * 0.16, 1.44, -0.135, 0.055, 0.41, 0.06, 0.01);
    strap.rotation.z = side * -0.1;
  }
  for (let i = 0; i < 3; i++) {
    bevel(body, a.vest, -0.118 + i * 0.118, 1.19, -0.251, 0.1, 0.185, 0.075, 0.014);
    bevel(body, a.belt, -0.118 + i * 0.118, 1.29, -0.293, 0.089, 0.022, 0.01, 0.003);
  }
  bevel(body, a.vest, 0.22, 1.11, 0.038, 0.09, 0.16, 0.1, 0.014);
  bevel(body, a.vest, -0.22, 1.11, 0.04, 0.09, 0.14, 0.1, 0.014);
  // Neck, ellipsoid skull, ears, nose, face albedo and fabric helmet liner.
  cylinder(body, a.skin, 0, 1.66, 0, 0.07, 0.12);
  const headStart = body.children.length;
  const head = sphere(body, a.skin, 0, 1.825, 0, 0.177, 0.224, 0.171, 20);
  head.userData.head = true;
  facePatch(body, a);
  for (const side of [-1, 1])
    sphere(body, a.skin, side * 0.174, 1.83, -0.015, 0.032, 0.052, 0.032, 10).userData.head = true;
  sphere(body, a.skin, 0, 1.823, -0.222, 0.026, 0.042, 0.029, 12).userData.head = true;
  const helmet = mesh(
    body,
    new THREE.SphereGeometry(0.194, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    jacket,
    0,
    1.99,
    0.006,
  );
  helmet.scale.set(1, 1.1, 1.05);
  helmet.userData.head = true;
  const helmetBand = cylinder(body, a.belt, 0, 1.959, 0.005, 0.195, 0.034, 'y', 0.195, 20);
  helmetBand.scale.z = 1.02;
  helmetBand.userData.head = true;
  for (const side of [-1, 1])
    segment(body, a.belt, [side * 0.155, 1.94, -0.014], [side * 0.09, 1.665, -0.065], 0.009);
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.82;
  headGroup.scale.setScalar(0.72);
  for (const part of body.children.slice(headStart)) {
    part.position.y -= 1.82;
    headGroup.add(part);
  }
  body.add(headGroup);
  // Hip/knee hierarchy supplies an actual bend at the knee during the stride.
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.126, 0.96, 0);
    body.add(hip);
    capsule(hip, a.fabric, 0, -0.208, 0, 0.092, 0.24, 1, 0.91);
    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    hip.add(knee);
    capsule(knee, a.fabric, 0, -0.17, 0.01, 0.077, 0.23, 1, 0.9);
    sphere(knee, a.belt, 0, -0.035, -0.072, 0.071, 0.083, 0.027, 12);
    bevel(knee, a.rubber, 0, -0.42, -0.055, 0.15, 0.14, 0.28, 0.026);
    capsule(knee, a.rubber, 0, -0.33, 0.016, 0.078, 0.04, 1, 0.92);
    bevel(hip, a.vest, side * 0.088, -0.17, 0.02, 0.035, 0.16, 0.115, 0.007);
    limbs.push({ hip, knee });
  }
  // Shoulder / elbow chains are posed into a two-handed rifle hold.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.28, 1.48, -0.006);
    body.add(shoulder);
    capsule(shoulder, jacket, 0, -0.15, 0, 0.081, 0.18);
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.29, 0);
    shoulder.add(elbow);
    capsule(elbow, jacket, 0, -0.13, 0, 0.067, 0.16);
    sphere(elbow, a.belt, 0, -0.014, 0.053, 0.07, 0.07, 0.027, 10);
    const palm = hand(elbow, a, 0, -0.273, 0, side < 0);
    shoulder.rotation.x = side > 0 ? 0.45 : 0.95;
    shoulder.rotation.z = side > 0 ? -0.4 : 0.32;
    elbow.rotation.x = side > 0 ? 0.22 : 0.32;
    elbow.rotation.z = side > 0 ? -0.12 : 0.45;
    arms.push({ shoulder, elbow });
  }
  const rifle = buildWeapon(index % 2, a, { view: false });
  rifle.position.set(0.085, 1.23, -0.12);
  rifle.rotation.x = -0.045;
  body.add(rifle);
  // Backpack, radio and pouch silhouettes make soldiers recognizable at range.
  bevel(body, a.vest, 0, 1.32, 0.192, 0.3, 0.38, 0.13, 0.035);
  bevel(body, a.black, 0.196, 1.48, 0.125, 0.055, 0.095, 0.048, 0.008);
  cylinder(body, a.black, 0.196, 1.61, 0.125, 0.005, 0.19);
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const g = shadowCanvas.getContext('2d'),
    gradient = g.createRadialGradient(32, 32, 3, 32, 32, 32);
  gradient.addColorStop(0, '#1713099a');
  gradient.addColorStop(1, '#17130900');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  const shadow = mesh(
    root,
    new THREE.PlaneGeometry(0.95, 0.8),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas),
      transparent: true,
      depthWrite: false,
    }),
    0,
    0.018,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  shadow.raycast = () => {};
  // Keep head material split for headshots and batch each joint's rigid parts separately.
  const headMeshes = new Set();
  body.traverse((m) => {
    if (m.userData.head) headMeshes.add(m);
  });
  for (const { hip, knee } of limbs) {
    batchGroup(knee);
    const preserve = new Set();
    knee.traverse((m) => {
      if (m.isMesh) preserve.add(m);
    });
    batchGroup(hip, preserve);
  }
  for (const { shoulder, elbow } of arms) {
    batchGroup(elbow);
    const preserve = new Set();
    elbow.traverse((m) => {
      if (m.isMesh) preserve.add(m);
    });
    batchGroup(shoulder, preserve);
  }
  const movingMeshes = new Set(headMeshes);
  for (const joint of [...limbs.map((l) => l.hip), ...arms.map((l) => l.shoulder)])
    joint.traverse((m) => {
      if (m.isMesh) movingMeshes.add(m);
    });
  batchGroup(body, movingMeshes);
  return {
    root,
    body,
    legs: limbs.map((l) => l.hip),
    limbs,
    arms,
    shadow,
    death: 0,
    hp: 100,
    index,
    attack: 1 + index * 0.1,
    path: [],
    think: 0,
    x: 0,
    z: 0,
    y: 0,
    hit: 0,
  };
}
export function animateSoldier(bot, moving, time, dt) {
  if (bot.hp <= 0) {
    bot.death = Math.min(1, bot.death + dt * 3);
    bot.body.rotation.z = (-bot.death * Math.PI) / 2;
    bot.body.position.y = -bot.death * 0.68;
    return;
  }
  bot.body.rotation.z = Math.sin(time * 2 + bot.index) * 0.008;
  bot.body.position.y = moving ? Math.abs(Math.sin(time * 8)) * 0.025 : Math.sin(time * 2) * 0.005;
  bot.limbs.forEach(({ hip, knee }, i) => {
    const phase = time * 8 + i * Math.PI;
    hip.rotation.x = moving ? Math.sin(phase) * 0.38 : 0;
    knee.rotation.x = moving ? Math.max(0, -Math.sin(phase)) * 0.63 : 0.025;
  });
  bot.arms.forEach(({ shoulder, elbow }, i) => {
    shoulder.rotation.x =
      (i === 0 ? 0.95 : 0.45) + (moving ? Math.sin(time * 8) * 0.035 : Math.sin(time * 2) * 0.008);
    elbow.rotation.x = (i === 0 ? 0.32 : 0.22) + (bot.attack < 0.15 ? 0.06 : 0);
  });
}
export function animateWeapon(root, reloadProgress, recoil, time, dt) {
  const { magazine, bolt, index } = root.userData;
  const phase = reloadProgress;
  // Move detachable magazine and articulate the bolt independently during the reload.
  if (!magazine.userData.rest)
    magazine.userData.rest = {
      position: magazine.position.clone(),
      rotation: magazine.rotation.clone(),
    };
  magazine.position.copy(magazine.userData.rest.position);
  magazine.rotation.copy(magazine.userData.rest.rotation);
  if (phase > 0) {
    const amount = Math.sin(Math.PI * phase);
    magazine.position.y -= amount * (index === 3 ? 0.12 : 0.19);
    magazine.rotation.x += amount * 0.14;
  }
  if (bolt) {
    if (!bolt.userData.rest) bolt.userData.rest = bolt.position.clone();
    bolt.position.copy(bolt.userData.rest);
    bolt.position.z +=
      phase > 0.8 ? Math.sin(((phase - 0.8) / 0.2) * Math.PI) * 0.055 : recoil * 0.15;
  }
}

export function setSoldierName(soldier, name) {
  if (soldier.name === name && soldier.nameTag) return;
  soldier.name = name;
  if (!soldier.nameTag) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    const tag = new THREE.Sprite(material);
    tag.position.y = 2.55;
    tag.scale.set(2.8, 0.525, 1);
    tag.raycast = () => {};
    soldier.root.add(tag);
    soldier.nameTag = tag;
  }
  const canvas = soldier.nameTag.material.map.image,
    c = canvas.getContext('2d');
  c.clearRect(0, 0, 512, 96);
  c.fillStyle = '#10202acc';
  c.fillRect(12, 8, 488, 80);
  c.direction = 'rtl';
  c.font = 'bold 42px Tahoma, Arial';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#fff0cb';
  c.fillText(name, 256, 48, 456);
  soldier.nameTag.material.map.needsUpdate = true;
}
