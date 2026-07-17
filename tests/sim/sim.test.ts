import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type InputCommand, type SimEvent } from '../../src/sim/types';

function newSim(seed = 1234): Sim {
  return createSim({
    seed,
    level: BROOD_WARRENS,
    players: [{ heroId: 'vanguard' }],
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

describe('sim setup', () => {
  it('spawns players, generators and pickups from level data', () => {
    const sim = newSim();
    expect(sim.state.players).toHaveLength(1);
    expect(sim.state.players[0]!.hp).toBe(CONTENT.heroes['vanguard']!.maxHp);
    expect(sim.state.generators).toHaveLength(2);
    expect(sim.state.pickups).toHaveLength(BROOD_WARRENS.pickups.length);
    expect(sim.state.phase).toBe('combat');
  });

  it('applies persistent-upgrade modifiers', () => {
    const sim = createSim({
      seed: 1,
      level: BROOD_WARRENS,
      players: [{ heroId: 'vanguard', modifiers: { maxHpBonus: 40, damageBonus: 5 } }],
      content: CONTENT
    });
    expect(sim.state.players[0]!.maxHp).toBe(CONTENT.heroes['vanguard']!.maxHp + 40);
  });
});

describe('determinism', () => {
  it('same seed and inputs produce identical state', () => {
    const a = newSim(42);
    const b = newSim(42);
    const cmd = input({ moveX: 1, moveY: 0.3, attack: true });
    for (let i = 0; i < TICK_RATE * 10; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.enemies.length).toBeGreaterThan(0); // generators actually ran
  });

  it('different seeds diverge once RNG is consumed', () => {
    const a = newSim(1);
    const b = newSim(2);
    for (let i = 0; i < TICK_RATE * 10; i++) {
      simTick(a, [EMPTY_INPUT]);
      simTick(b, [EMPTY_INPUT]);
    }
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });
});

describe('movement', () => {
  it('moves the player and normalizes diagonals', () => {
    const sim = newSim();
    const start = { ...sim.state.players[0]!.pos };
    runTicks(sim, 30, input({ moveX: 1, moveY: 1 }));
    const p = sim.state.players[0]!;
    const moved = Math.hypot(p.pos.x - start.x, p.pos.y - start.y);
    const maxAllowed = CONTENT.heroes['vanguard']!.moveSpeed * 0.5 + 1;
    expect(moved).toBeGreaterThan(0);
    expect(moved).toBeLessThanOrEqual(maxAllowed);
  });
});

describe('combat', () => {
  it('melee attack kills an adjacent enemy and awards a kill plus gold drop', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    // Place an enemy directly in front of the player (facing defaults to +y).
    sim.state.enemies.push({
      id: 900,
      typeId: 'skitterling',
      pos: { x: p.pos.x, y: p.pos.y + 30 },
      hp: CONTENT.enemies['skitterling']!.maxHp,
      attackCooldown: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      sourceGen: null
    });
    const goldBefore = sim.state.pickups.length;
    // Two swings kill a 40hp skitterling at 25 damage.
    let events: SimEvent[] = [];
    events = events.concat(runTicks(sim, 1, input({ attack: true })));
    events = events.concat(runTicks(sim, 30, EMPTY_INPUT)); // cooldown
    events = events.concat(runTicks(sim, 1, input({ attack: true })));
    const died = events.filter((e) => e.type === 'enemy-died');
    expect(died).toHaveLength(1);
    expect(p.kills).toBe(1);
    expect(sim.state.pickups.length).toBeGreaterThan(goldBefore); // gold dropped
  });

  it('enemies chase and damage the player', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    sim.state.enemies.push({
      id: 901,
      typeId: 'skitterling',
      pos: { x: p.pos.x + 100, y: p.pos.y },
      hp: 40,
      attackCooldown: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      sourceGen: null
    });
    const events = runTicks(sim, TICK_RATE * 3);
    expect(events.some((e) => e.type === 'player-hit')).toBe(true);
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('ability damages everything in radius', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    for (let i = 0; i < 4; i++) {
      sim.state.enemies.push({
        id: 910 + i,
        typeId: 'skitterling',
        pos: { x: p.pos.x + 40 * Math.cos(i), y: p.pos.y + 40 * Math.sin(i) },
        hp: 40,
        attackCooldown: 0,
        hitstunTicks: 0,
        knockback: { x: 0, y: 0 },
        sourceGen: null
      });
    }
    const events = runTicks(sim, 1, input({ ability: true }));
    expect(events.filter((e) => e.type === 'enemy-died')).toHaveLength(4); // 40 dmg one-shots
    expect(sim.state.players[0]!.abilityCooldown).toBeGreaterThan(0);
  });
});

describe('generators', () => {
  it('spawns enemies over time up to the alive cap', () => {
    const sim = newSim();
    const def = CONTENT.generators['brood-node']!;
    runTicks(sim, def.spawnIntervalTicks * (def.maxAlive + 4));
    const perGen = new Map<number, number>();
    for (const e of sim.state.enemies) {
      if (e.sourceGen == null) continue;
      perGen.set(e.sourceGen, (perGen.get(e.sourceGen) ?? 0) + 1);
    }
    expect(sim.state.enemies.length).toBeGreaterThan(0);
    for (const count of perGen.values()) {
      expect(count).toBeLessThanOrEqual(def.maxAlive);
    }
  });

  it('destroyed generator stops spawning, drops gold, and opens the exit when all are down', () => {
    const sim = newSim();
    const events: SimEvent[] = [];
    // Destroy both generators directly through the damage path.
    for (const g of [...sim.state.generators]) {
      const p = sim.state.players[0]!;
      p.pos = { x: g.pos.x - 40, y: g.pos.y };
      p.facing = { x: 1, y: 0 };
      p.attackCooldown = 0;
      while (sim.state.generators.includes(g)) {
        p.attackCooldown = 0;
        events.push(...simTick(sim, [input({ attack: true })]));
      }
    }
    expect(events.filter((e) => e.type === 'generator-destroyed')).toHaveLength(2);
    expect(events.some((e) => e.type === 'exit-opened')).toBe(true);
    expect(sim.state.phase).toBe('exit-open');
    expect(sim.state.pickups.some((pk) => pk.kind === 'gold' && pk.amount === 25)).toBe(true);
  });
});

describe('pickups', () => {
  it('collects gold on contact', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const gold = sim.state.pickups.find((pk) => pk.kind === 'gold')!;
    p.pos = { ...gold.pos };
    const events = runTicks(sim, 1);
    expect(events.some((e) => e.type === 'pickup-collected' && e.kind === 'gold')).toBe(true);
    expect(p.gold).toBe(gold.amount);
  });

  it('health pickup is only consumed when damaged and never overheals', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const health = sim.state.pickups.find((pk) => pk.kind === 'health')!;
    p.pos = { ...health.pos };
    runTicks(sim, 1);
    expect(sim.state.pickups).toContain(health); // full hp: left on the ground
    p.hp = p.maxHp - 10;
    runTicks(sim, 1);
    expect(sim.state.pickups).not.toContain(health);
    expect(p.hp).toBe(p.maxHp); // +30 capped at max
  });
});

