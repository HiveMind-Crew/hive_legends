import type { LevelDef } from '../../sim/types';

/**
 * Mission 4 (boss): The Hollow Throne — the Realm-1 finale (issue #25,
 * expanded by #151 into a staged pre-boss approach).
 *
 * `South entry -> throne overlook/landing -> west sanctum / east sanctum
 * (either order) -> boss threshold -> Mireveil arena -> north portal`.
 *
 * The arena (rows 0-21, columns 5-34) is the original 30x22 room byte-for-byte,
 * just embedded at an offset inside the larger grid. That is deliberate, not
 * laziness: `scripts/mireveilBenchmark.ts` and `docs/COMBAT.md`'s generated
 * table pin exact per-hero tick counts for a duel fought in this room, and a
 * geometry change must not read as a balance change (issue #151's
 * implementation review). Only the south wall gained a breach so the approach
 * can connect to it; everything else — pillars, dais, corner relief, the
 * single hoarded potion — is untouched.
 *
 * The two sanctums are the approach's staged pre-boss objectives (#147) and
 * both must stay dependency-free so either can be cleared first. That is the
 * whole reason `east-sanctum-cyst` is a `skitter-cyst` and not a `brood-node`:
 * `updateEncounterActivations` wakes every dependency-ready encounter whose
 * trigger holds a living player, so a split four-player party wakes both
 * sanctums at once. A Brood Node alone caps at 15 at four players — the entire
 * readability ceiling — so it can never sit on a sanctum that has to coexist
 * with another one. `skitter-cyst` (src/content/enemies.ts) is a lower-cap
 * swarm spawner sized to 5 at four players, matching the Husk Mound's own 5,
 * so the pair sums to 10 — the same "5 + 5" budget Cobalt Combs' arms use.
 * Chaining the sanctums with `requires` was the other way to solve the cap
 * problem, but either-order clearing is an acceptance criterion, so the fix
 * had to live on the cap side.
 *
 * Mireveil herself carries `id: 'mireveil'` and `encounterId: 'boss-threshold'`.
 * That encounter `requires: ['west-sanctum', 'east-sanctum']` and triggers on
 * the corridor tile band between the landing and the arena breach. No sim
 * change was needed for this: `BossState.active` starts false whenever
 * `LevelBossDef.encounterId` is set, `updateBoss` returns immediately while
 * inactive, and `livingBoss()` makes a dormant Mireveil untargetable and
 * unable to touch, summon, or damage anyone — she is authored-inert until both
 * sanctums clear and a living player crosses the threshold.
 *
 * One optional vault hangs off each sanctum, exactly as Cobalt Combs and the
 * Warrens do: a gate behind the west sanctum needs the key sitting in the
 * landing, and a secret wall behind the east sanctum opens by force. Neither
 * vault sits on the mandatory line.
 *
 * 40 x 36 tiles, '#' = wall, '.' = floor. Geometry, both sanctum orders, the
 * derived approach budget, the co-op camera span, the hostile-cap sum, boss
 * dormancy and the preserved arena duel are machine-verified; see
 * tests/sim/hollowThrone.test.ts, tests/sim/mireveilBenchmark.test.ts and
 * tests/sim/level.test.ts.
 */
