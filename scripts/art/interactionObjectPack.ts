import { encodePng, type Bitmap } from './pixels';

/**
 * Original pickups, gate, and exit portal for issue #28.
 *
 * The larger direction sheet is
 * `docs/design/concepts/realm-one-interaction-objects-reference.png`. Pickups
 * are deliberately silhouette-first because the renderer bobs them over
 * different floor palettes; the portal is half-turn symmetric so its
 * continuous renderer-owned rotation never exposes a preferred facing.
 */

const C = {
  outline: 0x17101f,
  goldDark: 0x8f661c,
  gold: 0xffd75e,
  goldLight: 0xffef9a,
  healthDark: 0x782b35,
  health: 0xe0524d,
  healthLight: 0xff9a83,
  frenzyDark: 0x8f321f,
  frenzy: 0xff8a3d,
  frenzyLight: 0xffd08a,
  swiftDark: 0x1f6f99,
  swift: 0x5ad6ff,
  swiftLight: 0xc8f2ff,
  wardDark: 0x285d38,
  ward: 0x7be08a,
  wardLight: 0xd6ffd0,
  glass: 0x183d31,
  cork: 0x8a5a2e,
  gateDark: 0x24172d,
  gate: 0x50365e,
  gateHigh: 0x7a4b86,
  resin: 0x8f5e2f,
  portalDark: 0x2d1b3b,
  portalViolet: 0xa855c8,
  portalCyan: 0x64e6ff,
  portalLight: 0xbdf4ff
} as const;

export type InteractionObjectKey =
  | 'pickup-gold'
  | 'pickup-health'
  | 'pickup-frenzy'
  | 'pickup-swiftness'
  | 'pickup-ward'
  | 'pickup-key'
  | 'pickup-potion'
  | 'level-gate'
  | 'exit-portal';

type Point = readonly [number, number];

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

function rect(image: Bitmap, x: number, y: number, w: number, h: number, colour: number, alpha = 0xff): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) put(image, px, py, colour, alpha);
  }
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
  for (let y = Math.floor(-ry); y <= Math.ceil(ry); y++) {
    for (let x = Math.floor(-rx); x <= Math.ceil(rx); x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) {
        put(image, Math.round(cx + x), Math.round(cy + y), colour, alpha);
      }
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

function thickLine(
  image: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  colour: number
): void {
  for (let offset = -Math.floor(thickness / 2); offset <= Math.floor(thickness / 2); offset++) {
    line(image, x0, y0 + offset, x1, y1 + offset, colour);
  }
}

function polygon(image: Bitmap, points: readonly Point[], colour: number): void {
  const minX = Math.floor(Math.min(...points.map(([x]) => x)));
  const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
  const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
  const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]!;
        const [xj, yj] = points[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) put(image, x, y, colour);
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
  thickness = 1
): void {
  const steps = Math.max(48, Math.ceil(Math.PI * Math.max(rx, ry) * 4));
  for (let step = 0; step < steps; step++) {
    const angle = (step / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(angle) * rx);
    const y = Math.round(cy + Math.sin(angle) * ry);
    disc(image, x, y, Math.floor((thickness - 1) / 2), colour);
  }
}

function goldPickup(): Bitmap {
  const image = bitmap(16, 16);
  const outer: readonly Point[] = [
    [8, 1],
    [13, 4],
    [14, 10],
    [10, 14],
    [4, 14],
    [1, 10],
    [2, 4]
  ];
  polygon(image, outer, C.goldDark);
  polygon(
    image,
    [
      [8, 3],
      [12, 5],
      [12, 10],
      [9, 12],
      [5, 12],
      [3, 9],
      [4, 5]
    ],
    C.gold
  );
  polygon(image, [[8, 4], [11, 6], [8, 9], [5, 6]], C.goldLight);
  line(image, 8, 9, 10, 12, C.goldDark);
  return image;
}

function healthPickup(): Bitmap {
  const image = bitmap(18, 18);
  disc(image, 6, 7, 5, C.healthDark);
  disc(image, 12, 7, 5, C.healthDark);
  polygon(image, [[2, 7], [16, 7], [9, 17]], C.healthDark);
  disc(image, 6, 6, 3, C.health);
  disc(image, 12, 6, 3, C.health);
  polygon(image, [[4, 7], [14, 7], [9, 15]], C.health);
  disc(image, 6, 5, 1, C.healthLight);
  line(image, 9, 3, 9, 12, C.healthDark);
  return image;
}

function frenzyPickup(): Bitmap {
  const image = bitmap(18, 18);
  polygon(image, [[9, 1], [13, 5], [12, 8], [16, 8], [12, 16], [7, 17], [3, 12], [6, 8], [5, 4]], C.outline);
  polygon(image, [[9, 3], [11, 6], [10, 10], [14, 9], [11, 15], [8, 15], [5, 12], [8, 8], [7, 5]], C.frenzy);
  polygon(image, [[9, 5], [10, 8], [8, 12], [10, 13], [12, 10], [11, 7]], C.frenzyLight);
  put(image, 6, 6, C.frenzyDark);
  return image;
}

function swiftnessPickup(): Bitmap {
  const image = bitmap(18, 18);
  for (const offset of [0, 5]) {
    polygon(
      image,
      [
        [1 + offset, 3],
        [8 + offset, 9],
        [1 + offset, 15],
        [4 + offset, 9]
      ],
      C.swiftDark
    );
    polygon(
      image,
      [
        [2 + offset, 5],
        [7 + offset, 9],
        [2 + offset, 13],
        [5 + offset, 9]
      ],
      C.swift
    );
  }
  line(image, 4, 6, 7, 9, C.swiftLight);
  line(image, 9, 6, 12, 9, C.swiftLight);
  return image;
}

