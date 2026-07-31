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

export type AmberResinTileKey =
  | 'tile-amber-resin-wall'
  | 'tile-amber-resin-wall-inner'
  | 'tile-amber-resin-wall-face'
  | 'tile-amber-resin-floor-0'
  | 'tile-amber-resin-floor-1'
  | 'tile-amber-resin-floor-2'
  | 'tile-amber-resin-floor-3';

export type HollowThroneTileKey =
  | 'tile-hollow-throne-wall'
  | 'tile-hollow-throne-wall-inner'
  | 'tile-hollow-throne-wall-face'
  | 'tile-hollow-throne-floor-0'
  | 'tile-hollow-throne-floor-1'
  | 'tile-hollow-throne-floor-2'
  | 'tile-hollow-throne-floor-3';

const AMBER = {
  floor: 0x1b1510,
  floorLow: 0x120e0b,
  floorMid: 0x2a2117,
  floorHigh: 0x3b2d1b,
  resin: 0x5c3d16,
  resinGlow: 0x9a651d,
  inclusion: 0x765426,
  inclusionLight: 0xb88735,
  wallLow: 0x24170d,
  wall: 0x3d2813,
  wallMid: 0x5b3a18,
  wallHigh: 0x7a521f,
  wallGlow: 0xc4852d,
  shadow: 0x0d0906
} as const;

const THRONE = {
  floor: 0x19131c,
  floorLow: 0x100c13,
  floorMid: 0x241724,
  floorHigh: 0x312036,
  rib: 0x4b2940,
  ribEdge: 0x6d3852,
  pulse: 0x8a425d,
  wallLow: 0x241622,
  wall: 0x3c2535,
  wallMid: 0x512b42,
  wallHigh: 0x71394f,
  wallGlow: 0xa84f6c,
  shadow: 0x0c080e
} as const;

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

function amberMottle(image: Bitmap, seed: number, density: number): void {
  for (let y = 0; y < image.h; y++) {
    for (let x = 0; x < image.w; x++) {
      const n = hash(x, y, seed) % 100;
      if (n < density) put(image, x, y, AMBER.floorMid);
      else if (n > 97) put(image, x, y, AMBER.floorLow);
    }
  }
}

/** Dark resin pools with restrained highlights, kept below actor luminance. */
function amberFloorPools(): Bitmap {
  const image = bitmap(32, 32, AMBER.floor);
  amberMottle(image, 43, 12);
  for (const [x, y, rx, ry] of [
    [5, 6, 8, 5],
    [22, 13, 10, 7],
    [10, 27, 9, 6],
    [31, 29, 7, 5]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, AMBER.resin);
    ellipseOutline(image, x + 1, y, Math.max(2, rx - 3), Math.max(2, ry - 2), AMBER.floorHigh);
  }
  for (const [x, y] of [
    [3, 4],
    [20, 10],
    [8, 25]
  ] as const) {
    put(image, x, y, AMBER.resinGlow, true);
  }
  sealOppositeEdges(image);
  return image;
}

/** Hairline golden fissures under a quiet, mottled walking surface. */
function amberFloorFissures(): Bitmap {
  const image = bitmap(32, 32, AMBER.floor);
  amberMottle(image, 47, 9);
  for (const points of [
    [
      [0, 8],
      [7, 11],
      [13, 17],
      [10, 24],
      [17, 31]
    ],
    [
      [22, 0],
      [20, 7],
      [26, 13],
      [31, 15]
    ]
  ] as const) {
    for (let i = 0; i < points.length - 1; i++) {
      line(image, points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1], AMBER.resin);
    }
  }
  line(image, 13, 17, 20, 14, AMBER.resinGlow);
  line(image, 10, 24, 4, 27, AMBER.resin);
  for (const [x, y] of [
    [13, 17],
    [20, 7],
    [26, 13]
  ] as const) {
    put(image, x, y, AMBER.resinGlow, true);
  }
  sealOppositeEdges(image);
  return image;
}

/** Overlapping sealed cells: softer and more organic than the violet membrane. */
function amberFloorMembrane(): Bitmap {
  const image = bitmap(32, 32, AMBER.floor);
  amberMottle(image, 53, 6);
  for (const [x, y, rx, ry] of [
    [5, 7, 8, 6],
    [16, 8, 7, 6],
    [26, 6, 8, 5],
    [9, 21, 10, 7],
    [24, 23, 11, 8]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, AMBER.resin);
    ellipseOutline(image, x, y + 1, Math.max(2, rx - 3), Math.max(2, ry - 2), AMBER.floorHigh);
  }
  line(image, 0, 16, 31, 16, AMBER.resin, true);
  for (const x of [4, 17, 29]) disc(image, x, 16, 1, AMBER.resinGlow, true);
  sealOppositeEdges(image);
  return image;
}

