import type { EnemyDef, GeneratorDef } from '../sim/types';

/**
 * Enemy families of the Hive (#7 visual grammar, #23 roster):
 * - skitter: fast fragile swarmers
 * - husk: slow, tanky melee bruisers
 * - spitter: ranged attackers that keep their distance and spit hostile bolts
 * Palette/size read from the tier (common → veteran → elite).
 */
export const ENEMIES: Record<string, EnemyDef> = {
  skitterling: {
    id: 'skitterling',
    name: 'Skitterling',
    family: 'skitter',
    tier: 'common',
    maxHp: 40,
    moveSpeed: 120,
    radius: 10,
    touchDamage: 7,
    attackRange: 28,
    attackCooldownTicks: 45,
    goldMin: 2,
    goldMax: 5
  },
  'carapace-husk': {
    id: 'carapace-husk',
    name: 'Carapace Husk',
    family: 'husk',
    tier: 'veteran',
    maxHp: 140,
    moveSpeed: 66, // slow bruiser
    radius: 15,
    touchDamage: 16,
    attackRange: 34,
    attackCooldownTicks: 55,
    goldMin: 6,
    goldMax: 12
  },
  'bile-spitter': {
    id: 'bile-spitter',
    name: 'Bile Spitter',
    family: 'spitter',
    tier: 'common',
    maxHp: 46,
    moveSpeed: 88,
    radius: 12,
    touchDamage: 0, // never melees; fights at range
    attackRange: 200, // holds this distance and spits
    attackCooldownTicks: 105,
    goldMin: 4,
    goldMax: 9,
    ranged: {
      projectileSpeed: 240,
      projectileRadius: 5,
      projectileDamage: 8,
      projectileRange: 230
    }
  },
  'gravebound-ravager': {
    id: 'gravebound-ravager',
    name: 'Gravebound Ravager',
    family: 'husk',
    tier: 'elite',
    maxHp: 320,
    moveSpeed: 82,
    radius: 19,
    touchDamage: 24,
    attackRange: 42,
    attackCooldownTicks: 58,
    goldMin: 22,
    goldMax: 34
  }
};

/** Enemy-spawning structures. Destroying these is the core tactical priority. */
export const GENERATORS: Record<string, GeneratorDef> = {
  'brood-node': {
    id: 'brood-node',
    name: 'Brood Node',
    maxHp: 120,
    radius: 20,
    spawnsEnemyId: 'skitterling',
    spawnIntervalTicks: 90,
    // 5 per node = 10 concurrent chasers max: tuned for the solo slice.
    // Scale generator pressure with player count when co-op lands (M3).
    maxAlive: 5,
    goldDrop: 25,
    // Wounded nodes panic-spawn: faster interval for 2.5 s, once, below
    // half HP. Tuned against solo-clear attrition (see docs/STATUS.md).
    enrage: {
      hpFraction: 0.5,
      intervalMult: 0.6,
      durationTicks: 150
    }
  },
  'husk-mound': {
    id: 'husk-mound',
    name: 'Husk Mound',
    maxHp: 150,
    radius: 20,
    spawnsEnemyId: 'carapace-husk',
    spawnIntervalTicks: 165, // husks are tanky, so they come slowly
    maxAlive: 2,
    goldDrop: 30
  },
  'spitter-nest': {
    id: 'spitter-nest',
    name: 'Spitter Nest',
    maxHp: 110,
    radius: 18,
    spawnsEnemyId: 'bile-spitter',
    spawnIntervalTicks: 150,
    maxAlive: 2,
    goldDrop: 30
  }
};
