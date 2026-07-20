import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Enemy roster expansion (issue #23): the Husk (tanky melee bruiser), the
 * Spitter (ranged, fires hostile bolts), and an elite tier. Tests drive the
 * real content enemies through the deterministic sim and prove the new
 * hostile-projectile mechanic without crossing streams with player fire.
 */

function newSim(heroId = 'vanguard', seed = 33): Sim {
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

function spawnEnemy(sim: Sim, typeId: string, id: number, x: number, y: number): EnemyState {
  const e: EnemyState = {
    id,
    typeId,
    pos: { x, y },
    hp: CONTENT.enemies[typeId]!.maxHp,
    attackCooldown: 0,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
  sim.state.enemies.push(e);
  return e;
}

describe('enemy roster', () => {
  it('defines a tanky melee husk, a ranged spitter, and an elite husk', () => {
    const husk = CONTENT.enemies['carapace-husk']!;
    const spitter = CONTENT.enemies['bile-spitter']!;
    const elite = CONTENT.enemies['gravebound-ravager']!;
    expect(husk.family).toBe('husk');
    expect(husk.ranged).toBeUndefined();
    expect(husk.maxHp).toBeGreaterThan(CONTENT.enemies['skitterling']!.maxHp);
    expect(spitter.family).toBe('spitter');
    expect(spitter.ranged).toBeDefined();
    expect(elite.tier).toBe('elite');
    expect(elite.maxHp).toBeGreaterThan(husk.maxHp);
  });

  it('the level fields all three families from its spawners', () => {
    const sim = newSim();
    const kinds = new Set(sim.state.generators.map((g) => g.typeId));
    expect(kinds).toEqual(new Set(['brood-node', 'husk-mound', 'spitter-nest']));
    // Run long enough for each spawner to produce at least one enemy.
    runTicks(sim, 400);
    const families = new Set(sim.state.enemies.map((e) => CONTENT.enemies[e.typeId]!.family));
    expect(families.has('husk')).toBe(true);
    expect(families.has('spitter')).toBe(true);
  });
});

describe('husk (melee bruiser)', () => {
  it('closes in and deals contact damage, never firing a bolt', () => {
    const sim = newSim();
    sim.state.generators = []; // isolate
    const p = sim.state.players[0]!;
    spawnEnemy(sim, 'carapace-husk', 800, p.pos.x + 60, p.pos.y);
    const events = runTicks(sim, 120);
    expect(events.some((e) => e.type === 'player-hit')).toBe(true);
    expect(events.some((e) => e.type === 'enemy-shot')).toBe(false); // pure melee
    expect(sim.state.projectiles).toHaveLength(0);
    expect(p.hp).toBeLessThan(p.maxHp);
  });
});

describe('spitter (ranged)', () => {
  it('fires a hostile bolt that flies to the player and wounds them', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const before = p.hp;
    spawnEnemy(sim, 'bile-spitter', 810, p.pos.x + 150, p.pos.y); // inside attackRange (200)
    const events = runTicks(sim, 60);
    expect(events.some((e) => e.type === 'enemy-shot')).toBe(true);
    expect(events.some((e) => e.type === 'player-hit')).toBe(true);
    expect(p.hp).toBeLessThan(before);
  });

  it('a hostile bolt passes through other enemies and only strikes players', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    // A husk stands on the line between the spitter and the player.
    const husk = spawnEnemy(sim, 'carapace-husk', 820, p.pos.x + 70, p.pos.y);
    const huskHp = husk.hp;
    spawnEnemy(sim, 'bile-spitter', 821, p.pos.x + 150, p.pos.y);
    runTicks(sim, 60);
    expect(husk.hp).toBe(huskHp); // enemy fire never harms other enemies
    expect(p.hp).toBeLessThan(p.maxHp);
  });

  it('a bolt stops at a wall instead of tunnelling through', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const before = p.hp;
    // Put the central wall column (tx 15, solid at ty 3) between the spitter
    // (west) and the player (east), within firing range. The eastward shot
    // must die on the wall and never reach the player.
    const c = (t: number): number => t * BROOD_WARRENS.tileSize + BROOD_WARRENS.tileSize / 2;
    p.pos = { x: c(18), y: c(3) };
    spawnEnemy(sim, 'bile-spitter', 830, c(13), c(3));
    const events = runTicks(sim, 60);
    expect(events.some((e) => e.type === 'enemy-shot')).toBe(true);
    expect(events.some((e) => e.type === 'projectile-expired')).toBe(true);
    expect(p.hp).toBe(before); // the wall ate the bolt
  });

  it('a guarding Sentinel soaks a spit as a block', () => {
    const sim = newSim('sentinel');
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const spitter = CONTENT.enemies['bile-spitter']!;
    spawnEnemy(sim, 'bile-spitter', 840, p.pos.x + 150, p.pos.y);
    const before = p.hp;
    const events = runTicks(sim, 60, input({ ability: true })); // hold Bastion Wall up
    expect(events.some((e) => e.type === 'guard-block')).toBe(true);
    // Damage taken is the reduced (guarded) fraction of the bolt's damage.
    expect(before - p.hp).toBeLessThanOrEqual(spitter.ranged!.projectileDamage);
  });

  it('spitter fights stay deterministic', () => {
    const a = newSim('vanguard', 202);
    const b = newSim('vanguard', 202);
    for (const sim of [a, b]) {
      sim.state.generators = [];
      spawnEnemy(sim, 'bile-spitter', 850, sim.state.players[0]!.pos.x + 140, sim.state.players[0]!.pos.y);
    }
    for (let i = 0; i < 300; i++) {
      simTick(a, [input({ attack: true })]);
      simTick(b, [input({ attack: true })]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
