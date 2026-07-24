import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { createSim, simTick, type Sim } from '../../src/sim/sim';
import {
  EMPTY_INPUT,
  type BlastAbilityDef,
  type EnemyState,
  type InputCommand,
  type SimEvent
} from '../../src/sim/types';

/**
 * The Arcanist hero (issue #18): a ranged hex-weaver. These tests drive the
 * *real* content-authored hero (not a test injection) to prove she is
 * selectable and completable, and that Resin Cage roots/slows enemies through
 * the seeded, deterministic sim.
 */

/** Resin Cage is a blast ability; narrow once for the whole suite. */
const RESIN_CAGE = CONTENT.heroes['arcanist']!.ability as BlastAbilityDef;

function newArcanistSim(seed = 55): Sim {
  return createSim({ seed, level: BROOD_WARRENS, players: [{ heroId: 'arcanist' }], content: CONTENT });
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

describe('arcanist roster entry', () => {
  it('is a real, playable ranged hero in the content db', () => {
    const hero = CONTENT.heroes['arcanist']!;
    expect(hero).toBeDefined();
    expect(hero.attack.kind).toBe('projectile');
    const sim = newArcanistSim();
    expect(sim.state.players[0]!.heroId).toBe('arcanist');
    expect(sim.state.players[0]!.maxHp).toBe(hero.maxHp);
  });

  it('fires piercing bolts that strike enemies at range', () => {
    const sim = newArcanistSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    spawnEnemy(sim, 900, p.pos.x + 180, p.pos.y);
    const events = runTicks(sim, 45, input({ attack: true }));
    expect(events.some((e) => e.type === 'projectile-fired')).toBe(true);
    expect(events.some((e) => e.type === 'projectile-hit')).toBe(true);
  });
});

describe('resin cage', () => {
  it('roots enemies in front of the caster (offset cast center)', () => {
    const sim = newArcanistSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    // Enemy sits at the projected cast center, well beyond point-blank range —
    // proving the ability is thrown ahead of the caster.
    const e = spawnEnemy(sim, 910, p.pos.x + RESIN_CAGE.offsetPx!, p.pos.y, 1000);
    runTicks(sim, 1, input({ ability: true }));
    expect(e.slowTicks).toBeGreaterThan(0);
    expect(e.slowMult).toBe(RESIN_CAGE.slowMult);
  });

  it('leaves an enemy at the caster untouched — the cage lands downrange', () => {
    const sim = newArcanistSim();
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    const atFeet = spawnEnemy(sim, 911, p.pos.x, p.pos.y, 1000);
    runTicks(sim, 1, input({ ability: true }));
    expect(atFeet.slowTicks).toBe(0);
  });

  it('a rooted enemy crawls while slowed, then chases at full pace once it wears off', () => {
    const sim = newArcanistSim();
    // Isolate from the horde so only our test enemy moves and the caster is
    // never chipped to death over the ~200-tick observation window.
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    p.facing = { x: 1, y: 0 };
    // One enemy on open floor at the cage center, with huge HP so the cage's
    // damage never removes it. Facing +x keeps its chase path clear of walls.
    const caged = spawnEnemy(sim, 920, p.pos.x + RESIN_CAGE.offsetPx!, p.pos.y, 100000);
    p.abilityCooldown = 0;
    runTicks(sim, 1, input({ ability: true }));
    expect(caged.slowTicks).toBeGreaterThan(0);
    expect(caged.slowMult).toBe(RESIN_CAGE.slowMult);

    // Distance crawled over 40 ticks while rooted...
    const slowedStart = { ...caged.pos };
    runTicks(sim, 40);
    const slowedMoved = Math.hypot(caged.pos.x - slowedStart.x, caged.pos.y - slowedStart.y);

    // ...let the root expire naturally (the slowTicks counter ticks down)...
    let guard = 0;
    while (caged.slowTicks > 0 && guard++ < 400) simTick(sim, [EMPTY_INPUT]);
    expect(caged.slowTicks).toBe(0);

    // ...versus 40 ticks of the same chase once free. It still has runway to
    // the caster, so this measures true movement speed, not a wall stop.
    const freeStart = { ...caged.pos };
    runTicks(sim, 40);
    const freeMoved = Math.hypot(caged.pos.x - freeStart.x, caged.pos.y - freeStart.y);

    expect(slowedMoved).toBeGreaterThan(0); // a near-root, not a hard stop
    expect(freeMoved).toBeGreaterThan(slowedMoved * 3); // dramatically faster once free
  });
});

describe('arcanist mission flow', () => {
  it('a scripted Arcanist playthrough completes the mission', () => {
    const sim = newArcanistSim(202);
    const p = sim.state.players[0]!;
    let guard = 0;
    while (sim.state.phase === 'combat' && guard++ < 8000) {
      const g = sim.state.generators[0];
      if (g) {
        // Stand in bolt range and face the node; sweep the swarm with the cage.
        p.pos = { x: g.pos.x - 60, y: g.pos.y };
        p.facing = { x: 1, y: 0 };
        p.attackCooldown = 0;
      }
      simTick(sim, [input({ attack: true, ability: sim.state.enemies.length > 4 })]);
    }
    expect(sim.state.phase).toBe('exit-open');
    p.pos = { ...sim.state.exitPos };
    simTick(sim, [EMPTY_INPUT]);
    expect(sim.state.phase).toBe('complete');
  });
});
