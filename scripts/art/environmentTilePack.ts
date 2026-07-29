import { encodePng, type Bitmap } from './pixels';

/**
 * Original Realm 1 environment tiles for issue #28.
 *
 * The concept sheet lives at
 * `docs/design/concepts/realm-one-tiles-reference.png`; these deliberately
 * quieter pixel translations keep combat readable at the game's native 32 px
 * scale. Floors are toroidal and finish by matching opposite edges exactly,
 * so deterministic variation never exposes a grid seam.
 */

const C = {
  floor: 0x17131f,
  floorLow: 0x110e18,
  floorMid: 0x1d1827,
  floorHigh: 0x251c31,
  resin: 0x352442,
  resinGlow: 0x55305f,
  crack: 0x0c0911,
  bone: 0x756d7c,
  boneLight: 0xa097a7,
  wallLow: 0x1b1424,
  wall: 0x2b2036,
  wallMid: 0x392947,
  wallHigh: 0x50365e,
  wallGlow: 0x70437c
} as const;

export type EnvironmentTileKey =
  | 'tile-wall'
  | 'tile-wall-inner'
  | 'tile-wall-face'
  | 'tile-floor-0'
  | 'tile-floor-1'
  | 'tile-floor-2'
  | 'tile-floor-3';

function rgb(n: number): readonly [number, number, number, number] {
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff, 0xff];
}

function bitmap(w: number, h: number, colour: number): Bitmap {
  const rgba = new Uint8Array(w * h * 4);
  const [r, g, b, a] = rgb(colour);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }
  return { w, h, rgba };
}

function put(image: Bitmap, x: number, y: number, colour: number, wrap = false): void {
  if (wrap) {
    x = ((x % image.w) + image.w) % image.w;
    y = ((y % image.h) + image.h) % image.h;
  } else if (x < 0 || y < 0 || x >= image.w || y >= image.h) {
    return;
  }
  const i = (y * image.w + x) * 4;
  const [r, g, b, a] = rgb(colour);
  image.rgba[i] = r;
  image.rgba[i + 1] = g;
  image.rgba[i + 2] = b;
  image.rgba[i + 3] = a;
}

function copyPixel(image: Bitmap, fromX: number, fromY: number, toX: number, toY: number): void {
  const from = (fromY * image.w + fromX) * 4;
  const to = (toY * image.w + toX) * 4;
  image.rgba.copyWithin(to, from, from + 4);
}

function rect(image: Bitmap, x: number, y: number, w: number, h: number, colour: number): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) put(image, px, py, colour);
  }
}

function disc(image: Bitmap, cx: number, cy: number, radius: number, colour: number, wrap = false): void {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius) put(image, cx + x, cy + y, colour, wrap);
    }
  }
}

function line(
  image: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colour: number,
  wrap = false
): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    put(image, x0, y0, colour, wrap);
    if (x0 === x1 && y0 === y1) return;
    const twice = 2 * err;
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
  colour: number
): void {
  for (let step = 0; step < 96; step++) {
    const angle = (step / 96) * Math.PI * 2;
    put(image, Math.round(cx + Math.cos(angle) * rx), Math.round(cy + Math.sin(angle) * ry), colour, true);
  }
}

function hash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed * 17, 0x45d9f3b) ^ Math.imul(y - seed * 11, 0x119de1f3);
  n ^= n >>> 16;
  n = Math.imul(n, 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}

function mottle(image: Bitmap, seed: number, density: number): void {
  for (let y = 0; y < image.h; y++) {
    for (let x = 0; x < image.w; x++) {
      const n = hash(x, y, seed) % 100;
      if (n < density) put(image, x, y, C.floorMid);
      else if (n > 98) put(image, x, y, C.floorLow);
    }
  }
}

/** Make the final row/column equal to the first without adding a flat border. */
function sealOppositeEdges(image: Bitmap): void {
  for (let y = 0; y < image.h; y++) copyPixel(image, 0, y, image.w - 1, y);
  for (let x = 0; x < image.w; x++) copyPixel(image, x, 0, x, image.h - 1);
}

function floorMottle(): Bitmap {
  const image = bitmap(32, 32, C.floor);
  mottle(image, 3, 17);
  for (const [x, y, r] of [
    [5, 5, 3],
    [22, 12, 4],
    [10, 25, 3],
    [30, 28, 3]
  ] as const) {
    disc(image, x, y, r, C.floorMid, true);
    disc(image, x + 1, y, Math.max(1, r - 2), C.floorHigh, true);
  }
  sealOppositeEdges(image);
  return image;
}

function floorCracks(): Bitmap {
  const image = bitmap(32, 32, C.floor);
  mottle(image, 7, 11);
  for (const points of [
    [
      [0, 7],
      [7, 10],
      [13, 16],
      [12, 24],
      [18, 31]
    ],
    [
      [20, 0],
      [21, 7],
      [27, 12],
      [31, 13]
    ]
  ] as const) {
    for (let i = 0; i < points.length - 1; i++) {
      line(image, points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1], C.crack);
    }
  }
  line(image, 13, 16, 20, 13, C.crack);
  line(image, 12, 24, 6, 27, C.crack);
  line(image, 21, 7, 17, 10, C.resin);
  sealOppositeEdges(image);
  return image;
}

