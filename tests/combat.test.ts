import { describe, expect, it } from 'vitest';
import {
  attackForWeapon,
  crowdScore,
  dps,
  enemyAttackKind,
  enemyDps,
  stunlocks,
  sweptArea,
  targetsPerUse
} from '../scripts/combatTables';
import { CONTENT } from '../src/content';
import { ENEMY_FAMILIES, ENEMY_TIERS, type AttackDef, type HeroDef, type WeaponDef } from '../src/sim/types';

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
    // No exceptions: the Arcanist's out-ranging of the Ranger closed the last
    // one. A new entry here means a hero has lost its reason to exist.
    const knownDominated = new Set<string>();

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
    // No exceptions: the Ranger's cadence now clears the hitstun window at
    // every tier. Any entry here is a hero that removes a target from the
    // fight outright, which is not a hero feature.
    const knownStunlocks = new Set<string>();

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

/**
 * Differentiation: the guarantee that two actors do not quietly become one.
 *
 * The invariants above each protect a *single* archetype ("the Sentinel is the
 * anchor"). These protect the relationships *between* archetypes, which is
 * where convergence actually happens — no individual hero test fails when two
 * heroes drift toward each other, because neither one has broken its own rule.
 *
 * The generated "Axis leaders" table in docs/COMBAT.md is the companion to
 * this suite: it answers the question a test cannot, which is whether a hero
 * leads anything at all.
 */
