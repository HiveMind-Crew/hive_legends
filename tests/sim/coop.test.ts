import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { activePlayers, createSim, effectiveGeneratorMaxAlive, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand } from '../../src/sim/types';

const command = (overrides: Partial<InputCommand> = {}): InputCommand => ({ ...EMPTY_INPUT, ...overrides });

function coopSim(seed = 106): Sim {
  return createSim({
    seed,
    level: BROOD_WARRENS,
    players: [{ heroId: 'vanguard' }, { heroId: 'vanguard', startJoined: false }],
    content: CONTENT
  });
}

function joinP2(sim: Sim): void {
  simTick(sim, [EMPTY_INPUT, command({ join: true })]);
}

function skitterAt(sim: Sim, x: number, y: number): EnemyState {
  return {
    id: sim.state.nextEntityId++,
    typeId: 'skitterling',
    pos: { x, y },
    hp: 1,
    attackCooldown: 999,
    windupTicksLeft: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
}

describe('deterministic local co-op participation', () => {
  it('joins a reserved slot through input and drives it independently', () => {
    const sim = coopSim();
    expect(sim.state.players.map((p) => p.slot)).toEqual([0]);

    const events = simTick(sim, [EMPTY_INPUT, command({ join: true })]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'player-joined', slot: 1 }));
    expect(activePlayers(sim).map((p) => p.slot)).toEqual([0, 1]);

    const p1 = sim.state.players[0]!;
    const p2 = sim.state.players[1]!;
    const before1 = { ...p1.pos };
    const before2 = { ...p2.pos };
    simTick(sim, [EMPTY_INPUT, command({ moveX: 1 })]);
    expect(p1.pos).toEqual(before1);
    expect(p2.pos.x).toBeGreaterThan(before2.x);

    // Holding START is not a second join: the edge command is replay data,
    // and even a duplicate command cannot create a duplicate state object.
    simTick(sim, [EMPTY_INPUT, command({ join: true })]);
    expect(sim.state.players.filter((p) => p.slot === 1)).toHaveLength(1);
  });

  it('drops out only on an explicit command, retains earnings, and can rejoin', () => {
    const sim = coopSim();
    joinP2(sim);
    const p2 = sim.state.players.find((p) => p.slot === 1)!;
    p2.gold = 17;
    p2.xpEarned = 6;
    const id = p2.id;

    // Idle input stands in for a missing/transient device: no silent mutation.
    simTick(sim, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(p2.participating).toBe(true);

    const left = simTick(sim, [EMPTY_INPUT, command({ leave: true })]);
    expect(left).toContainEqual(expect.objectContaining({ type: 'player-left', slot: 1 }));
    expect(p2).toMatchObject({ id, participating: false, gold: 17, xpEarned: 6 });

    simTick(sim, [EMPTY_INPUT, command({ join: true })]);
    expect(p2).toMatchObject({ id, participating: true, gold: 17, xpEarned: 6 });
  });

  it('pays the level-up heal for levels crossed while dormant', () => {
    const prog = CONTENT.progression;
    const sim = coopSim();
    joinP2(sim);
    const p2 = sim.state.players.find((p) => p.slot === 1)!;
    const baseMaxHp = p2.maxHp;
    p2.hp = 20;

    simTick(sim, [EMPTY_INPUT, command({ leave: true })]);
    // The party clears two thresholds without them.
    sim.state.rewards.xp = prog.xpToReach[2]!;
    simTick(sim, [EMPTY_INPUT, command({ join: true })]);

    // A dormant hero pays no attrition for the levels: same +maxHp and same
    // heal a hero who stayed in would have banked (docs/PROGRESSION.md).
    expect(p2.level).toBe(3);
    expect(p2.maxHp).toBe(baseMaxHp + 2 * prog.maxHpPerLevel);
    expect(p2.hp).toBe(20 + 2 * prog.maxHpPerLevel);
  });

  it('never heals a dormant hero past max, or a downed one at all', () => {
    const prog = CONTENT.progression;
    const sim = coopSim();
    joinP2(sim);
    const p2 = sim.state.players.find((p) => p.slot === 1)!;
    const baseMaxHp = p2.maxHp;

    simTick(sim, [EMPTY_INPUT, command({ leave: true })]);
    sim.state.rewards.xp = prog.xpToReach[1]!;
    simTick(sim, [EMPTY_INPUT, command({ join: true })]);
    expect(p2.hp).toBe(p2.maxHp);
    expect(p2.maxHp).toBe(baseMaxHp + prog.maxHpPerLevel);

    // A downed hero takes the max-HP raise only; the revive owns its own hp.
    simTick(sim, [EMPTY_INPUT, command({ leave: true })]);
    p2.alive = false;
    p2.hp = 0;
    sim.state.rewards.xp = prog.xpToReach[2]!;
    simTick(sim, [EMPTY_INPUT, command({ join: true })]);
    expect(p2.maxHp).toBe(baseMaxHp + 2 * prog.maxHpPerLevel);
    expect(p2.hp).toBe(0);
  });

  it('removes dormant bodies from pickups and failure without erasing them', () => {
    const sim = coopSim();
    joinP2(sim);
    const [p1, p2] = sim.state.players;
    p2!.pos = { x: 500, y: 500 };
    simTick(sim, [EMPTY_INPUT, command({ leave: true })]);
    sim.state.pickups = [{ id: 8000, kind: 'gold', amount: 9, pos: { ...p2!.pos } }];
    simTick(sim, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(sim.state.pickups).toHaveLength(1);

    p1!.hp = 0;
    p1!.alive = false;
    const events = simTick(sim, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(sim.state.phase).toBe('failed');
    expect(events.some((event) => event.type === 'mission-failed')).toBe(true);
    expect(p2).toMatchObject({ participating: false, alive: true });
  });

  it('cannot drop out slot 0', () => {
    const sim = coopSim();
    simTick(sim, [command({ leave: true }), EMPTY_INPUT]);
    expect(sim.state.players[0]).toMatchObject({ slot: 0, participating: true });
  });

  it('keeps specialization config attached to the stable slot after joining', () => {
    const sim = createSim({
      seed: 44,
      level: BROOD_WARRENS,
      players: [
        { heroId: 'vanguard' },
        {
          heroId: 'vanguard',
          startJoined: false,
          ability: CONTENT.abilitySpecializations['vanguard-faultline']!.ability
        }
      ],
      content: CONTENT
    });
    joinP2(sim);

    const events = simTick(sim, [EMPTY_INPUT, command({ ability: true })]);

    expect(events).toContainEqual(expect.objectContaining({ type: 'ability-line', playerId: sim.state.players[1]!.id }));
    expect(events.some((event) => event.type === 'ability' && event.playerId === sim.state.players[1]!.id)).toBe(false);
  });
});

describe('shared rewards', () => {
  it('collects one pickup once and keeps a matching unique party ledger', () => {
    const sim = coopSim();
    joinP2(sim);
    sim.state.generators = [];
    const [p1, p2] = sim.state.players;
    p2!.pos = { ...p1!.pos };
    sim.state.pickups = [{ id: 9000, kind: 'gold', amount: 11, pos: { ...p1!.pos } }];

    simTick(sim, [EMPTY_INPUT, EMPTY_INPUT]);

    expect(p1!.gold + p2!.gold).toBe(11);
    expect(sim.state.rewards.gold).toBe(11);
    expect(sim.state.pickups).toEqual([]);
  });

  it('shares level-up XP but attributes and banks each source once', () => {
    const sim = coopSim();
    joinP2(sim);
    sim.state.generators = [];
    const [p1, p2] = sim.state.players;
    p2!.facing = { x: 0, y: 1 };
    sim.state.enemies = [skitterAt(sim, p2!.pos.x, p2!.pos.y + 25)];

    simTick(sim, [EMPTY_INPUT, command({ attack: true })]);

    const xp = CONTENT.enemies.skitterling!.xp;
    expect(sim.state.rewards.xp).toBe(xp);
    expect(p1!.xp).toBe(xp);
    expect(p2!.xp).toBe(xp);
    expect(p1!.xpEarned).toBe(0);
    expect(p2!.xpEarned).toBe(xp);
  });
});

describe('teammate revive', () => {
  function downedPair(): { sim: Sim; p1: Sim['state']['players'][number]; p2: Sim['state']['players'][number] } {
    const sim = coopSim();
    joinP2(sim);
    sim.state.generators = [];
    sim.state.enemies = [];
    const [p1, p2] = sim.state.players;
    p2!.pos = { ...p1!.pos };
    p2!.hp = 0;
    p2!.alive = false;
    return { sim, p1: p1!, p2: p2! };
  }

  it('requires the full authored consecutive hold and grants the smaller revive', () => {
    const { sim, p2 } = downedPair();
    const hold = command({ interact: true });
    for (let tick = 0; tick < CONTENT.revive.teammateHoldTicks - 1; tick++) simTick(sim, [hold, EMPTY_INPUT]);
    expect(p2).toMatchObject({ alive: false, reviveProgress: CONTENT.revive.teammateHoldTicks - 1 });

    const events = simTick(sim, [hold, EMPTY_INPUT]);
    expect(p2.alive).toBe(true);
    expect(p2.hp).toBe(Math.round(p2.maxHp * CONTENT.revive.teammateHpFraction));
    expect(p2.invulnTicks).toBe(CONTENT.revive.teammateInvulnTicks);
    expect(events).toContainEqual(expect.objectContaining({ type: 'player-revived', playerId: p2.id }));
  });

  it('resets on release, range exit, or a hit to the reviver', () => {
    const { sim, p1, p2 } = downedPair();
    const hold = command({ interact: true });
    for (let tick = 0; tick < 20; tick++) simTick(sim, [hold, EMPTY_INPUT]);
    simTick(sim, [EMPTY_INPUT, EMPTY_INPUT]);
    expect(p2.reviveProgress).toBe(0);

    p2.pos.x = p1.pos.x + CONTENT.revive.teammateRange + 1;
    simTick(sim, [hold, EMPTY_INPUT]);
    expect(p2.reviveProgress).toBe(0);

    p2.pos = { ...p1.pos };
    p1.lastHitTick = sim.state.tick;
    simTick(sim, [hold, EMPTY_INPUT]);
    expect(p2.reviveProgress).toBe(0);
  });
});

describe('co-op pressure and determinism', () => {
  it('uses authored per-player caps and preserves exact solo values', () => {
    for (const def of Object.values(CONTENT.generators)) {
      expect(effectiveGeneratorMaxAlive(def, 1)).toBe(def.maxAlive);
      expect(effectiveGeneratorMaxAlive(def, 2)).toBe(def.maxAlive + (def.maxAlivePerExtraPlayer ?? 0));
    }
  });

  it('lets the generator produce above its solo cap only while a second slot is active', () => {
    const solo = coopSim(900);
    const party = coopSim(900);
    joinP2(party);
    for (const sim of [solo, party]) {
      const generator = sim.state.generators[0]!;
      generator.spawnCooldown = 0;
      sim.state.enemies = Array.from({ length: CONTENT.generators[generator.typeId]!.maxAlive }, (_, index) => {
        const enemy = skitterAt(sim, 500 + index, 500);
        enemy.hp = CONTENT.enemies.skitterling!.maxHp;
        enemy.sourceGen = generator.id;
        return enemy;
      });
    }

    simTick(solo, [EMPTY_INPUT, EMPTY_INPUT]);
    simTick(party, [EMPTY_INPUT, EMPTY_INPUT]);

    expect(solo.state.enemies).toHaveLength(CONTENT.generators['brood-node']!.maxAlive);
    expect(party.state.enemies).toHaveLength(CONTENT.generators['brood-node']!.maxAlive + 1);
  });

  it('replays join, independent input, drop-out, and rejoin byte-identically', () => {
    const a = coopSim(777);
    const b = coopSim(777);
    const script: InputCommand[][] = [
      [EMPTY_INPUT, command({ join: true })],
      [command({ moveY: 1, attack: true }), command({ moveX: -1, ability: true })],
      [EMPTY_INPUT, command({ leave: true })],
      [command({ moveX: 1 }), EMPTY_INPUT],
      [EMPTY_INPUT, command({ join: true })]
    ];
    for (const inputs of script) {
      simTick(a, inputs);
      simTick(b, inputs);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
