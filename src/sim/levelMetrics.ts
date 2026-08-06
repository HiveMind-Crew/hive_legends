import type { LevelDef } from './types';

export interface LevelPacingMetrics {
  widthTiles: number;
  heightTiles: number;
  widthPx: number;
  heightPx: number;
  walkableFloorCount: number;
  /** Shortest spawn -> every mandatory objective -> exit route, in tile steps. */
  criticalPathDistanceTiles: number | null;
  /** Exit leg selected by that shortest complete route. */
  finalObjectiveToExitTiles: number | null;
  /** Stable objective ids in the selected shortest route order. */
  objectiveOrder: string[];
  minCriticalCorridorWidthTiles: number | null;
  pinchPoints: { tx: number; ty: number; widthTiles: number }[];
}

interface Tile {
  tx: number;
  ty: number;
}

interface Objective extends Tile {
  id: string;
}

interface Search {
  distances: Int32Array;
  previous: Int32Array;
}

/** Phaser-free authored-map measurements used by unit tests and e2e reports. */
export function measureLevelPacing(level: LevelDef): LevelPacingMetrics {
  const width = level.walls[0]?.length ?? 0;
  const height = level.walls.length;
  const walkableFloorCount = level.walls.reduce(
    (total, row) => total + [...row].reduce((count, tile) => count + (tile === '.' ? 1 : 0), 0),
    0
  );
  const objectives: Objective[] = [
    ...level.generators.map((generator, index) => ({
      id: generator.id ?? `generator-${index + 1}`,
      tx: generator.tx,
      ty: generator.ty
    })),
    ...(level.boss
      ? [{ id: level.boss.id ?? 'boss', tx: level.boss.tx, ty: level.boss.ty }]
      : [])
  ];

  const points: Tile[] = [...level.playerSpawns, ...objectives, level.exit];
  const searches = points.map((point) => searchFrom(level, point));
  const objectiveOffset = level.playerSpawns.length;
  const exitIndex = points.length - 1;
  const distance = (fromPoint: number, toPoint: number): number => {
    const target = points[toPoint]!;
    return searches[fromPoint]!.distances[target.ty * width + target.tx] ?? -1;
  };

  const route = shortestObjectiveRoute(level.playerSpawns.length, objectives.length, distance, objectiveOffset, exitIndex);
  const routePoints = route
    ? [route.spawnIndex, ...route.objectiveOrder.map((index) => objectiveOffset + index), exitIndex]
    : [];
  const criticalTiles: Tile[] = [];
  for (let i = 0; i + 1 < routePoints.length; i++) {
    const from = routePoints[i]!;
    const to = routePoints[i + 1]!;
    const segment = reconstructPath(points[to]!, searches[from]!, width);
    if (i > 0) segment.shift();
    criticalTiles.push(...segment);
  }
  const widths = criticalTiles.map((tile) => ({ ...tile, widthTiles: corridorWidth(level, tile) }));
  const minWidth = widths.length > 0 ? Math.min(...widths.map((entry) => entry.widthTiles)) : null;
  const pinchPoints = minWidth === null
    ? []
    : widths
        .filter((entry) => entry.widthTiles === minWidth)
        .filter((entry, index, all) => index === 0 || all[index - 1]!.tx !== entry.tx || all[index - 1]!.ty !== entry.ty);

  return {
    widthTiles: width,
    heightTiles: height,
    widthPx: width * level.tileSize,
    heightPx: height * level.tileSize,
    walkableFloorCount,
    criticalPathDistanceTiles: route?.distance ?? null,
    finalObjectiveToExitTiles:
      route && route.objectiveOrder.length > 0
        ? distance(objectiveOffset + route.objectiveOrder.at(-1)!, exitIndex)
        : distance(route?.spawnIndex ?? 0, exitIndex),
    objectiveOrder: route?.objectiveOrder.map((index) => objectives[index]!.id) ?? [],
    minCriticalCorridorWidthTiles: minWidth,
    pinchPoints
  };
}

function searchFrom(level: LevelDef, start: Tile): Search {
  const width = level.walls[0]?.length ?? 0;
  const size = width * level.walls.length;
  const distances = new Int32Array(size).fill(-1);
  const previous = new Int32Array(size).fill(-1);
  const startIndex = start.ty * width + start.tx;
  const queue = [startIndex];
  distances[startIndex] = 0;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!;
    const tx = current % width;
    const ty = Math.floor(current / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      const next = ny * width + nx;
      if (level.walls[ny]?.[nx] !== '.' || distances[next] !== -1) continue;
      distances[next] = distances[current]! + 1;
      previous[next] = current;
      queue.push(next);
    }
  }
  return { distances, previous };
}

