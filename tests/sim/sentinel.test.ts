import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import {
  EMPTY_INPUT,
  type EnemyState,
  type GuardAbilityDef,
  type InputCommand,
  type SimEvent
} from '../../src/sim/types';

/**
 * The Sentinel hero (issue #20): a bulwark with a great maul and Bastion Wall,
 * a timed guard stance. Tests drive the *real* content hero and assert the
 * stance's damage reduction, speed penalty, block-knockback, exact duration,
 * and completability — all through the deterministic sim.
 */

const BASTION = CONTENT.heroes['sentinel']!.ability as GuardAbilityDef;

function newSentinelSim(seed = 88): Sim {
  return createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'sentinel' }], content: CONTENT });
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

describe('sentinel roster entry', () => {
  it('is a real, playable melee bulwark', () => {
    const hero = CONTENT.heroes['sentinel']!;
    expect(hero.attack.kind).toBe('melee');
    expect(hero.ability.kind).toBe('guard');
    const sim = newSentinelSim();
    expect(sim.state.players[0]!.heroId).toBe('sentinel');
    expect(sim.state.players[0]!.maxHp).toBe(hero.maxHp); // huge health pool
  });
});

describe('bastion wall', () => {
  /** One adjacent enemy strike; returns the HP the Sentinel lost that tick. */
  function hitLoss(guard: boolean): number {
    const sim = newSentinelSim();
    sim.state.generators = []; // isolate from the horde
    const p = sim.state.players[0]!;
    spawnEnemy(sim, 900, p.pos.x + 20, p.pos.y); // inside attack.range (28)
    const before = p.hp;
    simTick(sim, [guard ? input({ ability: true }) : EMPTY_INPUT]); // raise the stance on the first tick
    runTicks(sim, CONTENT.enemies['skitterling']!.attack.windupTicks + 2); // let the enemy's windup land
    return before - p.hp;
  }

  it('soaks most incoming damage while active', () => {
    const raw = hitLoss(false);
    const guarded = hitLoss(true);
    expect(raw).toBeGreaterThan(0);
    expect(guarded).toBeCloseTo(raw * BASTION.damageMult, 5);
  });

  it('halves the Sentinel move speed while braced', () => {
    const distance = (guard: boolean): number => {
      const sim = newSentinelSim();
      const p = sim.state.players[0]!;
      if (guard) simTick(sim, [input({ ability: true })]); // raise the stance (no move)
      const start = { ...p.pos };
      runTicks(sim, 20, input({ moveX: 1, moveY: 0 })); // open floor ahead
      return Math.hypot(p.pos.x - start.x, p.pos.y - start.y);
    };
    const free = distance(false);
    const braced = distance(true);
    expect(free).toBeGreaterThan(0);
    expect(braced / free).toBeCloseTo(BASTION.moveMult, 1);
  });

  it('shoves a blocked attacker back and emits a block event', () => {
    const sim = newSentinelSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    const e = spawnEnemy(sim, 901, p.pos.x + 20, p.pos.y);
    simTick(sim, [input({ ability: true })]); // raise the stance
    const events = runTicks(sim, CONTENT.enemies['skitterling']!.attack.windupTicks + 2); // block lands as the windup resolves
    expect(events.some((ev) => ev.type === 'guard-block')).toBe(true);
    // The enemy sits at +x, so the reflected impulse pushes it further +x.
    expect(e.knockback.x).toBeGreaterThan(100);
  });

  it('lasts exactly its authored duration, then stops mitigating', () => {
    const sim = newSentinelSim();
    sim.state.generators = []; // isolate from the horde for a clean countdown
    const p = sim.state.players[0]!;
    simTick(sim, [input({ ability: true })]);
    expect(p.guardTicks).toBe(BASTION.durationTicks);
    runTicks(sim, BASTION.durationTicks - 1);
    expect(p.guardTicks).toBe(1); // still braced on the final tick
    runTicks(sim, 1);
    expect(p.guardTicks).toBe(0); // stance dropped

    // A hit now lands at full strength again.
    const before = p.hp;
    spawnEnemy(sim, 902, p.pos.x + 20, p.pos.y);
    p.invulnTicks = 0;
    runTicks(sim, CONTENT.enemies['skitterling']!.attack.windupTicks + 2); // unguarded windup lands at full strength
    expect(before - p.hp).toBeCloseTo(CONTENT.enemies['skitterling']!.attack.damage, 5);
  });

  it('the guard sim stays deterministic', () => {
    const a = newSentinelSim(212);
    const b = newSentinelSim(212);
    const cmd = input({ moveX: 0.5, moveY: 0.2, attack: true, ability: true });
    for (let i = 0; i < 300; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});

describe('sentinel mission flow', () => {
  it('a scripted Sentinel playthrough completes the mission', () => {
    const sim = newSentinelSim(505);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 8000) {
      const g = sim.state.generators[0];
      if (g) {
        p.pos = { x: g.pos.x - 40, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
        p.attackCooldown = 0;
      }
      simTick(sim, [input({ attack: true, ability: sim.state.enemies.length > 5 })]);
    }
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
  });
});
