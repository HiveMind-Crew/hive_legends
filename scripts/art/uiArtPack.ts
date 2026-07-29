import { encodePng, type Bitmap } from './pixels';

/**
 * Original UI pack for issue #28.
 *
 * The HUD glyphs are purpose-built at their final 12px size instead of
 * shrinking world pickups. The title is split into a readable base and a
 * low-alpha bioluminescent layer so HeroSelectScene can pulse it additively.
 */

const C = {
  dark: 0x17101f,
  deep: 0x2d1b3b,
  violet: 0xa855c8,
  violetLight: 0xd79aee,
  goldDark: 0x8f661c,
  gold: 0xffd75e,
  goldLight: 0xffef9a,
  bone: 0xcfc4de,
  boneDark: 0x6b5878,
  frenzy: 0xff8a3d,
  swift: 0x5ad6ff,
  ward: 0x7be08a,
  potionDark: 0x183d31,
  cork: 0x8a5a2e,
  white: 0xffffff
} as const;

export type UiArtKey =
  | 'ui-icon-gold'
  | 'ui-icon-kills'
  | 'ui-icon-key'
  | 'ui-icon-potion'
  | 'ui-power-frenzy'
  | 'ui-power-swiftness'
  | 'ui-power-ward'
  | 'ui-ability-ready'
  | 'ui-title-logo-base'
  | 'ui-title-logo-glow';

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

function line(
  image: Bitmap,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  colour: number,
  alpha = 0xff
): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    put(image, x0, y0, colour, alpha);
    if (x0 === x1 && y0 === y1) return;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function polygon(image: Bitmap, points: readonly (readonly [number, number])[], colour: number, alpha = 0xff): void {
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
      if (inside) put(image, x, y, colour, alpha);
    }
  }
}

function goldIcon(): Bitmap {
  const image = bitmap(12, 12);
  polygon(image, [[6, 0], [10, 2], [11, 7], [8, 11], [3, 10], [0, 6], [2, 2]], C.goldDark);
  polygon(image, [[6, 2], [9, 3], [9, 7], [7, 9], [3, 8], [2, 5], [4, 2]], C.gold);
  polygon(image, [[6, 3], [8, 5], [6, 7], [4, 5]], C.goldLight);
  return image;
}

function killsIcon(): Bitmap {
  const image = bitmap(12, 12);
  // A tiny chitin skull/trophy: split brow, eye pits, mandible points.
  polygon(image, [[2, 1], [5, 2], [6, 0], [7, 2], [10, 1], [11, 6], [8, 9], [7, 12], [5, 12], [4, 9], [1, 6]], C.boneDark);
  polygon(image, [[3, 2], [6, 3], [9, 2], [9, 6], [7, 8], [5, 8], [3, 6]], C.bone);
  put(image, 4, 5, C.dark);
  put(image, 8, 5, C.dark);
  rect(image, 5, 8, 3, 2, C.dark);
  return image;
}

function keyIcon(): Bitmap {
  const image = bitmap(12, 12);
  disc(image, 3, 3, 3, C.goldDark);
  disc(image, 3, 3, 1, C.dark);
  line(image, 5, 5, 10, 10, C.gold, 0xff);
  line(image, 6, 5, 10, 9, C.goldLight, 0xff);
  rect(image, 8, 8, 2, 3, C.goldDark);
  return image;
}

function potionIcon(): Bitmap {
  const image = bitmap(12, 12);
  rect(image, 4, 0, 4, 4, C.cork);
  rect(image, 3, 3, 6, 5, C.potionDark);
  disc(image, 6, 8, 4, C.potionDark);
  disc(image, 6, 8, 2, C.ward);
  put(image, 5, 7, C.goldLight);
  return image;
}

function frenzyChip(): Bitmap {
  const image = bitmap(12, 12);
  polygon(image, [[6, 0], [9, 3], [8, 6], [11, 5], [9, 11], [5, 12], [1, 8], [4, 5], [3, 2]], C.dark);
  polygon(image, [[6, 2], [7, 4], [6, 8], [9, 7], [7, 10], [5, 10], [3, 8], [5, 5], [5, 3]], C.frenzy);
  put(image, 6, 5, C.goldLight);
  return image;
}

function swiftnessChip(): Bitmap {
  const image = bitmap(12, 12);
  for (const offset of [0, 4]) {
    polygon(image, [[offset, 1], [offset + 7, 6], [offset, 11], [offset + 3, 6]], C.deep);
    polygon(image, [[offset + 1, 3], [offset + 5, 6], [offset + 1, 9], [offset + 3, 6]], C.swift);
  }
  return image;
}

function wardChip(): Bitmap {
  const image = bitmap(12, 12);
  disc(image, 6, 6, 5, C.deep);
  polygon(image, [[6, 1], [10, 3], [9, 8], [6, 11], [3, 8], [2, 3]], C.ward);
  line(image, 6, 2, 6, 9, C.goldLight);
  return image;
}

