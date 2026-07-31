import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, COBALT_COMBS, CONTENT, HOLLOW_THRONE, RESIN_GALLERIES } from '../../src/content';
import { buildFlowField, buildPassable, distanceAt, flowStep, tileAt } from '../../src/sim/flowField';
import { segmentHitsWall, tileCenter } from '../../src/sim/level';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type LevelDef } from '../../src/sim/types';

/**
 * Horde pathfinding (issue #107).
 *
 * Enemy movement used to be straight-line steering with crowd separation, so a
 * chaser wedged against any concave wall and never arrived. The objective is
 * spawner destruction, not survival, so a stuck swarm never *blocks* a clear —
 * it just quietly removes the pressure the whole design rests on, which is why
 * this went unnoticed across four authored maps.
 *
 * These tests are structural, not tuning: every one of them fails if an enemy
 * cannot reach a player it has a floor route to.
 */

const AUTHORED = [BROOD_WARRENS, RESIN_GALLERIES, COBALT_COMBS, HOLLOW_THRONE];

/**
 * The bug in isolation: a barrier dead ahead, with the way round leading
 * sideways.
 *
 * ```
 *   tx  0 1 2 3 4 5 6 7 8 9 10
 *       # # # # # # # # # # #
 *       # . . . . . . . . . #
 *       # . . . . # . . . . #
 *       # . . . . # . . . . #
 *       # E . . . # . . . P #   E starts at (1,4), the player sits at (9,4)
 *       # . . . . # . . . . #
 *       # . . . . # . . . . #
 *       # . . . . . . . . . #   the only ways round are this row and row 1
 *       # # # # # # # # # # #
 * ```
 *
 * Eight tiles apart in a straight line with a wall column between them, so a
 * chaser closes to the barrier and then stops dead: the two share a row, the
 * horizontal component is blocked, `moveCircle` drops the blocked axis, and
 * the vertical component is zero. Nothing moves, ever. Getting through means
 * abandoning the straight line for a fourteen-tile detour.
 *
 * Contrived on purpose — it isolates wedging from every other force in the
 * sim. The authored maps below supply the realistic geometry.
 */
const HOOK_TRAP: LevelDef = {
  id: 'hook-trap',
  name: 'Hook Trap',
  tileSize: 32,
  walls: [
    '###########',
    '#.........#',
    '#....#....#',
    '#....#....#',
    '#....#....#',
    '#....#....#',
    '#....#....#',
    '#.........#',
    '###########'
  ],
  playerSpawns: [{ tx: 9, ty: 4 }],
  generators: [],
  pickups: [],
  exit: { tx: 9, ty: 7 }
};
const TRAP_W = HOOK_TRAP.walls[0]!.length;
/** Where the enemy starts: across the barrier from the player, on its row. */
const TRAP_START = { tx: 1, ty: 4 };
/** Straight-line tiles between them, versus the route the floor actually allows. */
const TRAP_CROW_FLIES = 8;
const TRAP_ROUTE = 14;
/** Bottom edge of the barrier column: to pass it, an enemy must go below this. */
const BARRIER_BOTTOM_Y = 7 * HOOK_TRAP.tileSize;

function spawnEnemyAt(sim: Sim, typeId: string, tx: number, ty: number): EnemyState {
  const e: EnemyState = {
    id: 9000 + sim.state.enemies.length,
    typeId,
    pos: tileCenter(sim.config.level, tx, ty),
    hp: CONTENT.enemies[typeId]!.maxHp,
    attackCooldown: 0,
    windupTicksLeft: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
  sim.state.enemies.push(e);
  return e;
}

/**
 * A sim with the spawners removed and the player pinned at full health, so a
 * run measures one thing: whether the seeded enemy arrives. The player never
 * takes an input, which is the harshest case — a stationary target gives the
 * flow field no help from a moving attractor.
 */
function chaseSim(level: LevelDef, seed = 7): Sim {
  const sim = createSim({ seed, level, players: [{ heroId: 'vanguard' }], content: CONTENT });
  sim.state.generators = [];
  return sim;
}

/** Runs until the enemy is within `within` px of the player, or the budget runs out. */
function ticksToReach(sim: Sim, enemy: EnemyState, within: number, budget: number): number | null {
  const player = sim.state.players[0]!;
  for (let t = 1; t <= budget; t++) {
    player.hp = player.maxHp; // the question is arrival, not whether it wins the fight
    simTick(sim, [EMPTY_INPUT]);
    if (Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.y - player.pos.y) <= within) return t;
  }
  return null;
}

