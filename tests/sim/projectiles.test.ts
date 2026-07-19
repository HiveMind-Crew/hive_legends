import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import {
  EMPTY_INPUT,
  type ContentDb,
  type EnemyState,
  type InputCommand,
  type SimEvent
} from '../../src/sim/types';

/**
 * Projectile attacks (issue #15): a test-only hero with a projectile kit is
 * injected into the content db, proving typed hero kits are pure data.
 */

const TEST_CONTENT: ContentDb = {
  ...CONTENT,
  heroes: {
    ...CONTENT.heroes,
    'test-archer': {
      ...CONTENT.heroes['vanguard']!,
      id: 'test-archer',
      name: 'Test Archer',
      attack: {
        kind: 'projectile',
        damage: 40, // one-shots a skitterling
        speed: 400,
        radius: 4,
        range: 300,
        cooldownTicks: 20,
        pierce: 0,
        knockback: 100
      }
    }
  }
};

function newArcherSim(seed = 99): Sim {
  return createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'test-archer' }], content: TEST_CONTENT });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function spawnEnemy(sim: Sim, id: number, x: number, y: number): EnemyState {
  const e: EnemyState = {
    id,
    typeId: 'skitterling',
    pos: { x, y },
    hp: CONTENT.enemies['skitterling']!.maxHp,
    attackCooldown: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    sourceGen: null
  };
  sim.state.enemies.push(e);
  return e;
}

describe('projectile attacks', () => {
  it('fires a bolt that flies and kills a distant enemy', () => {
    const sim = newArcherSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    spawnEnemy(sim, 900, p.pos.x + 200, p.pos.y);
    const events = runTicks(sim, 45, input({ attack: true }));
    expect(events.some((e) => e.type === 'projectile-fired')).toBe(true);
    expect(events.some((e) => e.type === 'projectile-hit')).toBe(true);
    expect(events.filter((e) => e.type === 'enemy-died')).toHaveLength(1);
  });

  it('bolts stop at walls and emit projectile-expired', () => {
    const sim = newArcherSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 0, y: -1 }; // spawn hall: border wall is a few tiles up
    const events = runTicks(sim, 60, input({ attack: true }));
    expect(events.some((e) => e.type === 'projectile-expired')).toBe(true);
    expect(events.some((e) => e.type === 'projectile-hit')).toBe(false);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('pierce lets one bolt hit multiple enemies in a line', () => {
    const archer = TEST_CONTENT.heroes['test-archer']!;
    const piercing: ContentDb = {
      ...TEST_CONTENT,
      heroes: {
        ...TEST_CONTENT.heroes,
        'test-archer': {
          ...archer,
          attack: {
            kind: 'projectile',
            damage: 40,
            speed: 400,
            radius: 4,
            range: 300,
            cooldownTicks: 60, // one bolt only in this window
            pierce: 1,
            knockback: 0
          }
        }
      }
    };
    const sim = createSim({ seed: 7, level: BROOD_WARRENS, players: [{ heroId: 'test-archer' }], content: piercing });
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    spawnEnemy(sim, 901, p.pos.x + 120, p.pos.y);
    spawnEnemy(sim, 902, p.pos.x + 200, p.pos.y);
    const events = runTicks(sim, 45, input({ attack: true }));
    // A single bolt pierces the first kill and continues into the second.
    expect(events.filter((e) => e.type === 'projectile-fired')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'enemy-died')).toHaveLength(2);
  });

  it('bolts expire at max range without hitting anything', () => {
    const sim = newArcherSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 }; // open floor ahead, no enemies
    const events = runTicks(sim, 1, input({ attack: true }));
    expect(events.some((e) => e.type === 'projectile-fired')).toBe(true);
    const later = runTicks(sim, 60);
    expect(later.some((e) => e.type === 'projectile-expired')).toBe(true);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('respects the attack cooldown', () => {
    const sim = newArcherSim();
    const events = runTicks(sim, 10, input({ attack: true }));
    // 20-tick cooldown: exactly one bolt in the first 10 ticks.
    expect(events.filter((e) => e.type === 'projectile-fired')).toHaveLength(1);
  });

  it('projectile sims are deterministic', () => {
    const a = newArcherSim(123);
    const b = newArcherSim(123);
    const cmd = input({ moveX: 0.4, moveY: 0.1, attack: true });
    for (let i = 0; i < 300; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
