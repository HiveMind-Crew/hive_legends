import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, COBALT_COMBS, HOLLOW_THRONE, LEVELS, MISSION_ORDER, RESIN_GALLERIES } from '../../src/content';
import { circleHitsWall, moveCircle, tileCenter, validateLevel } from '../../src/sim/level';
import { measureLevelPacing } from '../../src/sim/levelMetrics';
import type { LevelDef } from '../../src/sim/types';

const AUTHORED = [BROOD_WARRENS, RESIN_GALLERIES, COBALT_COMBS, HOLLOW_THRONE];

/** Floor-BFS reachability from a start tile; `blocked` tiles are impassable. */
function reachable(level: LevelDef, start: { tx: number; ty: number }, blocked: { tx: number; ty: number }[] = []) {
  const w = level.walls[0]!.length;
  const h = level.walls.length;
  const isFloor = (tx: number, ty: number) => level.walls[ty]?.[tx] === '.';
  const blk = new Set(blocked.map((b) => b.ty * w + b.tx));
  const seen = new Set<number>();
  const q = [start.ty * w + start.tx];
  seen.add(q[0]!);
  while (q.length) {
    const cur = q.shift()!;
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ] as const) {
      const nx = cx + dx;
      const ny = cy + dy;
      const nk = ny * w + nx;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || seen.has(nk) || blk.has(nk) || !isFloor(nx, ny)) continue;
      seen.add(nk);
      q.push(nk);
    }
  }
  return (tx: number, ty: number) => seen.has(ty * w + tx);
}

describe('level validation', () => {
  it.each(AUTHORED)('$name is a well-formed level', (level) => {
    expect(validateLevel(level)).toEqual([]);
  });

  it.each(AUTHORED)('$name border is fully walled', (level) => {
    const rows = level.walls;
    const w = rows[0]!.length;
    expect(rows[0]).toBe('#'.repeat(w));
    expect(rows[rows.length - 1]).toBe('#'.repeat(w));
    for (const row of rows) {
      expect(row[0]).toBe('#');
      expect(row[w - 1]).toBe('#');
    }
  });

  it('every authored mission is registered in the level order', () => {
    for (const level of AUTHORED) {
      expect(LEVELS[level.id]).toBe(level);
      expect(MISSION_ORDER).toContain(level.id);
    }
    // The Brood Warrens must stay first (e2e Enter-default).
    expect(MISSION_ORDER[0]).toBe(BROOD_WARRENS.id);
  });

  it.each(AUTHORED)('$name: every generator and the exit is reachable from spawn', (level) => {
    const spawn = level.playerSpawns[0]!;
    const canReach = reachable(level, spawn);
    for (const g of level.generators) expect(canReach(g.tx, g.ty), `gen ${g.typeId}`).toBe(true);
    expect(canReach(level.exit.tx, level.exit.ty), 'exit').toBe(true);
  });

  it('The Cobalt Combs vaults are sealed behind their gate and secret wall', () => {
    const spawn = COBALT_COMBS.playerSpawns[0]!;
    const gate = COBALT_COMBS.gates![0]!;
    const secret = COBALT_COMBS.secrets![0]!;
    // Treasure tiles sit just inside each south vault.
    const gateTreasure = { tx: 5, ty: 24 };
    const secretTreasure = { tx: 32, ty: 24 };

    // Open (mechanic solved): reachable.
    const open = reachable(COBALT_COMBS, spawn);
    expect(open(gateTreasure.tx, gateTreasure.ty)).toBe(true);
    expect(open(secretTreasure.tx, secretTreasure.ty)).toBe(true);

    // Sealed (gate/secret tile impassable): the treasure is cut off, proving
    // the vault is only reachable through the #17 mechanic.
    const sealedGate = reachable(COBALT_COMBS, spawn, [gate]);
    expect(sealedGate(gateTreasure.tx, gateTreasure.ty)).toBe(false);
    const sealedSecret = reachable(COBALT_COMBS, spawn, [secret]);
    expect(sealedSecret(secretTreasure.tx, secretTreasure.ty)).toBe(false);
  });

  it('The Cobalt Combs fields all three enemy families', () => {
    // The step up from the Galleries is the enemy mix, not a fourth spawner —
    // ranged pressure the earlier realms never applied.
    const families = COBALT_COMBS.generators.map((g) => g.typeId).sort();
    expect(families).toEqual(['brood-node', 'husk-mound', 'spitter-nest']);
  });

  it('The Resin Galleries vaults are sealed behind their gate and secret wall', () => {
    const spawn = RESIN_GALLERIES.playerSpawns[0]!;
    const gate = RESIN_GALLERIES.gates![0]!;
    const secret = RESIN_GALLERIES.secrets![0]!;
    // Treasure tiles sit just inside each vault.
    const gateTreasure = { tx: 12, ty: 25 };
    const secretTreasure = { tx: 25, ty: 25 };

    // Open (mechanic solved): reachable.
    const open = reachable(RESIN_GALLERIES, spawn);
    expect(open(gateTreasure.tx, gateTreasure.ty)).toBe(true);
    expect(open(secretTreasure.tx, secretTreasure.ty)).toBe(true);

    // Sealed (gate/secret tile impassable): the treasure is cut off, proving
    // the vault is only reachable through the #17 mechanic.
    const sealedGate = reachable(RESIN_GALLERIES, spawn, [gate]);
    expect(sealedGate(gateTreasure.tx, gateTreasure.ty)).toBe(false);
    const sealedSecret = reachable(RESIN_GALLERIES, spawn, [secret]);
    expect(sealedSecret(secretTreasure.tx, secretTreasure.ty)).toBe(false);
  });

  it('The Brood Warrens optional vault rewards stay sealed by their authored mechanics', () => {
    const spawn = BROOD_WARRENS.playerSpawns[0]!;
    const gate = BROOD_WARRENS.gates![0]!;
    const secret = BROOD_WARRENS.secrets![0]!;
    const gateTreasure = { tx: 19, ty: 12 };
    const secretTreasure = { tx: 29, ty: 13 };

    const open = reachable(BROOD_WARRENS, spawn);
    expect(open(gateTreasure.tx, gateTreasure.ty)).toBe(true);
    expect(open(secretTreasure.tx, secretTreasure.ty)).toBe(true);
    expect(reachable(BROOD_WARRENS, spawn, [gate])(gateTreasure.tx, gateTreasure.ty)).toBe(false);
    expect(reachable(BROOD_WARRENS, spawn, [secret])(secretTreasure.tx, secretTreasure.ty)).toBe(false);
  });
});

