import { circleHitsWall, isWallTile, tileCenter, type Blockage } from './level';
import type { LevelDef, Vec2 } from './types';

/**
 * Grid pathfinding for the horde (issue #107).
 *
 * Enemies used to steer in a straight line at the nearest player, which wedges
 * them against any concave wall — a swarm that never arrives hollows out the
 * pressure the whole design rests on. A flow field fits this game exactly: the
 * maps are small grids, there is a single attractor (the nearest player), and
 * the field only has to be rebuilt when a player crosses a tile.
 *
 * Everything here is integer grid maths over `LevelDef` and the dynamic
 * `Blockage` overlay — no randomness, no wall-clock, nothing that could make
 * two runs of the same seed disagree.
 *
 * ## Why passability is per radius
 *
 * Tiles are 32px and enemy radii run 10–20, so a Gravebound Ravager (radius 20,
 * 40px across) does not fit down a one-tile corridor a Skitterling walks
 * happily. A field built on "is this tile floor" would route the big families
 * into gaps their bodies cannot enter — the same wedge in a new place. So a
 * tile is passable *for a given radius* only when that circle can sit on its
 * centre, and fields are built per radius class. There are only a handful of
 * distinct radii in the bestiary, so this stays cheap.
 */

/** BFS distances to the nearest source, in tiles. */
export interface FlowField {
  readonly width: number;
  readonly height: number;
  /** Steps to the nearest source per tile index; -1 = impassable or cut off. */
  readonly dist: Int32Array;
}

export interface TileCoord {
  tx: number;
  ty: number;
}

/** Which tile a world position sits in. */
export function tileAt(level: LevelDef, pos: Vec2): TileCoord {
  return { tx: Math.floor(pos.x / level.tileSize), ty: Math.floor(pos.y / level.tileSize) };
}

function gridWidth(level: LevelDef): number {
  return level.walls[0]?.length ?? 0;
}

/**
 * Tiles a circle of `radius` can stand on, as a flat row-major byte grid.
 *
 * Derived from the same `circleHitsWall` movement uses, so "the field says I
 * can go there" and "movement lets me go there" cannot disagree.
 */
export function buildPassable(level: LevelDef, blk: Blockage | undefined, radius: number): Uint8Array {
  const w = gridWidth(level);
  const h = level.walls.length;
  const passable = new Uint8Array(w * h);
  for (let ty = 0; ty < h; ty++) {
    for (let tx = 0; tx < w; tx++) {
      if (isWallTile(level, tx, ty)) continue;
      if (circleHitsWall(level, tileCenter(level, tx, ty), radius, blk)) continue;
      passable[ty * w + tx] = 1;
    }
  }
  return passable;
}

/**
 * Multi-source breadth-first search out from every source tile at once, so each
 * enemy naturally descends toward whichever player is nearest *along the
 * floor* rather than nearest as the crow flies — the distinction that matters
 * when a wall stands between them.
 *
 * Four-way, not eight: diagonal BFS would let a route slip through the corner
 * seam between two walls, which movement then refuses, and an enemy following
 * a route movement rejects is the bug this file exists to remove. Steering
 * reintroduces diagonals safely in `flowStep`.
 */
export function buildFlowField(level: LevelDef, passable: Uint8Array, sources: readonly TileCoord[]): FlowField {
  const width = gridWidth(level);
  const height = level.walls.length;
  const dist = new Int32Array(width * height).fill(-1);

  // A plain array walked with a read cursor: no Set, no shift(), no allocation
  // per step. The queue is seeded in source order and drained in insertion
  // order, so the result is a pure function of its inputs.
  const queue: number[] = [];
  for (const { tx, ty } of sources) {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
    const idx = ty * width + tx;
    if (dist[idx] === 0) continue; // duplicate source
    // Seeded whether or not the *enemy* could stand here. A Ravager is wider
    // than a one-tile corridor, so the player routinely stands somewhere it
    // cannot follow; expanding outward from that tile anyway gives it a route
    // to the closest tile it does fit in, which is the best answer available.
    // Only the expansion below is filtered by passability.
    dist[idx] = 0;
    queue.push(idx);
  }

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head]!;
    const next = dist[idx]! + 1;
    const tx = idx % width;
    const ty = (idx - tx) / width;
    // Fixed neighbour order (left, right, up, down) keeps the traversal — and
    // so every tie in the finished field — identical run to run.
    if (tx > 0) visit(idx - 1, next);
    if (tx < width - 1) visit(idx + 1, next);
    if (ty > 0) visit(idx - width, next);
    if (ty < height - 1) visit(idx + width, next);
  }

  function visit(idx: number, next: number): void {
    if (!passable[idx] || dist[idx] !== -1) return;
    dist[idx] = next;
    queue.push(idx);
  }

  return { width, height, dist };
}

/** Steps to the nearest source from a tile, or null if cut off or off-grid. */
export function distanceAt(field: FlowField, tx: number, ty: number): number | null {
  if (tx < 0 || ty < 0 || tx >= field.width || ty >= field.height) return null;
  const d = field.dist[ty * field.width + tx]!;
  return d < 0 ? null : d;
}

/** Neighbour offsets, orthogonals first so they win ties against diagonals. */
const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
];

/**
 * The neighbouring tile to walk into next, or null when there is nowhere
 * better to go (already at a source, cut off, or standing off the grid).
 *
 * Diagonals are offered here even though the field is four-way: on a four-way
 * field a diagonal whose both legs make progress is two steps closer while an
 * orthogonal is one, so it simply wins on distance and the route stops reading
 * as a staircase. A diagonal is only allowed when both of its orthogonal
 * neighbours are passable, so the body never squeezes through a corner seam.
 *
 * ## Ties are broken by neighbour order, and by nothing else
 *
 * Deliberately: the choice must depend on the *tile*, never on where inside it
 * the enemy is standing. An earlier version tie-broke toward the straight line
 * to the player, which deadlocked — at a symmetric ridge the enemy stepped up,
 * which moved it below the player, which made stepping down the better-aligned
 * choice, which moved it back. It oscillated on the spot at 2px an tick and
 * never escaped. Anything that feeds the enemy's own position back into the
 * decision can close that loop, so nothing does.
 */
export function flowStep(field: FlowField, passable: Uint8Array, from: TileCoord): TileCoord | null {
  const here = distanceAt(field, from.tx, from.ty);
  if (here === null || here === 0) return null;

  let best: TileCoord | null = null;
  let bestDist = here;

  for (const [dx, dy] of NEIGHBOURS) {
    const tx = from.tx + dx;
    const ty = from.ty + dy;
    const d = distanceAt(field, tx, ty);
    if (d === null || d >= bestDist) continue;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: both orthogonal legs of the diagonal must be open.
      if (!passable[from.ty * field.width + (from.tx + dx)]) continue;
      if (!passable[(from.ty + dy) * field.width + from.tx]) continue;
    }
    best = { tx, ty };
    bestDist = d;
  }
  return best;
}
