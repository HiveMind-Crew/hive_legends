import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT, HOLLOW_THRONE } from '../../src/content';
import { createSim, hashState, levelForXp, simTick, xpForNextLevel, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Hero levelling (issue #46): XP earned from kills and objectives during a
 * mission, levelling the hero mid-run and persisting via the profile. Tests
 * drive the real content curve through the deterministic sim.
 */

const PROG = CONTENT.progression;

function newSim(startXp = 0, seed = 91, level = BROOD_WARRENS): Sim {
  return createSim({ seed, level, players: [{ heroId: 'vanguard', startXp }], content: CONTENT });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function spawnEnemy(sim: Sim, id: number, typeId: string, x: number, y: number): EnemyState {
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

describe('progression content (#46)', () => {
  it('authors a rising curve starting at level 1 for 0 XP', () => {
    expect(PROG.xpToReach[0]).toBe(0);
    for (let i = 1; i < PROG.xpToReach.length; i++) {
      expect(PROG.xpToReach[i]!).toBeGreaterThan(PROG.xpToReach[i - 1]!);
    }
    expect(PROG.maxHpPerLevel).toBeGreaterThan(0);
    expect(PROG.damagePerLevel).toBeGreaterThan(0);
  });

  it('every enemy, generator and boss awards XP', () => {
    for (const def of Object.values(CONTENT.enemies)) expect(def.xp, `${def.id} xp`).toBeGreaterThan(0);
    for (const def of Object.values(CONTENT.generators)) expect(def.xp, `${def.id} xp`).toBeGreaterThan(0);
    for (const def of Object.values(CONTENT.bosses)) expect(def.xp, `${def.id} xp`).toBeGreaterThan(0);
  });

  it('maps XP to a level and caps out', () => {
    expect(levelForXp(PROG, 0)).toBe(1);
    expect(levelForXp(PROG, PROG.xpToReach[1]! - 1)).toBe(1);
    expect(levelForXp(PROG, PROG.xpToReach[1]!)).toBe(2);
    // Far past the end of the curve still clamps to the cap.
    expect(levelForXp(PROG, 10_000_000)).toBe(PROG.xpToReach.length);
    expect(xpForNextLevel(PROG, PROG.xpToReach.length)).toBeNull();
  });
});

describe('earning XP in a run', () => {
  it('credits the killer and raises XP on a kill', () => {
    const sim = newSim();
    sim.state.generators = []; // isolate from spawner XP
    const p = sim.state.players[0]!;
    p.facing = { x: 0, y: 1 };
    const e = spawnEnemy(sim, 700, 'skitterling', p.pos.x, p.pos.y + 30);
    e.hp = 1; // one swing kills
    runTicks(sim, 2, input({ attack: true }));
    expect(sim.state.enemies).toHaveLength(0);
    expect(p.xp).toBe(CONTENT.enemies['skitterling']!.xp);
  });

  it('levels the hero up mid-mission, raising max HP and healing the gain', () => {
    const sim = newSim(PROG.xpToReach[1]! - 1); // one kill short of level 2
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    expect(p.level).toBe(1);
    const maxHpBefore = p.maxHp;
    p.hp = maxHpBefore - PROG.maxHpPerLevel; // room for the level-up heal
    const hpBefore = p.hp;
    p.facing = { x: 0, y: 1 };
    const e = spawnEnemy(sim, 701, 'skitterling', p.pos.x, p.pos.y + 30);
    e.hp = 1;
    const events = runTicks(sim, 2, input({ attack: true }));

    expect(events.some((ev) => ev.type === 'player-leveled' && ev.level === 2)).toBe(true);
    expect(p.level).toBe(2);
    expect(p.maxHp).toBe(maxHpBefore + PROG.maxHpPerLevel);
    expect(p.hp).toBe(hpBefore + PROG.maxHpPerLevel); // the reward heal
  });

  it('a level raises outgoing damage', () => {
    const damageDealt = (startXp: number): number => {
      const sim = newSim(startXp);
      sim.state.generators = [];
      const p = sim.state.players[0]!;
      p.facing = { x: 0, y: 1 };
      const e = spawnEnemy(sim, 702, 'carapace-husk', p.pos.x, p.pos.y + 30);
      const before = e.hp;
      runTicks(sim, 1, input({ attack: true }));
      return before - e.hp;
    };
    const atL1 = damageDealt(0);
    const atL2 = damageDealt(PROG.xpToReach[1]!);
    expect(atL1).toBeGreaterThan(0);
    expect(atL2).toBeCloseTo(atL1 + PROG.damagePerLevel, 4);
  });

  it('banked XP carries in as a starting level', () => {
    const sim = newSim(PROG.xpToReach[2]!);
    const p = sim.state.players[0]!;
    expect(p.level).toBe(3);
    // Two levels of max-HP bonus over the bare hero.
    expect(p.maxHp).toBe(CONTENT.heroes['vanguard']!.maxHp + 2 * PROG.maxHpPerLevel);
  });

  it('a single huge award can grant several levels, announcing each', () => {
    const sim = createSim({
      seed: 5,
      level: HOLLOW_THRONE,
      players: [{ heroId: 'vanguard' }],
      content: CONTENT
    });
    const boss = sim.state.boss!;
    const p = sim.state.players[0]!;
    // Dormant behind the #151 boss threshold until both approach sanctums
    // clear; force her active for this XP-payout test.
    boss.active = true;
    boss.hp = 1;
    p.pos = { x: boss.pos.x - 50, y: boss.pos.y };
    p.facing = { x: 1, y: 0 };
    const events = runTicks(sim, 3, input({ moveX: 1, attack: true }));
    const levels = events.filter((e) => e.type === 'player-leveled').map((e) => (e as { level: number }).level);
    expect(levels.length).toBeGreaterThan(1); // the finale payout is worth several
    expect(levels).toEqual([...levels].sort((a, b) => a - b)); // announced in order
    expect(p.level).toBe(levelForXp(PROG, CONTENT.bosses['mireveil']!.xp));
  });

  it('destroying a spawner awards its objective XP', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const g = sim.state.generators[0]!;
    const def = CONTENT.generators[g.typeId]!;
    g.hp = 1;
    p.pos = { x: g.pos.x - 40, y: g.pos.y };
    p.facing = { x: 1, y: 0 };
    runTicks(sim, 3, input({ moveX: 1, attack: true }));
    expect(p.xp).toBeGreaterThanOrEqual(def.xp);
  });

  it('levelling stays deterministic', () => {
    const build = (): Sim => {
      const sim = newSim(PROG.xpToReach[1]! - 5, 606);
      spawnEnemy(sim, 710, 'skitterling', sim.state.players[0]!.pos.x + 30, sim.state.players[0]!.pos.y);
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
