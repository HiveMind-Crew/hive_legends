import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import { EMPTY_INPUT, type InputCommand, type SimEvent } from '../../src/sim/types';
import { activateAllObjectives } from './fixtures';

/**
 * Level-mechanics toolkit (issue #17): keys, key-locked gates, and breakable
 * secret walls. Tests drive the real Brood Warrens vault through the
 * deterministic sim: gates block until a key is spent, secrets block until an
 * attack crumbles them, and both open their tiles permanently.
 */

function newSim(seed = 51): Sim {
  return activateAllObjectives(createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'vanguard' }], content: CONTENT }));
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

describe('level authoring', () => {
  it('the Brood Warrens fields a gate, a secret wall, and a key', () => {
    const sim = newSim();
    expect(sim.state.gates.length).toBeGreaterThan(0);
    expect(sim.state.secrets.length).toBeGreaterThan(0);
    expect(BROOD_WARRENS.pickups.some((p) => p.kind === 'key')).toBe(true);
    expect(sim.state.gates[0]!.locked).toBe(true);
  });
});

describe('keys', () => {
  it('a key pickup increments the carried count', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    sim.state.pickups.push({ id: 9001, kind: 'key', amount: 1, pos: { ...p.pos } });
    const events = runTicks(sim, 1);
    expect(p.keys).toBe(1);
    expect(events.some((e) => e.type === 'pickup-collected' && e.kind === 'key')).toBe(true);
  });
});

describe('gates', () => {
  it('a locked gate blocks a player without a key', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const gate = sim.state.gates[0]!;
    p.keys = 0;
    p.pos = { x: gate.pos.x + 40, y: gate.pos.y };
    runTicks(sim, 60, input({ moveX: -1 }));
    expect(gate.locked).toBe(true);
    // Never crossed onto the far (treasure) side of the gate tile.
    expect(p.pos.x).toBeGreaterThan(gate.pos.x);
  });

  it('touching a gate with a key opens it, spends the key, and lets the player through', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const gate = sim.state.gates[0]!;
    p.keys = 1;
    p.pos = { x: gate.pos.x + 40, y: gate.pos.y };
    const events = runTicks(sim, 12, input({ moveX: -1 }));
    expect(gate.locked).toBe(false);
    expect(p.keys).toBe(0);
    expect(events.some((e) => e.type === 'gate-opened')).toBe(true);
    // The way is open now — press on into the vault past the gate tile.
    runTicks(sim, 40, input({ moveX: -1 }));
    expect(p.pos.x).toBeLessThan(gate.pos.x);
  });
});

describe('secret walls', () => {
  it('block movement like a wall until broken', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const secret = sim.state.secrets[0]!;
    p.pos = { x: secret.pos.x, y: secret.pos.y - 40 };
    runTicks(sim, 40, input({ moveY: 1 }));
    expect(sim.state.secrets).toHaveLength(1); // intact
    expect(p.pos.y).toBeLessThan(secret.pos.y); // blocked
  });

  it('crumble under attack and open the tile', () => {
    const sim = newSim();
    const p = sim.state.players[0]!;
    const secret = sim.state.secrets[0]!;
    p.pos = { x: secret.pos.x, y: secret.pos.y - 30 };
    p.facing = { x: 0, y: 1 };
    const events: SimEvent[] = [];
    for (let i = 0; i < 60 && sim.state.secrets.length > 0; i++) {
      p.attackCooldown = 0;
      events.push(...simTick(sim, [input({ attack: true })]));
    }
    expect(sim.state.secrets).toHaveLength(0);
    expect(events.some((e) => e.type === 'secret-revealed')).toBe(true);
    // The passage is walkable now.
    runTicks(sim, 40, input({ moveY: 1 }));
    expect(p.pos.y).toBeGreaterThan(secret.pos.y);
  });
});

describe('determinism', () => {
  it('a run through the vault stays deterministic', () => {
    const build = (): Sim => {
      const sim = newSim(707);
      const p = sim.state.players[0]!;
      p.keys = 1;
      p.pos = { x: sim.state.gates[0]!.pos.x + 40, y: sim.state.gates[0]!.pos.y };
      return sim;
    };
    const a = build();
    const b = build();
    for (let i = 0; i < 200; i++) {
      simTick(a, [input({ moveX: -1, attack: true })]);
      simTick(b, [input({ moveX: -1, attack: true })]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});
