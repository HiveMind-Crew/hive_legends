import type { LevelDef, Vec2 } from './types';

/** Center of a tile in world coordinates. */
export function tileCenter(level: LevelDef, tx: number, ty: number): Vec2 {
  return { x: (tx + 0.5) * level.tileSize, y: (ty + 0.5) * level.tileSize };
}

export function levelWidthPx(level: LevelDef): number {
  return (level.walls[0]?.length ?? 0) * level.tileSize;
}

export function levelHeightPx(level: LevelDef): number {
  return level.walls.length * level.tileSize;
}

/**
 * A sim-side collision overlay: floor tiles that are *dynamically* blocked
 * (locked gates, intact secret walls). Movement consults this on top of the
 * static wall grid, so opening a gate or breaking a secret makes its tile
 * passable without touching the level data. Kept allocation-light (a plain
 * array of tile indices) because it rides the hot path every tick.
 */
export interface Blockage {
  blockedTiles: readonly number[];
  width: number;
}

export function tileIndex(level: LevelDef, tx: number, ty: number): number {
  return ty * (level.walls[0]?.length ?? 0) + tx;
}

export function isWallTile(level: LevelDef, tx: number, ty: number): boolean {
  const row = level.walls[ty];
  if (row === undefined) return true;
  const c = row[tx];
  if (c === undefined) return true;
  return c === '#';
}

/** Blocked for movement: a static wall, or a dynamically-blocked floor tile. */
function isBlockedTile(level: LevelDef, tx: number, ty: number, blk?: Blockage): boolean {
  if (isWallTile(level, tx, ty)) return true;
  if (blk && blk.blockedTiles.includes(ty * blk.width + tx)) return true;
  return false;
}

/** True if a circle at pos with the given radius overlaps any blocked tile. */
export function circleHitsWall(level: LevelDef, pos: Vec2, radius: number, blk?: Blockage): boolean {
  const ts = level.tileSize;
  const minTx = Math.floor((pos.x - radius) / ts);
  const maxTx = Math.floor((pos.x + radius) / ts);
  const minTy = Math.floor((pos.y - radius) / ts);
  const maxTy = Math.floor((pos.y + radius) / ts);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isBlockedTile(level, tx, ty, blk)) continue;
      // Closest point on the tile AABB to the circle center.
      const cx = Math.max(tx * ts, Math.min(pos.x, (tx + 1) * ts));
      const cy = Math.max(ty * ts, Math.min(pos.y, (ty + 1) * ts));
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }
  return false;
}

/**
 * Moves a circle by (dx, dy) with axis-separated wall collision, mutating pos.
 * Sliding along walls falls out naturally: a blocked axis is simply dropped.
 */
export function moveCircle(level: LevelDef, pos: Vec2, radius: number, dx: number, dy: number, blk?: Blockage): void {
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!circleHitsWall(level, { x: nx, y: pos.y }, radius, blk)) pos.x = nx;
  }
  if (dy !== 0) {
    const ny = pos.y + dy;
    if (!circleHitsWall(level, { x: pos.x, y: ny }, radius, blk)) pos.y = ny;
  }
}

/**
 * True if a circle of `radius` cannot travel the straight segment from → to
 * without touching blocked geometry. Sampled at half-radius steps, which is
 * fine enough that no wall thinner than the circle can slip between probes.
 *
 * Used to ask "can this body just walk at the target?" — the question that
 * decides whether an enemy needs to path around something (issue #107).
 */
export function segmentHitsWall(
  level: LevelDef,
  from: Vec2,
  to: Vec2,
  radius: number,
  blk?: Blockage
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return circleHitsWall(level, from, radius, blk);
  const stride = Math.max(2, radius / 2);
  const steps = Math.ceil(length / stride);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (circleHitsWall(level, { x: from.x + dx * t, y: from.y + dy * t }, radius, blk)) return true;
  }
  return false;
}

