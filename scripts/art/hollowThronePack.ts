import { encodePng, type Bitmap } from './pixels';

/**
 * Original Hollow Throne dressing for issue #110.
 *
 * These are small, opaque-palette-on-transparent-canvas translations of a
 * brood queen's chamber: a raised birthing dais, grown pillars, spent shell
 * casings, and sacs suspended from the chamber's ribs. They are intentionally
 * quieter than actors and telegraphs, so the room reads as a place without
 * becoming another combat signal.
 */

const C = {
  shadow: 0x0b0710,
  shellDark: 0x1b101d,
  shellLow: 0x382039,
  shell: 0x5d2f4d,
  shellHigh: 0x87445f,
  flesh: 0x713c50,
  brood: 0xb45a7a,
  broodQuiet: 0xd08da3,
  casing: 0x9b674b,
  casingHigh: 0xc18a5f,
  vent: 0x291627
} as const;

export type HollowThroneDecorKey =
  | 'decor-throne-dais'
  | 'decor-throne-pillar'
  | 'decor-spent-casings'
  | 'decor-hanging-sacs';

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

/** A raised cradle with a shell crown and a quiet brood aperture at its centre. */
function throneDais(): Bitmap {
  const image = bitmap(96, 64);

  // Low platform and stepped front lip.
  ellipse(image, 48, 53, 39, 8, C.shadow, 0xb0);
  ellipse(image, 48, 48, 40, 10, C.shellDark);
  rect(image, 17, 43, 62, 10, C.shellLow);
  rect(image, 22, 51, 52, 5, C.shellDark);
  line(image, 19, 43, 77, 43, C.shellHigh);
  line(image, 25, 52, 71, 52, C.shell);

  // Two grown side wings make the mass read as a throne rather than a prop.
  ellipse(image, 28, 34, 16, 19, C.shellDark);
  ellipse(image, 28, 32, 12, 16, C.shell);
  ellipse(image, 68, 34, 16, 19, C.shellDark);
  ellipse(image, 68, 32, 12, 16, C.shell);
  for (const [x0, y0, x1, y1] of [
    [19, 42, 28, 13],
    [25, 42, 31, 8],
    [77, 42, 68, 13],
    [71, 42, 65, 8]
  ] as const) {
    line(image, x0, y0, x1, y1, C.shellHigh);
    line(image, x0 + (x1 < x0 ? -2 : 2), y0, x1, y1 + 4, C.shellLow);
  }

  // Central back plate and crown spines frame the birthing aperture.
  ellipse(image, 48, 28, 18, 24, C.shellDark);
  ellipse(image, 48, 27, 14, 20, C.flesh);
  ellipse(image, 48, 34, 11, 9, C.shellLow);
  ellipse(image, 48, 34, 7, 5, C.vent);
  ellipse(image, 48, 33, 4, 3, C.brood);
  for (const [x0, y0, x1, y1] of [
    [39, 17, 34, 4],
    [44, 12, 42, 0],
    [48, 10, 48, 0],
    [52, 12, 54, 0],
    [57, 17, 62, 4]
  ] as const) {
    line(image, x0, y0, x1, y1, C.shellHigh);
  }
  line(image, 41, 23, 48, 17, C.broodQuiet);
  line(image, 55, 23, 48, 17, C.broodQuiet);
  ellipseOutline(image, 48, 28, 18, 24, C.shell);
  return image;
}

/** A four-lobed chitin growth for the four existing solid pillar landmarks. */
function grownPillar(): Bitmap {
  const image = bitmap(64, 64);
  ellipse(image, 32, 56, 22, 5, C.shadow, 0xa0);
  ellipse(image, 32, 45, 19, 13, C.shellDark);
  ellipse(image, 32, 40, 15, 23, C.shellLow);
  ellipse(image, 32, 36, 11, 20, C.shell);
  for (const [cx, cy, rx, ry] of [
    [20, 43, 8, 11],
    [44, 43, 8, 11],
    [25, 28, 8, 13],
    [39, 28, 8, 13]
  ] as const) {
    ellipse(image, cx, cy, rx, ry, C.shellHigh);
    ellipseOutline(image, cx, cy, rx, ry, C.shellDark);
  }
  line(image, 32, 52, 32, 14, C.flesh);
  line(image, 29, 40, 24, 8, C.shellHigh);
  line(image, 35, 40, 40, 8, C.shellHigh);
  for (const [x, y] of [
    [24, 8],
    [40, 8],
    [32, 5],
    [17, 17],
    [47, 17]
  ] as const) {
    line(image, 32, 33, x, y, C.shellHigh);
  }
  ellipse(image, 32, 40, 4, 8, C.vent);
  ellipse(image, 32, 39, 2, 5, C.brood);
  return image;
}

/** Hollow shell fragments left around the dais after a brood cycle. */
function spentCasings(): Bitmap {
  const image = bitmap(24, 18);
  ellipse(image, 12, 14, 10, 3, C.shadow, 0x90);
  for (const [cx, cy, rx, ry] of [
    [5, 11, 4, 5],
    [12, 8, 5, 6],
    [19, 11, 4, 5]
  ] as const) {
    ellipse(image, cx, cy, rx, ry, C.shellDark);
    ellipse(image, cx, cy - 1, Math.max(1, rx - 1), Math.max(1, ry - 2), C.shell);
    ellipse(image, cx, cy - 1, Math.max(1, rx - 2), Math.max(1, ry - 3), C.vent);
  }
  line(image, 2, 12, 7, 14, C.casing);
  line(image, 17, 14, 22, 10, C.casingHigh);
  put(image, 11, 2, C.casingHigh);
  put(image, 13, 3, C.casing);
  return image;
}

/** Three low-luminance sacs hang from one shared root, above the walkable floor. */
function hangingSacs(): Bitmap {
  const image = bitmap(28, 36);
  line(image, 14, 1, 14, 9, C.shellHigh);
  line(image, 14, 6, 7, 14, C.shell);
  line(image, 14, 6, 21, 14, C.shell);
  for (const [cx, cy, rx, ry] of [
    [7, 19, 5, 8],
    [14, 14, 6, 9],
    [21, 19, 5, 8]
  ] as const) {
    ellipse(image, cx, cy, rx + 1, ry + 1, C.shellDark);
    ellipse(image, cx, cy, rx, ry, C.flesh);
    ellipse(image, cx - 1, cy - 2, Math.max(1, rx - 2), Math.max(1, ry - 3), C.shellHigh);
    line(image, cx - 1, cy - 5, cx + 1, cy + 4, C.brood, 0xc0);
  }
  line(image, 7, 27, 5, 32, C.shell);
  line(image, 21, 27, 23, 32, C.shell);
  put(image, 14, 9, C.broodQuiet, 0xc0);
  return image;
}

export function hollowThroneDecorBitmap(key: HollowThroneDecorKey): Bitmap {
  switch (key) {
    case 'decor-throne-dais':
      return throneDais();
    case 'decor-throne-pillar':
      return grownPillar();
    case 'decor-spent-casings':
      return spentCasings();
    case 'decor-hanging-sacs':
      return hangingSacs();
  }
}

export function buildHollowThroneDecorPack(): ReadonlyMap<HollowThroneDecorKey, Uint8Array> {
  const keys: readonly HollowThroneDecorKey[] = [
    'decor-throne-dais',
    'decor-throne-pillar',
    'decor-spent-casings',
    'decor-hanging-sacs'
  ];
  return new Map(keys.map((key) => [key, encodePng(hollowThroneDecorBitmap(key), 0)]));
}