/** Generous travel budget: the route length at the enemy's own speed, tripled. */
function budgetFor(level: LevelDef, typeId: string, routeTiles: number): number {
  const speed = CONTENT.enemies[typeId]!.moveSpeed;
  return Math.ceil(((routeTiles * level.tileSize) / speed) * 60 * 3) + 120;
}

describe('flow field', () => {
  const passable = buildPassable(HOOK_TRAP, undefined, 10);
  const field = buildFlowField(HOOK_TRAP, passable, [{ tx: 9, ty: 4 }]);

  it('measures distance along the floor, not through walls', () => {
    // Eight tiles apart as the crow flies, fourteen along the floor. That gap
    // is the entire bug: straight-line steering only ever sees the eight.
    expect(distanceAt(field, TRAP_START.tx, TRAP_START.ty)).toBe(TRAP_ROUTE);
    expect(TRAP_ROUTE).toBeGreaterThan(TRAP_CROW_FLIES);
    expect(distanceAt(field, 8, 4), 'the tile beside the player').toBe(1);
  });

  it('reports walls and off-grid tiles as unreachable rather than near', () => {
    expect(distanceAt(field, 5, 4), 'the barrier between them').toBeNull();
    expect(distanceAt(field, 0, 0), 'the outer border').toBeNull();
    expect(distanceAt(field, -1, 4), 'off the grid').toBeNull();
  });

  it('steps strictly downhill from anywhere and always lands on the player', () => {
    for (let ty = 0; ty < field.height; ty++) {
      for (let tx = 0; tx < field.width; tx++) {
        if (distanceAt(field, tx, ty) === null) continue;
        let at = { tx, ty };
        const walked = [distanceAt(field, tx, ty)!];
        for (let i = 0; i < 64; i++) {
          const next = flowStep(field, passable, at);
          if (!next) break;
          at = next;
          walked.push(distanceAt(field, at.tx, at.ty)!);
          expect(passable[at.ty * TRAP_W + at.tx], 'never steps onto a tile it cannot stand in').toBe(1);
        }
        expect(walked[walked.length - 1], `the walk from (${tx},${ty}) ends on the player`).toBe(0);
        for (let i = 1; i < walked.length; i++) {
          expect(walked[i], 'every step is closer than the last').toBeLessThan(walked[i - 1]!);
        }
      }
    }
  });

  it('routes wide bodies only through gaps they fit', () => {
    // Radius 19 (the Ravager) is 38px across, so a tile whose centre sits 16px
    // from a wall face is closed to it even though the floor is there.
    const wide = buildPassable(HOOK_TRAP, undefined, 19);
    const narrow = buildPassable(HOOK_TRAP, undefined, 10);
    const neck = TRAP_START.ty * TRAP_W + TRAP_START.tx;
    expect(narrow[neck], 'a Skitterling fits the left corridor').toBe(1);
    expect(wide[neck], 'a Ravager does not').toBe(0);
  });

  it('still offers a route when the player stands where the enemy cannot follow', () => {
    // The whole trap is too tight for a Ravager, including the player's own
    // tile. Seeding the search there anyway is what keeps a wide body walking
    // toward the player instead of standing still with no field at all.
    const wide = buildPassable(HOOK_TRAP, undefined, 19);
    const wideField = buildFlowField(HOOK_TRAP, wide, [{ tx: 9, ty: 4 }]);
    expect(wide[4 * TRAP_W + 9], 'the player tile is closed to a Ravager').toBe(0);
    expect(distanceAt(wideField, 9, 4), 'and is still the attractor').toBe(0);
  });
});