describe('differentiation', () => {
  const MELEE_SPLIT = 'the two melee heroes converged once already — see "Resolved issues" #4 in docs/COMBAT.md';

  it('the Vanguard spears where the Sentinel sweeps, at every tier', () => {
    // The melee split of issue #4, stated as the doc states it: the Sentinel
    // out-crowds the Vanguard while the Vanguard out-damages him.
    //
    // Crowd *score* is the load-bearing half, not swept area — area alone is
    // dominated by the maul at any plausible arc, so it stays green through
    // exactly the regression this is here to catch (restoring the Vanguard's
    // pre-split 110° arc inverts crowd throughput while leaving area intact).
    const vanguard = CONTENT.heroes['vanguard']!;
    const sentinel = CONTENT.heroes['sentinel']!;
    for (const tier of [1, 2, 3]) {
      const pike = attackForWeapon(vanguard, tiersFor(vanguard.id).find((w) => w.tier === tier)!);
      const maul = attackForWeapon(sentinel, tiersFor(sentinel.id).find((w) => w.tier === tier)!);
      if (pike.kind !== 'melee' || maul.kind !== 'melee') continue;
      expect(pike.arcDeg, `T${tier} pike arc vs maul arc — ${MELEE_SPLIT}`).toBeLessThan(maul.arcDeg);
      expect(crowdScore(maul), `T${tier} maul crowd score vs pike — ${MELEE_SPLIT}`).toBeGreaterThan(crowdScore(pike));
      expect(dps(pike), `T${tier} pike DPS vs maul — ${MELEE_SPLIT}`).toBeGreaterThan(dps(maul));
    }
  });

  it('the Arcanist opens from further out than anyone', () => {
    // Stated in her archetype section, and the whole of what separates the two
    // ranged heroes: she out-ranges, he out-sustains.
    const arcanist = CONTENT.heroes['arcanist']!;
    for (const hero of HEROES) {
      if (hero.id === arcanist.id) continue;
      expect(arcanist.attack.range, `arcanist reach vs ${hero.id}`).toBeGreaterThan(hero.attack.range);
    }
  });

  it('no two heroes share an attack profile', () => {
    // Cheap, but it is the floor: two identical stat blocks are two heroes
    // that play identically, whatever their names and art say.
    const seen = new Map<string, string>();
    for (const hero of HEROES) {
      const profile = JSON.stringify(hero.attack);
      const twin = seen.get(profile);
      expect(twin, `${hero.id} has the same attack as ${twin}`).toBeUndefined();
      seen.set(profile, hero.id);
    }
  });

  it('no hero is dominated by another at the same tier', () => {
    // The base-kit domination check above is blind to weapon tracks: two heroes
    // can start apart and converge by T3, since each track is only ever checked
    // against its own hero's previous tier.
    const knownDominated = new Set<string>();

    const found = new Set<string>();
    for (const a of allLoadouts()) {
      for (const b of allLoadouts()) {
        if (a.hero.id === b.hero.id) continue;
        if (a.weapon.tier !== b.weapon.tier) continue;
        if (a.attack.kind !== b.attack.kind) continue;
        const axes: [number, number][] = [
          [a.hero.maxHp, b.hero.maxHp],
          [a.hero.moveSpeed, b.hero.moveSpeed],
          [a.attack.range, b.attack.range],
          [dps(a.attack), dps(b.attack)],
          [targetsPerUse(a.attack) ?? (sweptArea(a.attack) ?? 0), targetsPerUse(b.attack) ?? (sweptArea(b.attack) ?? 0)]
        ];
        if (axes.every(([x, y]) => x <= y) && axes.some(([x, y]) => x < y)) {
          found.add(`${a.weapon.id} < ${b.weapon.id}`);
        }
      }
    }
    expect([...found].sort(), 'strictly dominated loadouts').toEqual([...knownDominated].sort());
  });

  it('no two enemies attack the same way', () => {
    // A monster that is another monster with a different HP bar is not a new
    // monster. Shape counts for everything; failing that, an enemy has to
    // differ on at least two of the four dials that describe an attack.
    const enemies = Object.values(CONTENT.enemies);
    for (const a of enemies) {
      for (const b of enemies) {
        if (a.id >= b.id) continue;
        if (enemyAttackKind(a) !== enemyAttackKind(b)) continue; // different shape outright
        const dials = [
          a.attack.range !== b.attack.range,
          a.attack.cooldownTicks !== b.attack.cooldownTicks,
          a.attack.windupTicks !== b.attack.windupTicks,
          a.attack.damage !== b.attack.damage
        ].filter(Boolean).length;
        expect(dials, `${a.id} and ${b.id} attack too much alike`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('enemy threat rises with tier', () => {
    // Tier has to mean something to a player who cannot see the data: a
    // veteran must outclass every common, an elite every veteran.
    const byTier = ENEMY_TIERS.map((tier) => Object.values(CONTENT.enemies).filter((e) => e.tier === tier));
    for (let i = 1; i < byTier.length; i++) {
      const lower = byTier[i - 1]!;
      const higher = byTier[i]!;
      if (lower.length === 0 || higher.length === 0) continue;
      const label = `${ENEMY_TIERS[i - 1]} → ${ENEMY_TIERS[i]}`;
      expect(Math.min(...higher.map((e) => e.maxHp)), `${label} hp`).toBeGreaterThan(
        Math.max(...lower.map((e) => e.maxHp))
      );
      expect(Math.min(...higher.map(enemyDps)), `${label} dps`).toBeGreaterThan(Math.max(...lower.map(enemyDps)));
    }
  });

  it('every enemy attack is telegraphed long enough to read', () => {
    // The windup is the entire counterplay against an enemy — there is no
    // contact damage to dodge and no arc to step behind. An attack that lands
    // faster than a player can react to is not difficulty, it is noise.
    const MIN_WINDUP_TICKS = 10;
    for (const enemy of Object.values(CONTENT.enemies)) {
      expect(enemy.attack.windupTicks, `${enemy.id} windup`).toBeGreaterThanOrEqual(MIN_WINDUP_TICKS);
    }
  });

  it('every enemy family has at least one authored member', () => {
    // A family in the union with nothing in it is dead vocabulary: it has art
    // keys and a silhouette rule but never appears in a fight.
    for (const family of ENEMY_FAMILIES) {
      const members = Object.values(CONTENT.enemies).filter((e) => e.family === family);
      expect(members.length, `${family} family has members`).toBeGreaterThan(0);
    }
  });

  it('every boss phase fights differently from the last', () => {
    // Escalation is already checked (faster, lower threshold). This checks the
    // fight *changes* rather than merely speeding up: a phase that reuses the
    // previous cycle verbatim is a difficulty slider, not a new phase.
    for (const boss of Object.values(CONTENT.bosses)) {
      const cycles = boss.phases.map((p) => p.actions.join(','));
      expect(new Set(cycles).size, `${boss.id} has a distinct action cycle per phase`).toBe(cycles.length);
    }
  });
});
