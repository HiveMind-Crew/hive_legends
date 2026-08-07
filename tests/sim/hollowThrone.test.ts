import { describe, expect, it } from 'vitest';
import { CONTENT, HOLLOW_THRONE } from '../../src/content';
import { circleHitsWall, tileCenter } from '../../src/sim/level';
import { measureAuthoredRoute, measureLevelPacing } from '../../src/sim/levelMetrics';
import { createSim, effectiveGeneratorMaxAlive, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type InputCommand, type SimEvent } from '../../src/sim/types';
import { PARTY_CAMERA } from '../../src/game/partyCamera';

/**
 * The Hollow Throne's staged pre-boss approach (#151). The playthrough and
 * determinism layers mirror the Warrens and the Combs; the layers below pin
 * the properties specific to a "both sanctums, either order, then a dormant
 * boss" finale — most importantly that Mireveil cannot be touched, cannot
 * touch anyone, and cannot summon until both sanctums clear and a living
 * player crosses the threshold.
 */

const WEST_FIRST = ['west-sanctum-mound', 'east-sanctum-cyst'];
const EAST_FIRST = ['east-sanctum-cyst', 'west-sanctum-mound'];

/** The hostile readability ceiling from docs/design/visual-direction.md. */
const HOSTILE_CEILING = 15;

function newSim(seed = 151, heroes = 1): Sim {
  return createSim({
    seed,
    level: HOLLOW_THRONE,
    players: Array.from({ length: heroes }, () => ({ heroId: 'vanguard' as const })),
    content: CONTENT
  });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function generator(id: string) {
  return HOLLOW_THRONE.generators.find((g) => g.id === id)!;
}

function encounter(id: string) {
  return (HOLLOW_THRONE.encounters ?? []).find((e) => e.id === id)!;
}

/** Trigger a whole encounter by standing in it, then delete its objectives. */
function clearEncounter(sim: Sim, id: string): SimEvent[] {
  const trigger = encounter(id).trigger;
  const tile = trigger.kind === 'region'
    ? { tx: trigger.minTx, ty: trigger.minTy }
    : { tx: trigger.tx, ty: trigger.ty };
  sim.state.players[0]!.pos = tileCenter(HOLLOW_THRONE, tile.tx, tile.ty);
  const events = [...simTick(sim, [EMPTY_INPUT])];
  sim.state.generators = sim.state.generators.filter((g) => g.encounterId !== id);
  events.push(...simTick(sim, [EMPTY_INPUT]));
  return events;
}

/** Stand in the boss threshold's trigger region (does nothing until both sanctums clear). */
function enterThreshold(sim: Sim): SimEvent[] {
  const trigger = encounter('boss-threshold').trigger;
  if (trigger.kind !== 'region') throw new Error('boss-threshold uses a region trigger');
  sim.state.players[0]!.pos = tileCenter(HOLLOW_THRONE, trigger.minTx, trigger.minTy);
  return simTick(sim, [EMPTY_INPUT]);
}

/** Reachability with an explicit set of tiles treated as solid. */
function reachableWithout(blocked: readonly { tx: number; ty: number }[], from: { tx: number; ty: number }) {
  const width = HOLLOW_THRONE.walls[0]!.length;
  const solid = new Set(blocked.map((t) => `${t.tx},${t.ty}`));
  const seen = new Set<string>([`${from.tx},${from.ty}`]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { tx, ty } = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= HOLLOW_THRONE.walls.length) continue;
      if (HOLLOW_THRONE.walls[ny]?.[nx] !== '.' || solid.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ tx: nx, ty: ny });
    }
  }
  return (tx: number, ty: number): boolean => seen.has(`${tx},${ty}`);
}