describe('collision', () => {
  it('detects circle overlap with wall tiles', () => {
    // Tile (0,0) is a border wall.
    expect(circleHitsWall(BROOD_WARRENS, { x: 40, y: 40 }, 12)).toBe(true);
    const openTile = tileCenter(BROOD_WARRENS, 4, 3);
    expect(circleHitsWall(BROOD_WARRENS, openTile, 12)).toBe(false);
  });

  it('blocks movement into walls and allows sliding', () => {
    const pos = tileCenter(BROOD_WARRENS, 1, 7); // adjacent to the west border, open above/below
    const startY = pos.y;
    moveCircle(BROOD_WARRENS, pos, 12, -100, 10);
    expect(pos.x).toBeGreaterThanOrEqual(32 + 12); // never inside the border wall
    expect(pos.y).toBe(startY + 10); // y-axis movement still applied
  });
});

describe('authored pacing baselines', () => {
  it.each([
    [BROOD_WARRENS, { floor: 1069, route: 97, exit: 5, pinch: 3 }],
    [RESIN_GALLERIES, { floor: 537, route: 78, exit: 34, pinch: 1 }],
    [COBALT_COMBS, { floor: 514, route: 65, exit: 4, pinch: 1 }],
    [HOLLOW_THRONE, { floor: 528, route: 18, exit: 7, pinch: 10 }]
  ] as const)('$name reports its pinned route baseline', (level, expected) => {
    const metrics = measureLevelPacing(level);
    expect(metrics.walkableFloorCount).toBe(expected.floor);
    expect(metrics.criticalPathDistanceTiles).toBe(expected.route);
    expect(metrics.finalObjectiveToExitTiles).toBe(expected.exit);
    expect(metrics.minCriticalCorridorWidthTiles).toBe(expected.pinch);
    expect(metrics.pinchPoints.length).toBeGreaterThan(0);
    expect(metrics.objectiveOrder).toHaveLength(level.generators.length + (level.boss ? 1 : 0));
  });
});
