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
  // --- Vanguard (focused thrusts; the track deepens reach, never widens the
  // arc — broad sweeps belong to the Sentinel) ---------------------------
  'vanguard-t1': {
    id: 'vanguard-t1',
    name: 'Wardpike',
    heroId: 'vanguard',
    tier: 1,
    description: 'The Vanguard’s standard driving thrust.',
    cost: 0,
    attackOverrides: {}
  },
  'vanguard-t2': {
    id: 'vanguard-t2',
    name: "Warden's Reach",
    heroId: 'vanguard',
    tier: 2,
    description: 'A longer haft that spears from further out (+reach, +damage).',
    cost: 90,
    attackOverrides: { damage: 35, range: 72 }
  },
  'vanguard-t3': {
    id: 'vanguard-t3',
    name: 'Sunreaver Pike',
    heroId: 'vanguard',
    tier: 3,
    description: 'A greatpike that runs a rank through end to end (+damage, +reach).',
    cost: 220,
    attackOverrides: { damage: 44, range: 76, arcDeg: 80, knockback: 260 }
  },

  // --- Arcanist (heavy amber artillery; the track adds weight per bolt and
  // depth of penetration, never cadence — the slow rhythm is the class) ---
  'arcanist-t1': {
    id: 'arcanist-t1',
    name: 'Hexbolt Focus',
    heroId: 'arcanist',
    tier: 1,
    description: 'The Arcanist’s standard heavy amber bolt.',
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
    attackOverrides: { damage: 34, pierce: 2 }
  },
  'arcanist-t3': {
    id: 'arcanist-t3',
    name: 'Amberlance',
    heroId: 'arcanist',
    tier: 3,
    description: 'A lancing bolt, faster and deeper-striking (+damage, +speed, +pierce).',
    cost: 240,
    attackOverrides: { damage: 44, speed: 460, pierce: 3 }
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
  // Cadence stays above `combat.enemyHitstunTicks` at every tier — a faster
  // draw than that would stunlock rather than out-damage. Tiers buy weight and
  // penetration instead.
  'ranger-t2': {
    id: 'ranger-t2',
    name: 'Thornscar Bow',
    heroId: 'ranger',
    tier: 2,
    description: 'A faster draw that threads darts quicker (−cooldown, +damage).',
    cost: 100,
    attackOverrides: { damage: 17, cooldownTicks: 11 }
  },
  'ranger-t3': {
    id: 'ranger-t3',
    name: 'Galewind Longbow',
    heroId: 'ranger',
    tier: 3,
    description: 'A longbow whose darts skewer whole files (+pierce, +damage).',
    cost: 240,
    attackOverrides: { damage: 20, pierce: 4, cooldownTicks: 11 }
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
  // The arc stays under a half-plane: at 180° a swing hits everything but the
  // hero's exact rear and flanking stops being counterplay (docs/COMBAT.md).
  'sentinel-t2': {
    id: 'sentinel-t2',
    name: 'Bulwark Cleaver',
    heroId: 'sentinel',
    tier: 2,
    description: 'A wider guard-sweep that clears the line (+arc, +damage).',
    cost: 110,
    attackOverrides: { damage: 26, arcDeg: 170 }
  },
  'sentinel-t3': {
    id: 'sentinel-t3',
    name: 'Graven Maul',
    heroId: 'sentinel',
    tier: 3,
    description: 'A monstrous maul that hurls the brood aside (+damage, +knockback, +reach).',
    cost: 260,
    attackOverrides: { damage: 34, knockback: 480, arcDeg: 175, range: 68 }
  }
};
