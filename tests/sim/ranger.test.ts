import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { circleHitsWall } from '../../src/sim/level';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import {
  EMPTY_INPUT,
  type DashVolleyAbilityDef,
  type EnemyState,
  type InputCommand,
  type SimEvent
} from '../../src/sim/types';
import { activateAllObjectives } from './fixtures';

/**
 * The Ranger hero (issue #19): a fast skirmisher with rapid piercing thorn
 * darts and Volley Step — an instant, wall-clipped dash that sprays a fan of
 * darts backward. Tests drive the *real* content hero and assert the dash's
 * determinism, wall-safety, exact dart count, pierce cap, and completability.
 */

const VOLLEY_STEP = CONTENT.heroes['ranger']!.ability as DashVolleyAbilityDef;

function newRangerSim(seed = 71): Sim {
  return activateAllObjectives(createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'ranger' }], content: CONTENT }));
}

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

function runTicks(sim: Sim, n: number, cmd: InputCommand = EMPTY_INPUT): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < n; i++) events.push(...simTick(sim, [cmd]));
  return events;
}

function spawnEnemy(sim: Sim, id: number, x: number, y: number, hp = CONTENT.enemies['skitterling']!.maxHp): EnemyState {
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

describe('ranger roster entry', () => {
  it('is a real, playable ranged skirmisher', () => {
    const hero = CONTENT.heroes['ranger']!;
    expect(hero.attack.kind).toBe('projectile');
    expect(hero.ability.kind).toBe('dash-volley');
    const sim = newRangerSim();
    expect(sim.state.players[0]!.heroId).toBe('ranger');
  });

  it('rapid-fires thorn darts on the attack cooldown', () => {
    const sim = newRangerSim();
    sim.state.players[0]!.facing = { x: 1, y: 0 };
    // Exactly one dart inside one cooldown window, whatever the tuning is.
    const cooldown = CONTENT.heroes['ranger']!.attack.cooldownTicks;
    const events = runTicks(sim, cooldown, input({ attack: true }));
    expect(events.filter((e) => e.type === 'projectile-fired')).toHaveLength(1);
    // The cadence must stay clear of the hitstun window, or the Ranger locks a
    // target out of the fight permanently (docs/COMBAT.md).
    expect(cooldown).toBeGreaterThan(CONTENT.combat.enemyHitstunTicks);
  });

  it('a dart pierces two enemies and stops at the third (3 targets max)', () => {
    const sim = newRangerSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    const r = CONTENT.enemies['skitterling']!.radius;
    // Four enemies in a line along the shot; high HP so none die and drift out.
    const line = [0, 1, 2, 3].map((i) => spawnEnemy(sim, 800 + i, p.pos.x + 30 + i * (r * 2 + 6), p.pos.y, 500));
    runTicks(sim, 20, input({ attack: true }));
    const damaged = line.map((e) => e.hp < 500);
    expect(damaged.slice(0, 3)).toEqual([true, true, true]); // first three hit
    expect(line[3]!.hp).toBe(500); // the fourth is spared — pierce is capped
  });
});

describe('volley step', () => {
  it('dashes the ranger forward along the facing', () => {
    const sim = newRangerSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 }; // open floor ahead (see projectile/arcanist tests)
    const start = { ...p.pos };
    runTicks(sim, 1, input({ ability: true }));
    const moved = Math.hypot(p.pos.x - start.x, p.pos.y - start.y);
    expect(moved).toBeGreaterThan(VOLLEY_STEP.dashPx * 0.75);
    expect(p.pos.x).toBeGreaterThan(start.x); // forward, along +x
  });

  it('fires exactly five darts, all sprayed backward', () => {
    const sim = newRangerSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    const events = runTicks(sim, 1, input({ ability: true }));
    const fired = events.filter((e) => e.type === 'projectile-fired');
    expect(fired).toHaveLength(VOLLEY_STEP.dartCount);
    expect(VOLLEY_STEP.dartCount).toBe(5);
    // Facing +x, so "backward" darts all carry negative x-velocity.
    for (const bolt of sim.state.projectiles) expect(bolt.vel.x).toBeLessThan(0);
  });

  it('the dash never crosses a wall', () => {
    const sim = newRangerSim();
    const p = sim.state.players[0]!;
    const hero = CONTENT.heroes['ranger']!;
    p.facing = { x: 0, y: -1 }; // the spawn hall's north border wall is close
    runTicks(sim, 1, input({ ability: true }));
    // However far the dash clipped, the ranger is still on open floor.
    expect(circleHitsWall(BROOD_WARRENS, p.pos, hero.radius)).toBe(false);
  });

  it('honors the ~4s cooldown', () => {
    const sim = newRangerSim();
    runTicks(sim, 1, input({ ability: true }));
    expect(sim.state.players[0]!.abilityCooldown).toBe(VOLLEY_STEP.cooldownTicks);
  });

  it('the dash-volley sim stays deterministic', () => {
    const a = newRangerSim(303);
    const b = newRangerSim(303);
    const cmd = input({ moveX: 0.3, moveY: -0.2, attack: true, ability: true });
    for (let i = 0; i < 300; i++) {
      simTick(a, [cmd]);
      simTick(b, [cmd]);
    }
    expect(hashState(a.state)).toBe(hashState(b.state));
  });
});

describe('ranger mission flow', () => {
  it('a scripted Ranger playthrough completes the mission', () => {
    const sim = newRangerSim(404);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 8000) {
      const g = sim.state.generators[0];
      if (g) {
        // Stand in dart range and face the node; rapid-fire it down.
        p.pos = { x: g.pos.x - 70, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
        p.attackCooldown = 0;
      }
      simTick(sim, [input({ attack: true })]);
    }
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
  });
});