describe('enemies escape concave geometry', () => {
  it('a chaser walks around a wall the straight line cannot cross', () => {
    const sim = chaseSim(HOOK_TRAP);
    const enemy = spawnEnemyAt(sim, 'skitterling', TRAP_START.tx, TRAP_START.ty);
    const player = sim.state.players[0]!;

    // The trap is real: this body has no straight path at the start.
    expect(
      segmentHitsWall(HOOK_TRAP, enemy.pos, player.pos, CONTENT.enemies['skitterling']!.radius, undefined),
      'the straight line is walled off'
    ).toBe(true);

    expect(ticksToReach(sim, enemy, 40, budgetFor(HOOK_TRAP, 'skitterling', TRAP_ROUTE))).not.toBeNull();
  });

  it('goes round the barrier rather than through where the straight line pointed', () => {
    const sim = chaseSim(HOOK_TRAP);
    const enemy = spawnEnemyAt(sim, 'skitterling', TRAP_START.tx, TRAP_START.ty);
    const player = sim.state.players[0]!;

    let routed = false;
    let wentAround = false;
    for (let t = 0; t < budgetFor(HOOK_TRAP, 'skitterling', TRAP_ROUTE); t++) {
      player.hp = player.maxHp;
      simTick(sim, [EMPTY_INPUT]);
      if ((enemy.pathTicks ?? 0) > 0) routed = true;
      // Leaving the barrier's rows is only possible by choosing a worse
      // straight-line position — the one thing greedy steering can never do.
      if (enemy.pos.y > BARRIER_BOTTOM_Y || enemy.pos.y < HOOK_TRAP.tileSize * 2) wentAround = true;
      if (Math.hypot(enemy.pos.x - player.pos.x, enemy.pos.y - player.pos.y) <= 40) break;
    }
    expect(routed, 'the enemy noticed the straight line had failed').toBe(true);
    expect(wentAround, 'and left the barrier rows to get past it').toBe(true);
  });
});

/**
 * The authored maps. For each one the deepest reachable tile — the furthest
 * point from the player measured along the floor — is the worst pocket that
 * map has to offer, so an enemy seeded there is the strongest arrival test the
 * level can produce. Deriving it from the level data rather than hardcoding
 * coordinates means a future map edit re-aims the test automatically.
 */
describe.each(AUTHORED)('$name has no enemy trap', (level) => {
  const chasers = ['skitterling', 'carapace-husk'] as const;

  it.each(chasers)('a %s reaches the player from the deepest pocket', (typeId) => {
    const radius = CONTENT.enemies[typeId]!.radius;
    const sim = chaseSim(level);
    const player = sim.state.players[0]!;
    const passable = buildPassable(level, undefined, radius);
    const field = buildFlowField(level, passable, [tileAt(level, player.pos)]);

    let deepest = { tx: 0, ty: 0, d: -1 };
    for (let ty = 0; ty < field.height; ty++) {
      for (let tx = 0; tx < field.width; tx++) {
        const d = distanceAt(field, tx, ty);
        if (d !== null && d > deepest.d) deepest = { tx, ty, d };
      }
    }
    expect(deepest.d, 'the map has somewhere to be stuck').toBeGreaterThan(4);

    const enemy = spawnEnemyAt(sim, typeId, deepest.tx, deepest.ty);
    const reached = ticksToReach(sim, enemy, 40, budgetFor(level, typeId, deepest.d));
    expect(reached, `stuck at (${deepest.tx},${deepest.ty}), ${deepest.d} tiles out`).not.toBeNull();
  });
});

describe('pathfinding stays deterministic', () => {
  it('two runs of the same seed agree tick for tick', () => {
    const run = (): string => {
      const sim = chaseSim(HOOK_TRAP, 4242);
      spawnEnemyAt(sim, 'skitterling', TRAP_START.tx, TRAP_START.ty);
      spawnEnemyAt(sim, 'carapace-husk', TRAP_START.tx, TRAP_START.ty + 1);
      for (let t = 0; t < 300; t++) simTick(sim, [EMPTY_INPUT]);
      return hashState(sim.state);
    };
    expect(run()).toBe(run());
  });

  it('keeps the derived field out of the hashed state', () => {
    const sim = chaseSim(HOOK_TRAP);
    spawnEnemyAt(sim, 'skitterling', TRAP_START.tx, TRAP_START.ty);
    for (let t = 0; t < 240; t++) simTick(sim, [EMPTY_INPUT]);
    // The cache exists…
    expect(sim.flow, 'a field was built').toBeDefined();
    // …and contributes nothing to the determinism hash, which is what keeps a
    // pure optimisation out of the desync surface.
    expect(hashState(sim.state)).not.toContain('passable');
    expect(hashState(sim.state)).not.toContain('blockKey');
  });
});
