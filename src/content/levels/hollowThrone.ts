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
  // A fleshy, blood-warm throne room, distinct from the violet Warrens and
  // the amber Galleries.
  theme: { wall: 0xc0707e, floor: 0xb07a80, accent: 0xff7a9a },
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
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 15, ty: 20 }
  ],
  props: [
    { typeId: 'amber-clutch', tx: 8, ty: 17 },
    { typeId: 'amber-clutch', tx: 21, ty: 17 },
    { typeId: 'resin-husk', tx: 8, ty: 3 },
    { typeId: 'resin-husk', tx: 21, ty: 3 }
  ],
  decor: [
    { kind: 'egg-cluster', tx: 13, ty: 6 },
    { kind: 'egg-cluster', tx: 17, ty: 6 },
    { kind: 'egg-cluster', tx: 12, ty: 9 },
    { kind: 'egg-cluster', tx: 18, ty: 9 },
    { kind: 'resin-web', tx: 1, ty: 1 },
    { kind: 'resin-web', tx: 28, ty: 1 },
    { kind: 'resin-web', tx: 1, ty: 20 },
    { kind: 'resin-web', tx: 28, ty: 20 },
    { kind: 'spore-patch', tx: 10, ty: 13 },
    { kind: 'spore-patch', tx: 20, ty: 13 },
    { kind: 'spore-patch', tx: 15, ty: 16 }
  ],
  // Sealed behind her: the way out opens only once Mireveil falls.
  exit: { tx: 15, ty: 1 }
};
