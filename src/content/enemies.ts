import type { EnemyDef, GeneratorDef } from '../sim/types';

/** Enemy families of the Hive. Slice 0: the Skitterling swarm. */
export const ENEMIES: Record<string, EnemyDef> = {
  skitterling: {
    id: 'skitterling',
    name: 'Skitterling',
    maxHp: 40,
    moveSpeed: 120,
    radius: 10,
    touchDamage: 8,
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
    maxAlive: 6,
    goldDrop: 25
  }
};
