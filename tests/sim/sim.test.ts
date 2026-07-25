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
    expect(sim.state.generators).toHaveLength(BROOD_WARRENS.generators.length);
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
      windupTicksLeft: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      slowTicks: 0,
      slowMult: 1,
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
      windupTicksLeft: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      slowTicks: 0,
      slowMult: 1,
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
        windupTicksLeft: 0,
        hitstunTicks: 0,
        knockback: { x: 0, y: 0 },
        slowTicks: 0,
        slowMult: 1,
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

  it('enrages exactly once below half HP, spawns faster, then calms down', () => {
    const sim = newSim();
    const def = CONTENT.generators['brood-node']!;
    const enrage = def.enrage!;
    const g = sim.state.generators[0]!;
    const p = sim.state.players[0]!;
    p.pos = { x: g.pos.x - 40, y: g.pos.y };
    p.facing = { x: 1, y: 0 };

    // 3 swings x 25 dmg = 75 of 120 HP: crosses the 50% threshold (60) on
    // the third swing while leaving the node alive.
    const events: SimEvent[] = [];
    for (let i = 0; i < 3; i++) {
      p.attackCooldown = 0;
      events.push(...simTick(sim, [input({ attack: true })]));
    }
    expect(events.filter((e) => e.type === 'generator-enraged')).toHaveLength(1);
    expect(g.enrageTriggered).toBe(true);
    expect(g.enrageTicksLeft).toBeGreaterThan(0);
    // The pending spawn is pulled in to the enraged pace.
    const fastInterval = Math.round(def.spawnIntervalTicks * enrage.intervalMult);
    expect(g.spawnCooldown).toBeLessThanOrEqual(fastInterval);

    // A spawn during enrage resets the cooldown to the halved interval.
    let sawEnragedSpawn = false;
    for (let i = 0; i < 200 && !sawEnragedSpawn; i++) {
      const evs = simTick(sim, [EMPTY_INPUT]);
      const fromThisGen = evs.some(
        (e) =>
          e.type === 'enemy-spawned' &&
          sim.state.enemies.find((en) => en.id === e.enemyId)?.sourceGen === g.id
      );
      if (fromThisGen && g.enrageTicksLeft > 0) {
        sawEnragedSpawn = true;
        expect(g.spawnCooldown).toBe(fastInterval);
      }
    }
    expect(sawEnragedSpawn).toBe(true);

    // Enrage expires and never re-triggers on further damage.
    p.hp = p.maxHp; // undo swarm chip damage so the mission can't fail mid-test
    runTicks(sim, enrage.durationTicks + 1);
    expect(g.enrageTicksLeft).toBe(0);
    p.attackCooldown = 0;
    const more = runTicks(sim, 1, input({ attack: true }));
    expect(more.filter((e) => e.type === 'generator-enraged')).toHaveLength(0);
  });

  it('destroyed generator stops spawning, drops gold, and opens the exit when all are down', () => {
    const sim = newSim();
    const events: SimEvent[] = [];
    // Destroy every generator directly through the damage path.
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
    expect(events.filter((e) => e.type === 'generator-destroyed')).toHaveLength(BROOD_WARRENS.generators.length);
    expect(events.some((e) => e.type === 'exit-opened')).toBe(true);
    expect(sim.state.phase).toBe('exit-open');
    expect(sim.state.pickups.some((pk) => pk.kind === 'gold' && pk.amount === 25)).toBe(true);
  });
});

describe('props', () => {
  it('a melee swing shatters a prop and drops loot from the seeded RNG', () => {
    const sim = newSim();
    expect(sim.state.props.length).toBeGreaterThan(0);
    const pr = sim.state.props[0]!;
    const def = CONTENT.props[pr.typeId]!;
    const p = sim.state.players[0]!;
    p.pos = { x: pr.pos.x - 30, y: pr.pos.y };
    p.facing = { x: 1, y: 0 };
    p.attackCooldown = 0;
    const before = sim.state.pickups.length;
    const events = runTicks(sim, 1, input({ attack: true }));
    expect(events.some((e) => e.type === 'prop-destroyed')).toBe(true);
    expect(sim.state.props).not.toContain(pr);
    expect(sim.state.pickups.length).toBe(before + 1);
    const drop = sim.state.pickups[sim.state.pickups.length - 1]!;
    expect(drop.kind).toBe(def.dropKind);
    expect(drop.amount).toBeGreaterThanOrEqual(def.dropMin);
    expect(drop.amount).toBeLessThanOrEqual(def.dropMax);
  });

  it('props out of reach are untouched by a swing', () => {
    const sim = newSim();
    const count = sim.state.props.length;
    runTicks(sim, 1, input({ attack: true })); // spawn hall: nothing in range
    expect(sim.state.props.length).toBe(count);
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
      windupTicksLeft: 0,
      hitstunTicks: 0,
      knockback: { x: 0, y: 0 },
      slowTicks: 0,
      slowMult: 1,
      sourceGen: null
    });
    const events = runTicks(sim, TICK_RATE * 2);
    expect(events.some((e) => e.type === 'mission-failed')).toBe(true);
    expect(sim.state.phase).toBe('failed');
  });

  it('a full scripted playthrough completes the mission', () => {
    // Not a real player, but proves the loop is winnable: teleport-free,
    // input-driven kill of every generator then walk to the exit is complex
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