describe('mission flow', () => {
  it('completes when a player reaches the exit after all generators die', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    let events = runTicks(sim, 1);
    expect(events.some((e) => e.type === 'exit-opened')).toBe(true);
    p.pos = { ...sim.state.exitPos };
    events = runTicks(sim, 1);
    expect(events.some((e) => e.type === 'mission-complete')).toBe(true);
    expect(sim.state.phase).toBe('complete');
  });

  it('fails when all players die', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.hp = 1;
    sim.state.enemies.push({
      id: 950,
      typeId: 'skitterling',
      pos: { x: p.pos.x + 20, y: p.pos.y },
      hp: 40,
      attackCooldown: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      sourceGen: null
    });
    const events = runTicks(sim, TICK_RATE * 2);
    expect(events.some((e) => e.type === 'mission-failed')).toBe(true);
    expect(sim.state.phase).toBe('failed');
  });

  it('a full scripted playthrough completes the mission', () => {
    // Not a real player, but proves the loop is winnable: teleport-free,
    // input-driven kill of both generators then walk to the exit is complex
    // to script, so we drive positions and use the real damage/objective path.
    const sim = newSim(777);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 5000) {
      const g = sim.state.generators[0];
      if (g) {
        p.pos = { x: g.pos.x - 40, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
      }
      simTick(sim, [input({ attack: true, ability: sim.state.enemies.length > 4 })]);
    }
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
    expect(p.gold).toBeGreaterThanOrEqual(0);
  });
});
