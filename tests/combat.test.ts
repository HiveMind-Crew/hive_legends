import { describe, expect, it } from 'vitest';
import { attackForWeapon, dps, stunlocks, targetsPerUse } from '../scripts/combatTables';
import { CONTENT } from '../src/content';
import type { AttackDef, HeroDef, WeaponDef } from '../src/sim/types';

/**
 * Archetype invariants for hero attacks (see docs/COMBAT.md).
 *
 * These are deliberately *not* balance assertions — they don't pin any number.
 * Each one encodes a statement about what a hero **is**, so that tuning a
 * number can never silently turn the anchor into the damage dealer or hand the
 * skirmisher a control tool. If one of these fails, the fix is either to
 * change the data back or to change docs/COMBAT.md on purpose.
 */

const HEROES = Object.values(CONTENT.heroes);

function tiersFor(heroId: string): WeaponDef[] {
  return Object.values(CONTENT.weapons)
    .filter((w) => w.heroId === heroId)
    .sort((a, b) => a.tier - b.tier);
}

/** Every (hero, weapon tier) pairing with the tier's overrides applied. */
function allLoadouts(): { hero: HeroDef; weapon: WeaponDef; attack: AttackDef }[] {
  return HEROES.flatMap((hero) =>
    tiersFor(hero.id).map((weapon) => ({ hero, weapon, attack: attackForWeapon(hero, weapon) }))
  );
}

/** The roster's cheapest enemy — the yardstick every burst is measured against. */
function baselineSwarmEnemy() {
  return Object.values(CONTENT.enemies).reduce((a, b) => (a.maxHp <= b.maxHp ? a : b));
}

describe('weapon tracks', () => {
  it('every tier is an unambiguous upgrade in DPS and cost', () => {
    for (const hero of HEROES) {
      const tiers = tiersFor(hero.id);
      expect(tiers.length, `${hero.id} has a weapon track`).toBeGreaterThan(0);
      for (let i = 1; i < tiers.length; i++) {
        const prev = tiers[i - 1]!;
        const next = tiers[i]!;
        const label = `${hero.id} T${prev.tier} → T${next.tier}`;
        // Individual stats may regress (the Ranger's T3 fires slower than its
        // T2) as long as the package nets out ahead.
        expect(dps(attackForWeapon(hero, next)), `${label} DPS`).toBeGreaterThan(dps(attackForWeapon(hero, prev)));
        expect(next.cost, `${label} cost`).toBeGreaterThan(prev.cost);
      }
    }
  });
});

describe('attack shapes', () => {
  it('melee arcs stay under a half-plane', () => {
    // Past 180° a swing hits everything but the hero's exact rear, which
    // deletes flanking as counterplay. See "The frontal arc is melee's
    // counterplay" in docs/COMBAT.md.
    for (const { hero, weapon, attack } of allLoadouts()) {
      if (attack.kind !== 'melee') continue;
      const label = `${hero.id} ${weapon.id} arcDeg`;
      expect(attack.arcDeg, label).toBeGreaterThan(0);
      expect(attack.arcDeg, label).toBeLessThanOrEqual(180);
    }
  });

  it('melee reach stays far shorter than ranged reach', () => {
    const melee = allLoadouts().filter((l) => l.attack.kind === 'melee');
    const ranged = allLoadouts().filter((l) => l.attack.kind === 'projectile');
    expect(melee.length).toBeGreaterThan(0);
    expect(ranged.length).toBeGreaterThan(0);
    const longestMelee = Math.max(...melee.map((l) => l.attack.range));
    const shortestRanged = Math.min(...ranged.map((l) => l.attack.range));
    // A wide margin, not a hair's breadth: the two shapes must stay legible
    // at a glance rather than blurring into "medium range".
    expect(longestMelee * 2, 'longest melee reach vs shortest ranged').toBeLessThan(shortestRanged);
  });
});

