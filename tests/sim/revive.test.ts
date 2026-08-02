import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, revivePlayer, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type EnemyState, type SimEvent } from '../../src/sim/types';

/**
 * The arcade continue (issue #99). The gold half lives in `src/meta/save.ts`
 * and is covered in `tests/meta.test.ts`; this is the sim half — a revive has
 * to be a deterministic state transition like everything else the sim does.
 */

function newSim(seed = 99): Sim {
  return createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT });
}

/** Drops the hero and advances one tick, so the mission registers the loss. */
function fell(sim: Sim): SimEvent[] {
  const p = sim.state.players[0]!;
  p.hp = 0;
  p.alive = false;
  return simTick(sim, [EMPTY_INPUT]);
}

/** Puts an enemy at an exact offset from the hero, for the shove test. */
function enemyAt(sim: Sim, dx: number, dy: number): EnemyState {
  const p = sim.state.players[0]!;
  const enemy: EnemyState = {
    id: 9001,
    typeId: 'skitterling',
    pos: { x: p.pos.x + dx, y: p.pos.y + dy },
    hp: 40,
    attackCooldown: 0,
    windupTicksLeft: 30,
    hitstunTicks: 0,
    knockback: { x: 0, y: 0 },
    slowTicks: 0,
    slowMult: 1,
    sourceGen: null
  };
  sim.state.enemies.push(enemy);
  return enemy;
}

describe('revivePlayer', () => {
  it('stands the hero back up on the revive def, where they fell', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const deathSpot = { ...p.pos };
    fell(sim);
    expect(sim.state.phase).toBe('failed');

    const events = revivePlayer(sim, p.id);

    expect(p.alive).toBe(true);
    expect(p.hp).toBe(Math.round(p.maxHp * CONTENT.revive.hpFraction));
    expect(p.invulnTicks).toBe(CONTENT.revive.invulnTicks);
    expect(p.pos).toEqual(deathSpot); // the arcade answer: continue where you stood
    expect(sim.state.phase).toBe('combat');
    expect(events).toEqual([{ type: 'player-revived', playerId: p.id, pos: deathSpot, hp: p.hp, source: 'continue' }]);
  });

  it('shoves the ring of enemies standing over the body, without damaging them', () => {
    const sim = newSim();
    const near = enemyAt(sim, CONTENT.revive.clearRadius - 10, 0);
    const far = enemyAt(sim, CONTENT.revive.clearRadius + 40, 0);
    far.id = 9002;
    const hpBefore = near.hp;
    fell(sim);
    // Committed *after* the fall, so the tick that registers the death cannot
    // be what cancels them.
    near.windupTicksLeft = 30;
    far.windupTicksLeft = 30;

    revivePlayer(sim, sim.state.players[0]!.id);

    expect(near.knockback.x).toBeCloseTo(CONTENT.revive.knockback);
    expect(near.windupTicksLeft).toBe(0); // a telegraph aimed at a corpse
    expect(near.hp).toBe(hpBefore); // space, not a free screen-clear
    expect(far.knockback.x).toBe(0);
    expect(far.windupTicksLeft).toBe(30);
  });

  it('clears a committed swing but keeps what the run earned', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    p.attackCooldown = 20;
    p.guardTicks = 40;
    p.gold = 120;
    p.kills = 7;
    p.potions = 1;
    fell(sim);

    revivePlayer(sim, p.id);

    expect(p.attackCooldown).toBe(0);
    expect(p.guardTicks).toBe(0);
    expect(p.gold).toBe(120);
    expect(p.kills).toBe(7);
    expect(p.potions).toBe(1);
  });

  it('is a no-op for a living hero or an unknown id', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const before = hashState(sim.state);
    expect(revivePlayer(sim, p.id)).toEqual([]);
    expect(revivePlayer(sim, 4242)).toEqual([]);
    expect(hashState(sim.state)).toBe(before);
  });

  it('lets the run continue: the mission can still be failed again, and completed', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    fell(sim);
    revivePlayer(sim, p.id);
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('combat');

    // Falling a second time fails the mission again — a continue is a second
    // chance, not immunity.
    const events = fell(sim);
    expect(sim.state.phase).toBe('failed');
    expect(events.some((e) => e.type === 'mission-failed')).toBe(true);
  });

  it('re-derives the objective rather than stranding a cleared level in combat', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    sim.state.generators = []; // every spawner already down
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('exit-open');

    fell(sim);
    revivePlayer(sim, p.id);
    expect(sim.state.phase).toBe('combat'); // set optimistically...
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('exit-open'); // ...and corrected on the next tick
  });

  it('is deterministic: two sims revived identically stay byte-identical', () => {
    const a = newSim(7);
    const b = newSim(7);
    for (let i = 0; i < 120; i++) {
      simTick(a, [EMPTY_INPUT]);
      simTick(b, [EMPTY_INPUT]);
    }
    fell(a);
    fell(b);
    revivePlayer(a, a.state.players[0]!.id);
    revivePlayer(b, b.state.players[0]!.id);
    for (let i = 0; i < 120; i++) {
      simTick(a, [EMPTY_INPUT]);
      simTick(b, [EMPTY_INPUT]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
