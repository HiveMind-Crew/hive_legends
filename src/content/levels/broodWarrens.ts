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
    '#..............#######..########',
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
    { kind: 'health', amount: 30, tx: 10, ty: 20 }
  ],
  exit: { tx: 3, ty: 20 }
};
