import { describe, expect, it } from 'vitest';
import { COBALT_COMBS, CONTENT } from '../../src/content';
import { circleHitsWall, tileCenter } from '../../src/sim/level';
import { measureAuthoredRoute, measureLevelPacing } from '../../src/sim/levelMetrics';
import { createSim, effectiveGeneratorMaxAlive, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type InputCommand, type SimEvent } from '../../src/sim/types';
import { PARTY_CAMERA } from '../../src/game/partyCamera';

/**
 * Mission 3 — The Cobalt Combs. The playthrough and determinism layers mirror
 * the Warrens and Galleries; the braid layer (#148) pins the properties that
 * make a two-arm map different from a linear one.
 */

const ARMS = ['husk-arm-mound', 'spitter-arm-nest'] as const;
const HUSK_FIRST = ['husk-arm-mound', 'spitter-arm-nest', 'merge-brood-node', 'breach-nest'];
const SPITTER_FIRST = ['spitter-arm-nest', 'husk-arm-mound', 'merge-brood-node', 'breach-nest'];

/** The hostile readability ceiling from docs/design/visual-direction.md. */
const HOSTILE_CEILING = 15;

function newSim(seed = 909, heroes = 1): Sim {
  return createSim({
    seed,
    level: COBALT_COMBS,
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
  return COBALT_COMBS.generators.find((g) => g.id === id)!;
}

function encounter(id: string) {
  return (COBALT_COMBS.encounters ?? []).find((e) => e.id === id)!;
}

/** Trigger a whole encounter by standing in it, then delete its objectives. */
function clearEncounter(sim: Sim, id: string): SimEvent[] {
  const trigger = encounter(id).trigger;
  const tile = trigger.kind === 'region'
    ? { tx: trigger.minTx, ty: trigger.minTy }
    : { tx: trigger.tx, ty: trigger.ty };
  sim.state.players[0]!.pos = tileCenter(COBALT_COMBS, tile.tx, tile.ty);
  const events = [...simTick(sim, [EMPTY_INPUT])];
  sim.state.generators = sim.state.generators.filter((g) => g.encounterId !== id);
  events.push(...simTick(sim, [EMPTY_INPUT]));
  return events;
}

/** Reachability with an explicit set of tiles treated as solid. */
function reachableWithout(blocked: readonly { tx: number; ty: number }[], from: { tx: number; ty: number }) {
  const width = COBALT_COMBS.walls[0]!.length;
  const solid = new Set(blocked.map((t) => `${t.tx},${t.ty}`));
  const seen = new Set<string>([`${from.tx},${from.ty}`]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const { tx, ty } = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      const key = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= width || ny >= COBALT_COMBS.walls.length) continue;
      if (COBALT_COMBS.walls[ny]?.[nx] !== '.' || solid.has(key) || seen.has(key)) continue;
      seen.add(key);
      queue.push({ tx: nx, ty: ny });
    }
  }
  return (tx: number, ty: number): boolean => seen.has(`${tx},${ty}`);
}

describe('The Cobalt Combs', () => {
  it('spawns the authored generators, gate and secret', () => {
    const sim = newSim();
    expect(sim.state.generators).toHaveLength(COBALT_COMBS.generators.length);
    expect(sim.state.generators.length).toBe(4);
    expect(sim.state.gates.length).toBe(1);
    expect(sim.state.secrets.length).toBe(1);
  });

  it('fields all three enemy families once every stage has run', () => {
    // The Combs' defining trait: skitterlings, husks and spitters across one
    // mission. A regression to a single-family map would quietly undo the
    // difficulty step. Staged activation (#147) means nothing spawns until woken,
    // so force every stage live and let all four spawners run.
    const sim = newSim(4242);
    expect(sim.state.generators.filter((g) => g.active)).toHaveLength(0);
    for (const state of sim.state.encounters) state.active = true;
    for (const gen of sim.state.generators) gen.active = true;
    runTicks(sim, TICK_RATE * 12);
    const families = new Set(
      sim.state.enemies.map((enemy) => CONTENT.enemies[enemy.typeId]?.family).filter(Boolean)
    );
    expect(families).toContain('skitter');
    expect(families).toContain('husk');
    expect(families).toContain('spitter');
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
      clearEncounter(sim, 'husk-arm');
      sim.state.generators = COBALT_COMBS.generators.map((g, i) => ({ ...a.state.generators[i]! }));
    }
    const a2 = newSim(1);
    const b2 = newSim(2);
    for (const sim of [a2, b2]) {
      for (const state of sim.state.encounters) state.active = true;
      for (const gen of sim.state.generators) gen.active = true;
      runTicks(sim, TICK_RATE * 10);
    }
    expect(hashState(a2.state)).not.toBe(hashState(b2.state));
  });

  it('a full scripted playthrough completes the mission', () => {
    // Drive the player onto each live generator and swing. Because the map is
    // staged, the walk onto a generator is also what wakes its encounter.
    const sim = newSim(777);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 20000) {
      const g = sim.state.generators.find((gen) => gen.hp > 0);
      if (g) {
        p.pos = { x: g.pos.x - 40, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
      }
      // Four staged encounters is more total pressure than a base-kit hero
      // teleporting between spawners survives; this test is about the objective
      // and phase plumbing, so keep the hero standing.
      p.hp = p.maxHp;
      simTick(sim, [input({ attack: true, ability: sim.state.enemies.length > 4 })]);
    }
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
  });
});