/** Resin-frozen chitin and crystal inclusions replace Realm 1's bone scatter. */
function amberFloorInclusions(): Bitmap {
  const image = bitmap(32, 32, AMBER.floor);
  amberMottle(image, 59, 11);
  for (const [x, y, dx, dy] of [
    [6, 8, 5, 3],
    [20, 23, 6, -4],
    [28, 6, 4, 3]
  ] as const) {
    line(image, x, y, x + dx, y + dy, AMBER.inclusion);
    line(image, x + dx, y + dy, x + Math.sign(dx), y + dy + 4, AMBER.inclusion);
    line(image, x + Math.sign(dx), y + dy + 4, x, y, AMBER.inclusionLight);
    put(image, x + Math.sign(dx), y + 1, AMBER.resinGlow, true);
  }
  disc(image, 14, 16, 2, AMBER.resin, true);
  disc(image, 14, 16, 1, AMBER.floorLow, true);
  sealOppositeEdges(image);
  return image;
}

/** Layered, honeycombed resin roof with sparse trapped-light beads. */
function amberWallRoof(): Bitmap {
  const image = bitmap(32, 32, AMBER.wall);
  for (let y = 0; y < image.h; y++) {
    for (let x = 0; x < image.w; x++) {
      const n = hash(x, y, 61) % 100;
      if (n < 8) put(image, x, y, AMBER.wallMid);
      else if (n > 97) put(image, x, y, AMBER.wallLow);
    }
  }
  for (const [x, y, rx, ry] of [
    [4, 5, 10, 7],
    [20, 7, 11, 8],
    [10, 20, 12, 9],
    [29, 24, 10, 8]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, AMBER.wallHigh);
    ellipseOutline(image, x, y + 2, Math.max(3, rx - 2), Math.max(3, ry - 2), AMBER.wallLow);
  }
  line(image, 0, 2, 31, 2, AMBER.wallHigh);
  for (const x of [5, 17, 28]) disc(image, x, 3, 1, AMBER.wallGlow, true);
  sealOppositeEdges(image);
  return image;
}

function amberWallInner(): Bitmap {
  const image = bitmap(32, 32, AMBER.wallLow);
  for (const [x, y, rx, ry] of [
    [4, 4, 10, 7],
    [22, 5, 12, 8],
    [8, 19, 12, 9],
    [27, 23, 13, 9]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, AMBER.wall);
    ellipseOutline(image, x + 1, y + 1, Math.max(3, rx - 3), Math.max(3, ry - 3), AMBER.wallMid);
  }
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (hash(x, y, 67) % 83 === 0) put(image, x, y, AMBER.wallGlow);
    }
  }
  sealOppositeEdges(image);
  return image;
}

/** Vertical resin curtains with dark gaps and descending amber droplets. */
function amberWallFace(): Bitmap {
  const image = bitmap(32, 16, AMBER.wallLow);
  rect(image, 0, 0, 32, 2, AMBER.wallHigh);
  rect(image, 0, 2, 32, 2, AMBER.wall);
  for (const [x, width, drop] of [
    [1, 5, 12],
    [8, 6, 9],
    [16, 5, 13],
    [23, 7, 10]
  ] as const) {
    rect(image, x, 3, width, drop, AMBER.wall);
    line(image, x + 1, 4, x + 1, Math.min(13, drop), AMBER.wallMid);
    put(image, x + width - 2, Math.min(13, drop), AMBER.wallGlow);
  }
  rect(image, 0, 14, 32, 2, AMBER.shadow);
  for (let y = 0; y < image.h; y++) copyPixel(image, 0, y, image.w - 1, y);
  return image;
}

function throneMottle(image: Bitmap, seed: number, density: number): void {
  for (let y = 0; y < image.h; y++) {
    for (let x = 0; x < image.w; x++) {
      const n = hash(x, y, seed) % 100;
      if (n < density) put(image, x, y, THRONE.floorMid);
      else if (n > 98) put(image, x, y, THRONE.floorLow);
    }
  }
}