export const HOLLOW_THRONE: LevelDef = {
  id: 'hollow-throne',
  name: 'The Hollow Throne',
  tileSize: 32,
  mission: {
    biomeLabel: 'THRONE · BONE AND BROOD',
    threatRating: 4,
    threatLabel: 'EXTREME',
    encounters: ['Western Sanctum', 'Eastern Sanctum', 'Boss Threshold', 'Mireveil'],
    description:
      'Clear the twin sanctums guarding the throne approach in either order, cross the threshold once both fall quiet, and bring down Mireveil before the sealed north exit can open.'
  },
  // Dedicated grown-chitin art makes the finale read as Mireveil's brood
  // chamber instead of a tinted copy of either earlier Realm 1 room.
  theme: { tileSet: 'hollow-throne', accent: 0xff7a9a },
  // The portal is a landmark before it is an exit — visible in dimmed preview
  // from the approach, the same treatment the Warrens and the Combs use.
  previewExit: true,
  walls: [
    '########################################',
    '######............................######',
    '######............................######',
    '######............................######',
    '######.....####..........####.....######',
    '######.....####..........####.....######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######.....####..........####.....######',
    '######.....####..........####.....######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '######............................######',
    '##################....##################',
    '################........################',
    '##..........####........####..........##',
    '##....................................##',
    '##....................................##',
    '##....................................##',
    '##....................................##',
    '##..........######....######..........##',
    '##..........######....######..........##',
    '#####.############....############.#####',
    '###.....##########....##########.....###',
    '###.....######............######.....###',
    '##############............##############',
    '##############............##############',
    '########################################'
  ],
  // A protected south entry, well clear of both sanctums, with a straight
  // sightline north up the spine toward the lit threshold and the dais beyond.
  playerSpawns: [
    { tx: 18, ty: 33 },
    { tx: 20, ty: 33 },
    { tx: 18, ty: 34 },
    { tx: 20, ty: 34 }
  ],
  generators: [
    // Husk Mound sanctum: its on-death Ravager previews finale-level danger.
    { id: 'west-sanctum-mound', typeId: 'husk-mound', tx: 6, ty: 26, encounterId: 'west-sanctum' },
    // Skitter Cyst sanctum: swarm pressure at a cap sized to coexist with the
    // Husk Mound above (see the file header for the arithmetic).
    { id: 'east-sanctum-cyst', typeId: 'skitter-cyst', tx: 33, ty: 26, encounterId: 'east-sanctum' }
  ],
  encounters: [
    // Both sanctums are dependency-free so either may be entered first.
    { id: 'west-sanctum', trigger: { kind: 'region', minTx: 2, minTy: 23, maxTx: 11, maxTy: 29 } },
    { id: 'east-sanctum', trigger: { kind: 'region', minTx: 28, minTy: 23, maxTx: 37, maxTy: 29 } },
    // The boss threshold wakes Mireveil only once both sanctums are down and
    // a living player crosses the corridor into the arena breach.
    {
      id: 'boss-threshold',
      requires: ['west-sanctum', 'east-sanctum'],
      trigger: { kind: 'region', minTx: 16, minTy: 22, maxTx: 23, maxTy: 23 }
    }
  ],
  // The arena keeps its original relative position inside the preserved
  // 30x22 room (offset +5 columns into the wider grid); see the file header.
  boss: { id: 'mireveil', typeId: 'mireveil', tx: 20, ty: 8, encounterId: 'boss-threshold' },
  pickups: [
    // South approach: a gold trail reads the spine north, then splits toward
    // whichever sanctum the party picks first.
    { kind: 'gold', amount: 10, tx: 19, ty: 34 },
    { kind: 'gold', amount: 10, tx: 19, ty: 30 },
    { kind: 'gold', amount: 10, tx: 14, ty: 25 },
    { kind: 'gold', amount: 10, tx: 25, ty: 25 },
    { kind: 'gold', amount: 10, tx: 9, ty: 24 },
    { kind: 'gold', amount: 10, tx: 30, ty: 24 },
    // Relief past each sanctum's peak, not before it.
    { kind: 'health', amount: 30, tx: 9, ty: 28 },
    { kind: 'health', amount: 30, tx: 30, ty: 28 },
    // The key sits in the landing, visible well before the gate it opens —
    // both sanctums are reachable without it, so it costs nothing mandatory.
    { kind: 'key', amount: 1, tx: 19, ty: 25 },
    // One optional vault off each sanctum; neither strands the other.
    { kind: 'gold', amount: 55, tx: 5, ty: 31 },
    { kind: 'gold', amount: 50, tx: 34, ty: 31 },
    // Arena relief, tucked into the corners exactly as before — topping up
    // still costs ground. Unchanged from the original room but shifted +5
    // columns with it.
    { kind: 'health', amount: 30, tx: 7, ty: 2 },
    { kind: 'health', amount: 30, tx: 32, ty: 2 },
    { kind: 'health', amount: 30, tx: 7, ty: 19 },
    { kind: 'health', amount: 30, tx: 32, ty: 19 },
    { kind: 'gold', amount: 15, tx: 17, ty: 12 },
    { kind: 'gold', amount: 15, tx: 23, ty: 12 },
    // One relic of each buff, spread so grabbing one is a real detour.
    { kind: 'powerup', amount: 0, power: 'frenzy', tx: 9, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'ward', tx: 30, ty: 10 },
    { kind: 'powerup', amount: 0, power: 'swiftness', tx: 20, ty: 20 },
    // A single Hive-Fire Draught (#41), same as before: the finale is exactly
    // the fight worth hoarding a screen-clear for. The approach hands out no
    // second one — no free reset immediately before Mireveil.
    { kind: 'potion', amount: 1, tx: 20, ty: 17 }
  ],
  gates: [{ tx: 5, ty: 30 }],
  secrets: [{ tx: 34, ty: 30 }],
  props: [
    // Approach
    { typeId: 'amber-clutch', tx: 19, ty: 33 },
    { typeId: 'resin-husk', tx: 14, ty: 24 },
    { typeId: 'resin-husk', tx: 27, ty: 24 },
    { typeId: 'resin-husk', tx: 10, ty: 27 },
    { typeId: 'resin-husk', tx: 29, ty: 27 },
    // Arena, unchanged from the original room but shifted +5 columns with it.
    { typeId: 'amber-clutch', tx: 13, ty: 17 },
    { typeId: 'amber-clutch', tx: 26, ty: 17 },
    { typeId: 'resin-husk', tx: 13, ty: 3 },
    { typeId: 'resin-husk', tx: 26, ty: 3 }
  ],
  decor: [
    // Approach landmarks — generic keys only; the finale still owns none of
    // the three Realm 1-only dressing kinds.
    { kind: 'hanging-sacs', tx: 6, ty: 23 },
    { kind: 'hanging-sacs', tx: 33, ty: 23 },
    { kind: 'hanging-sacs', tx: 14, ty: 26 },
    { kind: 'hanging-sacs', tx: 25, ty: 26 },
    { kind: 'spent-casings', tx: 19, ty: 29 },
    { kind: 'spent-casings', tx: 20, ty: 22 },
    // The dais sits beneath Mireveil; the boss sprite is rendered above it.
    { kind: 'throne-dais', tx: 20, ty: 8 },
    // These four are the same solid landmarks as the collision pillars, now
    // dressed as grown brood-throne columns without entering the sim.
    // Unchanged from the original room but shifted +5 columns with it.
    { kind: 'throne-pillar', tx: 11, ty: 4, surface: 'wall' },
    { kind: 'throne-pillar', tx: 25, ty: 4, surface: 'wall' },
    { kind: 'throne-pillar', tx: 11, ty: 14, surface: 'wall' },
    { kind: 'throne-pillar', tx: 25, ty: 14, surface: 'wall' },
    // Quiet environmental evidence of the final brood cycle.
    { kind: 'hanging-sacs', tx: 8, ty: 4 },
    { kind: 'hanging-sacs', tx: 32, ty: 4 },
    { kind: 'hanging-sacs', tx: 8, ty: 17 },
    { kind: 'hanging-sacs', tx: 32, ty: 17 },
    { kind: 'spent-casings', tx: 16, ty: 11 },
    { kind: 'spent-casings', tx: 24, ty: 11 },
    { kind: 'spent-casings', tx: 18, ty: 16 },
    { kind: 'spent-casings', tx: 22, ty: 16 }
  ],
  // Sealed behind her: the way out opens only once Mireveil falls.
  exit: { tx: 20, ty: 1 }
};
