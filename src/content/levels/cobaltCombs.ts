import type { LevelDef } from '../../sim/types';

/**
 * Mission 3: The Cobalt Combs — a south-east-to-north-west braided dungeon
 * (issue #148), and still the last stop of The Azure Reach before Mireveil.
 *
 * The first two Reach maps travel in a straight line. This one forks. From the
 * south-east staging comb the route splits at a single wide landmark into two
 * arms that may be cleared in either order:
 *
 *   SE staging -> fork -> husk arm (west) / spitter arm (north)
 *              -> merge -> north breach -> NW portal
 *
 * The arms answer different combat questions rather than mirroring each other:
 * the husk arm is a low, cover-dense hall where the realm's one Husk Mound
 * releases its Ravager at close quarters; the spitter arm is a tall gallery of
 * lateral cover bars that break the ranged nest's sightlines. Each arm's far
 * end opens forward into the central merge, so resolving one never sends the
 * party back through the fork — the braid closes itself.
 *
 * Two constraints shape the objective layout, and neither is guessable:
 *
 * 1. Both arms are dependency-free, so a split four-player party can wake both
 *    at once. Their caps therefore have to sum under the 15-enemy readability
 *    ceiling: Husk Mound (5 at four players) + Spitter Nest (5) = 10. A Brood
 *    Node alone caps at 15 and can never sit on an arm.
 * 2. For the same reason the merge Brood Node requires *both* arms cleared, and
 *    the breach requires the merge, so the 15-cap node is never co-active with
 *    anything else. That also makes the final chamber a single Spitter Nest
 *    rather than the mixed pair first sketched on #148 — Brood Node + Spitter
 *    Nest is 20 and cannot be made readable at four players.
 *
 * All three families stay mandatory, and exactly one Husk Mound means exactly
 * one on-death elite. Cobalt's best trait is preserved: the last nest is six
 * tiles from the portal.
 *
 * 48 x 36 tiles, '#' = wall, '.' = floor. Geometry, both arm orders, pinch
 * widths, vault seals and the co-op camera span are machine-verified; see
 * tests/sim/cobaltCombs.test.ts and tests/sim/level.test.ts.
 */