/** Validates a level definition; returns a list of problems (empty = ok). */
export function validateLevel(level: LevelDef): string[] {
  const problems: string[] = [];
  const w = level.walls[0]?.length ?? 0;
  if (w === 0 || level.walls.length === 0) problems.push('level has no wall grid');
  level.walls.forEach((row, i) => {
    if (row.length !== w) problems.push(`row ${i} has length ${row.length}, expected ${w}`);
    if (!/^[#.]+$/.test(row)) problems.push(`row ${i} contains invalid characters`);
  });
  const mustBeFloor: { what: string; tx: number; ty: number }[] = [
    ...level.playerSpawns.map((s, i) => ({ what: `playerSpawn[${i}]`, tx: s.tx, ty: s.ty })),
    ...level.generators.map((g, i) => ({ what: `generator[${i}]`, tx: g.tx, ty: g.ty })),
    ...level.pickups.map((p, i) => ({ what: `pickup[${i}]`, tx: p.tx, ty: p.ty })),
    ...(level.props ?? []).map((p, i) => ({ what: `prop[${i}]`, tx: p.tx, ty: p.ty })),
    ...(level.gates ?? []).map((g, i) => ({ what: `gate[${i}]`, tx: g.tx, ty: g.ty })),
    ...(level.secrets ?? []).map((s, i) => ({ what: `secret[${i}]`, tx: s.tx, ty: s.ty })),
    { what: 'exit', tx: level.exit.tx, ty: level.exit.ty }
  ];
  for (const { what, tx, ty } of mustBeFloor) {
    if (isWallTile(level, tx, ty)) problems.push(`${what} at (${tx},${ty}) is not on a floor tile`);
  }
  for (const [i, decor] of (level.decor ?? []).entries()) {
    if (decor.surface === 'wall') {
      if (!isWallTile(level, decor.tx, decor.ty)) {
        problems.push(`decor[${i}] at (${decor.tx},${decor.ty}) is not on a wall tile`);
      }
    } else if (isWallTile(level, decor.tx, decor.ty)) {
      problems.push(`decor[${i}] at (${decor.tx},${decor.ty}) is not on a floor tile`);
    }
  }
  if (level.playerSpawns.length === 0) problems.push('level has no player spawns');

  const objectiveIds = new Set<string>();
  const encounterIds = new Set<string>();
  const encounterObjectives = new Map<string, number>();
  const addObjective = (what: string, id: string | undefined, encounterId: string | undefined): void => {
    if (id) {
      if (objectiveIds.has(id)) problems.push(`level "${level.id}" ${what} has duplicate objective id "${id}"`);
      objectiveIds.add(id);
    }
    if (!encounterId) return;
    if (!id) problems.push(`level "${level.id}" ${what} in encounter "${encounterId}" needs a stable id`);
    encounterObjectives.set(encounterId, (encounterObjectives.get(encounterId) ?? 0) + 1);
  };
  level.generators.forEach((g, i) => addObjective(`generator[${i}]`, g.id, g.encounterId));
  if (level.boss) addObjective('boss', level.boss.id, level.boss.encounterId);

  for (const encounter of level.encounters ?? []) {
    const label = `level "${level.id}" encounter "${encounter.id}"`;
    if (!encounter.id) problems.push(`${label} has an empty id`);
    if (encounterIds.has(encounter.id)) problems.push(`${label} has a duplicate id`);
    encounterIds.add(encounter.id);
    const trigger = encounter.trigger;
    if (trigger.kind === 'region') {
      if (
        !Number.isInteger(trigger.minTx) ||
        !Number.isInteger(trigger.minTy) ||
        !Number.isInteger(trigger.maxTx) ||
        !Number.isInteger(trigger.maxTy) ||
        trigger.minTx > trigger.maxTx ||
        trigger.minTy > trigger.maxTy ||
        trigger.minTx < 0 ||
        trigger.minTy < 0 ||
        trigger.maxTx >= w ||
        trigger.maxTy >= level.walls.length
      ) {
        problems.push(`${label} has an invalid trigger region`);
      }
    } else if (
      !Number.isInteger(trigger.tx) ||
      !Number.isInteger(trigger.ty) ||
      !Number.isFinite(trigger.radiusTiles) ||
      trigger.radiusTiles <= 0 ||
      trigger.tx < 0 ||
      trigger.ty < 0 ||
      trigger.tx >= w ||
      trigger.ty >= level.walls.length
    ) {
      problems.push(`${label} has an invalid radius trigger`);
    }
  }

  for (const encounter of level.encounters ?? []) {
    const label = `level "${level.id}" encounter "${encounter.id}"`;
    if ((encounterObjectives.get(encounter.id) ?? 0) === 0) problems.push(`${label} has no objective`);
    for (const dependency of encounter.requires ?? []) {
      if (!encounterIds.has(dependency)) problems.push(`${label} requires missing encounter "${dependency}"`);
    }
  }
  for (const g of level.generators) {
    if (g.encounterId && !encounterIds.has(g.encounterId)) {
      problems.push(`level "${level.id}" generator "${g.id ?? g.typeId}" references missing encounter "${g.encounterId}"`);
    }
  }
  if (level.boss?.encounterId && !encounterIds.has(level.boss.encounterId)) {
    problems.push(`level "${level.id}" boss "${level.boss.id ?? level.boss.typeId}" references missing encounter "${level.boss.encounterId}"`);
  }

  // Stable DFS order makes cycle errors deterministic and names the authored stage.
  const byId = new Map((level.encounters ?? []).map((encounter) => [encounter.id, encounter]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) {
      problems.push(`level "${level.id}" encounter "${id}" has a dependency cycle`);
      return;
    }
    visiting.add(id);
    for (const dependency of byId.get(id)?.requires ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const encounter of level.encounters ?? []) visit(encounter.id);
  return problems;
}
