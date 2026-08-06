import type { LevelDef } from '../../sim/types';

/**
 * Mission 1: The Brood Warrens.
 * A compact three-chamber warren. The party starts in the west hall, fights
 * through three spawners in the eastern chambers — a skitterling Brood Node, a
 * Husk Mound, and a Spitter Nest — then reaches the exit in the south-west
 * vault once every spawner is destroyed.
 *
 * 32 x 24 tiles, '#' = wall, '.' = floor.
 */
export const BROOD_WARRENS: LevelDef = {
  id: 'brood-warrens',
  name: 'The Brood Warrens',
  tileSize: 32,
  mission: {
    biomeLabel: 'BROOD RESIN · TUNNELS',
    threatRating: 1,
    threatLabel: 'LOW',
    encounters: ['Skitterlings', 'Carapace Husks', 'Brood nodes'],
    description: 'Skitterling swarms pour from brood nodes through three connected tunnels. Destroy every node, then reach the exit vault.'
  },
  walls: [
    '################################',
    '#..............#...............#',
    '###............#...............#',
    '#..............#...............#',
    '###............#...............#',
    '#..............................#',
    '#..............................#',
    '#..............#...............#',
    '#......##......#...............#',
    '#......##......#...............#',
    '#..............#...............#',
    '#..............#######...#######',
    '#..............#...............#',
    '#..............#...............#',
    '#..............#...............#',
    '#..............#...............#',
    '#####..####....#...............#',
    '#..............................#',
    '#..............................#',
    '#..............#...............#',
    '#..............#...............#',
    '#......##......#......##.......#',
    '#..............#...............#',
    '################################'
  ],
  playerSpawns: [
    { tx: 4, ty: 3 },
    { tx: 6, ty: 3 },
    { tx: 4, ty: 5 },
    { tx: 6, ty: 5 }
  ],
  generators: [
    { id: 'north-brood-node', typeId: 'brood-node', tx: 24, ty: 5 }, // skitterling swarm (north-east)
    { id: 'mid-husk-mound', typeId: 'husk-mound', tx: 24, ty: 15 }, // tanky husk bruisers (mid-east)
    { id: 'south-spitter-nest', typeId: 'spitter-nest', tx: 27, ty: 18 } // ranged spitters (south-east)
  ],
  pickups: [
    { kind: 'gold', amount: 10, tx: 8, ty: 3 },
    { kind: 'gold', amount: 10, tx: 12, ty: 8 },
    { kind: 'gold', amount: 10, tx: 20, ty: 2 },
    { kind: 'gold', amount: 10, tx: 28, ty: 6 },
    { kind: 'gold', amount: 10, tx: 20, ty: 14 },
    { kind: 'gold', amount: 10, tx: 28, ty: 20 },
    { kind: 'gold', amount: 10, tx: 3, ty: 12 },
    { kind: 'health', amount: 30, tx: 28, ty: 2 },
    { kind: 'health', amount: 30, tx: 10, ty: 20 },
    { kind: 'health', amount: 30, tx: 16, ty: 6 },
    // Temporary power-up relics (issue #16), one of each buff.
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 10, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 20, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 26, ty: 16 },
    // A single screen-clear potion (issue #41), scarce by design.
    { kind: 'potion', amount: 1, tx: 8, ty: 12 },
    // A key on the beaten path, opening the gated NW vault (issue #17).
    { kind: 'key', amount: 1, tx: 12, ty: 2 },
    // Treasure sealed in the two NW corner vaults.
    { kind: 'gold', amount: 50, tx: 1, ty: 1 }, // behind a secret wall
    { kind: 'gold', amount: 40, tx: 1, ty: 3 } // behind a key-locked gate
  ],
  // Optional NW vaults, off the critical path: a secret wall and a key gate.
  gates: [{ tx: 2, ty: 3 }],
  secrets: [{ tx: 2, ty: 1 }],
  props: [
    { typeId: 'resin-husk', tx: 10, ty: 5 },
    { typeId: 'resin-husk', tx: 13, ty: 17 },
    { typeId: 'resin-husk', tx: 22, ty: 8 },
    { typeId: 'resin-husk', tx: 18, ty: 20 },
    { typeId: 'resin-husk', tx: 27, ty: 13 },
    { typeId: 'resin-husk', tx: 5, ty: 18 },
    { typeId: 'amber-clutch', tx: 30, ty: 17 },
    { typeId: 'amber-clutch', tx: 2, ty: 7 }
  ],
  decor: [
    { kind: 'egg-cluster', tx: 23, ty: 3 },
    { kind: 'egg-cluster', tx: 26, ty: 7 },
    { kind: 'egg-cluster', tx: 22, ty: 17 },
    { kind: 'egg-cluster', tx: 26, ty: 13 },
    { kind: 'egg-cluster', tx: 9, ty: 9 },
    { kind: 'resin-web', tx: 1, ty: 1 },
    { kind: 'resin-web', tx: 30, ty: 1 },
    { kind: 'resin-web', tx: 16, ty: 5 },
    { kind: 'resin-web', tx: 14, ty: 16 },
    { kind: 'resin-web', tx: 1, ty: 22 },
    { kind: 'spore-patch', tx: 6, ty: 10 },
    { kind: 'spore-patch', tx: 18, ty: 3 },
    { kind: 'spore-patch', tx: 28, ty: 10 },
    { kind: 'spore-patch', tx: 12, ty: 14 },
    { kind: 'spore-patch', tx: 24, ty: 19 },
    { kind: 'spore-patch', tx: 6, ty: 21 },
    { kind: 'spore-patch', tx: 5, ty: 16 }
  ],
  exit: { tx: 3, ty: 20 }
};