function abilityReady(): Bitmap {
  const image = bitmap(76, 18);
  // Tintable white flare: a segmented resin frame with four directional rays.
  for (let x = 9; x < 67; x++) {
    put(image, x, 2, C.white, x % 6 < 3 ? 0xd0 : 0x70);
    put(image, x, 15, C.white, x % 6 < 3 ? 0xd0 : 0x70);
  }
  for (let y = 4; y < 14; y++) {
    put(image, 5, y, C.white, 0xa0);
    put(image, 70, y, C.white, 0xa0);
  }
  for (let i = 0; i < 8; i++) {
    put(image, i, 8, C.white, 0xff - i * 18);
    put(image, 75 - i, 8, C.white, 0xff - i * 18);
  }
  line(image, 2, 3, 10, 8, C.white, 0xc0);
  line(image, 2, 14, 10, 9, C.white, 0xc0);
  line(image, 73, 3, 65, 8, C.white, 0xc0);
  line(image, 73, 14, 65, 9, C.white, 0xc0);
  return image;
}

const FONT: Readonly<Record<string, readonly string[]>> = {
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  N: ['10001', '11001', '11001', '10101', '10011', '10011', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110']
};

function drawWord(
  image: Bitmap,
  word: string,
  startX: number,
  startY: number,
  scale: number,
  colour: number,
  alpha = 0xff
): void {
  let x = startX;
  for (const char of word) {
    const glyph = FONT[char];
    if (!glyph) {
      x += scale * 4;
      continue;
    }
    for (let gy = 0; gy < glyph.length; gy++) {
      for (let gx = 0; gx < glyph[gy]!.length; gx++) {
        if (glyph[gy]![gx] === '1') rect(image, x + gx * scale, startY + gy * scale, scale, scale, colour, alpha);
      }
    }
    x += scale * 6;
  }
}

function titleBase(): Bitmap {
  const image = bitmap(384, 96);
  // Mirrored chitin crown and mandibles frame the name without a solid plaque.
  for (const side of [-1, 1]) {
    const outer = 192 + side * 184;
    const inner = 192 + side * 154;
    line(image, outer, 48, inner, 22, C.deep);
    line(image, outer, 49, inner, 74, C.deep);
    line(image, outer - side * 4, 48, inner, 23, C.violet);
    line(image, outer - side * 4, 49, inner, 73, C.violet);
    polygon(image, [[192 + side * 150, 17], [192 + side * 164, 4], [192 + side * 157, 25]], C.goldDark);
    polygon(image, [[192 + side * 150, 79], [192 + side * 164, 92], [192 + side * 157, 71]], C.goldDark);
  }
  // Dark extrusion, then amber face and a pale upper-left glint.
  drawWord(image, 'HIVE LEGENDS', 28, 34, 5, C.dark);
  drawWord(image, 'HIVE LEGENDS', 25, 30, 5, C.goldDark);
  drawWord(image, 'HIVE LEGENDS', 25, 28, 5, C.gold);
  for (const x of [25, 55, 85, 115, 165, 195, 225, 255, 285, 315, 345]) {
    rect(image, x, 28, 17, 2, C.goldLight, 0xd0);
  }
  disc(image, 192, 15, 5, C.violet);
  disc(image, 192, 15, 2, C.violetLight);
  disc(image, 192, 82, 4, C.violet);
  return image;
}

function titleGlow(): Bitmap {
  const image = bitmap(384, 96);
  // Sparse alpha preserves additive detail instead of becoming a white box.
  drawWord(image, 'HIVE LEGENDS', 25, 28, 5, C.goldLight, 0x36);
  for (const radius of [10, 7, 4]) {
    disc(image, 192, 15, radius, C.violetLight, 0x18 + (10 - radius) * 5);
    disc(image, 192, 82, radius, C.violet, 0x14 + (10 - radius) * 4);
  }
  line(image, 8, 48, 38, 22, C.violetLight, 0x70);
  line(image, 376, 48, 346, 22, C.violetLight, 0x70);
  line(image, 8, 49, 38, 74, C.violetLight, 0x70);
  line(image, 376, 49, 346, 74, C.violetLight, 0x70);
  return image;
}

export function uiArtBitmap(key: UiArtKey): Bitmap {
  switch (key) {
    case 'ui-icon-gold':
      return goldIcon();
    case 'ui-icon-kills':
      return killsIcon();
    case 'ui-icon-key':
      return keyIcon();
    case 'ui-icon-potion':
      return potionIcon();
    case 'ui-power-frenzy':
      return frenzyChip();
    case 'ui-power-swiftness':
      return swiftnessChip();
    case 'ui-power-ward':
      return wardChip();
    case 'ui-ability-ready':
      return abilityReady();
    case 'ui-title-logo-base':
      return titleBase();
    case 'ui-title-logo-glow':
      return titleGlow();
  }
}

export function buildUiArtPack(): ReadonlyMap<UiArtKey, Uint8Array> {
  const keys: readonly UiArtKey[] = [
    'ui-icon-gold',
    'ui-icon-kills',
    'ui-icon-key',
    'ui-icon-potion',
    'ui-power-frenzy',
    'ui-power-swiftness',
    'ui-power-ward',
    'ui-ability-ready',
    'ui-title-logo-base',
    'ui-title-logo-glow'
  ];
  return new Map(keys.map((key) => [key, encodePng(uiArtBitmap(key), 0)]));
}
