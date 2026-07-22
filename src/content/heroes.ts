import type { HeroDef } from '../sim/types';

/**
 * Hero roster: the Vanguard, Arcanist, Ranger and Sentinel are all playable.
 * Roster order matters: the first entry is the default hero.
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
      kind: 'blast',
      id: 'sunder-slam',
      name: 'Sunder Slam',
      damage: 40,
      radius: 110,
      knockback: 440,
      cooldownTicks: 300
    }
  },
  arcanist: {
    id: 'arcanist',
    name: 'Veyra Solmerin',
    role: 'Arcanist',
    description:
      'A hex-weaver who scours the warrens from afar, piercing swarms with amber bolts and binding them in hardened resin.',
    maxHp: 80,
    moveSpeed: 170,
    radius: 11,
    attack: {
      kind: 'projectile',
      damage: 18,
      speed: 380,
      radius: 4,
      range: 320,
      cooldownTicks: 16,
      pierce: 1,
      knockback: 120
    },
    ability: {
      kind: 'blast',
      id: 'resin-cage',
      name: 'Resin Cage',
      damage: 25,
      radius: 90,
      knockback: 0,
      cooldownTicks: 300,
      offsetPx: 140,
      slowTicks: 120, // 2 s near-root
      slowMult: 0.1
    },
    // Available from the first run, but recruited with banked gold.
    unlock: { goldCost: 120 }
  },
  ranger: {
    id: 'ranger',
    name: 'Tamsin Vael',
    role: 'Ranger',
    description:
      'A fleet-footed warren-stalker who dances at the edge of the swarm, threading thorn darts through whole ranks and vaulting clear with a backward volley.',
    maxHp: 90,
    moveSpeed: 230,
    radius: 10,
    attack: {
      kind: 'projectile',
      damage: 12,
      speed: 520,
      radius: 4,
      range: 380,
      cooldownTicks: 9, // rapid fire
      pierce: 2, // a dart hits up to three targets in a line
      knockback: 40
    },
    ability: {
      kind: 'dash-volley',
      id: 'volley-step',
      name: 'Volley Step',
      cooldownTicks: 240, // ~4 s
      dashPx: 120,
      dartCount: 5,
      spreadDeg: 70
    },
    // Revealed after a first clear, then recruited with gold.
    unlock: { missionsCompleted: 1, goldCost: 160 }
  },
  sentinel: {
    id: 'sentinel',
    name: 'Odo Brakk',
    role: 'Sentinel',
    description:
      'An immovable warden who plants himself between the brood and the party, sweeping ranks aside with a great maul and weathering the tide behind a tower shield.',
    maxHp: 170,
    moveSpeed: 150,
    radius: 13,
    attack: {
      kind: 'melee',
      damage: 20,
      range: 56,
      arcDeg: 150,
      knockback: 380, // heavy sweep that scatters hordes
      cooldownTicks: 28
    },
    ability: {
      kind: 'guard',
      id: 'bastion-wall',
      name: 'Bastion Wall',
      cooldownTicks: 360, // ~6 s
      durationTicks: 150, // ~2.5 s guard stance
      damageMult: 0.25, // soak 75% of incoming damage
      moveMult: 0.5, // rooted-heavy while braced
      reflectKnockback: 200 // shove blocked attackers off
    },
    // The deepest recruit: two clears to reveal, then the largest gold cost.
    unlock: { missionsCompleted: 2, goldCost: 220 }
  }
};
