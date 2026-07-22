import type { WeaponDef } from '../sim/types';

/**
 * Data-driven weapon tiers (issue #22). Each hero has a three-tier track:
 * tier 1 is their built-in kit (cost 0, no overrides), tiers 2–3 are
 * shop-purchasable and override specific attack numbers that fit the class
 * fantasy. The equipped tier resolves to an AttackDef at createSim time
 * (see `resolveEquippedAttack` in src/meta/save.ts); the sim never reads this
 * table or the profile directly.
 *
 * Ids follow `<heroId>-t<tier>` so ownership persists as stable strings and
 * the tier-1 (base) id is derivable from the hero id alone.
 */
export const WEAPONS: Record<string, WeaponDef> = {
  // --- Vanguard (melee sweeps) ------------------------------------------
  'vanguard-t1': {
    id: 'vanguard-t1',
    name: 'Wardpike',
    heroId: 'vanguard',
    tier: 1,
    description: 'The Vanguard’s standard shield-breaker sweep.',
    cost: 0,
    attackOverrides: {}
  },
  'vanguard-t2': {
    id: 'vanguard-t2',
    name: "Warden's Edge",
    heroId: 'vanguard',
    tier: 2,
    description: 'A broader sweep that catches more of the swarm (+arc, +damage).',
    cost: 90,
    attackOverrides: { damage: 31, arcDeg: 150 }
  },
  'vanguard-t3': {
    id: 'vanguard-t3',
    name: 'Sunreaver Maul',
    heroId: 'vanguard',
    tier: 3,
    description: 'A crushing maul that scatters ranks (+damage, +knockback).',
    cost: 220,
    attackOverrides: { damage: 40, knockback: 360, arcDeg: 150 }
  },

  // --- Arcanist (piercing amber bolts) ----------------------------------
  'arcanist-t1': {
    id: 'arcanist-t1',
    name: 'Hexbolt Focus',
    heroId: 'arcanist',
    tier: 1,
    description: 'The Arcanist’s standard piercing amber bolt.',
    cost: 0,
    attackOverrides: {}
  },
  'arcanist-t2': {
    id: 'arcanist-t2',
    name: 'Hexbore Wand',
    heroId: 'arcanist',
    tier: 2,
    description: 'Bolts bore through an extra rank (+pierce, +damage).',
    cost: 100,
    attackOverrides: { damage: 22, pierce: 2 }
  },
  'arcanist-t3': {
    id: 'arcanist-t3',
    name: 'Amberlance',
    heroId: 'arcanist',
    tier: 3,
    description: 'A lancing bolt, faster and deeper-striking (+damage, +speed, +pierce).',
    cost: 240,
    attackOverrides: { damage: 28, speed: 460, pierce: 3 }
  },

  // --- Ranger (rapid thorn darts) ---------------------------------------
  'ranger-t1': {
    id: 'ranger-t1',
    name: 'Thornbow',
    heroId: 'ranger',
    tier: 1,
    description: 'The Ranger’s standard rapid thorn dart.',
    cost: 0,
    attackOverrides: {}
  },
  'ranger-t2': {
    id: 'ranger-t2',
    name: 'Thornscar Bow',
    heroId: 'ranger',
    tier: 2,
    description: 'A faster draw that threads darts quicker (−cooldown, +damage).',
    cost: 100,
    attackOverrides: { damage: 15, cooldownTicks: 7 }
  },
  'ranger-t3': {
    id: 'ranger-t3',
    name: 'Galewind Longbow',
    heroId: 'ranger',
    tier: 3,
    description: 'A longbow whose darts skewer whole files (+pierce, +damage).',
    cost: 240,
    attackOverrides: { damage: 18, pierce: 4, cooldownTicks: 8 }
  },

  // --- Sentinel (great sweeping maul) -----------------------------------
  'sentinel-t1': {
    id: 'sentinel-t1',
    name: 'Warmaul',
    heroId: 'sentinel',
    tier: 1,
    description: 'The Sentinel’s standard scattering sweep.',
    cost: 0,
    attackOverrides: {}
  },
  'sentinel-t2': {
    id: 'sentinel-t2',
    name: 'Bulwark Cleaver',
    heroId: 'sentinel',
    tier: 2,
    description: 'A wider guard-sweep that clears the line (+arc, +damage).',
    cost: 110,
    attackOverrides: { damage: 26, arcDeg: 180 }
  },
  'sentinel-t3': {
    id: 'sentinel-t3',
    name: 'Graven Maul',
    heroId: 'sentinel',
    tier: 3,
    description: 'A monstrous maul that hurls the brood aside (+damage, +knockback).',
    cost: 260,
    attackOverrides: { damage: 34, knockback: 480, arcDeg: 180 }
  }
};
