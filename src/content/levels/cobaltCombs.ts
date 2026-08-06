import type { LevelDef } from '../../sim/types';

/**
 * Mission 3: The Cobalt Combs — the last stop of The Azure Reach before
 * Mireveil (issue #55).
 *
 * Cold blue comb-work, and the first map to field all three enemy families at
 * once: a Brood Node in the north comb, a Husk Mound in the north-east (whose
 * wreckage births the realm's one elite), and a Spitter Nest in the south hall.
 * That mix, rather than a fourth spawner, is where the step up from the
 * Galleries comes from — ranged pressure the earlier realms never applied.
 *
 * The party starts in the north-west comb, works clockwise, and leaves by the
 * south-central hall once every spawner is down. Two optional vaults hang off
 * the southern combs — one behind a key-locked gate, one behind a breakable
 * secret wall (#17) — each sealed so its treasure is reachable ONLY through
 * that mechanic.
 *
 * 38 x 26 tiles, '#' = wall, '.' = floor. Layout, reachability and vault seals
 * are machine-verified; see tests/sim/level.test.ts.
 */
export const COBALT_COMBS: LevelDef = {
  id: 'cobalt-combs',
  name: 'The Cobalt Combs',
  tileSize: 32,
  mission: {
    biomeLabel: 'COBALT COMB · CRYSTALLINE',
    threatRating: 3,
    threatLabel: 'DANGEROUS',
    encounters: ['Bile Spitters', 'Carapace Husks', 'All three nest types'],
    description: 'Cobalt comb-work fields every enemy family at once. Break the mixed-range nests, survive the elite guardian, and leave through the south hall.'
  },
  // Dedicated cold, hard comb-work replaces the former blue tint over the
  // Warrens tiles. This is the blue the Azure Reach is named for.
  theme: { tileSet: 'cobalt-combs', accent: 0x4aa3ff },
  walls: [
    '######################################',
    '######################################',
    '##.......####........####...........##',
    '##.......####........####...........##',
    '##.......####........####...........##',
    '##.......####........####...........##',
    '##...................####...........##',
    '##.......####.......................##',
    '#####.###########.############.#######',
    '#####.###########.############.#######',
    '##..................................##',
    '##............########..............##',
    '##............########..............##',
    '##............########..............##',
    '##..................................##',
    '##....####..................####....##',
    '##..................................##',
    '########.###########.###########.#####',
    '########.###########.###########.#####',
    '##..........##............##........##',
    '##..........##............##........##',
    '##..........##............##........##',
    '##..........##............##........##',
    '#####.##########################.#####',
    '###.....######################.....###',
    '######################################'
  ],
  playerSpawns: [
    { tx: 3, ty: 3 },
    { tx: 5, ty: 3 },
    { tx: 3, ty: 5 },
    { tx: 5, ty: 5 }
  ],
  // All three families, one spawner each — the Combs' signature.
  generators: [
    { id: 'north-brood-node', typeId: 'brood-node', tx: 16, ty: 4 }, // north comb: the skitterling swarm
    { id: 'east-husk-mound', typeId: 'husk-mound', tx: 30, ty: 4 }, // north-east: bruisers, and the realm's elite on death
    { id: 'south-spitter-nest', typeId: 'spitter-nest', tx: 19, ty: 20 } // south hall: ranged pressure, new to the Reach
  ],
  pickups: [
    { kind: 'gold', amount: 10, tx: 4, ty: 2 },
    { kind: 'gold', amount: 10, tx: 18, ty: 3 },
    { kind: 'gold', amount: 10, tx: 33, ty: 3 },
    { kind: 'gold', amount: 10, tx: 3, ty: 12 },
    { kind: 'gold', amount: 10, tx: 25, ty: 12 },
    { kind: 'gold', amount: 10, tx: 16, ty: 20 },
    { kind: 'gold', amount: 10, tx: 30, ty: 20 },
    { kind: 'health', amount: 30, tx: 26, ty: 5 },
    { kind: 'health', amount: 30, tx: 10, ty: 14 },
    { kind: 'health', amount: 30, tx: 5, ty: 20 },
    // One of each relic (issue #16), spread so no single sweep collects them.
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 7, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 17, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 33, ty: 16 },
    // A single screen-clear potion (issue #41), scarce by design.
    { kind: 'potion', amount: 1, tx: 24, ty: 14 },
    // The key sits on the central hall, well before the gate it opens.
    { kind: 'key', amount: 1, tx: 12, ty: 16 },
    // Treasure sealed in the two south vaults.
    { kind: 'gold', amount: 60, tx: 5, ty: 24 }, // behind a key-locked gate
    { kind: 'gold', amount: 50, tx: 32, ty: 24 } // behind a secret wall
  ],
  // Optional south vaults, off the critical path.
  gates: [{ tx: 5, ty: 23 }],
  secrets: [{ tx: 32, ty: 23 }],
  props: [
    { typeId: 'resin-husk', tx: 6, ty: 3 },
    { typeId: 'resin-husk', tx: 15, ty: 6 },
    { typeId: 'resin-husk', tx: 28, ty: 6 },
    { typeId: 'resin-husk', tx: 11, ty: 12 },
    { typeId: 'resin-husk', tx: 24, ty: 16 },
    { typeId: 'resin-husk', tx: 9, ty: 20 },
    { typeId: 'resin-husk', tx: 22, ty: 19 },
    { typeId: 'amber-clutch', tx: 34, ty: 7 },
    { typeId: 'amber-clutch', tx: 3, ty: 16 },
    { typeId: 'amber-clutch', tx: 31, ty: 20 }
  ],
  decor: [
    { kind: 'egg-cluster', tx: 15, ty: 3 },
    { kind: 'egg-cluster', tx: 31, ty: 3 },
    { kind: 'egg-cluster', tx: 17, ty: 4 },
    { kind: 'egg-cluster', tx: 18, ty: 21 },
    { kind: 'resin-web', tx: 2, ty: 2 },
    { kind: 'resin-web', tx: 35, ty: 2 },
    { kind: 'resin-web', tx: 2, ty: 10 },
    { kind: 'resin-web', tx: 35, ty: 14 },
    { kind: 'spore-patch', tx: 7, ty: 7 },
    { kind: 'spore-patch', tx: 13, ty: 10 },
    { kind: 'spore-patch', tx: 29, ty: 12 },
    { kind: 'spore-patch', tx: 6, ty: 19 },
    { kind: 'spore-patch', tx: 20, ty: 22 },
    { kind: 'spore-patch', tx: 33, ty: 22 }
  ],
  exit: { tx: 22, ty: 21 }
};
