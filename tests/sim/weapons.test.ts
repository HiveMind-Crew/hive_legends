import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../../src/content';
import { WEAPONS } from '../../src/content/weapons';
import { createSim, hashState, simTick, type Sim } from '../../src/sim/sim';
import {
  EMPTY_INPUT,
  type AttackDef,
  type EnemyState,
  type InputCommand,
  type SimEvent
} from '../../src/sim/types';

/**
 * Weapon tiers (issue #22): the equipped weapon's resolved AttackDef enters the
 * sim only at createSim time via SimPlayerConfig.attack, exactly like stat
 * modifiers. These tests drive the real sim to prove (a) an equipped tier-2
 * weapon measurably changes the same-seed outcome, and (b) per-config
 * determinism is intact — identical config ⇒ identical state hash.
 */

function input(partial: Partial<InputCommand>): InputCommand {
  return { ...EMPTY_INPUT, ...partial };
}

/** A sim with the Vanguard, optionally equipping a resolved weapon attack. */
function vanguardSim(attack?: AttackDef, seed = 7): Sim {
  return createSim({
    seed,
    level: BROOD_WARRENS,
    players: [{ heroId: 'vanguard', attack }],
    content: CONTENT
  });
}

/** Drop one skitterling right in front of the Vanguard's spawn facing. */
function plantTarget(sim: Sim): EnemyState {
  const p = sim.state.players[0]!;
  const e: EnemyState = {
    id: 9001,
    typeId: 'skitterling',
    pos: { x: p.pos.x, y: p.pos.y + 30 }, // directly along the default (0,1) facing
    hp: 1000, // fat target so we read raw damage, not kills
    attackCooldown: 999,
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

/** One attack input then idle until the swing resolves; returns damage dealt. */
function swingDamage(attack?: AttackDef): number {
  const sim = vanguardSim(attack);
  const target = plantTarget(sim);
  const before = target.hp;
  const events: SimEvent[] = [];
  events.push(...simTick(sim, [input({ attack: true })]));
  for (let i = 0; i < 3; i++) events.push(...simTick(sim, [EMPTY_INPUT]));
  return before - target.hp;
}

function resolve(weaponId: string): AttackDef {
  const hero = CONTENT.heroes['vanguard']!;
  return { ...hero.attack, ...WEAPONS[weaponId]!.attackOverrides } as AttackDef;
}

describe('weapon tiers in the sim', () => {
  it('the base attack matches the hero kit when no weapon is equipped', () => {
    const base = CONTENT.heroes['vanguard']!.attack;
    expect(base.kind).toBe('melee');
    expect(swingDamage(undefined)).toBe(base.damage);
  });

  it('equipping a higher tier measurably changes the same-seed outcome', () => {
    const baseDamage = swingDamage(undefined);
    const tier3Damage = swingDamage(resolve('vanguard-t3'));
    // Sunreaver Maul hits harder than the base Wardpike.
    expect(tier3Damage).toBeGreaterThan(baseDamage);
    expect(tier3Damage).toBe(WEAPONS['vanguard-t3']!.attackOverrides.damage);
  });

  it('a wider-arc weapon catches a target the base sweep misses', () => {
    // A target off to the side, outside the 110° base arc but inside 150°.
    function sideHit(attack?: AttackDef): boolean {
      const sim = vanguardSim(attack);
      const p = sim.state.players[0]!;
      const e: EnemyState = {
        id: 9002,
        typeId: 'skitterling',
        pos: { x: p.pos.x + 34, y: p.pos.y + 20 }, // ~60° off the (0,1) facing
        hp: 1000,
        attackCooldown: 999,
        windupTicksLeft: 0,
        hitstunTicks: 0,
        knockback: { x: 0, y: 0 },
        slowTicks: 0,
        slowMult: 1,
        sourceGen: null
      };
      sim.state.enemies.push(e);
      const before = e.hp;
      simTick(sim, [input({ attack: true })]);
      return e.hp < before;
    }
    expect(sideHit(undefined)).toBe(false); // base 110° arc misses the flank
    expect(sideHit(resolve('vanguard-t2'))).toBe(true); // Warden's Edge 150° catches it
  });

  it('is deterministic per config: identical setup ⇒ identical state hash', () => {
    const run = (attack?: AttackDef): string => {
      const sim = vanguardSim(attack, 42);
      plantTarget(sim); // a target so weapon damage/knockback shape the state
      for (let i = 0; i < 120; i++) {
        simTick(sim, [input({ attack: true })]);
      }
      return hashState(sim.state);
    };
    // Same config twice → identical; a different weapon → the hash diverges
    // (harder hits + heavier knockback move the target to a different place).
    expect(run(resolve('vanguard-t3'))).toBe(run(resolve('vanguard-t3')));
    expect(run(undefined)).not.toBe(run(resolve('vanguard-t3')));
  });
});
