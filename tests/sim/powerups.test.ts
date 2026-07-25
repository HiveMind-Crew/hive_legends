import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand, type PowerUpKind, type SimEvent } from '../../src/sim/types';

/**
 * Temporary power-ups (issue #16): floor relics that grant a timed buff.
 * Tests drive the real content buffs through the deterministic sim — frenzy
 * (damage), swiftness (speed), ward (damage taken) — plus pickup/refresh/expiry.
 */

function newSim(heroId = 'vanguard', seed = 44): Sim {
  return createSim({ seed, level: BROOD_WARRENS, players: [{ heroId }], content: CONTENT });
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function spawnEnemy(sim: Sim, id: number, x: number, y: number, hp = 5000): EnemyState {
  const e: EnemyState = {
    id,
    typeId: 'skitterling',
    pos: { x, y },
    hp,
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

function dropPowerup(sim: Sim, power: PowerUpKind, x: number, y: number): number {
  const id = sim.state.nextEntityId++;
  sim.state.pickups.push({ id, kind: 'powerup', amount: 0, power, pos: { x, y } });
  return id;
}

describe('power-up content', () => {
  it('defines all three buff relics with the expected effect fields', () => {
    expect(CONTENT.powerups.frenzy.damageMult).toBeGreaterThan(1);
    expect(CONTENT.powerups.swiftness.speedMult).toBeGreaterThan(1);
    expect(CONTENT.powerups.ward.damageTakenMult).toBeLessThan(1);
  });

  it('the level seeds one relic of each buff', () => {
    const powers = new Set(BROOD_WARRENS.pickups.filter((p) => p.kind === 'powerup').map((p) => p.power));
    expect(powers).toEqual(new Set(['frenzy', 'swiftness', 'ward']));
  });
});

describe('collecting a relic', () => {
  it('starts the buff timer on contact and announces it', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const relicId = dropPowerup(sim, 'frenzy', p.pos.x, p.pos.y);
    const events = runTicks(sim, 1);
    expect(p.power.frenzy).toBe(CONTENT.powerups.frenzy.durationTicks);
    expect(events.some((e) => e.type === 'powerup-gained' && e.power === 'frenzy')).toBe(true);
    expect(sim.state.pickups.some((pk) => pk.id === relicId)).toBe(false); // consumed
  });

  it('grabbing the same buff again refreshes its full duration', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.power.frenzy = 10; // partly elapsed
    dropPowerup(sim, 'frenzy', p.pos.x, p.pos.y);
    runTicks(sim, 1);
    expect(p.power.frenzy).toBe(CONTENT.powerups.frenzy.durationTicks);
  });
});

describe('frenzy (outgoing damage)', () => {
  function meleeDamage(frenzy: boolean): number {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 0, y: 1 };
    if (frenzy) p.power.frenzy = CONTENT.powerups.frenzy.durationTicks;
    const e = spawnEnemy(sim, 900, p.pos.x, p.pos.y + 30);
    const before = e.hp;
    runTicks(sim, 1, input({ attack: true }));
    return before - e.hp;
  }

  it('multiplies attack damage while active', () => {
    const raw = meleeDamage(false);
    const buffed = meleeDamage(true);
    expect(raw).toBeGreaterThan(0);
    expect(buffed).toBeCloseTo(raw * CONTENT.powerups.frenzy.damageMult, 4);
  });

  it('wears off after exactly its duration', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.power.frenzy = 5;
    runTicks(sim, 5);
    expect(p.power.frenzy).toBe(0);
    // Damage is back to baseline once the buff lapses.
    p.facing = { x: 0, y: 1 };
    const e = spawnEnemy(sim, 901, p.pos.x, p.pos.y + 30);
    const before = e.hp;
    runTicks(sim, 1, input({ attack: true }));
    expect(before - e.hp).toBeCloseTo(CONTENT.heroes['vanguard']!.attack.damage, 4);
  });
});

describe('swiftness (movement)', () => {
  it('speeds the hero up while active', () => {
    const distance = (swift: boolean): number => {
      const sim = newSim();
      const p = sim.state.players[0]!;
      if (swift) p.power.swiftness = CONTENT.powerups.swiftness.durationTicks;
      const start = { ...p.pos };
      runTicks(sim, 20, input({ moveX: 1, moveY: 0 })); // open floor ahead
      return Math.hypot(p.pos.x - start.x, p.pos.y - start.y);
    };
    const normal = distance(false);
    const fast = distance(true);
    expect(normal).toBeGreaterThan(0);
    expect(fast / normal).toBeCloseTo(CONTENT.powerups.swiftness.speedMult, 1);
  });
});

describe('ward (incoming damage)', () => {
  function hitTaken(ward: boolean): number {
    const sim = newSim();
    const p = sim.state.players[0]!;
    if (ward) p.power.ward = CONTENT.powerups.ward.durationTicks;
    spawnEnemy(sim, 910, p.pos.x + 20, p.pos.y); // inside attackRange
    const before = p.hp;
    runTicks(sim, CONTENT.enemies['skitterling']!.attackWindupTicks + 2); // let the enemy windup land
    return before - p.hp;
  }

  it('reduces damage taken while active', () => {
    const raw = hitTaken(false);
    const warded = hitTaken(true);
    expect(raw).toBeGreaterThan(0);
    expect(warded).toBeCloseTo(raw * CONTENT.powerups.ward.damageTakenMult, 4);
  });
});

describe('determinism', () => {
  it('a run with a collected relic stays deterministic', () => {
    const build = (): Sim => {
      const sim = newSim('vanguard', 606);
      dropPowerup(sim, 'swiftness', sim.state.players[0]!.pos.x, sim.state.players[0]!.pos.y);
      return sim;
    };
    const a = build();
    const b = build();
    const cmd = input({ moveX: 1, moveY: 0.2, attack: true });
    for (let i = 0; i < 300; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
