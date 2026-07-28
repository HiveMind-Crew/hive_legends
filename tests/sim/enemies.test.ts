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

describe('enemy roster', () => {
  it('defines a tanky melee husk, a ranged spitter, and an elite husk', () => {
    const husk = CONTENT.enemies['carapace-husk']!;
    const spitter = CONTENT.enemies['bile-spitter']!;
    const elite = CONTENT.enemies['gravebound-ravager']!;
    expect(husk.family).toBe('husk');
    expect(husk.ranged).toBeUndefined();
    expect(husk.melee).toEqual({ kind: 'contact', pushPx: 28 });
    expect(husk.maxHp).toBeGreaterThan(CONTENT.enemies['skitterling']!.maxHp);
    expect(spitter.family).toBe('spitter');
    expect(spitter.ranged).toBeDefined();
    expect(elite.tier).toBe('elite');
    expect(elite.maxHp).toBeGreaterThan(husk.maxHp);
    expect(elite.melee?.kind).toBe('line');
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

  it('every ranged enemy authors keep-distance kiting, and melee never does', () => {
    for (const def of Object.values(CONTENT.enemies)) {
      if (def.ranged) {
        expect(def.keepDistanceFraction, `${def.id} kiting`).toBeGreaterThan(0);
        expect(def.keepDistanceFraction, `${def.id} kiting`).toBeLessThan(1);
      } else {
        // Melee families hold their ground; kiting would read as cowardice.
        expect(def.keepDistanceFraction ?? 0, `${def.id} kiting`).toBe(0);
      }
    }
  });

  it('every generator on-death spawn names a real enemy', () => {
    for (const gen of Object.values(CONTENT.generators)) {
      if (gen.onDeathSpawn) expect(CONTENT.enemies[gen.onDeathSpawn.enemyId]).toBeDefined();
    }
  });
});

describe('elite on generator death (#40)', () => {
  /** Destroys the Husk Mound in isolation and returns the emitted events. */
  function killHuskMound(seed = 33): { sim: Sim; events: SimEvent[] } {
    const sim = newSim('vanguard', seed);
    const mound = sim.state.generators.find((g) => g.typeId === 'husk-mound')!;
    sim.state.generators = [mound]; // isolate: no other spawners muddy the state
    sim.state.enemies = [];
    mound.hp = 20; // one Vanguard swing (25 dmg) destroys it before any husk spawns
    const p = sim.state.players[0]!;
    p.pos = { x: mound.pos.x - 40, y: mound.pos.y }; // in melee reach, facing the mound
    p.facing = { x: 1, y: 0 };
    return { sim, events: runTicks(sim, 5, input({ attack: true })) };
  }

  it('a Gravebound Ravager bursts from the Husk Mound when it dies', () => {
    const { sim, events } = killHuskMound();
    expect(events.some((e) => e.type === 'generator-destroyed')).toBe(true);
    const elites = sim.state.enemies.filter((e) => e.typeId === 'gravebound-ravager');
    expect(elites).toHaveLength(1);
    // Elite tier is what drives the crimson render + the Herald's elite call.
    expect(CONTENT.enemies['gravebound-ravager']!.tier).toBe('elite');
    // Unparented (no dead generator to cap it) and given an attack grace so it
    // can't land an un-telegraphed hit the instant it emerges (#39).
    expect(elites[0]!.sourceGen).toBeNull();
    expect(elites[0]!.attackCooldown).toBeGreaterThan(0);
    // An `enemy-spawned` event fires so the renderer plays the emergence + Herald.
    expect(events.some((e) => e.type === 'enemy-spawned' && e.typeId === 'gravebound-ravager')).toBe(true);
  });

  it('the death-spawn is deterministic', () => {
    const a = killHuskMound(777);
    const b = killHuskMound(777);
    expect(hashState(a.sim.state)).toBe(hashState(b.sim.state));
  });
});

describe('attack windup (#39)', () => {
  const HUSK_WINDUP = CONTENT.enemies['carapace-husk']!.attackWindupTicks;

  it('telegraphs the first strike instead of hitting on contact', () => {
    const sim = newSim();
    sim.state.generators = []; // isolate
    const p = sim.state.players[0]!;
    const before = p.hp;
    const husk = spawnEnemy(sim, 'carapace-husk', 900, p.pos.x + 30, p.pos.y); // already in reach

    // First tick: the husk commits to a windup and deals NO damage yet.
    const first = runTicks(sim, 1);
    expect(first.some((e) => e.type === 'enemy-windup' && e.enemyId === husk.id)).toBe(true);
    expect(first.some((e) => e.type === 'player-hit')).toBe(false);
    expect(husk.windupTicksLeft).toBeGreaterThan(0);
    expect(p.hp).toBe(before);

    // The blow lands only once the authored windup elapses.
    const rest = runTicks(sim, HUSK_WINDUP);
    expect(rest.some((e) => e.type === 'player-hit')).toBe(true);
    expect(p.hp).toBeLessThan(before);
  });

  it('a target that leaves reach during the windup is not hit', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const before = p.hp;
    const husk = spawnEnemy(sim, 'carapace-husk', 901, p.pos.x + 30, p.pos.y);
    runTicks(sim, 1); // commit to the windup
    expect(husk.windupTicksLeft).toBeGreaterThan(0);

    // Step well out of reach before the swing releases: it whiffs.
    p.pos = { x: p.pos.x + 400, y: p.pos.y };
    const events = runTicks(sim, HUSK_WINDUP + 2);
    expect(events.some((e) => e.type === 'player-hit')).toBe(false);
    expect(p.hp).toBe(before);
  });

  it('windup combat stays deterministic', () => {
    const seeds = [909, 909];
    const sims = seeds.map((seed) => {
      const sim = newSim('vanguard', seed);
      sim.state.generators = [];
      spawnEnemy(sim, 'carapace-husk', 910, sim.state.players[0]!.pos.x + 30, sim.state.players[0]!.pos.y);
      return sim;
    });
    for (let i = 0; i < 200; i++) for (const sim of sims) simTick(sim, [input({ attack: true })]);
    expect(hashState(sims[0]!.state)).toBe(hashState(sims[1]!.state));
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

  it('the Carapace Husk overhead knocks its target away', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const beforeX = p.pos.x;
    spawnEnemy(sim, 'carapace-husk', 801, p.pos.x + 30, p.pos.y);

    const events = runTicks(sim, CONTENT.enemies['carapace-husk']!.attackWindupTicks + 1);

    expect(events.some((e) => e.type === 'player-hit')).toBe(true);
    expect(p.pos.x).toBeLessThan(beforeX);
  });
});

describe('Gravebound Ravager line rupture', () => {
  it('commits a line, hits along it, and pushes in its travel direction', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const c = (t: number): number => t * BROOD_WARRENS.tileSize + BROOD_WARRENS.tileSize / 2;
    p.pos = { x: c(10), y: c(5) };
    const beforeHp = p.hp;
    const beforeX = p.pos.x;
    const ravager = spawnEnemy(sim, 'gravebound-ravager', 802, c(7), c(5));

    const events = runTicks(sim, CONTENT.enemies['gravebound-ravager']!.attackWindupTicks + 1);
    const rupture = events.find((e) => e.type === 'enemy-line-attack');

    expect(rupture).toMatchObject({ enemyId: ravager.id, length: 120, width: 28 });
    expect(p.hp).toBeLessThan(beforeHp);
    expect(p.pos.x).toBeGreaterThan(beforeX);
  });

  it('can be sidestepped after the direction is committed', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const before = p.hp;
    spawnEnemy(sim, 'gravebound-ravager', 803, p.pos.x - 100, p.pos.y);
    runTicks(sim, 1); // lock the eastward rupture
    p.pos.y += 80;

    const events = runTicks(sim, CONTENT.enemies['gravebound-ravager']!.attackWindupTicks + 1);

    expect(events.some((e) => e.type === 'enemy-line-attack')).toBe(true);
    expect(events.some((e) => e.type === 'player-hit')).toBe(false);
    expect(p.hp).toBe(before);
  });

  it('stops the rupture at a wall', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const before = p.hp;
    const c = (t: number): number => t * BROOD_WARRENS.tileSize + BROOD_WARRENS.tileSize / 2;
    p.pos = { x: c(16), y: c(3) };
    spawnEnemy(sim, 'gravebound-ravager', 804, c(13), c(3));

    const events = runTicks(sim, CONTENT.enemies['gravebound-ravager']!.attackWindupTicks + 1);
    const rupture = events.find((e) => e.type === 'enemy-line-attack');

    expect(rupture?.type === 'enemy-line-attack' ? rupture.length : Infinity).toBeLessThan(96);
    expect(events.some((e) => e.type === 'player-hit')).toBe(false);
    expect(p.hp).toBe(before);
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

  it('backs away when the player crowds it, reopening the gap (#23)', () => {
    const sim = newSim();
    sim.state.generators = []; // isolate
    const p = sim.state.players[0]!;
    const def = CONTENT.enemies['bile-spitter']!;
    const keepDistance = def.attackRange * def.keepDistanceFraction!;
    // Stand well inside its comfort band, on open floor with room behind it.
    const start = { x: p.pos.x + 60, y: p.pos.y };
    expect(60).toBeLessThan(keepDistance);
    const e = spawnEnemy(sim, 'bile-spitter', 860, start.x, start.y);
    runTicks(sim, 60);
    const now = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
    expect(now).toBeGreaterThan(60); // it gave ground
  });

  it('holds its ground in the sweet spot between keep-distance and range', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    const def = CONTENT.enemies['bile-spitter']!;
    const keepDistance = def.attackRange * def.keepDistanceFraction!;
    // Comfortably inside range but outside the retreat band.
    const gap = (keepDistance + def.attackRange) / 2;
    const e = spawnEnemy(sim, 'bile-spitter', 861, p.pos.x + gap, p.pos.y);
    const before = { ...e.pos };
    runTicks(sim, 60);
    expect(Math.hypot(e.pos.x - before.x, e.pos.y - before.y)).toBeLessThan(2);
  });

  it('keeps firing while it retreats', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    spawnEnemy(sim, 'bile-spitter', 862, p.pos.x + 50, p.pos.y); // crowded
    const events = runTicks(sim, 120);
    expect(events.some((ev) => ev.type === 'enemy-shot')).toBe(true);
  });

  it('a crowded melee enemy stands and fights instead of kiting', () => {
    const sim = newSim();
    sim.state.generators = [];
    const p = sim.state.players[0]!;
    // A husk pressed right up against the player must not give ground.
    const e = spawnEnemy(sim, 'carapace-husk', 863, p.pos.x + 20, p.pos.y);
    const beforeX = e.pos.x;
    runTicks(sim, 60);
    // Its bash may push the player away, but the Husk itself never retreats;
    // it holds or advances toward the displaced target.
    expect(e.pos.x).toBeLessThanOrEqual(beforeX + 1);
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