describe('The Hollow Throne', () => {
  it('spawns the authored generators, gate, secret and dormant boss', () => {
    const sim = newSim();
    expect(sim.state.generators).toHaveLength(2);
    expect(sim.state.gates.length).toBe(1);
    expect(sim.state.secrets.length).toBe(1);
    expect(sim.state.boss).not.toBeNull();
    expect(sim.state.boss!.active).toBe(false);
  });

  it('is deterministic: same seed and inputs produce an identical state hash', () => {
    const a = newSim(555);
    const b = newSim(555);
    const cmd = input({ moveX: -1, moveY: -0.2, attack: true });
    for (let i = 0; i < TICK_RATE * 10; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.tick).toBeGreaterThan(0);
  });

  it('different seeds diverge once the RNG is consumed', () => {
    const a = newSim(1);
    const b = newSim(2);
    for (const sim of [a, b]) {
      for (const state of sim.state.encounters) state.active = true;
      for (const gen of sim.state.generators) gen.active = true;
      runTicks(sim, TICK_RATE * 10);
    }
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });

  it('a full scripted playthrough clears both sanctums, crosses the threshold, fells Mireveil, and exits', () => {
    const sim = newSim(777);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 40000) {
      p.hp = p.maxHp; // this test is about objective/phase plumbing, not survival
      const g = sim.state.generators.find((gen) => gen.hp > 0);
      if (g) {
        p.pos = { x: g.pos.x - 40, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
        simTick(sim, [input({ attack: true, ability: sim.state.enemies.length > 4 })]);
        continue;
      }
      const boss = sim.state.boss!;
      if (!boss.active) {
        enterThreshold(sim);
        continue;
      }
      if (boss.hp > 0) {
        p.pos = { x: boss.pos.x - 40, y: boss.pos.y };
        p.facing = { x: 1, y: 0 };
        simTick(sim, [input({ attack: true })]);
        continue;
      }
      break;
    }
    expect(sim.state.boss!.hp).toBe(0);
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
  });
});

