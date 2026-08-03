import type { LevelDef } from '../../sim/types';

/**
 * Mission 2: The Resin Galleries.
 * A larger, winding gallery in warm amber resin — tighter corridors and more
 * chambers than the Warrens. The party starts in the west hall, works through
 * three spawners (two Brood Nodes and a Husk Mound) strung along the northern
 * and eastern galleries, then reaches the south-west exit vault once every
 * spawner is destroyed. Two optional vaults hang off the central-south hall,
 * one behind a key-locked gate and one behind a breakable secret wall (#17),
 * each sealed so its treasure is reachable ONLY through that mechanic.
 *
 * 40 x 28 tiles, '#' = wall, '.' = floor. Layout + reachability/seal are
 * machine-verified; see tests/sim/level.test.ts.
 */
export const RESIN_GALLERIES: LevelDef = {
  id: 'resin-galleries',
  name: 'The Resin Galleries',
  tileSize: 32,
  mission: {
    biomeLabel: 'AMBER RESIN · GALLERIES',
    threatRating: 2,
    threatLabel: 'GUARDED',
    encounters: ['Skitterlings', 'Carapace Husks', 'Brood nodes'],
    description: 'Tight amber galleries turn husk bruisers and brood nodes into a corridor fight. Clear the three spawners before the south-west exit opens.'
  },
  // Dedicated amber-resin art replaces the old tint of the violet tiles:
  // pooled floors, luminous fissures, embedded inclusions, and layered walls.
  theme: { tileSet: 'amber-resin', accent: 0xffb020 },
  walls: [
    '########################################',
    '########################################',
    '##.......####........####.............##',
    '##.......####........####.............##',
    '##...................####.............##',
    '##.......####.........................##',
    '##.......####........####.............##',
    '####.########........####.............##',
    '####.############.#######.............##',
    '##.....##########.###############.######',
    '##.....##########.###############.######',
    '##.....##########.###############.######',
    '##.............##.###############.######',
    '##.....#######.##.##########..........##',
    '##.....#######...........###..........##',
    '##.....#######...........###..........##',
    '##.....#######...........###..........##',
    '####.#########...........###..........##',
    '####.#########........................##',
    '##.........###...........###..........##',
    '##.......................###..........##',
    '##.........###...........###..........##',
    '##........................##..........##',
    '##........##.############.##############',
    '##........#....#########...#############',
    '##........#....#########...#############',
    '###########....#########...#############',
    '########################################'
  ],
  playerSpawns: [
    { tx: 3, ty: 3 },
    { tx: 5, ty: 3 },
    { tx: 3, ty: 5 },
    { tx: 5, ty: 5 }
  ],
  generators: [
    { typeId: 'brood-node', tx: 16, ty: 4 }, // north-central gallery
    { typeId: 'husk-mound', tx: 31, ty: 5 }, // north-east chamber
    { typeId: 'brood-node', tx: 32, ty: 18 } // south-east chamber
  ],
  pickups: [
    { kind: 'gold', amount: 10, tx: 5, ty: 2 },
    { kind: 'gold', amount: 10, tx: 15, ty: 3 },
    { kind: 'gold', amount: 10, tx: 34, ty: 4 },
    { kind: 'gold', amount: 10, tx: 34, ty: 16 },
    { kind: 'gold', amount: 10, tx: 20, ty: 16 },
    { kind: 'gold', amount: 10, tx: 4, ty: 12 },
    { kind: 'gold', amount: 10, tx: 8, ty: 24 },
    { kind: 'health', amount: 30, tx: 30, ty: 3 },
    { kind: 'health', amount: 30, tx: 35, ty: 20 },
    { kind: 'health', amount: 30, tx: 16, ty: 20 },
    // Temporary power-up relics (issue #16), one of each buff, spread wide.
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 18, ty: 4 },
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 4, ty: 14 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 33, ty: 15 },
    // A single screen-clear potion (issue #41), scarce by design.
    { kind: 'potion', amount: 1, tx: 6, ty: 14 },
    // A key on the central hall, opening the gated south vault (issue #17).
    { kind: 'key', amount: 1, tx: 19, ty: 15 },
    // Treasure sealed in the two south vaults.
    { kind: 'gold', amount: 60, tx: 12, ty: 25 }, // behind a key-locked gate
    { kind: 'gold', amount: 50, tx: 25, ty: 25 } // behind a secret wall
  ],
  // Optional south vaults, off the critical path.
  gates: [{ tx: 12, ty: 23 }],
  secrets: [{ tx: 25, ty: 23 }],
  props: [
    { typeId: 'resin-husk', tx: 6, ty: 4 },
    { typeId: 'resin-husk', tx: 18, ty: 6 },
    { typeId: 'resin-husk', tx: 28, ty: 7 },
    { typeId: 'resin-husk', tx: 22, ty: 19 },
    { typeId: 'resin-husk', tx: 30, ty: 20 },
    { typeId: 'resin-husk', tx: 4, ty: 22 },
    { typeId: 'resin-husk', tx: 15, ty: 17 },
    { typeId: 'amber-clutch', tx: 35, ty: 6 },
    { typeId: 'amber-clutch', tx: 5, ty: 20 },
    { typeId: 'amber-clutch', tx: 29, ty: 14 }
  ],
  decor: [
    { kind: 'egg-cluster', tx: 15, ty: 4 },
    { kind: 'egg-cluster', tx: 33, ty: 4 },
    { kind: 'egg-cluster', tx: 34, ty: 18 },
    { kind: 'egg-cluster', tx: 30, ty: 16 },
    { kind: 'egg-cluster', tx: 17, ty: 14 },
    { kind: 'resin-web', tx: 2, ty: 2 },
    { kind: 'resin-web', tx: 37, ty: 2 },
    { kind: 'resin-web', tx: 13, ty: 2 },
    { kind: 'resin-web', tx: 24, ty: 14 },
    { kind: 'resin-web', tx: 2, ty: 24 },
    { kind: 'spore-patch', tx: 4, ty: 10 },
    { kind: 'spore-patch', tx: 20, ty: 18 },
    { kind: 'spore-patch', tx: 33, ty: 21 },
    { kind: 'spore-patch', tx: 8, ty: 22 },
    { kind: 'spore-patch', tx: 14, ty: 15 },
    { kind: 'spore-patch', tx: 36, ty: 13 }
  ],
  exit: { tx: 4, ty: 24 }
};