function floorMembrane(): Bitmap {
  const image = bitmap(32, 32, C.floor);
  mottle(image, 11, 8);
  ellipseOutline(image, 8, 7, 10, 7, C.resin);
  ellipseOutline(image, 8, 7, 7, 5, C.floorHigh);
  ellipseOutline(image, 24, 21, 12, 9, C.resin);
  ellipseOutline(image, 24, 21, 8, 6, C.floorHigh);
  line(image, 15, 4, 18, 15, C.resinGlow, true);
  line(image, 18, 15, 14, 25, C.resin, true);
  for (const [x, y] of [
    [3, 17],
    [20, 8],
    [29, 28]
  ] as const) {
    disc(image, x, y, 1, C.resinGlow, true);
  }
  sealOppositeEdges(image);
  return image;
}

function floorBones(): Bitmap {
  const image = bitmap(32, 32, C.floor);
  mottle(image, 19, 14);
  const bones = [
    [6, 8, 5, 1],
    [20, 23, 4, -2],
    [28, 5, 4, 1]
  ] as const;
  for (const [x, y, dx, dy] of bones) {
    line(image, x, y, x + dx, y + dy, C.bone);
    put(image, x - Math.sign(dx), y, C.boneLight, true);
    put(image, x + dx + Math.sign(dx), y + dy, C.boneLight, true);
  }
  disc(image, 15, 16, 1, C.bone, true);
  put(image, 15, 16, C.floor, true);
  sealOppositeEdges(image);
  return image;
}

function wallRoof(): Bitmap {
  const image = bitmap(32, 32, C.wall);
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const n = hash(x, y, 29) % 100;
      if (n < 9) put(image, x, y, C.wallMid);
      if (n > 97) put(image, x, y, C.wallLow);
    }
  }
  for (const [cx, cy, rx, ry] of [
    [4, 5, 11, 7],
    [21, 7, 11, 8],
    [11, 20, 13, 9],
    [29, 24, 11, 8]
  ] as const) {
    ellipseOutline(image, cx, cy, rx, ry, C.wallHigh);
    ellipseOutline(image, cx, cy + 1, rx, ry, C.wallLow);
  }
  line(image, 0, 2, 31, 2, C.wallHigh);
  for (const x of [5, 17, 28]) disc(image, x, 3, 1, C.wallGlow, true);
  sealOppositeEdges(image);
  return image;
}

function wallInner(): Bitmap {
  const image = bitmap(32, 32, C.wallLow);
  for (const [cx, cy, rx, ry] of [
    [4, 4, 10, 7],
    [22, 5, 12, 8],
    [8, 19, 12, 9],
    [27, 23, 13, 9]
  ] as const) {
    ellipseOutline(image, cx, cy, rx, ry, C.wall);
  }
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (hash(x, y, 37) % 79 === 0) put(image, x, y, C.wallMid);
    }
  }
  sealOppositeEdges(image);
  return image;
}

function wallFace(): Bitmap {
  const image = bitmap(32, 16, C.wallLow);
  rect(image, 0, 0, 32, 2, C.wallHigh);
  rect(image, 0, 2, 32, 2, C.wall);
  for (const x of [2, 10, 18, 26]) {
    rect(image, x, 3, 4, 11, C.wall);
    line(image, x + 1, 4, x + 1, 12, C.wallMid);
    put(image, x + 2, 6, C.wallHigh);
    put(image, x + 3, 11, C.wallLow);
  }
  rect(image, 0, 14, 32, 2, 0x0d0912);
  for (const x of [7, 22, 30]) put(image, x, 3, C.wallGlow, true);
  // Only the horizontal axis repeats; the vertical edges describe depth.
  for (let y = 0; y < image.h; y++) copyPixel(image, 0, y, image.w - 1, y);
  return image;
}

export function environmentTileBitmap(key: EnvironmentTileKey): Bitmap {
  switch (key) {
    case 'tile-wall':
      return wallRoof();
    case 'tile-wall-inner':
      return wallInner();
    case 'tile-wall-face':
      return wallFace();
    case 'tile-floor-0':
      return floorMottle();
    case 'tile-floor-1':
      return floorCracks();
    case 'tile-floor-2':
      return floorMembrane();
    case 'tile-floor-3':
      return floorBones();
  }
}

export function buildEnvironmentTilePack(): ReadonlyMap<EnvironmentTileKey, Uint8Array> {
  const keys: readonly EnvironmentTileKey[] = [
    'tile-wall',
    'tile-wall-inner',
    'tile-wall-face',
    'tile-floor-0',
    'tile-floor-1',
    'tile-floor-2',
    'tile-floor-3'
  ];
  return new Map(keys.map((key) => [key, encodePng(environmentTileBitmap(key), 0)]));
}
