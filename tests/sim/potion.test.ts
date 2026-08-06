import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type InputCommand } from '../../src/sim/types';
import { activateAllObjectives } from './fixtures';

/**
 * Screen-clear potion (issue #41): a carried consumable spent for a wide
 * self-centered burst. Tests drive the real content potion through the
 * deterministic sim — collection, the spend, the radius cutoff, and the
 * empty-handed no-op.
 */

function newSim(seed = 55): Sim {
  return activateAllObjectives(createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT }));
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
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

describe('screen-clear potion (#41)', () => {
  it('defines an original consumable with a wide, swarm-clearing burst', () => {
    expect(CONTENT.potion.name.length).toBeGreaterThan(0);
    expect(CONTENT.potion.damage).toBeGreaterThan(CONTENT.enemies['skitterling']!.maxHp); // one-shots a swarmer
    expect(CONTENT.potion.radius).toBeGreaterThan(100);
  });

  it('a potion pickup is banked as a carried count', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    sim.state.pickups.push({ id: 9001, kind: 'potion', amount: 1, pos: { ...p.pos } });
    const events = simTick(sim, [EMPTY_INPUT]);
    expect(p.potions).toBe(1);
    expect(events.some((e) => e.type === 'pickup-collected' && e.kind === 'potion')).toBe(true);
  });

  it('quaffing clears nearby enemies, spends exactly one, and emits the burst', () => {
    const sim = newSim();
    sim.state.generators = []; // isolate
    const p = sim.state.players[0]!;
    p.potions = 2;
    const near = spawnEnemy(sim, 9100, 'skitterling', p.pos.x + 40, p.pos.y); // inside the radius
    const far = spawnEnemy(sim, 9101, 'skitterling', p.pos.x + CONTENT.potion.radius + 80, p.pos.y); // outside
    const events = simTick(sim, [input({ usePotion: true })]);
    expect(events.some((e) => e.type === 'potion-used')).toBe(true);
    expect(p.potions).toBe(1); // spent exactly one
    expect(sim.state.enemies.some((e) => e.id === near.id)).toBe(false); // in-radius swarmer wiped
    expect(sim.state.enemies.some((e) => e.id === far.id)).toBe(true); // out-of-radius survivor
  });

  it('does nothing when no potion is carried', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    p.potions = 0;
    spawnEnemy(sim, 9200, 'skitterling', p.pos.x + 40, p.pos.y);
    const events = simTick(sim, [input({ usePotion: true })]);
    expect(events.some((e) => e.type === 'potion-used')).toBe(false);
    expect(sim.state.enemies).toHaveLength(1);
  });

  it('the burst also wounds a generator in range', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.potions = 1;
    const g = sim.state.generators[0]!;
    g.pos = { x: p.pos.x + 30, y: p.pos.y };
    const before = g.hp;
    simTick(sim, [input({ usePotion: true })]);
    const still = sim.state.generators.find((x) => x.id === g.id);
    expect(still ? still.hp : 0).toBeLessThan(before);
  });

  it('quaffing stays deterministic', () => {
    const build = (): Sim => {
      const sim = newSim(303);
      sim.state.generators = [];
      sim.state.players[0]!.potions = 1;
      spawnEnemy(sim, 9300, 'carapace-husk', sim.state.players[0]!.pos.x + 50, sim.state.players[0]!.pos.y);
      return sim;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 60; i++) {
      simTick(a, [input({ usePotion: i === 0 })]);
      simTick(b, [input({ usePotion: i === 0 })]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
