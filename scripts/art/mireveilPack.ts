import { encodePng, rasterize, type Palette } from './pixels';

/**
 * Mireveil, Mother of the Brood — original 96 px boss art for issue #27.
 *
 * The concept sheet in docs/design/concepts establishes one south-facing
 * brood-queen silhouette: a huge plated abdomen, three glowing brood sacs,
 * braced legs, a crown-like head and split mandibles. These runtime sprites
 * redraw it on a reviewable 48×48 logical canvas expanded 2×. Damage never
 * changes the footprint: cracks, peeled inner plates and exposed brood-light
 * escalate inside the same outline so all three states remain unmistakably
 * the same boss while she rotates in play.
 */

export type MireveilState = 0 | 1 | 2;

const SIZE = 48;
const PALETTE: Palette = {
  O: '#17131f',
  N: '#2a1433',
  D: '#4d2359',
  M: '#7a3b8f',
  V: '#a855c8',
  L: '#e1a6f0',
  W: '#fbe3ff',
  A: '#d9a441'
};

type Grid = string[][];
type Point = readonly [number, number];

function blank(): Grid {
  return Array.from({ length: SIZE }, () => Array<string>(SIZE).fill('.'));
}

function setPixel(grid: Grid, x: number, y: number, color: string): void {
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y]![x] = color;
}

function fillEllipse(grid: Grid, cx: number, cy: number, rx: number, ry: number, color: string): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(grid, x, y, color);
    }
  }
}

function drawLine(grid: Grid, x0: number, y0: number, x1: number, y1: number, color: string, width = 1): void {
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  const radius = Math.floor(width / 2);
  while (true) {
    for (let py = -radius; py <= radius; py++) {
      for (let px = -radius; px <= radius; px++) {
        if (px * px + py * py <= radius * radius + 0.5) setPixel(grid, x0 + px, y0 + py, color);
      }
    }
    if (x0 === x1 && y0 === y1) break;
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

function fillPolygon(grid: Grid, points: readonly Point[], color: string): void {
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
      if (inside) setPixel(grid, x, y, color);
    }
  }
}

function pairedLine(
  grid: Grid,
  from: Point,
  to: Point,
  color: string,
  width = 1
): void {
  drawLine(grid, from[0], from[1], to[0], to[1], color, width);
  drawLine(grid, SIZE - 1 - from[0], from[1], SIZE - 1 - to[0], to[1], color, width);
}

function drawLegs(grid: Grid): void {
  const segments: readonly (readonly [Point, Point])[] = [
    [[15, 22], [7, 21]],
    [[7, 21], [3, 28]],
    [[15, 28], [7, 31]],
    [[7, 31], [3, 38]],
    [[17, 34], [10, 39]],
    [[10, 39], [8, 46]]
  ];
  for (const [from, to] of segments) pairedLine(grid, from, to, 'O', 5);
  for (const [from, to] of segments) pairedLine(grid, from, to, 'D', 3);
  for (const [from, to] of [
    [[7, 21], [3, 28]],
    [[7, 31], [3, 38]],
    [[10, 39], [8, 46]]
  ] as const) pairedLine(grid, from, to, 'M');
  pairedLine(grid, [3, 28], [2, 31], 'O', 2);
  pairedLine(grid, [3, 38], [2, 41], 'O', 2);
  pairedLine(grid, [8, 46], [7, 47], 'O', 2);
}

function drawBase(grid: Grid): void {
  drawLegs(grid);

  // The swollen abdomen owns the silhouette; layered ellipses read as shell.
  fillEllipse(grid, 23.5, 16, 16, 16, 'O');
  fillEllipse(grid, 23.5, 16, 15, 15, 'D');
  fillEllipse(grid, 23.5, 14.5, 12, 12.5, 'M');
  drawLine(grid, 10, 10, 18, 12, 'N');
  drawLine(grid, 37, 10, 29, 12, 'N');
  drawLine(grid, 9, 18, 17, 17, 'N');
  drawLine(grid, 38, 18, 30, 17, 'N');
  drawLine(grid, 13, 26, 20, 22, 'N');
  drawLine(grid, 34, 26, 27, 22, 'N');
  drawLine(grid, 23, 1, 23, 8, 'N');

  // Three sealed brood windows.
  for (const [x, y] of [
    [15, 16],
    [24, 13],
    [32, 16]
  ] as const) {
    fillEllipse(grid, x, y, 4, 6, 'N');
    fillEllipse(grid, x, y, 3, 5, 'V');
    fillEllipse(grid, x - 1, y - 2, 1, 2, 'L');
  }

  // Thorax plates overlap the abdomen and narrow toward the head.
  fillEllipse(grid, 23.5, 30, 10, 9, 'O');
  fillEllipse(grid, 23.5, 30, 9, 8, 'M');
  fillPolygon(grid, [[18, 23], [29, 23], [27, 29], [20, 29]], 'D');
  fillPolygon(grid, [[19, 30], [28, 30], [26, 36], [21, 36]], 'D');
  drawLine(grid, 18, 29, 29, 29, 'N');
  drawLine(grid, 20, 35, 27, 35, 'N');

  // Crowned head, four eyes and downward split mandibles: art faces south.
  fillEllipse(grid, 23.5, 38, 8, 7, 'O');
  fillEllipse(grid, 23.5, 38, 7, 6, 'D');
  fillPolygon(grid, [[17, 35], [19, 30], [22, 35]], 'O');
  fillPolygon(grid, [[21, 34], [24, 28], [26, 34]], 'O');
  fillPolygon(grid, [[25, 35], [29, 30], [30, 36]], 'O');
  fillPolygon(grid, [[18, 35], [19, 32], [21, 36]], 'M');
  fillPolygon(grid, [[22, 34], [24, 30], [25, 35]], 'M');
  fillPolygon(grid, [[26, 36], [29, 32], [29, 36]], 'M');
  for (const [x, y] of [
    [20, 37],
    [27, 37],
    [21, 40],
    [26, 40]
  ] as const) {
    fillEllipse(grid, x, y, 1.2, 1.2, 'L');
    setPixel(grid, x, y, 'W');
  }
  fillPolygon(grid, [[18, 40], [14, 47], [20, 44], [22, 41]], 'O');
  fillPolygon(grid, [[29, 40], [33, 47], [27, 44], [25, 41]], 'O');
  fillPolygon(grid, [[18, 41], [16, 46], [20, 43], [21, 41]], 'M');
  fillPolygon(grid, [[29, 41], [31, 46], [27, 43], [26, 41]], 'M');

  // Restrained amber resin seams make the queen distinct from ordinary brood.
  pairedLine(grid, [12, 8], [13, 11], 'A');
  pairedLine(grid, [16, 24], [18, 26], 'A');
  setPixel(grid, 23, 25, 'A');
  setPixel(grid, 24, 25, 'A');
}

