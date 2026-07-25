import { describe, expect, it } from 'vitest';
import { COBALT_COMBS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, TICK_RATE, type InputCommand, type SimEvent } from '../../src/sim/types';

/**
 * Mission 3 — The Cobalt Combs (issue #55). Proves the third Azure Reach
 * mission is deterministic and winnable through the real sim, mirroring the
 * Warrens and Galleries playthrough tests. The map's reachability and vault
 * seals are covered in level.test.ts.
 */

function newSim(seed = 909): Sim {
  return createSim({
    seed,
    level: COBALT_COMBS,
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

describe('The Cobalt Combs', () => {
  it('spawns the authored generators, gate and secret', () => {
    const sim = newSim();
    expect(sim.state.generators).toHaveLength(COBALT_COMBS.generators.length);
    expect(sim.state.generators.length).toBe(3);
    expect(sim.state.gates.length).toBe(1);
    expect(sim.state.secrets.length).toBe(1);
  });

  it('fields all three enemy families once the spawners run', () => {
    // The Combs' defining trait: skitterlings, husks and spitters at once. A
    // regression to a single-family map would quietly undo the difficulty step.
    const sim = newSim(4242);
    runTicks(sim, TICK_RATE * 12);
    const families = sim.state.enemies
      .map((e) => CONTENT.enemies[e.typeId]?.family)
      .filter((f): f is NonNullable<typeof f> => f !== undefined);
    expect(families).toContain('skitter');
    expect(families).toContain('husk');
    expect(families).toContain('spitter');
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
    // Same approach as the Warrens and Galleries completion tests: drive the
    // player onto each generator and swing, then walk to the exit — exercising
    // the real damage and objective paths on the map.
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
