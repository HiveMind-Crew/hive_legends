import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT, HOLLOW_THRONE } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand, type SimEvent } from '../../src/sim/types';
import { activateAllObjectives } from './fixtures';

/**
 * Mission time pressure — "the hive rouses" (issue #41). The adapted answer to
 * the genre's health drain: loitering makes the brood fiercer instead of
 * starving the player. Tests drive the real content curve through the sim.
 */

const P = CONTENT.pressure;

function newSim(seed = 21, level = BROOD_WARRENS): Sim {
  return activateAllObjectives(createSim({ seed, level, players: [{ heroId: 'vanguard' }], content: CONTENT }));
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function spawnEnemy(sim: Sim, typeId: string, id: number, x: number, y: number): EnemyState {
  const e: EnemyState = {
    id,
    typeId,
    pos: { x, y },
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

describe('pressure content (#41)', () => {
  it('authors a grace period, a cap, and escalating-but-bounded multipliers', () => {
    expect(P.gracePeriodTicks).toBeGreaterThan(0);
    expect(P.intervalTicks).toBeGreaterThan(0);
    expect(P.maxStage).toBeGreaterThan(0);
    expect(P.moveSpeedPerStage).toBeGreaterThan(0);
    expect(P.damagePerStage).toBeGreaterThan(0);
    // Spawn intervals shorten, never lengthen or invert.
    expect(P.spawnIntervalMult).toBeGreaterThan(0);
    expect(P.spawnIntervalMult).toBeLessThan(1);
  });

  it('the grace period outlasts a competent clear, so skill is not punished', () => {
    // The e2e bot clears the Warrens in roughly 20-35 s; grace must exceed that.
    expect(P.gracePeriodTicks).toBeGreaterThanOrEqual(60 * 35);
  });
});

describe('the pressure clock', () => {
  /**
   * The clock only turns while the mission is live (simTick early-returns once
   * it is complete or failed), so these isolate it by clearing the spawners —
   * an idle hero left in a live horde level simply dies.
   */
  function idleSim(): Sim {
    const sim = newSim();
    sim.state.generators = [];
    return sim;
  }

  it('stays calm through the grace period, then rouses', () => {
    const sim = idleSim();
    runTicks(sim, P.gracePeriodTicks);
    expect(sim.state.pressureStage).toBe(0); // still calm

    const events = runTicks(sim, 1);
    expect(sim.state.pressureStage).toBe(1);
    expect(events.some((e) => e.type === 'pressure-rose' && e.stage === 1)).toBe(true);
  });

  it('climbs a stage per interval and plateaus at the cap', () => {
    const sim = idleSim();
    runTicks(sim, P.gracePeriodTicks + 1);
    expect(sim.state.pressureStage).toBe(1);
    runTicks(sim, P.intervalTicks);
    expect(sim.state.pressureStage).toBe(2);

    // Run far past the end of the curve: it must plateau, not run away.
    runTicks(sim, P.intervalTicks * (P.maxStage + 5));
    expect(sim.state.pressureStage).toBe(P.maxStage);
  });

  it('announces each stage exactly once', () => {
    const sim = idleSim();
    const events = runTicks(sim, P.gracePeriodTicks + P.intervalTicks * (P.maxStage + 2));
    const stages = events.filter((e) => e.type === 'pressure-rose').map((e) => (e as { stage: number }).stage);
    expect(stages).toEqual([...new Set(stages)]); // no duplicates
    expect(stages).toEqual([...stages].sort((a, b) => a - b)); // in order
    expect(stages[stages.length - 1]).toBe(P.maxStage);
  });
});

describe('what a roused hive does', () => {
  /** Distance a husk closes over a fixed window at the given stage. */
  function closedDistance(stage: number): number {
    const sim = newSim();
    sim.state.generators = [];
    sim.state.pressureStage = stage;
    const p = sim.state.players[0]!;
    const c = (tile: number): number => tile * BROOD_WARRENS.tileSize + BROOD_WARRENS.tileSize / 2;
    p.pos = { x: c(3), y: c(6) };
    const e = spawnEnemy(sim, 'carapace-husk', 500, p.pos.x + 200, p.pos.y);
    const before = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    runTicks(sim, 60);
    return before - Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
  }

  it('moves enemies faster', () => {
    const calm = closedDistance(0);
    const roused = closedDistance(P.maxStage);
    expect(calm).toBeGreaterThan(0);
    expect(roused).toBeCloseTo(calm * (1 + P.moveSpeedPerStage * P.maxStage), 0);
  });

  /** HP a player loses to one husk contact hit at the given stage. */
  function contactDamage(stage: number): number {
    const sim = newSim();
    sim.state.generators = [];
    sim.state.pressureStage = stage;
    const p = sim.state.players[0]!;
    const before = p.hp;
    spawnEnemy(sim, 'carapace-husk', 501, p.pos.x + 30, p.pos.y);
    runTicks(sim, CONTENT.enemies['carapace-husk']!.attack.windupTicks + 2);
    return before - p.hp;
  }

  it('hits harder in contact', () => {
    const calm = contactDamage(0);
    const roused = contactDamage(P.maxStage);
    expect(calm).toBeGreaterThan(0);
    expect(roused).toBeCloseTo(calm * (1 + P.damagePerStage * P.maxStage), 4);
  });

  it('scales committed pounce damage', () => {
    const pounceDamage = (stage: number): number => {
      const sim = newSim();
      sim.state.generators = [];
      sim.state.pressureStage = stage;
      const p = sim.state.players[0]!;
      const before = p.hp;
      spawnEnemy(sim, 'skitterling', 504, p.pos.x + 60, p.pos.y);
      runTicks(sim, CONTENT.enemies['skitterling']!.attack.windupTicks + 1);
      return before - p.hp;
    };
    const calm = pounceDamage(0);
    expect(calm).toBeGreaterThan(0);
    expect(pounceDamage(P.maxStage)).toBeCloseTo(calm * (1 + P.damagePerStage * P.maxStage), 4);
  });

  it('spits harder', () => {
    const boltDamage = (stage: number): number => {
      const sim = newSim();
      sim.state.generators = [];
      sim.state.pressureStage = stage;
      const p = sim.state.players[0]!;
      spawnEnemy(sim, 'bile-spitter', 502, p.pos.x + 150, p.pos.y);
      runTicks(sim, CONTENT.enemies['bile-spitter']!.attack.windupTicks + 2);
      return sim.state.projectiles[0]?.damage ?? 0;
    };
    const calm = boltDamage(0);
    expect(calm).toBeGreaterThan(0);
    expect(boltDamage(P.maxStage)).toBeCloseTo(calm * (1 + P.damagePerStage * P.maxStage), 4);
  });

  it('quickens spawners', () => {
    const cooldownAfterSpawn = (stage: number): number => {
      const sim = newSim();
      // Isolate the spitter nest: slow enough that its cadence is not cap-bound.
      sim.state.generators = sim.state.generators.filter((g) => g.typeId === 'spitter-nest');
      sim.state.pressureStage = stage;
      const g = sim.state.generators[0]!;
      for (let i = 0; i < 600; i++) {
        const events = simTick(sim, [EMPTY_INPUT]);
        if (events.some((e) => e.type === 'enemy-spawned')) break;
      }
      return g.spawnCooldown;
    };
    const calm = cooldownAfterSpawn(0);
    const roused = cooldownAfterSpawn(P.maxStage);
    expect(calm).toBe(CONTENT.generators['spitter-nest']!.spawnIntervalTicks);
    expect(roused).toBeLessThan(calm);
    expect(roused).toBe(Math.max(1, Math.round(calm * Math.pow(P.spawnIntervalMult, P.maxStage))));
  });
});

describe('boundaries', () => {
  it('leaves the boss on her own escalation, not the hive clock', () => {
    // Her glob shares the enemy bolt plumbing, so this guards the exclusion.
    const sim = newSim(9, HOLLOW_THRONE);
    sim.state.pressureStage = P.maxStage;
    const boss = sim.state.boss!;
    const def = CONTENT.bosses['mireveil']!;
    const phaseIndex = def.phases.findIndex((phase) => phase.actions.some((action) => action.id === 'glob'));
    const actionIndex = def.phases[phaseIndex]!.actions.findIndex((action) => action.id === 'glob');
    const glob = def.phases[phaseIndex]!.actions[actionIndex]!;
    if (glob.kind !== 'volley') throw new Error('Mireveil glob must use the volley primitive');
    boss.pendingAction = { phaseIndex, actionIndex };
    boss.telegraphTicksLeft = 1; // release the glob on the next tick
    runTicks(sim, 2);
    const bolt = sim.state.projectiles.find((b) => b.ownerId === boss.id);
    expect(bolt).toBeDefined();
    expect(bolt!.damage).toBe(glob.projectileDamage); // unscaled
  });

  it('a roused run stays deterministic', () => {
    const build = (): Sim => {
      const sim = newSim(808);
      sim.state.pressureStage = 3;
      spawnEnemy(sim, 'skitterling', 503, sim.state.players[0]!.pos.x + 60, sim.state.players[0]!.pos.y);
      return sim;
    };
    const a = build();
    const b = build();
    const cmd = input({ moveX: 1, attack: true });
    for (let i = 0; i < 400; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
