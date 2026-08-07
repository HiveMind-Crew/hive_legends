import type { LevelDef } from '../../sim/types';

/**
 * Mission 2: The Resin Galleries.
 *
 * A south-to-north amber-resin expedition with four dependency-staged
 * landings. Wide combat galleries alternate left and right around short,
 * offset ascents, while opposite-side reward branches loop forward through
 * the cross-gallery instead of returning the party to the south staging room.
 *
 * 42 x 42 tiles, '#' = wall, '.' = floor.
 */
export const RESIN_GALLERIES: LevelDef = {
  id: 'resin-galleries',
  name: 'The Resin Galleries',
  tileSize: 32,
  mission: {
    biomeLabel: 'AMBER RESIN · ASCENT',
    threatRating: 2,
    threatLabel: 'GUARDED',
    encounters: ['Lower Brood Basin', 'Husk Kiln', 'Upper Brood Gallery', 'Crown Brood Chamber'],
    description: 'Climb four waking galleries from the south basin to the portal light above the crown brood chamber.'
  },
  theme: { tileSet: 'amber-resin', accent: 0xffb020 },
  walls: [
    '##########################################',
    '################################.....#####',
    '################################.....#####',
    '####################...................###',
    '####################...................###',
    '####################...................###',
    '####################......###..........###',
    '####################......###..........###',
    '####################..........###......###',
    '##################............###......###',
    '##################.....................###',
    '##################.....................###',
    '##################.....................###',
    '###....................###################',
    '###....................###################',
    '###....................###################',
    '###........###.........###################',
    '###........###........####################',
    '###..............................#########',
    '###...............................########',
    '###....#...........................#######',
    '#######................#######....########',
    '########...............................###',
    '#########..............................###',
    '####################...................###',
    '####################.....###..###......###',
    '####################.....###..###......###',
    '####################...................###',
    '################.......................###',
    '################.......................###',
    '################.....#####################',
    '###..................#####################',
    '###..................#####################',
    '###................#######################',
    '###......####......#######################',
    '###......####......#######################',
    '###......####..............###############',
    '###........................###############',
    '###........................###############',
    '###........................###############',
    '################...........###############',
    '##########################################'
  ],
  playerSpawns: [
    { tx: 21, ty: 38 },
    { tx: 23, ty: 38 },
    { tx: 21, ty: 40 },
    { tx: 23, ty: 40 }
  ],
  generators: [
    { id: 'lower-brood-basin', typeId: 'brood-node', tx: 6, ty: 34, encounterId: 'lower-basin' },
    { id: 'husk-kiln-mound', typeId: 'husk-mound', tx: 35, ty: 25, encounterId: 'husk-kiln' },
    { id: 'upper-west-brood', typeId: 'brood-node', tx: 6, ty: 16, encounterId: 'upper-west' },
    { id: 'crown-brood-node', typeId: 'brood-node', tx: 35, ty: 7, encounterId: 'crown-brood' }
  ],
  encounters: [
    {
      id: 'lower-basin',
      trigger: { kind: 'region', minTx: 14, minTy: 33, maxTx: 18, maxTy: 39 }
    },
    {
      id: 'husk-kiln',
      requires: ['lower-basin'],
      trigger: { kind: 'region', minTx: 20, minTy: 27, maxTx: 24, maxTy: 29 }
    },
    {
      id: 'upper-west',
      requires: ['husk-kiln'],
      trigger: { kind: 'region', minTx: 18, minTy: 18, maxTx: 22, maxTy: 23 }
    },
    {
      id: 'crown-brood',
      requires: ['upper-west'],
      trigger: { kind: 'region', minTx: 18, minTy: 10, maxTx: 22, maxTy: 15 }
    }
  ],
  pickups: [
    // Gold pulls the eye upward through each offset connector and landing.
    { kind: 'gold', amount: 10, tx: 22, ty: 37 },
    { kind: 'gold', amount: 10, tx: 15, ty: 33 },
    { kind: 'gold', amount: 10, tx: 18, ty: 29 },
    { kind: 'gold', amount: 10, tx: 25, ty: 28 },
    { kind: 'gold', amount: 10, tx: 35, ty: 23 },
    { kind: 'gold', amount: 10, tx: 29, ty: 20 },
    { kind: 'gold', amount: 10, tx: 18, ty: 19 },
    { kind: 'gold', amount: 10, tx: 14, ty: 15 },
    { kind: 'gold', amount: 10, tx: 21, ty: 11 },
    { kind: 'gold', amount: 10, tx: 29, ty: 10 },
    { kind: 'gold', amount: 10, tx: 34, ty: 4 },
    // Recovery sits after pressure peaks rather than inside objective pockets.
    { kind: 'health', amount: 30, tx: 17, ty: 31 },
    { kind: 'health', amount: 30, tx: 21, ty: 19 },
    { kind: 'health', amount: 30, tx: 22, ty: 11 },
    // The cross-gallery key supports the west gate choice on the same ascent.
    { kind: 'key', amount: 1, tx: 24, ty: 23 },
    // Opposite optional branches: gated west cache and hidden east cache.
    { kind: 'gold', amount: 60, tx: 7, ty: 21 },
    { kind: 'gold', amount: 50, tx: 34, ty: 20 },
    // Region-specific relics reward reading each landing's side space.
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 4, ty: 38 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 37, ty: 28 },
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 4, ty: 14 },
    // The potion is collected after the upper-west fight, before the crown.
    { kind: 'potion', amount: 1, tx: 16, ty: 14 }
  ],
  gates: [{ tx: 7, ty: 21 }],
  secrets: [{ tx: 33, ty: 20 }],
  props: [
    { typeId: 'resin-husk', tx: 4, ty: 32 },
    { typeId: 'resin-husk', tx: 15, ty: 38 },
    { typeId: 'amber-clutch', tx: 17, ty: 32 },
    { typeId: 'resin-husk', tx: 23, ty: 24 },
    { typeId: 'resin-husk', tx: 28, ty: 28 },
    { typeId: 'resin-husk', tx: 37, ty: 23 },
    { typeId: 'amber-clutch', tx: 34, ty: 28 },
    { typeId: 'resin-husk', tx: 5, ty: 19 },
    { typeId: 'resin-husk', tx: 16, ty: 18 },
    { typeId: 'amber-clutch', tx: 19, ty: 14 },
    { typeId: 'resin-husk', tx: 23, ty: 5 },
    { typeId: 'resin-husk', tx: 29, ty: 11 },
    { typeId: 'resin-husk', tx: 37, ty: 10 },
    { typeId: 'amber-clutch', tx: 35, ty: 11 }
  ],
  decor: [
    // Lower basin: low eggs, pooled spores, and a hard south resin curtain.
    { kind: 'egg-cluster', tx: 5, ty: 33 },
    { kind: 'spore-patch', tx: 4, ty: 37 },
    { kind: 'hanging-sacs', tx: 17, ty: 37 },
    { kind: 'resin-web', tx: 15, ty: 40, surface: 'wall' },
    // Husk kiln and cross-gallery: embedded bodies and paired side silhouettes.
    { kind: 'hanging-sacs', tx: 22, ty: 25 },
    { kind: 'spent-casings', tx: 28, ty: 23 },
    { kind: 'spore-patch', tx: 34, ty: 28 },
    { kind: 'resin-web', tx: 7, ty: 20, surface: 'wall' },
    { kind: 'resin-web', tx: 35, ty: 20, surface: 'wall' },
    // Upper west: dense eggs around the cover island.
    { kind: 'egg-cluster', tx: 5, ty: 14 },
    { kind: 'egg-cluster', tx: 18, ty: 18 },
    { kind: 'spent-casings', tx: 9, ty: 18 },
    { kind: 'spore-patch', tx: 15, ty: 19 },
    // Crown: brighter open floor and portal-facing resin formations.
    { kind: 'egg-cluster', tx: 34, ty: 5 },
    { kind: 'egg-cluster', tx: 36, ty: 8 },
    { kind: 'hanging-sacs', tx: 22, ty: 11 },
    { kind: 'resin-web', tx: 31, ty: 2, surface: 'wall' }
  ],
  previewExit: true,
  exit: { tx: 34, ty: 1 }
};