/** Dark, ringed floor plates make the throne chamber feel grown rather than tiled. */
function throneFloorPlates(): Bitmap {
  const image = bitmap(32, 32, THRONE.floor);
  throneMottle(image, 71, 10);
  for (const [x, y, rx, ry] of [
    [5, 5, 8, 5],
    [22, 12, 10, 7],
    [10, 27, 9, 6],
    [31, 29, 7, 5]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, THRONE.rib);
    ellipseOutline(image, x + 1, y, Math.max(2, rx - 3), Math.max(2, ry - 2), THRONE.floorHigh);
  }
  for (const [x, y] of [
    [4, 4],
    [20, 10],
    [8, 25]
  ] as const) {
    put(image, x, y, THRONE.pulse, true);
  }
  sealOppositeEdges(image);
  return image;
}

/** Hairline root channels radiate across the walking surface without glowing. */
function throneFloorRoots(): Bitmap {
  const image = bitmap(32, 32, THRONE.floor);
  throneMottle(image, 73, 9);
  for (const points of [
    [
      [0, 8],
      [6, 11],
      [11, 17],
      [8, 24],
      [16, 31]
    ],
    [
      [22, 0],
      [20, 7],
      [25, 13],
      [31, 15]
    ],
    [
      [31, 27],
      [25, 24],
      [20, 27],
      [15, 25]
    ]
  ] as const) {
    for (let i = 0; i < points.length - 1; i++) {
      line(image, points[i]![0], points[i]![1], points[i + 1]![0], points[i + 1]![1], THRONE.shadow, true);
    }
  }
  line(image, 11, 17, 18, 14, THRONE.ribEdge, true);
  line(image, 8, 24, 3, 28, THRONE.rib, true);
  for (const [x, y] of [
    [11, 17],
    [20, 7],
    [25, 13],
    [20, 27]
  ] as const) {
    put(image, x, y, THRONE.ribEdge, true);
  }
  sealOppositeEdges(image);
  return image;
}

/** Overlapping brood membranes, with a few dark vents to keep the floor quiet. */
function throneFloorMembranes(): Bitmap {
  const image = bitmap(32, 32, THRONE.floor);
  throneMottle(image, 79, 7);
  for (const [x, y, rx, ry] of [
    [5, 7, 8, 6],
    [16, 8, 7, 6],
    [27, 6, 8, 5],
    [9, 21, 10, 7],
    [24, 23, 11, 8]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, THRONE.rib);
    ellipseOutline(image, x, y + 1, Math.max(2, rx - 3), Math.max(2, ry - 2), THRONE.floorHigh);
  }
  line(image, 0, 16, 31, 16, THRONE.rib, true);
  for (const x of [4, 17, 29]) disc(image, x, 16, 1, THRONE.pulse, true);
  sealOppositeEdges(image);
  return image;
}

/** Small dark shell remnants suggest a lived-in brood chamber without visual noise. */
function throneFloorRemnants(): Bitmap {
  const image = bitmap(32, 32, THRONE.floor);
  throneMottle(image, 83, 11);
  for (const [x, y, dx, dy] of [
    [6, 8, 5, 3],
    [20, 23, 6, -4],
    [28, 6, 4, 3]
  ] as const) {
    line(image, x, y, x + dx, y + dy, THRONE.rib, true);
    line(image, x + dx, y + dy, x + Math.sign(dx), y + dy + 4, THRONE.ribEdge, true);
    line(image, x + Math.sign(dx), y + dy + 4, x, y, THRONE.shadow, true);
  }
  disc(image, 14, 16, 2, THRONE.rib, true);
  disc(image, 14, 16, 1, THRONE.floorLow, true);
  sealOppositeEdges(image);
  return image;
}

/** Layered crown plates and restrained veins give every Hollow Throne wall a grown silhouette. */
function throneWallRoof(): Bitmap {
  const image = bitmap(32, 32, THRONE.wall);
  for (let y = 0; y < image.h; y++) {
    for (let x = 0; x < image.w; x++) {
      const n = hash(x, y, 89) % 100;
      if (n < 8) put(image, x, y, THRONE.wallMid);
      else if (n > 97) put(image, x, y, THRONE.wallLow);
    }
  }
  for (const [x, y, rx, ry] of [
    [4, 5, 10, 7],
    [20, 7, 11, 8],
    [10, 20, 12, 9],
    [29, 24, 10, 8]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, THRONE.wallHigh);
    ellipseOutline(image, x, y + 2, Math.max(3, rx - 2), Math.max(3, ry - 2), THRONE.wallLow);
  }
  line(image, 0, 2, 31, 2, THRONE.wallHigh, true);
  line(image, 4, 3, 1, 13, THRONE.ribEdge, true);
  line(image, 16, 3, 16, 14, THRONE.rib, true);
  line(image, 28, 3, 31, 13, THRONE.ribEdge, true);
  for (const x of [5, 17, 28]) disc(image, x, 3, 1, THRONE.wallGlow, true);
  sealOppositeEdges(image);
  return image;
}

