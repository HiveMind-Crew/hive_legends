import type { HeroDef } from '../sim/types';

/**
 * Hero roster. Slice 0 ships the Vanguard archetype; the Arcanist, Ranger,
 * and Sentinel land later in the vertical-slice milestone.
 */
export const HEROES: Record<string, HeroDef> = {
  vanguard: {
    id: 'vanguard',
    name: 'Korrin Vale',
    role: 'Vanguard',
    description:
      'A wandering shield-breaker who fights at the front line, shattering swarms with heavy sweeps and seismic slams.',
    maxHp: 120,
    moveSpeed: 190,
    radius: 12,
    attack: {
      kind: 'melee',
      damage: 25,
      range: 52,
      arcDeg: 110,
      knockback: 260,
      cooldownTicks: 22
    },
    ability: {
      id: 'sunder-slam',
      name: 'Sunder Slam',
      damage: 40,
      radius: 110,
      knockback: 440,
      cooldownTicks: 300
    }
  }
};