describe('The Cobalt Combs braided reverse-flow expansion (#148)', () => {
  it('meets the authored geometry, exit-leg and pinch budgets', () => {
    const metrics = measureLevelPacing(COBALT_COMBS);
    expect([metrics.widthTiles, metrics.heightTiles]).toEqual([48, 36]);
    expect(metrics.finalObjectiveToExitTiles).toBeGreaterThanOrEqual(4);
    expect(metrics.finalObjectiveToExitTiles).toBeLessThanOrEqual(8);
    expect(metrics.minCriticalCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    expect(COBALT_COMBS.previewExit).toBe(true);
  });

  it('reads south-east to north-west rather than repeating the clockwise sweep', () => {
    const spawnTx = Math.min(...COBALT_COMBS.playerSpawns.map((s) => s.tx));
    const spawnTy = Math.min(...COBALT_COMBS.playerSpawns.map((s) => s.ty));
    // Spawns sit in the south-east quadrant, the portal in the north-west.
    expect(spawnTx).toBeGreaterThan(COBALT_COMBS.walls[0]!.length / 2);
    expect(spawnTy).toBeGreaterThan(COBALT_COMBS.walls.length / 2);
    expect(COBALT_COMBS.exit.tx).toBeLessThan(COBALT_COMBS.walls[0]!.length / 2);
    expect(COBALT_COMBS.exit.ty).toBeLessThan(COBALT_COMBS.walls.length / 2);
    // The final objective is the one nearest the portal, and it is the breach.
    const metrics = measureLevelPacing(COBALT_COMBS);
    expect(metrics.objectiveOrder.at(-1)).toBe('breach-nest');
  });

  it('supports both branch orders within 15% of each other and inside the route budget', () => {
    const husk = measureAuthoredRoute(COBALT_COMBS, HUSK_FIRST);
    const spitter = measureAuthoredRoute(COBALT_COMBS, SPITTER_FIRST);
    expect(husk).not.toBeNull();
    expect(spitter).not.toBeNull();
    for (const route of [husk!, spitter!]) {
      expect(route.distanceTiles).toBeGreaterThanOrEqual(120);
      expect(route.distanceTiles).toBeLessThanOrEqual(150);
      expect(route.minCorridorWidthTiles).toBeGreaterThanOrEqual(3);
    }
    const longer = Math.max(husk!.distanceTiles, spitter!.distanceTiles);
    const shorter = Math.min(husk!.distanceTiles, spitter!.distanceTiles);
    expect((longer - shorter) / shorter).toBeLessThanOrEqual(0.15);
  });

  it('braids: each arm reaches the merge and the other arm without the fork', () => {
    // The replacement for a "one-way shortcut" the engine cannot express. If the
    // fork band is sealed, both arms must still reach the merge and each other,
    // which is exactly "clearing an arm opens forward movement".
    const fork: { tx: number; ty: number }[] = [];
    for (let ty = 27; ty <= 31; ty++) {
      for (let tx = 20; tx <= 36; tx++) {
        if (COBALT_COMBS.walls[ty]?.[tx] === '.') fork.push({ tx, ty });
      }
    }
    expect(fork.length).toBeGreaterThan(0);
    const merge = generator('merge-brood-node');
    for (const armId of ARMS) {
      const arm = generator(armId);
      const canReach = reachableWithout(fork, { tx: arm.tx, ty: arm.ty });
      expect(canReach(merge.tx, merge.ty), `${armId} -> merge without the fork`).toBe(true);
      const other = generator(ARMS.find((id) => id !== armId)!);
      expect(canReach(other.tx, other.ty), `${armId} -> other arm without the fork`).toBe(true);
    }
  });

  it('stages the arms independently and funnels them through the merge', () => {
    expect((COBALT_COMBS.encounters ?? []).map((e) => [e.id, e.requires ?? []])).toEqual([
      ['husk-arm', []],
      ['spitter-arm', []],
      ['merge', ['husk-arm', 'spitter-arm']],
      ['breach', ['merge']]
    ]);
  });

  it('keeps co-active arms and every later stage under the hostile ceiling', () => {
    // Both arms are dependency-free, so a split four-player party can wake both.
    // Nothing prevents that in the sim, so the sum has to fit.
    const capOf = (id: string): number =>
      effectiveGeneratorMaxAlive(CONTENT.generators[generator(id).typeId]!, 4);
    expect(capOf('husk-arm-mound') + capOf('spitter-arm-nest')).toBeLessThanOrEqual(HOSTILE_CEILING);
    // The merge and breach are dependency-gated, so each only has to fit alone.
    const byEncounter = new Map<string, number>();
    for (const gen of COBALT_COMBS.generators) {
      const key = gen.encounterId ?? gen.id!;
      byEncounter.set(key, (byEncounter.get(key) ?? 0) + capOf(gen.id!));
    }
    for (const [id, cap] of byEncounter) {
      expect(cap, `encounter ${id} four-player cap`).toBeLessThanOrEqual(HOSTILE_CEILING);
    }
  });

  it('actually holds the ceiling with four players on the worst-case stages', () => {
    // The static caps above are the budget; this runs the two cases that can
    // really happen — a split party with both arms live, and the 15-cap merge
    // node alone — and watches the live enemy count under spawn pressure.
    const worstCases: Record<string, readonly string[]> = {
      'both arms (split party)': ['husk-arm', 'spitter-arm'],
      'merge alone': ['merge'],
      'breach alone': ['breach']
    };
    for (const [label, live] of Object.entries(worstCases)) {
      const sim = newSim(148, 4);
      for (const state of sim.state.encounters) state.active = live.includes(state.id);
      for (const gen of sim.state.generators) gen.active = live.includes(gen.encounterId!);
      // Park each hero next to a live spawner so spawns are never distance-gated.
      const targets = sim.state.generators.filter((g) => g.active);
      sim.state.players.forEach((player, i) => {
        const target = targets[i % targets.length]!;
        player.pos = { x: target.pos.x - 48, y: target.pos.y };
      });
      let peak = 0;
      for (let tick = 0; tick < TICK_RATE * 90; tick++) {
        simTick(sim, sim.state.players.map(() => EMPTY_INPUT));
        peak = Math.max(peak, sim.state.enemies.length);
        // Keep the heroes alive so the spawners keep running the whole window.
        for (const player of sim.state.players) player.hp = player.maxHp;
      }
      expect(peak, `${label} peak`).toBeGreaterThan(0);
      expect(peak, `${label} peak`).toBeLessThanOrEqual(HOSTILE_CEILING);
    }
  });

  it('keeps the two arms inside the party camera span', () => {
    // At PARTY_CAMERA.minZoom the visible world is viewport/zoom; the party
    // bounding box plus padding has to fit inside it or a split party leaves
    // frame. This is the only authored map that invites the split.
    const spanTiles = (viewport: number): number =>
      Math.floor((viewport / PARTY_CAMERA.minZoom - PARTY_CAMERA.padding * 2) / COBALT_COMBS.tileSize);
    const maxTx = spanTiles(960);
    const maxTy = spanTiles(720);
    expect([maxTx, maxTy]).toEqual([34, 24]);

    const regions = ARMS.map((id) => {
      const trigger = encounter(id === 'husk-arm-mound' ? 'husk-arm' : 'spitter-arm').trigger;
      if (trigger.kind !== 'region') throw new Error('arms use region triggers');
      return trigger;
    });
    const gens = ARMS.map((id) => generator(id));
    const xs = [...regions.flatMap((r) => [r.minTx, r.maxTx]), ...gens.map((g) => g.tx)];
    const ys = [...regions.flatMap((r) => [r.minTy, r.maxTy]), ...gens.map((g) => g.ty)];
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(maxTx);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(maxTy);
  });

  it('activates either arm first, deterministically, and still opens the exit', () => {
    const play = (order: readonly string[]): { events: SimEvent[]; hash: string } => {
      const sim = newSim(148);
      expect(sim.state.generators.filter((g) => g.active)).toHaveLength(0);
      const events: SimEvent[] = [];
      for (const id of order) events.push(...clearEncounter(sim, id));
      return { events, hash: hashState(sim.state) };
    };
    const orders = [
      ['husk-arm', 'spitter-arm', 'merge', 'breach'],
      ['spitter-arm', 'husk-arm', 'merge', 'breach']
    ] as const;
    for (const order of orders) {
      const first = play(order);
      const second = play(order);
      expect(first.events).toEqual(second.events);
      expect(first.hash).toBe(second.hash);
      for (const id of order) {
        expect(first.events).toContainEqual(
          expect.objectContaining({ type: 'encounter-activated', encounterId: id })
        );
        expect(first.events).toContainEqual(
          expect.objectContaining({ type: 'encounter-cleared', encounterId: id })
        );
      }
    }
    // The two orders reach the same finished state: every stage cleared.
    for (const order of orders) {
      const sim = newSim(148);
      for (const id of order) clearEncounter(sim, id);
      expect(sim.state.encounters.every((e) => e.cleared)).toBe(true);
      expect(sim.state.phase).toBe('exit-open');
    }
  });

  it('will not wake a later stage before its dependencies clear', () => {
    const sim = newSim(148);
    // Standing in the merge and breach regions first must change nothing.
    for (const id of ['merge', 'breach']) {
      const trigger = encounter(id).trigger;
      if (trigger.kind !== 'region') throw new Error('expected a region trigger');
      sim.state.players[0]!.pos = tileCenter(COBALT_COMBS, trigger.minTx, trigger.minTy);
      runTicks(sim, 4);
      expect(sim.state.encounters.find((e) => e.id === id)!.active, id).toBe(false);
    }
    // One arm is not enough for the merge either.
    clearEncounter(sim, 'husk-arm');
    const trigger = encounter('merge').trigger;
    if (trigger.kind !== 'region') throw new Error('expected a region trigger');
    sim.state.players[0]!.pos = tileCenter(COBALT_COMBS, trigger.minTx, trigger.minTy);
    runTicks(sim, 4);
    expect(sim.state.encounters.find((e) => e.id === 'merge')!.active).toBe(false);
  });

  it('gives every hero collision-safe approaches to each mandatory objective', () => {
    const maxHeroRadius = Math.max(...Object.values(CONTENT.heroes).map((hero) => hero.radius));
    for (const gen of COBALT_COMBS.generators) {
      const approaches = [
        { tx: gen.tx - 1, ty: gen.ty },
        { tx: gen.tx + 1, ty: gen.ty },
        { tx: gen.tx, ty: gen.ty - 1 },
        { tx: gen.tx, ty: gen.ty + 1 }
      ].filter((tile) => !circleHitsWall(COBALT_COMBS, tileCenter(COBALT_COMBS, tile.tx, tile.ty), maxHeroRadius));
      expect(approaches.length, gen.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('hangs one optional vault off each arm and strands neither behind the merge', () => {
    expect(COBALT_COMBS.gates).toEqual([{ tx: 6, ty: 29 }]);
    expect(COBALT_COMBS.secrets).toEqual([{ tx: 42, ty: 9 }]);
    // Each vault opens off its own arm, so neither needs the merge cleared.
    const merge: { tx: number; ty: number }[] = [];
    for (let ty = 13; ty <= 19; ty++) {
      for (let tx = 14; tx <= 26; tx++) {
        if (COBALT_COMBS.walls[ty]?.[tx] === '.') merge.push({ tx, ty });
      }
    }
    const fromSpawn = reachableWithout(merge, COBALT_COMBS.playerSpawns[0]!);
    expect(fromSpawn(6, 29), 'husk vault gate without the merge').toBe(true);
    expect(fromSpawn(42, 9), 'spitter vault secret without the merge').toBe(true);
  });

  it('places recovery past the Ravager release and the potion before the breach', () => {
    const husk = generator('husk-arm-mound');
    const health = COBALT_COMBS.pickups.filter((p) => p.kind === 'health');
    expect(health.some((p) => p.tx < husk.tx)).toBe(true);
    const breach = encounter('breach').trigger;
    if (breach.kind !== 'region') throw new Error('expected a region trigger');
    const potion = COBALT_COMBS.pickups.find((p) => p.kind === 'potion')!;
    expect(potion.tx).toBeGreaterThan(breach.maxTx);
    // The key is on the fork, before the gate it opens.
    const key = COBALT_COMBS.pickups.find((p) => p.kind === 'key')!;
    expect(key.tx).toBeGreaterThan(COBALT_COMBS.gates![0]!.tx);
  });
});
