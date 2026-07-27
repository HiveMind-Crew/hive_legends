import { deflateSync } from 'node:zlib';

/**
 * The plumbing behind the hand-drawn art packs in `public/art/`.
 *
 * Sprites are authored as character grids — one character per pixel, keyed by
 * a small palette — so the art lives in the repository as something a reviewer
 * can read and edit in a diff rather than as an opaque binary. This module
 * only turns those grids into the PNGs the drop-in loader already consumes
 * (`docs/ART.md`); it makes no drawing decisions of its own.
 *
 * Nothing here ships in the build — it runs from `tests/artPack.test.ts`,
 * which regenerates the pack under `npm run art:build` and otherwise fails
 * when the checked-in PNGs and the authored grids disagree.
 */

/** `.` is transparent; every other character maps to an opaque `#rrggbb`. */
export type Palette = Readonly<Record<string, string>>;

export const TRANSPARENT = '.';

export interface Bitmap {
  readonly w: number;
  readonly h: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`palette colour must be #rrggbb, got "${hex}"`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Turns an authored grid into pixels. Throws on a ragged grid or an unknown
 * character, so a typo in the art fails the build instead of quietly punching
 * a transparent hole in a sprite.
 */
export function rasterize(rows: readonly string[], palette: Palette, label: string): Bitmap {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rows[y] ?? '';
    if (row.length !== w) {
      throw new Error(`${label}: row ${y} is ${row.length} wide, expected ${w}`);
    }
    for (let x = 0; x < w; x++) {
      const ch = row[x] ?? TRANSPARENT;
      if (ch === TRANSPARENT) continue;
      const hex = palette[ch];
      if (!hex) throw new Error(`${label}: row ${y} col ${x} uses "${ch}", which is not in the palette`);
      const [r, g, b] = parseHex(hex);
      const i = (y * w + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = 0xff;
    }
  }
  return { w, h, rgba };
}

/**
 * Mirrors a grid left-to-right. East/west, SE/SW and NE/NW frames are drawn
 * once and flipped, which is how the Vanguard and Arcanist packs already
 * work — the sprites are accent-neutral and carry no handedness that a flip
 * would betray.
 */
export function mirror(rows: readonly string[]): string[] {
  return rows.map((row) => [...row].reverse().join(''));
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const byte of bytes) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Minimal 8-bit RGBA PNG encoder — enough for 36px sprites, no dependencies. */
export function encodePng({ w, h, rgba }: Bitmap): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: truecolour with alpha
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(rgba.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0))
  ]);
}
