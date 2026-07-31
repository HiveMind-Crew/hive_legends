import type { LevelDef } from '../../sim/types';

/**
 * Mission 3: The Hollow Throne — the Realm-1 finale (issue #25).
 * No spawners here: the objective *is* Mireveil, Mother of the Brood, who
 * broods at the centre of her chamber. The exit north stays shut while she
 * lives.
 *
 * The room is deliberately open with four pillars: the fight is built around
 * circling (she is slower than every hero), and the pillars give cover from
 * her spat globs without ever boxing the player in.
 *
 * 30 x 22 tiles, '#' = wall, '.' = floor.
 */
export const HOLLOW_THRONE: LevelDef = {
  id: 'hollow-throne',
  name: 'The Hollow Throne',
  tileSize: 32,
  // Dedicated grown-chitin art makes the finale read as Mireveil's brood
  // chamber instead of a tinted copy of either earlier Realm 1 room.
  theme: { tileSet: 'hollow-throne', accent: 0xff7a9a },
  walls: [
    '##############################',
    '#............................#',
    '#............................#',
    '#............................#',
    '#.....####..........####.....#',
    '#.....####..........####.....#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#.....####..........####.....#',
    '#.....####..........####.....#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '#............................#',
    '##############################'
  ],
  playerSpawns: [
    { tx: 14, ty: 19 },
    { tx: 16, ty: 19 },
    { tx: 14, ty: 18 },
    { tx: 16, ty: 18 }
  ],
  // The boss is the objective; this realm has no spawners of its own.
  generators: [],
  boss: { typeId: 'mireveil', tx: 15, ty: 8 },
  pickups: [
    // Relief tucked into the corners, so topping up costs you ground.
    { kind: 'health', amount: 30, tx: 2, ty: 2 },
    { kind: 'health', amount: 30, tx: 27, ty: 2 },
    { kind: 'health', amount: 30, tx: 2, ty: 19 },
    { kind: 'health', amount: 30, tx: 27, ty: 19 },
    { kind: 'gold', amount: 15, tx: 12, ty: 12 },
    { kind: 'gold', amount: 15, tx: 18, ty: 12 },
    // One relic of each buff, spread so grabbing one is a real detour.
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 4, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 25, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 15, ty: 20 },
    // A single Hive-Fire Draught (#41): the finale is exactly the fight worth
    // hoarding a screen-clear for — it clears her brood, or bites her directly.
    { kind: 'potion', amount: 1, tx: 15, ty: 17 }
  ],
  props: [
    { typeId: 'amber-clutch', tx: 8, ty: 17 },
    { typeId: 'amber-clutch', tx: 21, ty: 17 },
    { typeId: 'resin-husk', tx: 8, ty: 3 },
    { typeId: 'resin-husk', tx: 21, ty: 3 }
  ],
  decor: [
    // The dais sits beneath Mireveil; the boss sprite is rendered above it.
    { kind: 'throne-dais', tx: 15, ty: 8 },
    // These four are the same solid landmarks as the collision pillars, now
    // dressed as grown brood-throne columns without entering the sim.
    { kind: 'throne-pillar', tx: 6, ty: 4, surface: 'wall' },
    { kind: 'throne-pillar', tx: 20, ty: 4, surface: 'wall' },
    { kind: 'throne-pillar', tx: 6, ty: 14, surface: 'wall' },
    { kind: 'throne-pillar', tx: 20, ty: 14, surface: 'wall' },
    // Quiet environmental evidence of the final brood cycle.
    { kind: 'hanging-sacs', tx: 3, ty: 4 },
    { kind: 'hanging-sacs', tx: 27, ty: 4 },
    { kind: 'hanging-sacs', tx: 3, ty: 17 },
    { kind: 'hanging-sacs', tx: 27, ty: 17 },
    { kind: 'spent-casings', tx: 11, ty: 11 },
    { kind: 'spent-casings', tx: 19, ty: 11 },
    { kind: 'spent-casings', tx: 13, ty: 16 },
    { kind: 'spent-casings', tx: 17, ty: 16 }
  ],
  // Sealed behind her: the way out opens only once Mireveil falls.
  exit: { tx: 15, ty: 1 }
};
