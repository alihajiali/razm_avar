// Original layouts inspired by classic tactical FPS settings. Coordinates use 4-unit tiles.
const T = 4;
const point = ([x, z]) => ({ x: (x + 0.5) * T, z: (z + 0.5) * T });
function layout(width, height, rooms, links, spawn, sites) {
  const cells = Array.from({ length: height }, () => Array(width).fill('#'));
  const carve = (x1, z1, x2, z2) => {
    for (let z = z1; z <= z2; z++)
      for (let x = x1; x <= x2; x++)
        if (x > 0 && z > 0 && x < width - 1 && z < height - 1) cells[z][x] = '.';
  };
  for (const room of rooms) carve(...room);
  for (const route of links)
    for (let i = 1; i < route.length; i++) {
      const [x, z] = route[i - 1],
        [nx, nz] = route[i];
      if (x !== nx && z !== nz) throw Error('Map corridors must be axis aligned');
      carve(Math.min(x, nx), Math.min(z, nz), Math.max(x, nx) + 1, Math.max(z, nz) + 1);
    }
  cells[spawn[1]][spawn[0]] = 'S';
  sites.forEach(([x, z], i) => (cells[z][x] = i ? 'B' : 'A'));
  return cells.map((row) => row.join(''));
}
function define(
  id,
  name,
  label,
  description,
  theme,
  width,
  height,
  rooms,
  links,
  spawn,
  sites,
  crateCells,
  extra = {},
) {
  return {
    id,
    name,
    label,
    description,
    theme,
    grid: layout(width, height, rooms, links, spawn, sites),
    spawn: point(spawn),
    sites: sites.map((p, i) => ({ name: i ? 'B' : 'A', ...point(p) })),
    crates: crateCells.map(([x, z, w = 3, d = 3, h = 3]) => [
      ...Object.values(point([x, z])),
      w,
      d,
      h,
    ]),
    ...extra,
  };
}
const dust = {
  id: 'dust',
  name: 'کوچه‌های کویر',
  label: 'داست · کوچه‌های شنی',
  description: 'تونل پوشیده، مسیر طولانی و دو محوطهٔ کلاسیک A و B.',
  theme: 'dust',
  grid: [
    '####################',
    '#......#...........#',
    '#......#....A......#',
    '#......#...........#',
    '#..##..####...##...#',
    '#..##.........##...#',
    '#......####........#',
    '###..###..####..####',
    '#...............#..#',
    '#...####..###......#',
    '#...#.......#......#',
    '#...#...B...#......#',
    '#...#.......#......#',
    '#...####..###..##..#',
    '#..................#',
    '#..S...............#',
    '####################',
  ],
  spawn: { x: 14, z: 62 },
  sites: [
    { name: 'A', x: 50, z: 10 },
    { name: 'B', x: 34, z: 46 },
  ],
  botCells: [
    [3, 2],
    [5, 3],
    [9, 2],
    [14, 2],
    [17, 3],
    [17, 5],
    [9, 5],
    [13, 8],
    [17, 10],
    [7, 11],
    [9, 12],
    [4, 8],
  ],
  crates: [
    [42, 10, 3, 3, 3],
    [66, 14, 3, 3, 3],
    [54, 22, 3, 3, 3],
    [22, 22, 3, 3, 3],
    [34, 42, 3, 3, 3],
    [42, 50, 3, 3, 3],
    [66, 46, 3, 3, 3],
    [22, 58, 3, 3, 3],
    [54, 58, 3, 3, 3],
  ],
  palette: {
    sky: '#a7bac4',
    fog: '#b8b6a8',
    wall: 0xc9b89d,
    plaster: 0xe0cfaa,
    floor: 0xd2c5ad,
    trim: 0xb7a184,
    sun: 0xffebd1,
    ambient: 0xd5dfe6,
  },
  zones: [{ name: 'تونل‌ها', x: 12, z: 25, w: 8, d: 12 }],
  roofs: [],
};
const mirage = define(
  'mirage',
  'بازار سراب',
  'میراژ · حیاط و بازار',
  'حیاط مرکزی باز، بازار غربی، قصر شرقی و دو مسیر دورزدن.',
  'mirage',
  24,
  20,
  [
    [2, 2, 7, 6],
    [16, 2, 21, 6],
    [9, 7, 14, 12],
    [2, 14, 7, 17],
    [16, 14, 21, 17],
    [9, 16, 14, 18],
  ],
  [
    [
      [4, 5],
      [4, 15],
    ],
    [
      [19, 5],
      [19, 15],
    ],
    [
      [5, 4],
      [18, 4],
    ],
    [
      [6, 9],
      [11, 9],
    ],
    [
      [11, 9],
      [18, 9],
    ],
    [
      [11, 11],
      [11, 17],
    ],
    [
      [4, 16],
      [19, 16],
    ],
  ],
  [11, 17],
  [
    [19, 3],
    [4, 3],
  ],
  [
    [17, 5],
    [6, 5],
    [10, 8, 2.5, 2.5, 2.2],
    [13, 11, 2.5, 2.5, 2.2],
    [3, 15],
    [20, 15],
  ],
  {
    palette: {
      sky: '#9dc7db',
      fog: '#d4c4a5',
      wall: 0xd6bf93,
      plaster: 0xeee1c2,
      floor: 0xd1c7b6,
      trim: 0xc69967,
      sun: 0xffe0ae,
      ambient: 0xd4e9ff,
    },
    roofs: [
      [8, 18, 16, 28],
      [64, 24, 24, 4],
    ],
    zones: [
      { name: 'بازار', x: 8, z: 8, w: 24, d: 20 },
      { name: 'کاخ', x: 64, z: 8, w: 24, d: 20 },
      { name: 'حیاط مرکزی', x: 36, z: 28, w: 24, d: 24 },
    ],
    arches: [
      [20, 28],
      [76, 28],
    ],
  },
);
const inferno = define(
  'inferno',
  'دهکدهٔ آتش',
  'اینفرنو · دهکده و کوچه',
  'کوچهٔ خمیده، میدان کلیسا، مسیر آپارتمان و تقاطع‌های نزدیک.',
  'inferno',
  24,
  22,
  [
    [2, 2, 7, 6],
    [15, 2, 21, 6],
    [9, 8, 14, 12],
    [2, 14, 7, 18],
    [16, 14, 21, 18],
    [9, 18, 14, 20],
  ],
  [
    [
      [4, 5],
      [4, 10],
      [7, 10],
      [7, 16],
    ],
    [
      [6, 4],
      [18, 4],
    ],
    [
      [18, 5],
      [18, 10],
      [15, 10],
      [15, 16],
    ],
    [
      [6, 10],
      [17, 10],
    ],
    [
      [4, 16],
      [11, 16],
      [11, 19],
    ],
    [
      [19, 16],
      [11, 16],
    ],
  ],
  [11, 19],
  [
    [18, 3],
    [4, 3],
  ],
  [
    [16, 5, 3, 3, 2.5],
    [6, 5, 3, 3, 2.5],
    [10, 9, 2.5, 2.5, 2],
    [13, 11, 2.5, 2.5, 2],
    [3, 17, 2.5, 2.5, 2],
    [20, 17, 2.5, 2.5, 2],
  ],
  {
    palette: {
      sky: '#c8b3a4',
      fog: '#c4b7a3',
      wall: 0xb86e4e,
      plaster: 0xe2b78a,
      floor: 0xaaa294,
      trim: 0xe6d2ae,
      sun: 0xffbf81,
      ambient: 0xc7d6ed,
    },
    roofs: [
      [16, 30, 8, 12],
      [60, 30, 8, 12],
    ],
    zones: [
      { name: 'کوچهٔ خمیده', x: 8, z: 28, w: 24, d: 40 },
      { name: 'آپارتمان‌ها', x: 60, z: 28, w: 24, d: 40 },
      { name: 'میدان دهکده', x: 36, z: 32, w: 24, d: 20 },
    ],
    arches: [
      [20, 28],
      [76, 28],
    ],
  },
);
const nuke = define(
  'nuke',
  'نیروگاه فولاد',
  'نوک · نیروگاه صنعتی',
  'حیاط بیرونی، سالن راکتور و راهروی خدمات؛ درگیری داخل و بیرون سالن.',
  'nuke',
  22,
  22,
  [
    [2, 2, 8, 7],
    [13, 2, 19, 7],
    [8, 10, 13, 14],
    [2, 15, 7, 19],
    [15, 15, 19, 19],
    [9, 17, 12, 20],
  ],
  [
    [
      [5, 5],
      [16, 5],
    ],
    [
      [5, 6],
      [5, 16],
    ],
    [
      [16, 6],
      [16, 16],
    ],
    [
      [5, 11],
      [16, 11],
    ],
    [
      [10, 12],
      [10, 18],
    ],
    [
      [5, 18],
      [16, 18],
    ],
  ],
  [10, 19],
  [
    [5, 3],
    [16, 3],
  ],
  [
    [3, 5, 3, 3, 4],
    [7, 5, 3, 3, 4],
    [14, 5, 3, 3, 4],
    [18, 5, 3, 3, 4],
    [9, 11, 2.5, 2.5, 2.5],
    [12, 13, 2.5, 2.5, 2.5],
    [3, 17, 3, 3, 3],
    [17, 17, 3, 3, 3],
  ],
  {
    palette: {
      sky: '#869ba6',
      fog: '#9ca6a8',
      wall: 0x84929b,
      plaster: 0xa6b8bb,
      floor: 0x6f7c80,
      trim: 0xd5a647,
      sun: 0xd8e9ff,
      ambient: 0xc7ddeb,
    },
    roofs: [
      [8, 8, 28, 24],
      [52, 8, 28, 24],
      [32, 40, 24, 20],
    ],
    zones: [
      { name: 'سالن راکتور', x: 8, z: 8, w: 28, d: 24 },
      { name: 'سالن کنترل', x: 52, z: 8, w: 28, d: 24 },
      { name: 'راهروی خدمات', x: 32, z: 40, w: 24, d: 20 },
      { name: 'حیاط بیرونی', x: 8, z: 60, w: 72, d: 20 },
    ],
  },
);
const train = define(
  'train',
  'ایستگاه آهن',
  'ترین · ایستگاه قطار',
  'واگن‌های باری، خطوط دید بلند، انبار و راهروهای کناری برای دورزدن.',
  'train',
  26,
  20,
  [
    [2, 2, 10, 7],
    [15, 2, 23, 7],
    [2, 10, 10, 15],
    [15, 10, 23, 15],
    [10, 16, 15, 18],
  ],
  [
    [
      [5, 6],
      [5, 12],
    ],
    [
      [20, 6],
      [20, 12],
    ],
    [
      [8, 4],
      [17, 4],
    ],
    [
      [8, 12],
      [17, 12],
    ],
    [
      [12, 4],
      [12, 17],
    ],
    [
      [5, 14],
      [5, 17],
      [20, 17],
      [20, 14],
    ],
  ],
  [12, 17],
  [
    [6, 3],
    [20, 11],
  ],
  [
    [4, 5, 2.8, 10, 2.8],
    [8, 5, 2.8, 10, 2.8],
    [17, 4, 2.8, 10, 2.8],
    [21, 4, 2.8, 10, 2.8],
    [4, 12, 2.8, 10, 2.8],
    [8, 12, 2.8, 10, 2.8],
    [17, 13, 2.8, 10, 2.8],
    [22, 13, 2.8, 10, 2.8],
  ],
  {
    palette: {
      sky: '#8e9da3',
      fog: '#9fa5a4',
      wall: 0x857065,
      plaster: 0xb5a48b,
      floor: 0x777a72,
      trim: 0x725b46,
      sun: 0xd9e1d9,
      ambient: 0xc4d0df,
    },
    roofs: [[60, 8, 36, 24]],
    zones: [
      { name: 'حیاط قدیمی', x: 8, z: 8, w: 36, d: 24 },
      { name: 'انبار بار', x: 60, z: 8, w: 36, d: 24 },
      { name: 'محوطهٔ بارگیری', x: 8, z: 40, w: 36, d: 24 },
      { name: 'ایستگاه قطار', x: 60, z: 40, w: 36, d: 24 },
    ],
  },
);
export const MAPS = { dust, mirage, inferno, nuke, train };
export function normalizeMap(id) {
  return typeof id === 'string' && Object.hasOwn(MAPS, id) ? id : 'dust';
}
export function botStarts(map) {
  if (map.botCells) return map.botCells.map(point);
  const list = [];
  for (let z = 1; z < map.grid.length - 1; z++)
    for (let x = 1; x < map.grid[0].length - 1; x++) {
      if (map.grid[z][x] !== '#') {
        const p = point([x, z]);
        if (
          Math.hypot(p.x - map.spawn.x, p.z - map.spawn.z) > 20 &&
          !map.crates.some(
            ([cx, cz, w, d]) =>
              Math.abs(p.x - cx) < w / 2 + 0.4 && Math.abs(p.z - cz) < d / 2 + 0.4,
          )
        )
          list.push(p);
      }
    }
  return list.filter((_, i) => i % 3 === 0).slice(0, 12);
}