describe('The Hollow Throne staged approach (#151)', () => {
  it('meets the authored geometry, exit-leg and pinch budgets', () => {
    const metrics = measureLevelPacing(HOLLOW_THRONE);
    expect([metrics.widthTiles, metrics.heightTiles]).toEqual([40, 36]);
    expect(metrics.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
    expect(metrics.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
    expect(metrics.minCriticalCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    expect(HOLLOW_THRONE.previewExit).toBe(true);
    // The boss is deep north, the exit right beside her — the optimal route
    // (dependency-unaware) still visits both sanctums before the boss.
    expect(metrics.objectiveOrder.at(-1)).toBe('mireveil');
  });

  it('derives a 65-90 tile approach budget ahead of the boss threshold', () => {
    const metrics = measureLevelPacing(HOLLOW_THRONE);
    const approachBudget = metrics.criticalPathDistanceTiles! - metrics.finalObjectiveToExitTiles!;
    expect(approachBudget).toBeGreaterThanOrEqual(65);
    expect(approachBudget).toBeLessThanOrEqual(90);
  });

  it('prices both sanctum orders explicitly, since the shortest permutation may not be playable', () => {
    const westFirst = measureAuthoredRoute(HOLLOW_THRONE, [...WEST_FIRST, 'mireveil']);
    const eastFirst = measureAuthoredRoute(HOLLOW_THRONE, [...EAST_FIRST, 'mireveil']);
    expect(westFirst).not.toBeNull();
    expect(eastFirst).not.toBeNull();
    for (const route of [westFirst!, eastFirst!]) {
      expect(route.minCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    }
    const longer = Math.max(westFirst!.distanceTiles, eastFirst!.distanceTiles);
    const shorter = Math.min(westFirst!.distanceTiles, eastFirst!.distanceTiles);
    expect((longer - shorter) / shorter).toBeLessThanOrEqual(0.15);
  });

  it('stages both sanctums independently and gates the boss threshold behind both', () => {
    expect((HOLLOW_THRONE.encounters ?? []).map((e) => [e.id, e.requires ?? []])).toEqual([
      ['west-sanctum', []],
      ['east-sanctum', []],
      ['boss-threshold', ['west-sanctum', 'east-sanctum']]
    ]);
  });

  it('keeps co-active sanctums and every encounter under the hostile ceiling', () => {
    // Both sanctums are dependency-free, so a split four-player party can wake
    // both at once. Nothing prevents that in the sim, so the sum has to fit.
    const capOf = (id: string): number =>
      effectiveGeneratorMaxAlive(CONTENT.generators[generator(id).typeId]!, 4);
    const sum = capOf('west-sanctum-mound') + capOf('east-sanctum-cyst');
    expect(sum).toBeLessThanOrEqual(HOSTILE_CEILING);
    const byEncounter = new Map<string, number>();
    for (const gen of HOLLOW_THRONE.generators) {
      const key = gen.encounterId ?? gen.id!;
      byEncounter.set(key, (byEncounter.get(key) ?? 0) + capOf(gen.id!));
    }
    for (const [id, cap] of byEncounter) {
      expect(cap, `encounter ${id} four-player cap`).toBeLessThanOrEqual(HOSTILE_CEILING);
    }
  });

  it('actually holds the ceiling with four players and both sanctums live', () => {
    const sim = newSim(151, 4);
    for (const state of sim.state.encounters) state.active = state.id === 'west-sanctum' || state.id === 'east-sanctum';
    for (const gen of sim.state.generators) gen.active = true;
    const targets = sim.state.generators;
    sim.state.players.forEach((player, i) => {
      const target = targets[i % targets.length]!;
      player.pos = { x: target.pos.x - 48, y: target.pos.y };
    });
    let peak = 0;
    for (let tick = 0; tick < TICK_RATE * 90; tick++) {
      simTick(sim, sim.state.players.map(() => EMPTY_INPUT));
      peak = Math.max(peak, sim.state.enemies.length);
      for (const player of sim.state.players) player.hp = player.maxHp;
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(HOSTILE_CEILING);
  });

  it('keeps Mireveil dormant, untargetable and unable to act until both sanctums clear', () => {
    const sim = newSim(151);
    const boss = sim.state.boss!;
    expect(boss.active).toBe(false);
    const cooldown = boss.actionCooldown;

    // Standing on her and swinging does nothing while she is dormant.
    const p = sim.state.players[0]!;
    p.pos = { x: boss.pos.x - 50, y: boss.pos.y };
    p.facing = { x: 1, y: 0 };
    const hpBefore = boss.hp;
    runTicks(sim, TICK_RATE * 2, input({ moveX: 1, attack: true }));
    expect(boss.hp).toBe(hpBefore);
    expect(boss.active).toBe(false);
    expect(boss.actionCooldown).toBe(cooldown); // never ticks down while inactive
    expect(sim.state.enemies).toHaveLength(0); // no brood-call while dormant

    // Crossing the threshold with only one sanctum down still does nothing.
    clearEncounter(sim, 'west-sanctum');
    const partial = enterThreshold(sim);
    expect(partial.some((e) => e.type === 'encounter-activated' && e.encounterId === 'boss-threshold')).toBe(false);
    expect(boss.active).toBe(false);

    // Clearing the second sanctum and crossing the threshold wakes her.
    clearEncounter(sim, 'east-sanctum');
    const woke = enterThreshold(sim);
    expect(woke).toContainEqual(expect.objectContaining({ type: 'encounter-activated', encounterId: 'boss-threshold' }));
    expect(boss.active).toBe(true);
  });

  it('will not wake the boss threshold before both sanctums clear', () => {
    const sim = newSim(151);
    // Standing in the threshold region first must change nothing.
    enterThreshold(sim);
    expect(sim.state.encounters.find((e) => e.id === 'boss-threshold')!.active).toBe(false);
    // One sanctum is not enough either.
    clearEncounter(sim, 'west-sanctum');
    enterThreshold(sim);
    expect(sim.state.encounters.find((e) => e.id === 'boss-threshold')!.active).toBe(false);
  });

  it('activates either sanctum order, deterministically, and still opens the exit', () => {
    const play = (order: readonly string[]): { events: SimEvent[]; hash: string } => {
      const sim = newSim(148);
      expect(sim.state.generators.filter((g) => g.active)).toHaveLength(0);
      const events: SimEvent[] = [];
      for (const id of order) events.push(...clearEncounter(sim, id));
      events.push(...enterThreshold(sim));
      const boss = sim.state.boss!;
      boss.hp = 0;
      events.push(...simTick(sim, [EMPTY_INPUT]));
      return { events, hash: hashState(sim.state) };
    };
    const orders = [
      ['west-sanctum', 'east-sanctum'],
      ['east-sanctum', 'west-sanctum']
    ] as const;
    for (const order of orders) {
      const first = play(order);
      const second = play(order);
      expect(first.events).toEqual(second.events);
      expect(first.hash).toBe(second.hash);
      for (const id of order) {
        expect(first.events).toContainEqual(expect.objectContaining({ type: 'encounter-activated', encounterId: id }));
        expect(first.events).toContainEqual(expect.objectContaining({ type: 'encounter-cleared', encounterId: id }));
      }
      expect(first.events).toContainEqual(expect.objectContaining({ type: 'encounter-activated', encounterId: 'boss-threshold' }));
    }
    // Both orders reach the same finished shape: every stage cleared, boss down.
    for (const order of orders) {
      const sim = newSim(148);
      for (const id of order) clearEncounter(sim, id);
      enterThreshold(sim);
      expect(sim.state.encounters.every((e) => e.cleared || e.id === 'boss-threshold')).toBe(true);
      expect(sim.state.boss!.active).toBe(true);
    }
  });

  it('keeps each sanctum, the preparation landing and the arena inside the party camera span', () => {
    // At PARTY_CAMERA.minZoom the visible world is viewport/zoom; the party
    // bounding box plus padding has to fit inside it or a split party leaves
    // frame.
    const spanTiles = (viewport: number): number =>
      Math.floor((viewport / PARTY_CAMERA.minZoom - PARTY_CAMERA.padding * 2) / HOLLOW_THRONE.tileSize);
    const maxTx = spanTiles(960);
    const maxTy = spanTiles(720);
    expect([maxTx, maxTy]).toEqual([34, 24]);

    const regions: { minTx: number; minTy: number; maxTx: number; maxTy: number }[] = [];
    for (const id of ['west-sanctum', 'east-sanctum']) {
      const trigger = encounter(id).trigger;
      if (trigger.kind !== 'region') throw new Error('sanctums use region triggers');
      regions.push(trigger);
    }
    // The arena is the preserved pre-#151 30x22 footprint.
    regions.push({ minTx: 5, minTy: 0, maxTx: 34, maxTy: 21 });
    // The preparation landing.
    regions.push({ minTx: 12, minTy: 24, maxTx: 27, maxTy: 27 });
    for (const region of regions) {
      expect(region.maxTx - region.minTx).toBeLessThanOrEqual(maxTx);
      expect(region.maxTy - region.minTy).toBeLessThanOrEqual(maxTy);
    }
  });

  it('gives every hero collision-safe approaches to each mandatory objective', () => {
    const maxHeroRadius = Math.max(...Object.values(CONTENT.heroes).map((hero) => hero.radius));
    const objectives = [
      ...HOLLOW_THRONE.generators,
      { tx: HOLLOW_THRONE.boss!.tx, ty: HOLLOW_THRONE.boss!.ty, id: 'mireveil' }
    ];
    for (const obj of objectives) {
      const approaches = [
        { tx: obj.tx - 1, ty: obj.ty },
        { tx: obj.tx + 1, ty: obj.ty },
        { tx: obj.tx, ty: obj.ty - 1 },
        { tx: obj.tx, ty: obj.ty + 1 }
      ].filter((tile) => !circleHitsWall(HOLLOW_THRONE, tileCenter(HOLLOW_THRONE, tile.tx, tile.ty), maxHeroRadius));
      expect(approaches.length, obj.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('hangs one optional vault off each sanctum and reaches both with every mandatory objective still open', () => {
    expect(HOLLOW_THRONE.gates).toEqual([{ tx: 5, ty: 30 }]);
    expect(HOLLOW_THRONE.secrets).toEqual([{ tx: 34, ty: 30 }]);
    const gateTreasure = { tx: 5, ty: 31 };
    const secretTreasure = { tx: 34, ty: 31 };
    const spawn = HOLLOW_THRONE.playerSpawns[0]!;

    // Open (mechanic solved): both vaults reachable.
    const open = reachableWithout([], spawn);
    expect(open(gateTreasure.tx, gateTreasure.ty)).toBe(true);
    expect(open(secretTreasure.tx, secretTreasure.ty)).toBe(true);
    // Everything mandatory is also reachable from spawn with no seals touched.
    for (const gen of HOLLOW_THRONE.generators) expect(open(gen.tx, gen.ty), gen.id).toBe(true);
    expect(open(HOLLOW_THRONE.boss!.tx, HOLLOW_THRONE.boss!.ty)).toBe(true);
    expect(open(HOLLOW_THRONE.exit.tx, HOLLOW_THRONE.exit.ty)).toBe(true);

    // Sealed (gate/secret tile impassable): each vault is cut off, but nothing
    // mandatory depends on it — reachability of the mandatory line survives
    // with both optional seals closed.
    const sealedGate = reachableWithout([HOLLOW_THRONE.gates![0]!], spawn);
    expect(sealedGate(gateTreasure.tx, gateTreasure.ty)).toBe(false);
    for (const gen of HOLLOW_THRONE.generators) expect(sealedGate(gen.tx, gen.ty), gen.id).toBe(true);
    expect(sealedGate(HOLLOW_THRONE.boss!.tx, HOLLOW_THRONE.boss!.ty)).toBe(true);

    const sealedSecret = reachableWithout([HOLLOW_THRONE.secrets![0]!], spawn);
    expect(sealedSecret(secretTreasure.tx, secretTreasure.ty)).toBe(false);
    for (const gen of HOLLOW_THRONE.generators) expect(sealedSecret(gen.tx, gen.ty), gen.id).toBe(true);
    expect(sealedSecret(HOLLOW_THRONE.boss!.tx, HOLLOW_THRONE.boss!.ty)).toBe(true);

    const sealedBoth = reachableWithout([...HOLLOW_THRONE.gates!, ...HOLLOW_THRONE.secrets!], spawn);
    for (const gen of HOLLOW_THRONE.generators) expect(sealedBoth(gen.tx, gen.ty), gen.id).toBe(true);
    expect(sealedBoth(HOLLOW_THRONE.boss!.tx, HOLLOW_THRONE.boss!.ty)).toBe(true);
    expect(sealedBoth(HOLLOW_THRONE.exit.tx, HOLLOW_THRONE.exit.ty)).toBe(true);
  });

  it('places recovery past each sanctum and hands out no second potion before Mireveil', () => {
    const potions = HOLLOW_THRONE.pickups.filter((p) => p.kind === 'potion');
    expect(potions).toHaveLength(1); // no free reset immediately before the boss
    const west = generator('west-sanctum-mound');
    const east = generator('east-sanctum-cyst');
    const health = HOLLOW_THRONE.pickups.filter((p) => p.kind === 'health');
    expect(health.some((p) => Math.abs(p.tx - west.tx) <= 5 && Math.abs(p.ty - west.ty) <= 5)).toBe(true);
    expect(health.some((p) => Math.abs(p.tx - east.tx) <= 5 && Math.abs(p.ty - east.ty) <= 5)).toBe(true);
    // The key sits in the landing, reachable without the gate it opens.
    const key = HOLLOW_THRONE.pickups.find((p) => p.kind === 'key')!;
    const sealedGate = reachableWithout([HOLLOW_THRONE.gates![0]!], HOLLOW_THRONE.playerSpawns[0]!);
    expect(sealedGate(key.tx, key.ty)).toBe(true);
  });
});