function addWoundedDamage(grid: Grid): void {
  drawLine(grid, 10, 7, 15, 11, 'L', 2);
  drawLine(grid, 15, 11, 13, 16, 'L', 2);
  drawLine(grid, 36, 8, 31, 12, 'L', 2);
  drawLine(grid, 31, 12, 34, 17, 'L', 2);
  drawLine(grid, 18, 21, 22, 18, 'L', 2);
  drawLine(grid, 22, 18, 24, 22, 'L', 2);
  drawLine(grid, 22, 4, 25, 9, 'L', 2);
  drawLine(grid, 25, 9, 22, 14, 'L', 2);
  drawLine(grid, 22, 14, 25, 20, 'L', 2);
  fillPolygon(grid, [[12, 22], [16, 21], [14, 25]], 'N');
  fillPolygon(grid, [[31, 23], [35, 21], [33, 26]], 'N');
  fillEllipse(grid, 13, 16, 1.5, 2, 'W');
  fillEllipse(grid, 34, 18, 1.5, 2, 'W');
}

function addCriticalDamage(grid: Grid): void {
  addWoundedDamage(grid);
  fillPolygon(grid, [[17, 5], [23, 8], [20, 13], [14, 11]], 'N');
  fillPolygon(grid, [[30, 5], [24, 8], [27, 13], [33, 11]], 'N');
  fillPolygon(grid, [[11, 19], [17, 17], [16, 23], [12, 25]], 'N');
  fillPolygon(grid, [[36, 19], [30, 17], [31, 23], [35, 25]], 'N');

  // The critical state opens around a brilliant brood core without changing
  // the outer mask, leaving the renderer free to add its own red action tint.
  fillEllipse(grid, 23.5, 14, 7, 10, 'N');
  fillEllipse(grid, 23.5, 14, 6, 9, 'L');
  fillEllipse(grid, 23.5, 14, 3, 6, 'W');
  drawLine(grid, 17, 7, 13, 4, 'L');
  drawLine(grid, 30, 7, 34, 4, 'L');
  drawLine(grid, 16, 20, 11, 23, 'L');
  drawLine(grid, 31, 20, 36, 23, 'L');
  drawLine(grid, 19, 27, 16, 30, 'L');
  drawLine(grid, 28, 27, 31, 30, 'L');
  setPixel(grid, 14, 4, 'W');
  setPixel(grid, 33, 4, 'W');
  setPixel(grid, 10, 23, 'W');
  setPixel(grid, 37, 23, 'W');
}

/** Logical 48×48 source grid for visual-regression tests and review. */
export function mireveilGrid(state: MireveilState): string[] {
  const grid = blank();
  drawBase(grid);
  const silhouette = grid.map((row) => row.map((pixel) => pixel !== '.'));
  if (state === 1) addWoundedDamage(grid);
  if (state === 2) addCriticalDamage(grid);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!silhouette[y]![x]) grid[y]![x] = '.';
    }
  }
  return grid.map((row) => row.join(''));
}

function expand2x(rows: readonly string[]): string[] {
  return rows.flatMap((row) => {
    const doubled = [...row].map((pixel) => pixel.repeat(2)).join('');
    return [doubled, doubled];
  });
}

export function buildMireveilPack(): Map<string, Uint8Array> {
  const pack = new Map<string, Uint8Array>();
  for (const state of [0, 1, 2] as const) {
    const key = `boss-mireveil-${state}`;
    const bitmap = rasterize(expand2x(mireveilGrid(state)), PALETTE, key);
    if (bitmap.w !== 96 || bitmap.h !== 96) {
      throw new Error(`${key}: frame is ${bitmap.w}x${bitmap.h}, expected 96x96`);
    }
    // Stored deflate blocks remain byte-identical across the Node 22 CI and
    // Node 24 local zlib builds; compressed output for this larger grid does not.
    pack.set(key, encodePng(bitmap, 0));
  }
  return pack;
}
