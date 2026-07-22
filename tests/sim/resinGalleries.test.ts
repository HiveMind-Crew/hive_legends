import { describe, expect, it } from 'vitest';
import { RESIN_GALLERIES, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Realm 2 — The Resin Galleries (issue #24). Proves the second authored mission
 * is deterministic and winnable through the real sim, mirroring the Warrens
 * playthrough test. The map's reachability and vault seals are covered in
 * level.test.ts.
 */

function newSim(seed = 321): Sim {
  return createSim({
    seed,
    level: RESIN_GALLERIES,
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

describe('The Resin Galleries', () => {
  it('spawns the authored generators and pickups', () => {
    const sim = newSim();
    expect(sim.state.generators).toHaveLength(RESIN_GALLERIES.generators.length);
    expect(sim.state.generators.length).toBe(3);
    expect(sim.state.gates.length).toBe(1);
    expect(sim.state.secrets.length).toBe(1);
  });

  it('is deterministic: same seed and inputs produce an identical state hash', () => {
    const a = newSim(555);
    const b = newSim(555);
    const cmd = input({ moveX: 1, moveY: 0.2, attack: true });
    for (let i = 0; i < TICK_RATE * 10; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.state.enemies.length).toBeGreaterThan(0); // generators actually ran
  });

  it('different seeds diverge once the RNG is consumed', () => {
    const a = newSim(1);
    const b = newSim(2);
    runTicks(a, TICK_RATE * 10);
    runTicks(b, TICK_RATE * 10);
    expect(hashState(a.state)).not.toBe(hashState(b.state));
  });

  it('a full scripted playthrough completes the mission', () => {
    // Same approach as the Warrens completion test: drive the player onto each
    // generator and swing, then walk to the exit — exercising the real damage
    // and objective paths on the larger map.
    const sim = newSim(777);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 8000) {
      const g = sim.state.generators.find((gen) => gen.hp > 0) ?? sim.state.generators[0];
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
  });
});
