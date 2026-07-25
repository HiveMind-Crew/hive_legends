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
    attackWindupTicks: 12, // quick nip — telegraphed but hard to punish
    goldMin: 2,
    goldMax: 5,
    xp: 6
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
    attackWindupTicks: 24, // heavy overhead — clearly readable, punishing if it lands
    goldMin: 6,
    goldMax: 12,
    xp: 18
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
    attackWindupTicks: 16, // a visible charge before the glob leaves the sac
    // Backs off inside 120 px (60% of its 200 px range) so it keeps plinking
    // from a distance instead of planting itself in your face (#23).
    keepDistanceFraction: 0.6,
    goldMin: 4,
    goldMax: 9,
    xp: 12,
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
    attackWindupTicks: 30, // the elite's big tell — reactable, in the boss-bar spirit (#25)
    goldMin: 22,
    goldMax: 34,
    xp: 55
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
    // ~2.5/s cadence: fast enough to outpace a sweeping hero's kills so the
    // swarm stays near its cap under fire, not just on approach (#38). A slower
    // 1/s trickle leaves ~3-4 alive against the Vanguard; this holds ~7-8.
    spawnIntervalTicks: 24,
    // Swarmer node: a full 9-strong crush so the room reads as a horde, not a
    // skirmish (#38). Well within the readability budget (~15) in a mixed horde.
    // Scale generator pressure with player count when co-op lands (M3).
    maxAlive: 9,
    goldDrop: 25,
    xp: 40,
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
    goldDrop: 30,
    xp: 45,
    // Destroying the mound births its elite guardian — a Gravebound Ravager
    // claws out of the wreckage (#40). One husk mound per realm, so exactly
    // one elite per realm. It spawns with an attack grace so it can't ambush.
    onDeathSpawn: { enemyId: 'gravebound-ravager' }
  },
  'spitter-nest': {
    id: 'spitter-nest',
    name: 'Spitter Nest',
    maxHp: 110,
    radius: 18,
    spawnsEnemyId: 'bile-spitter',
    spawnIntervalTicks: 150,
    maxAlive: 2,
    goldDrop: 30,
    xp: 45
  }
};