export const COBALT_COMBS: LevelDef = {
  id: 'cobalt-combs',
  name: 'The Cobalt Combs',
  tileSize: 32,
  mission: {
    biomeLabel: 'COBALT COMB · CRYSTALLINE',
    threatRating: 3,
    threatLabel: 'DANGEROUS',
    encounters: ['Husk Arm', 'Spitter Arm', 'Cobalt Merge', 'North Breach'],
    description: 'Cobalt comb-work forks in two. Break the close arm and the ranged arm in either order, put down the swarm where they meet, and breach north-west to the portal.'
  },
  // Dedicated cold, hard comb-work replaces the former blue tint over the
  // Warrens tiles. This is the blue the Azure Reach is named for.
  theme: { tileSet: 'cobalt-combs', accent: 0x4aa3ff },
  walls: [
    '################################################',
    '################################################',
    '################################################',
    '##....##....##.##.##############################',
    '##..........##.##.#######################...####',
    '##................#######################...####',
    '##................#######################...####',
    '##....##..................###############...####',
    '##....##..................###############...####',
    '########..##..............################.#####',
    '########..##......#####...######.............###',
    '#######################...######.............###',
    '###########.........................####.....###',
    '###########...............................######',
    '###########....###........................######',
    '###########....###........................######',
    '###########..................................###',
    '########.............###....####...######....###',
    '########.............###....####.......##....###',
    '########....................####.......##....###',
    '########....................###.....############',
    '########.....##################.....############',
    '########.....##################.....############',
    '########.....##################.....############',
    '#######...........#############.....############',
    '#######...........#############.....############',
    '#######....##.....#############.....############',
    '#######....##........................###########',
    '###...#.......................................##',
    '###.............##............................##',
    '###...#.........##......##....................##',
    '###...#...##............##....................##',
    '#######...##.........#########..##............##',
    '#######..............#########..##............##',
    '#####################################.........##',
    '################################################'
  ],
  // South-east staging comb: the party starts furthest from the portal and
  // travels diagonally away from it.
  playerSpawns: [
    { tx: 40, ty: 30 },
    { tx: 42, ty: 30 },
    { tx: 40, ty: 32 },
    { tx: 42, ty: 32 }
  ],
  generators: [
    // Either arm may be taken first; both caps are small enough to co-exist.
    { id: 'husk-arm-mound', typeId: 'husk-mound', tx: 14, ty: 29, encounterId: 'husk-arm' },
    { id: 'spitter-arm-nest', typeId: 'spitter-nest', tx: 41, ty: 12, encounterId: 'spitter-arm' },
    // The merge turns the two arms back into one forward path.
    { id: 'merge-brood-node', typeId: 'brood-node', tx: 19, ty: 16, encounterId: 'merge' },
    // Ranged pressure for the last room, six tiles from the portal.
    { id: 'breach-nest', typeId: 'spitter-nest', tx: 9, ty: 6, encounterId: 'breach' }
  ],
  encounters: [
    { id: 'husk-arm', trigger: { kind: 'region', minTx: 12, minTy: 27, maxTx: 19, maxTy: 32 } },
    { id: 'spitter-arm', trigger: { kind: 'region', minTx: 36, minTy: 11, maxTx: 43, maxTy: 17 } },
    {
      id: 'merge',
      requires: ['husk-arm', 'spitter-arm'],
      trigger: { kind: 'region', minTx: 14, minTy: 13, maxTx: 26, maxTy: 19 }
    },
    {
      id: 'breach',
      requires: ['merge'],
      trigger: { kind: 'region', minTx: 8, minTy: 3, maxTx: 17, maxTy: 9 }
    }
  ],
  pickups: [
    // Gold trail that reads north-west through the fork, both arms, and the breach.
    { kind: 'gold', amount: 10, tx: 42, ty: 31 },
    { kind: 'gold', amount: 10, tx: 34, ty: 28 },
    { kind: 'gold', amount: 10, tx: 22, ty: 28 },
    { kind: 'gold', amount: 10, tx: 10, ty: 29 },
    { kind: 'gold', amount: 10, tx: 9, ty: 20 },
    { kind: 'gold', amount: 10, tx: 33, ty: 24 },
    { kind: 'gold', amount: 10, tx: 38, ty: 13 },
    { kind: 'gold', amount: 10, tx: 25, ty: 16 },
    { kind: 'gold', amount: 10, tx: 24, ty: 9 },
    { kind: 'gold', amount: 10, tx: 12, ty: 7 },
    // Relief past the Ravager release, in the ranged gallery, and at the breach.
    { kind: 'health', amount: 30, tx: 8, ty: 29 },
    { kind: 'health', amount: 30, tx: 43, ty: 17 },
    { kind: 'health', amount: 30, tx: 13, ty: 5 },
    // One relic each, none on the mandatory line.
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 14, ty: 32 },
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 19, ty: 18 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 35, ty: 19 },
    // The screen-clear potion sits after the merge and before the breach threshold.
    { kind: 'potion', amount: 1, tx: 24, ty: 10 },
    // The key is visible on the fork, well before the gate it opens.
    { kind: 'key', amount: 1, tx: 20, ty: 27 },
    // One optional vault off each arm, each sealed by its own mechanic.
    { kind: 'gold', amount: 60, tx: 4, ty: 29 }, // husk arm, behind a key-locked gate
    { kind: 'gold', amount: 50, tx: 42, ty: 5 } // spitter arm, behind a secret wall
  ],
  gates: [{ tx: 6, ty: 29 }],
  secrets: [{ tx: 42, ty: 9 }],
  props: [
    { typeId: 'resin-husk', tx: 9, ty: 7 },
    { typeId: 'resin-husk', tx: 16, ty: 6 },
    { typeId: 'resin-husk', tx: 20, ty: 17 },
    { typeId: 'resin-husk', tx: 26, ty: 19 },
    { typeId: 'resin-husk', tx: 37, ty: 15 },
    { typeId: 'resin-husk', tx: 40, ty: 13 },
    { typeId: 'resin-husk', tx: 15, ty: 26 },
    { typeId: 'resin-husk', tx: 28, ty: 29 },
    { typeId: 'resin-husk', tx: 40, ty: 33 },
    { typeId: 'resin-husk', tx: 33, ty: 22 },
    { typeId: 'amber-clutch', tx: 12, ty: 10 },
    { typeId: 'amber-clutch', tx: 34, ty: 20 },
    { typeId: 'amber-clutch', tx: 11, ty: 33 }
  ],
  decor: [
    // Fork landmark: the choice reads as one lit comb mouth with two throats.
    { kind: 'egg-cluster', tx: 30, ty: 30 },
    { kind: 'spore-patch', tx: 27, ty: 28 },
    { kind: 'resin-web', tx: 29, ty: 33, surface: 'wall' },
    // Husk arm: low, crowded, close cover — sacs and casings hug the walls.
    { kind: 'hanging-sacs', tx: 13, ty: 25 },
    { kind: 'hanging-sacs', tx: 9, ty: 31 },
    { kind: 'spent-casings', tx: 16, ty: 28 },
    { kind: 'egg-cluster', tx: 8, ty: 24 },
    // Spitter arm: tall gallery, spores strung along the lateral cover bars.
    { kind: 'spore-patch', tx: 34, ty: 13 },
    { kind: 'spore-patch', tx: 38, ty: 18 },
    { kind: 'spent-casings', tx: 43, ty: 16 },
    { kind: 'resin-web', tx: 30, ty: 11, surface: 'wall' },
    // Merge: the two islands the swarm has to split around.
    { kind: 'egg-cluster', tx: 16, ty: 16 },
    { kind: 'egg-cluster', tx: 23, ty: 16 },
    { kind: 'spore-patch', tx: 12, ty: 19 },
    { kind: 'resin-web', tx: 22, ty: 21, surface: 'wall' },
    // Breach and portal: cold light gathers on the last room.
    { kind: 'spent-casings', tx: 20, ty: 8 },
    { kind: 'egg-cluster', tx: 11, ty: 4 },
    { kind: 'spore-patch', tx: 15, ty: 5 },
    { kind: 'resin-web', tx: 6, ty: 3, surface: 'wall' }
  ],
  // The portal is a landmark before it is an exit — it is the north-west thing
  // the whole diagonal points at.
  previewExit: true,
  exit: { tx: 4, ty: 5 }
};
