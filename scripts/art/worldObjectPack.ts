import { encodePng, type Bitmap } from './pixels';

/**
 * Original Realm 1 world objects and decor for issue #28.
 *
 * The larger direction sheet is
 * `docs/design/concepts/realm-one-world-objects-reference.png`. These compact
 * translations preserve its shell, resin, and spore language at native game
 * scale while keeping every non-prop canvas transparent for renderer-owned
 * shadows and lighting.
 */

const C = {
  shellDark: 0x26132f,
  shellLow: 0x3d1d49,
  shell: 0x7a3b8f,
  shellHigh: 0xa855c8,
  broodLight: 0xe1a6f0,
  broodWhite: 0xfbe3ff,
  ichor: 0xcf8fe0,
  resinDark: 0x4a321e,
  resin: 0x8f6a32,
  resinHigh: 0xbfa15e,
  gold: 0xffd75e,
  amberDark: 0x702d2a,
  amber: 0xb3543f,
  amberHigh: 0xe0524d,
  amberLight: 0xffa36d,
  sporeDark: 0x26391c,
  spore: 0x5b8f33,
  sporeHigh: 0x9fe06a,
  sporeLight: 0xd6f7b0,
  webDark: 0x53365d,
  web: 0x967da5,
  webHigh: 0xcfc4de,
  shadow: 0x08060b
} as const;

export type WorldObjectKey =
  | 'generator-brood-node-0'
  | 'generator-brood-node-1'
  | 'generator-brood-node-2'
  | 'prop-resin-husk'
  | 'prop-amber-clutch'
  | 'decor-egg-cluster'
  | 'decor-resin-web'
  | 'decor-spore-patch';

function bitmap(w: number, h: number): Bitmap {
  return { w, h, rgba: new Uint8Array(w * h * 4) };
}

function put(image: Bitmap, x: number, y: number, colour: number, alpha = 0xff): void {
  if (x < 0 || y < 0 || x >= image.w || y >= image.h) return;
  const i = (y * image.w + x) * 4;
  image.rgba[i] = (colour >> 16) & 0xff;
  image.rgba[i + 1] = (colour >> 8) & 0xff;
  image.rgba[i + 2] = colour & 0xff;
  image.rgba[i + 3] = alpha;
}

function disc(image: Bitmap, cx: number, cy: number, radius: number, colour: number, alpha = 0xff): void {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) put(image, cx + x, cy + y, colour, alpha);
    }
  }
}

function ellipse(
  image: Bitmap,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: number,
  alpha = 0xff
): void {
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) put(image, cx + x, cy + y, colour, alpha);
    }
  }
}

function line(image: Bitmap, x0: number, y0: number, x1: number, y1: number, colour: number, alpha = 0xff): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    put(image, x0, y0, colour, alpha);
    if (x0 === x1 && y0 === y1) return;
    const twice = err * 2;
    if (twice >= dy) {
      err += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

function ellipseOutline(
  image: Bitmap,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  colour: number,
  alpha = 0xff
): void {
  const steps = Math.max(32, Math.ceil(Math.PI * Math.max(rx, ry) * 3));
  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    put(image, Math.round(cx + Math.cos(angle) * rx), Math.round(cy + Math.sin(angle) * ry), colour, alpha);
  }
}

function drawNodeRoots(image: Bitmap): void {
  ellipse(image, 22, 36, 18, 5, C.shellDark);
  for (const points of [
    [11, 33, 3, 39],
    [16, 35, 11, 42],
    [27, 35, 32, 42],
    [33, 33, 41, 39]
  ] as const) {
    line(image, points[0], points[1], points[2], points[3], C.shellLow);
    put(image, points[2], points[3], C.shellHigh);
  }
  for (const [x, y, r] of [
    [7, 37, 2],
    [14, 40, 2],
    [30, 40, 2],
    [38, 37, 2]
  ] as const) {
    disc(image, x, y, r, C.shellLow);
    put(image, x - 1, y - 1, C.shell);
  }
}