function wardPickup(): Bitmap {
  const image = bitmap(18, 18);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const x = Math.round(9 + Math.cos(angle) * 6);
    const y = Math.round(9 + Math.sin(angle) * 6);
    disc(image, x, y, 3, C.wardDark);
    disc(image, x, y, 2, C.ward);
  }
  polygon(image, [[9, 3], [14, 6], [13, 12], [9, 16], [5, 12], [4, 6]], C.outline);
  polygon(image, [[9, 5], [12, 7], [11, 11], [9, 14], [7, 11], [6, 7]], C.ward);
  line(image, 9, 5, 9, 13, C.wardLight);
  return image;
}

function keyPickup(): Bitmap {
  const image = bitmap(18, 18);
  disc(image, 6, 6, 5, C.goldDark);
  disc(image, 6, 6, 3, C.gold);
  disc(image, 6, 6, 1, C.outline);
  thickLine(image, 9, 8, 16, 14, 3, C.goldDark);
  thickLine(image, 9, 7, 15, 13, 1, C.goldLight);
  rect(image, 12, 13, 3, 3, C.goldDark);
  rect(image, 15, 12, 2, 3, C.gold);
  return image;
}

function potionPickup(): Bitmap {
  const image = bitmap(18, 18);
  rect(image, 6, 2, 6, 7, C.glass);
  ellipse(image, 9, 12, 7, 6, C.glass);
  ellipse(image, 9, 13, 5, 4, C.ward);
  ellipse(image, 8, 11, 3, 2, C.wardLight);
  rect(image, 6, 1, 6, 3, C.cork);
  line(image, 4, 14, 7, 17, C.outline);
  line(image, 14, 14, 11, 17, C.outline);
  put(image, 6, 9, C.wardLight);
  return image;
}

function levelGate(): Bitmap {
  const image = bitmap(32, 32);
  rect(image, 1, 1, 30, 30, C.gateDark);
  // Cut dark gaps back into the slab before laying the bars and frame.
  for (const x of [5, 11, 17, 23]) rect(image, x, 4, 4, 24, C.outline);
  for (const x of [2, 8, 14, 20, 26]) {
    rect(image, x, 2, 4, 28, C.gate);
    rect(image, x + 1, 3, 1, 25, C.gateHigh);
  }
  rect(image, 2, 5, 28, 4, C.resin);
  rect(image, 2, 23, 28, 4, C.resin);
  rect(image, 3, 6, 26, 1, C.goldDark);
  ellipse(image, 16, 16, 5, 6, C.goldDark);
  ellipse(image, 16, 15, 3, 4, C.gold);
  disc(image, 16, 15, 1, C.outline);
  rect(image, 15, 16, 2, 4, C.outline);
  return image;
}

function enforceHalfTurn(image: Bitmap): void {
  const pixels = image.w * image.h;
  for (let i = 0; i < pixels; i++) {
    const x = i % image.w;
    const y = Math.floor(i / image.w);
    const opposite = (image.h - 1 - y) * image.w + (image.w - 1 - x);
    if (i >= opposite) continue;
    image.rgba.copyWithin(opposite * 4, i * 4, i * 4 + 4);
  }
}

function exitPortal(): Bitmap {
  const image = bitmap(48, 48);
  const c = 23.5;
  for (const [radius, colour, thickness] of [
    [20, C.portalDark, 3],
    [17, C.portalCyan, 2],
    [12, C.portalViolet, 2]
  ] as const) {
    ellipseOutline(image, c, c, radius, radius, colour, thickness);
  }
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const cx = Math.round(c + Math.cos(angle) * 17);
    const cy = Math.round(c + Math.sin(angle) * 17);
    disc(image, cx, cy, 3, C.portalViolet);
    disc(image, cx, cy, 1, C.portalLight);
    const innerX = Math.round(c + Math.cos(angle) * 13);
    const innerY = Math.round(c + Math.sin(angle) * 13);
    line(image, cx, cy, innerX, innerY, C.portalCyan);
  }
  enforceHalfTurn(image);
  return image;
}

export function interactionObjectBitmap(key: InteractionObjectKey): Bitmap {
  switch (key) {
    case 'pickup-gold':
      return goldPickup();
    case 'pickup-health':
      return healthPickup();
    case 'pickup-frenzy':
      return frenzyPickup();
    case 'pickup-swiftness':
      return swiftnessPickup();
    case 'pickup-ward':
      return wardPickup();
    case 'pickup-key':
      return keyPickup();
    case 'pickup-potion':
      return potionPickup();
    case 'level-gate':
      return levelGate();
    case 'exit-portal':
      return exitPortal();
  }
}

export function buildInteractionObjectPack(): ReadonlyMap<InteractionObjectKey, Uint8Array> {
  const keys: readonly InteractionObjectKey[] = [
    'pickup-gold',
    'pickup-health',
    'pickup-frenzy',
    'pickup-swiftness',
    'pickup-ward',
    'pickup-key',
    'pickup-potion',
    'level-gate',
    'exit-portal'
  ];
  return new Map(keys.map((key) => [key, encodePng(interactionObjectBitmap(key), 0)]));
}