describe('roster archetypes', () => {
  it('the Sentinel is the toughest hero', () => {
    const sentinel = CONTENT.heroes['sentinel']!;
    for (const hero of HEROES) {
      if (hero.id === sentinel.id) continue;
      expect(sentinel.maxHp, `sentinel hp vs ${hero.id}`).toBeGreaterThan(hero.maxHp);
    }
  });

  it('the Sentinel deals the least damage at every tier', () => {
    // The anchor trades damage for the space it holds; if it ever out-damages
    // a damage dealer at some tier, the roster has lost its tank.
    for (const tier of [1, 2, 3]) {
      const atTier = allLoadouts().filter((l) => l.weapon.tier === tier);
      const sentinel = atTier.find((l) => l.hero.id === 'sentinel');
      expect(sentinel, `sentinel has a T${tier}`).toBeDefined();
      for (const other of atTier) {
        if (other.hero.id === 'sentinel') continue;
        expect(dps(sentinel!.attack), `sentinel T${tier} DPS vs ${other.hero.id}`).toBeLessThan(dps(other.attack));
      }
    }
  });

  it('the Ranger is the fastest hero', () => {
    const ranger = CONTENT.heroes['ranger']!;
    for (const hero of HEROES) {
      if (hero.id === ranger.id) continue;
      expect(ranger.moveSpeed, `ranger speed vs ${hero.id}`).toBeGreaterThan(hero.moveSpeed);
    }
  });

  /**
   * Domination check, over the axes that actually decide a hero's power:
   * survivability, mobility, reach, sustained damage, and how many enemies one
   * use touches. Knockback is deliberately excluded — it is a peel tool, and
   * holding a knockback edge does not compensate a hero for being worse at
   * everything else (which is precisely the Arcanist's situation today).
   *
   * Compared only within an attack kind, since reach and multi-target mean
   * different things for a swing than for a bolt.
   */
  it('no hero is beaten on every core axis by another of the same kind', () => {
    // Known violations, tracked in docs/COMBAT.md. This set must only ever
    // shrink: a new entry means a hero has lost its reason to exist.
    const knownDominated = new Set(['arcanist < ranger']);

    const found = new Set<string>();
    for (const a of HEROES) {
      for (const b of HEROES) {
        if (a.id === b.id || a.attack.kind !== b.attack.kind) continue;
        const axes: [number, number][] = [
          [a.maxHp, b.maxHp],
          [a.moveSpeed, b.moveSpeed],
          [a.attack.range, b.attack.range],
          [dps(a.attack), dps(b.attack)],
          [targetsPerUse(a.attack) ?? a.attack.range, targetsPerUse(b.attack) ?? b.attack.range]
        ];
        if (axes.every(([x, y]) => x <= y) && axes.some(([x, y]) => x < y)) {
          found.add(`${a.id} < ${b.id}`);
        }
      }
    }
    expect([...found].sort(), 'strictly dominated heroes').toEqual([...knownDominated].sort());
  });
});

describe('cadence vs hitstun', () => {
  /**
   * Every hit freezes an enemy for `combat.enemyHitstunTicks`, and the hitstun
   * branch in updateEnemies returns before steering, attacking and windups. An
   * attack whose cooldown is at or below that window re-freezes the target
   * before the previous freeze lapses, removing it from the fight for good.
   */
  it('no loadout can hold a target permanently stunned', () => {
    // Known violations, tracked in docs/COMBAT.md — the Ranger stunlocks at
    // every tier. This set must only ever shrink.
    const knownStunlocks = new Set(['ranger-t1', 'ranger-t2', 'ranger-t3']);

    const found = allLoadouts()
      .filter((l) => stunlocks(l.attack, CONTENT.combat.enemyHitstunTicks))
      .map((l) => l.weapon.id);
    expect(found.sort(), 'loadouts that stunlock').toEqual([...knownStunlocks].sort());
  });
});

describe('abilities', () => {
  it('ability ids and names are unique across the roster', () => {
    const ids = HEROES.map((h) => h.ability.id);
    const names = HEROES.map((h) => h.ability.name);
    expect(new Set(ids).size, 'unique ability ids').toBe(ids.length);
    expect(new Set(names).size, 'unique ability names').toBe(names.length);
  });

  it('every ability is on a real cooldown', () => {
    for (const hero of HEROES) {
      expect(hero.ability.cooldownTicks, `${hero.id} ability cooldown`).toBeGreaterThan(0);
    }
  });

  it('a guard stance cannot be held permanently', () => {
    for (const hero of HEROES) {
      if (hero.ability.kind !== 'guard') continue;
      // Downtime is what makes the stance a decision rather than a passive.
      expect(hero.ability.durationTicks, `${hero.id} guard uptime`).toBeLessThan(hero.ability.cooldownTicks);
    }
  });

  it('every blast either clears the swarm threshold or applies control', () => {
    // A burst that neither kills the roster's cheapest enemy nor controls the
    // survivors has no felt moment, whatever its damage number says.
    const baseline = baselineSwarmEnemy();
    for (const hero of HEROES) {
      const ability = hero.ability;
      if (ability.kind !== 'blast') continue;
      const clears = ability.damage >= baseline.maxHp;
      const controls = (ability.slowTicks ?? 0) > 0 || ability.knockback > 0;
      expect(
        clears || controls,
        `${hero.id}'s ${ability.name} neither kills a ${baseline.name} (${ability.damage} vs ${baseline.maxHp} hp) nor controls`
      ).toBe(true);
    }
  });
});
