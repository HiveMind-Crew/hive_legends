import type { EnemyDef, GeneratorDef } from '../sim/types';

/** Enemy families of the Hive. Slice 0: the Skitterling swarm. */
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
  }
};
