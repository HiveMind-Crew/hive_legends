import type { LevelDef } from '../../sim/types';

/**
 * Mission 1: The Brood Warrens.
 * A compact three-chamber warren. The party starts in the west hall, fights
 * through two Brood Nodes in the eastern chambers, then reaches the exit in
 * the south-west vault once every node is destroyed.
 *
 * 32 x 24 tiles, '#' = wall, '.' = floor.
 */
export const BROOD_WARRENS: LevelDef = {
  id: 'brood-warrens',
  name: 'The Brood Warrens',
  tileSize: 32,
  walls: [
    '################################',
    '#..............#...............#',
    '#..............#...............#',
    '#..............#...............#',
    '#..............#...............#',
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
    { typeId: 'brood-node', tx: 24, ty: 5 },
    { typeId: 'brood-node', tx: 24, ty: 15 }
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
    { kind: 'health', amount: 30, tx: 16, ty: 6 }
  ],
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