function drawNodeShell(image: Bitmap): void {
  ellipse(image, 22, 21, 19, 18, C.shellDark);
  ellipse(image, 22, 20, 17, 16, C.shell);
  ellipse(image, 20, 16, 13, 11, C.shellHigh);
  ellipse(image, 19, 14, 7, 5, C.broodLight);
  // Layered chitin plates.
  for (const [cx, cy, rx, ry] of [
    [13, 14, 7, 6],
    [23, 10, 7, 6],
    [31, 16, 7, 7],
    [15, 25, 8, 8],
    [27, 25, 9, 8]
  ] as const) {
    ellipseOutline(image, cx, cy, rx, ry, C.shellLow);
  }
  ellipseOutline(image, 22, 21, 19, 18, C.shellDark);
}

function broodNode(tier: 0 | 1 | 2): Bitmap {
  const image = bitmap(44, 44);
  drawNodeRoots(image);
  drawNodeShell(image);

  if (tier === 0) {
    disc(image, 18, 13, 2, C.broodWhite);
    put(image, 14, 10, C.broodLight);
    put(image, 26, 7, C.broodLight);
  } else if (tier === 1) {
    disc(image, 9, 14, 2, C.shellDark);
    disc(image, 32, 11, 2, C.shellDark);
    for (const points of [
      [10, 10, 17, 19],
      [17, 19, 13, 30],
      [31, 8, 27, 19],
      [27, 19, 34, 28]
    ] as const) {
      line(image, points[0], points[1], points[2], points[3], C.shellDark);
    }
    line(image, 17, 19, 21, 22, C.broodLight);
    line(image, 27, 19, 25, 25, C.broodLight);
    line(image, 15, 29, 12, 39, C.ichor);
    line(image, 16, 31, 13, 39, C.broodLight);
    ellipse(image, 12, 40, 4, 2, C.ichor, 0xd8);
    disc(image, 18, 13, 3, C.broodWhite);
  } else {
    // Break the centre plates inward and expose the bright brood chamber.
    ellipse(image, 22, 21, 10, 11, C.shellDark);
    ellipse(image, 22, 21, 8, 9, C.broodLight);
    ellipse(image, 21, 19, 5, 6, C.broodWhite);
    disc(image, 19, 17, 2, 0xffffff);
    for (const points of [
      [7, 15, 14, 20],
      [14, 20, 9, 29],
      [36, 13, 30, 20],
      [30, 20, 36, 30],
      [16, 6, 19, 12],
      [29, 5, 26, 12]
    ] as const) {
      line(image, points[0], points[1], points[2], points[3], C.shellDark);
    }
    line(image, 15, 30, 13, 40, C.ichor);
    line(image, 29, 30, 33, 39, C.ichor);
    disc(image, 11, 40, 2, C.ichor, 0xd8);
    disc(image, 35, 40, 2, C.ichor, 0xd8);
    disc(image, 5, 38, 2, C.shellLow);
    disc(image, 40, 36, 2, C.shellLow);
  }
  return image;
}

function resinHusk(): Bitmap {
  const image = bitmap(20, 20);
  // Props own their small contact shadow.
  ellipse(image, 10, 17, 8, 2, C.shadow, 0x70);
  ellipse(image, 10, 11, 7, 7, C.resinDark);
  ellipse(image, 9, 9, 5, 5, C.resin);
  line(image, 4, 10, 8, 13, C.resinHigh);
  line(image, 8, 13, 6, 17, C.resinDark);
  line(image, 13, 5, 11, 11, C.resinHigh);
  line(image, 11, 11, 15, 14, C.resinDark);
  disc(image, 8, 8, 1, C.gold);
  put(image, 12, 14, C.gold);
  ellipseOutline(image, 10, 11, 7, 7, C.resinDark);
  return image;
}

