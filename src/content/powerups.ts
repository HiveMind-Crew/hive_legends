import type { PowerUpDef, PowerUpKind } from '../sim/types';

/**
 * Temporary power-ups (issue #16). Original relics of the Hive, each granting
 * a short, punchy buff. Every def sets all three multipliers so the sim math
 * stays branch-free; the fields a relic doesn't use stay at 1.
 */
export const POWERUPS: Record<PowerUpKind, PowerUpDef> = {
  frenzy: {
    kind: 'frenzy',
    name: 'Emberheart',
    durationTicks: 480, // 8 s
    damageMult: 1.6,
    speedMult: 1,
    damageTakenMult: 1
  },
  swiftness: {
    kind: 'swiftness',
    name: 'Windstep Sigil',
    durationTicks: 480,
    damageMult: 1,
    speedMult: 1.45,
    damageTakenMult: 1
  },
  ward: {
    kind: 'ward',
    name: 'Aegis Bloom',
    durationTicks: 480,
    damageMult: 1,
    speedMult: 1,
    damageTakenMult: 0.5 // soaks half of incoming damage
  }
};
