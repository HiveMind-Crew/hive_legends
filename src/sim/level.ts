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

export function isWallTile(level: LevelDef, tx: number, ty: number): boolean {
  const row = level.walls[ty];
  if (row === undefined) return true;
  const c = row[tx];
  if (c === undefined) return true;
  return c === '#';
}

/** True if a circle at pos with the given radius overlaps any wall tile. */
export function circleHitsWall(level: LevelDef, pos: Vec2, radius: number): boolean {
  const ts = level.tileSize;
  const minTx = Math.floor((pos.x - radius) / ts);
  const maxTx = Math.floor((pos.x + radius) / ts);
  const minTy = Math.floor((pos.y - radius) / ts);
  const maxTy = Math.floor((pos.y + radius) / ts);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isWallTile(level, tx, ty)) continue;
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
export function moveCircle(level: LevelDef, pos: Vec2, radius: number, dx: number, dy: number): void {
  if (dx !== 0) {
    const nx = pos.x + dx;
    if (!circleHitsWall(level, { x: nx, y: pos.y }, radius)) pos.x = nx;
  }
  if (dy !== 0) {
    const ny = pos.y + dy;
    if (!circleHitsWall(level, { x: pos.x, y: ny }, radius)) pos.y = ny;
  }
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
    ...(level.decor ?? []).map((d, i) => ({ what: `decor[${i}]`, tx: d.tx, ty: d.ty })),
    { what: 'exit', tx: level.exit.tx, ty: level.exit.ty }
  ];
  for (const { what, tx, ty } of mustBeFloor) {
    if (isWallTile(level, tx, ty)) problems.push(`${what} at (${tx},${ty}) is not on a floor tile`);
  }
  if (level.playerSpawns.length === 0) problems.push('level has no player spawns');
  return problems;
}