function throneWallInner(): Bitmap {
  const image = bitmap(32, 32, THRONE.wallLow);
  for (const [x, y, rx, ry] of [
    [4, 4, 10, 7],
    [22, 5, 12, 8],
    [8, 19, 12, 9],
    [27, 23, 13, 9]
  ] as const) {
    ellipseOutline(image, x, y, rx, ry, THRONE.wall);
    ellipseOutline(image, x + 1, y + 1, Math.max(3, rx - 3), Math.max(3, ry - 3), THRONE.wallMid);
  }
  line(image, 0, 15, 31, 15, THRONE.rib, true);
  line(image, 5, 0, 8, 31, THRONE.shadow, true);
  line(image, 22, 0, 19, 31, THRONE.shadow, true);
  for (const [x, y] of [
    [5, 5],
    [19, 13],
    [28, 25]
  ] as const) {
    put(image, x, y, THRONE.wallGlow);
  }
  sealOppositeEdges(image);
  return image;
}

/** South-facing wall faces descend as dark root curtains beneath a hard crown edge. */
function throneWallFace(): Bitmap {
  const image = bitmap(32, 16, THRONE.wallLow);
  rect(image, 0, 0, 32, 2, THRONE.wallHigh);
  rect(image, 0, 2, 32, 2, THRONE.wall);
  for (const [x, width, drop] of [
    [1, 5, 11],
    [8, 6, 8],
    [16, 5, 13],
    [23, 7, 10]
  ] as const) {
    rect(image, x, 3, width, drop, THRONE.wall);
    line(image, x + 1, 4, x + 1, Math.min(13, drop), THRONE.wallMid);
    line(image, x + width - 2, 4, x + width - 2, Math.min(12, drop), THRONE.rib, true);
  }
  line(image, 4, 3, 4, 12, THRONE.wallGlow, true);
  line(image, 27, 3, 27, 10, THRONE.wallGlow, true);
  rect(image, 0, 14, 32, 2, THRONE.shadow);
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

export function amberResinTileBitmap(key: AmberResinTileKey): Bitmap {
  switch (key) {
    case 'tile-amber-resin-wall':
      return amberWallRoof();
    case 'tile-amber-resin-wall-inner':
      return amberWallInner();
    case 'tile-amber-resin-wall-face':
      return amberWallFace();
    case 'tile-amber-resin-floor-0':
      return amberFloorPools();
    case 'tile-amber-resin-floor-1':
      return amberFloorFissures();
    case 'tile-amber-resin-floor-2':
      return amberFloorMembrane();
    case 'tile-amber-resin-floor-3':
      return amberFloorInclusions();
  }
}

export function buildAmberResinTilePack(): ReadonlyMap<AmberResinTileKey, Uint8Array> {
  const keys: readonly AmberResinTileKey[] = [
    'tile-amber-resin-wall',
    'tile-amber-resin-wall-inner',
    'tile-amber-resin-wall-face',
    'tile-amber-resin-floor-0',
    'tile-amber-resin-floor-1',
    'tile-amber-resin-floor-2',
    'tile-amber-resin-floor-3'
  ];
  return new Map(keys.map((key) => [key, encodePng(amberResinTileBitmap(key), 0)]));
}

export function hollowThroneTileBitmap(key: HollowThroneTileKey): Bitmap {
  switch (key) {
    case 'tile-hollow-throne-wall':
      return throneWallRoof();
    case 'tile-hollow-throne-wall-inner':
      return throneWallInner();
    case 'tile-hollow-throne-wall-face':
      return throneWallFace();
    case 'tile-hollow-throne-floor-0':
      return throneFloorPlates();
    case 'tile-hollow-throne-floor-1':
      return throneFloorRoots();
    case 'tile-hollow-throne-floor-2':
      return throneFloorMembranes();
    case 'tile-hollow-throne-floor-3':
      return throneFloorRemnants();
  }
}

export function buildHollowThroneTilePack(): ReadonlyMap<HollowThroneTileKey, Uint8Array> {
  const keys: readonly HollowThroneTileKey[] = [
    'tile-hollow-throne-wall',
    'tile-hollow-throne-wall-inner',
    'tile-hollow-throne-wall-face',
    'tile-hollow-throne-floor-0',
    'tile-hollow-throne-floor-1',
    'tile-hollow-throne-floor-2',
    'tile-hollow-throne-floor-3'
  ];
  return new Map(keys.map((key) => [key, encodePng(hollowThroneTileBitmap(key), 0)]));
}