function amberClutch(): Bitmap {
  const image = bitmap(20, 20);
  ellipse(image, 10, 17, 8, 2, C.shadow, 0x70);
  for (const [cx, cy] of [
    [6, 12],
    [14, 12],
    [10, 7]
  ] as const) {
    ellipse(image, cx, cy, 5, 6, C.amberDark);
    ellipse(image, cx, cy - 1, 4, 5, C.amber);
    ellipse(image, cx - 1, cy - 2, 2, 3, C.amberHigh);
    put(image, cx - 2, cy - 3, C.amberLight);
  }
  line(image, 10, 3, 10, 10, C.amberLight);
  line(image, 3, 11, 8, 13, C.amberHigh);
  line(image, 17, 11, 12, 13, C.amberHigh);
  return image;
}

function eggCluster(): Bitmap {
  const image = bitmap(24, 20);
  for (const [cx, cy, rx, ry] of [
    [5, 13, 4, 6],
    [18, 13, 4, 6],
    [9, 10, 5, 8],
    [15, 10, 5, 8],
    [12, 7, 4, 7]
  ] as const) {
    ellipse(image, cx, cy, rx, ry, C.shellLow);
    ellipse(image, cx, cy - 1, Math.max(1, rx - 1), Math.max(1, ry - 1), C.shell);
    put(image, cx - 1, cy - Math.max(2, ry - 2), C.broodLight);
    put(image, cx + 1, cy + 1, C.shellHigh);
  }
  for (const [x, y] of [
    [2, 18],
    [7, 18],
    [17, 18],
    [22, 18]
  ] as const) {
    line(image, 12, 15, x, y, C.shellDark);
  }
  return image;
}

function resinWeb(): Bitmap {
  const image = bitmap(28, 28);
  const c = 14;
  for (const [x, y] of [
    [1, 4],
    [9, 1],
    [19, 1],
    [27, 6],
    [27, 21],
    [20, 27],
    [7, 27],
    [1, 21]
  ] as const) {
    line(image, c, c, x, y, C.web);
    disc(image, x, y, 1, C.webHigh, 0xc0);
  }
  for (const radius of [4, 8, 12]) ellipseOutline(image, c, c, radius, radius, C.webDark, 0xc0);
  ellipseOutline(image, c, c, 8, 8, C.webHigh, 0x90);
  disc(image, c, c, 2, C.shellLow, 0xd0);
  put(image, c - 1, c - 1, C.webHigh);
  return image;
}

function sporePatch(): Bitmap {
  const image = bitmap(24, 18);
  ellipse(image, 12, 13, 10, 4, C.sporeDark, 0xd0);
  for (const [x, y, r] of [
    [5, 12, 3],
    [9, 9, 3],
    [13, 12, 4],
    [17, 8, 3],
    [20, 12, 2]
  ] as const) {
    disc(image, x, y, r, C.spore);
    disc(image, x - 1, y - 1, Math.max(1, r - 2), C.sporeHigh);
    put(image, x - 1, y - 1, C.sporeLight);
  }
  for (const [x, y] of [
    [3, 5],
    [8, 3],
    [15, 4],
    [21, 5]
  ] as const) {
    put(image, x, y, C.sporeHigh, 0xb0);
  }
  return image;
}

export function worldObjectBitmap(key: WorldObjectKey): Bitmap {
  switch (key) {
    case 'generator-brood-node-0':
      return broodNode(0);
    case 'generator-brood-node-1':
      return broodNode(1);
    case 'generator-brood-node-2':
      return broodNode(2);
    case 'prop-resin-husk':
      return resinHusk();
    case 'prop-amber-clutch':
      return amberClutch();
    case 'decor-egg-cluster':
      return eggCluster();
    case 'decor-resin-web':
      return resinWeb();
    case 'decor-spore-patch':
      return sporePatch();
  }
}

export function buildWorldObjectPack(): ReadonlyMap<WorldObjectKey, Uint8Array> {
  const keys: readonly WorldObjectKey[] = [
    'generator-brood-node-0',
    'generator-brood-node-1',
    'generator-brood-node-2',
    'prop-resin-husk',
    'prop-amber-clutch',
    'decor-egg-cluster',
    'decor-resin-web',
    'decor-spore-patch'
  ];
  return new Map(keys.map((key) => [key, encodePng(worldObjectBitmap(key), 0)]));
}