function shortestObjectiveRoute(
  spawnCount: number,
  objectiveCount: number,
  distance: (from: number, to: number) => number,
  objectiveOffset: number,
  exitIndex: number
): { spawnIndex: number; objectiveOrder: number[]; distance: number } | null {
  if (spawnCount === 0) return null;
  if (objectiveCount === 0) {
    let best: { spawnIndex: number; objectiveOrder: number[]; distance: number } | null = null;
    for (let spawn = 0; spawn < spawnCount; spawn++) {
      const d = distance(spawn, exitIndex);
      if (d >= 0 && (!best || d < best.distance)) best = { spawnIndex: spawn, objectiveOrder: [], distance: d };
    }
    return best;
  }
  // Authored levels are intentionally small. Avoid pathological bitmasks for malformed content.
  if (objectiveCount > 16) return null;
  const fullMask = (1 << objectiveCount) - 1;
  let bestRoute: { spawnIndex: number; objectiveOrder: number[]; distance: number } | null = null;
  for (let spawn = 0; spawn < spawnCount; spawn++) {
    const costs = new Map<string, number>();
    const previous = new Map<string, number>();
    for (let objective = 0; objective < objectiveCount; objective++) {
      const d = distance(spawn, objectiveOffset + objective);
      if (d >= 0) costs.set(`${1 << objective}:${objective}`, d);
    }
    for (let mask = 1; mask <= fullMask; mask++) {
      for (let last = 0; last < objectiveCount; last++) {
        const key = `${mask}:${last}`;
        const cost = costs.get(key);
        if (cost === undefined) continue;
        for (let next = 0; next < objectiveCount; next++) {
          if ((mask & (1 << next)) !== 0) continue;
          const leg = distance(objectiveOffset + last, objectiveOffset + next);
          if (leg < 0) continue;
          const nextMask = mask | (1 << next);
          const nextKey = `${nextMask}:${next}`;
          const candidate = cost + leg;
          if (candidate < (costs.get(nextKey) ?? Infinity)) {
            costs.set(nextKey, candidate);
            previous.set(nextKey, last);
          }
        }
      }
    }
    for (let last = 0; last < objectiveCount; last++) {
      const key = `${fullMask}:${last}`;
      const exitLeg = distance(objectiveOffset + last, exitIndex);
      const routeDistance = (costs.get(key) ?? Infinity) + (exitLeg < 0 ? Infinity : exitLeg);
      if (!Number.isFinite(routeDistance) || (bestRoute && routeDistance >= bestRoute.distance)) continue;
      const order = [last];
      let mask = fullMask;
      let cursor = last;
      while ((mask & (mask - 1)) !== 0) {
        const prior = previous.get(`${mask}:${cursor}`);
        if (prior === undefined) break;
        mask ^= 1 << cursor;
        cursor = prior;
        order.push(cursor);
      }
      bestRoute = { spawnIndex: spawn, objectiveOrder: order.reverse(), distance: routeDistance };
    }
  }
  return bestRoute;
}

function reconstructPath(target: Tile, search: Search, width: number): Tile[] {
  let cursor = target.ty * width + target.tx;
  if ((search.distances[cursor] ?? -1) < 0) return [];
  const reversed: Tile[] = [];
  while (cursor >= 0) {
    reversed.push({ tx: cursor % width, ty: Math.floor(cursor / width) });
    cursor = search.previous[cursor]!;
  }
  return reversed.reverse();
}

/** Minimum open span through a tile: one-tile halls report 1, open rooms report larger. */
function corridorWidth(level: LevelDef, tile: Tile): number {
  let horizontal = 1;
  for (let tx = tile.tx - 1; level.walls[tile.ty]?.[tx] === '.'; tx--) horizontal++;
  for (let tx = tile.tx + 1; level.walls[tile.ty]?.[tx] === '.'; tx++) horizontal++;
  let vertical = 1;
  for (let ty = tile.ty - 1; level.walls[ty]?.[tile.tx] === '.'; ty--) vertical++;
  for (let ty = tile.ty + 1; level.walls[ty]?.[tile.tx] === '.'; ty++) vertical++;
  return Math.min(horizontal, vertical);
}
