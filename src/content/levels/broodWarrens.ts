import type { LevelDef } from '../../sim/types';

/**
 * Mission 1: The Brood Warrens.
 *
 * A west-to-east introductory dungeon with four dependency-staged lessons:
 * swarm bowl, pillar bruiser room, two-arc breach, and broken ranged lane.
 * North/south objective placement makes the route reveal each region without
 * ever asking the party to backtrack into the protected spawn pocket.
 *
 * 46 x 30 tiles, '#' = wall, '.' = floor.
 */
export const BROOD_WARRENS: LevelDef = {
  id: 'brood-warrens',
  name: 'The Brood Warrens',
  tileSize: 32,
  mission: {
    biomeLabel: 'BROOD RESIN · TUNNELS',
    threatRating: 1,
    threatLabel: 'LOW',
    encounters: ['West Brood Bowl', 'Husk Gallery', 'Brood Breach', 'Spitter Run'],
    description: 'Push east through four waking nests, learn each brood shape, and break through to the portal beyond the final lane.'
  },
  walls: [
    '##############################################',
    '#............#..........#.........#..........#',
    '#............#..........#.........#..........#',
    '#............#..........#.........#..........#',
    '#.......................#....................#',
    '#.......................#....................#',
    '#.......................#....................#',
    '#.......................#....................#',
    '#.......................#....................#',
    '#............#..........#.........#..........#',
    '#............#..........#.........#..........#',
    '########.....#...#####..#...###...#..........#',
    '#......#.....#...##.##..#...###...#...###....#',
    '#............#...#...#..#...#.#...#...###....#',
    '#............#..........#.........#...###....#',
    '#............#...#####..#.........#..........#',
    '#............#..........#...###...#..........#',
    '#............#.......##.#...###...#......##..#',
    '#......#.....#.......##.#.........#......##..#',
    '########.....#..##......#.........#......##..#',
    '#............#..##................#..........#',
    '#............#....................#..........#',
    '#............#....................#..........#',
    '#.......######....................#..........#',
    '#.......######....................#..........#',
    '#.......######..........#.........#..........#',
    '#.......######..........#.........#..........#',
    '#.......######..........#.........#..........#',
    '#............#..........#.........#..........#',
    '##############################################'
  ],
  playerSpawns: [
    { tx: 3, ty: 14 },
    { tx: 5, ty: 14 },
    { tx: 3, ty: 16 },
    { tx: 5, ty: 16 }
  ],
  generators: [
    { id: 'west-brood-node', typeId: 'brood-node', tx: 10, ty: 6, encounterId: 'west-brood' },
    { id: 'husk-gallery-mound', typeId: 'husk-mound', tx: 21, ty: 23, encounterId: 'husk-gallery' },
    { id: 'breach-brood-node', typeId: 'brood-node', tx: 31, ty: 6, encounterId: 'brood-breach' },
    { id: 'east-spitter-nest', typeId: 'spitter-nest', tx: 39, ty: 22, encounterId: 'spitter-finale' }
  ],
  encounters: [
    {
      id: 'west-brood',
      trigger: { kind: 'region', minTx: 7, minTy: 4, maxTx: 12, maxTy: 10 }
    },
    {
      id: 'husk-gallery',
      requires: ['west-brood'],
      trigger: { kind: 'region', minTx: 17, minTy: 18, maxTx: 23, maxTy: 27 }
    },
    {
      id: 'brood-breach',
      requires: ['husk-gallery'],
      trigger: { kind: 'region', minTx: 25, minTy: 18, maxTx: 33, maxTy: 24 }
    },
    {
      id: 'spitter-finale',
      requires: ['brood-breach'],
      trigger: { kind: 'region', minTx: 35, minTy: 4, maxTx: 44, maxTy: 10 }
    }
  ],
  pickups: [
    // East-pointing gold trail through each threshold and reveal.
    { kind: 'gold', amount: 10, tx: 8, ty: 15 },
    { kind: 'gold', amount: 10, tx: 9, ty: 9 },
    { kind: 'gold', amount: 10, tx: 15, ty: 6 },
    { kind: 'gold', amount: 10, tx: 21, ty: 10 },
    { kind: 'gold', amount: 10, tx: 22, ty: 21 },
    { kind: 'gold', amount: 10, tx: 27, ty: 22 },
    { kind: 'gold', amount: 10, tx: 31, ty: 9 },
    { kind: 'gold', amount: 10, tx: 36, ty: 6 },
    { kind: 'gold', amount: 10, tx: 40, ty: 10 },
    { kind: 'gold', amount: 10, tx: 43, ty: 22 },
    // Relief after the Husk/Ravager peak and beside finale cover.
    { kind: 'health', amount: 30, tx: 26, ty: 22 },
    { kind: 'health', amount: 30, tx: 32, ty: 18 },
    { kind: 'health', amount: 30, tx: 43, ty: 15 },
    // The key is visible before the optional mid-gallery vault loop.
    { kind: 'key', amount: 1, tx: 17, ty: 7 },
    // Optional forward-rejoining branch rewards, each in a sealed side alcove.
    { kind: 'gold', amount: 50, tx: 29, ty: 13 },
    { kind: 'gold', amount: 40, tx: 19, ty: 12 },
    // Relics teach temporary power without sitting on the mandatory line.
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 11, ty: 20 },
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 23, ty: 8 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 36, ty: 10 },
    // A screen-clear potion waits after the breach and before the finale.
    { kind: 'potion', amount: 1, tx: 33, ty: 6 }
  ],
  gates: [{ tx: 19, ty: 13 }],
  secrets: [{ tx: 29, ty: 14 }],
  props: [
    { typeId: 'resin-husk', tx: 8, ty: 7 },
    { typeId: 'resin-husk', tx: 18, ty: 8 },
    { typeId: 'resin-husk', tx: 19, ty: 22 },
    { typeId: 'resin-husk', tx: 27, ty: 20 },
    { typeId: 'resin-husk', tx: 32, ty: 8 },
    { typeId: 'resin-husk', tx: 36, ty: 8 },
    { typeId: 'resin-husk', tx: 40, ty: 15 },
    { typeId: 'resin-husk', tx: 43, ty: 20 },
    { typeId: 'amber-clutch', tx: 22, ty: 24 },
    { typeId: 'amber-clutch', tx: 38, ty: 21 }
  ],
  decor: [
    // Bowl landmark: eggs gathered around a bright north wall web.
    { kind: 'egg-cluster', tx: 9, ty: 4 },
    { kind: 'egg-cluster', tx: 11, ty: 8 },
    { kind: 'resin-web', tx: 13, ty: 2, surface: 'wall' },
    // Husk gallery landmark: hanging sacs bracket the pillar field.
    { kind: 'hanging-sacs', tx: 15, ty: 10 },
    { kind: 'hanging-sacs', tx: 23, ty: 16 },
    { kind: 'spent-casings', tx: 19, ty: 24 },
    // Breach landmark: spores outline both circulation arcs.
    { kind: 'spore-patch', tx: 26, ty: 19 },
    { kind: 'spore-patch', tx: 27, ty: 10 },
    { kind: 'spore-patch', tx: 33, ty: 18 },
    { kind: 'egg-cluster', tx: 32, ty: 4 },
    // Finale landmark: webs and casings pull the eye down the broken lane.
    { kind: 'resin-web', tx: 34, ty: 3, surface: 'wall' },
    { kind: 'spent-casings', tx: 37, ty: 9 },
    { kind: 'spent-casings', tx: 40, ty: 20 },
    { kind: 'spore-patch', tx: 43, ty: 23 }
  ],
  previewExit: true,
  exit: { tx: 44, ty: 22 }
};
