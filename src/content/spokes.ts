import type { SpokeDef } from '../sim/types';
import { BROOD_WARRENS } from './levels/broodWarrens';
import { COBALT_COMBS } from './levels/cobaltCombs';
import { HOLLOW_THRONE } from './levels/hollowThrone';
import { RESIN_GALLERIES } from './levels/resinGalleries';

/**
 * The mission wheel (issue #53). Each spoke is a run of missions played in
 * order, capped by a boss encounter; felling that boss opens the next spoke.
 *
 * Adding a world is a pure content change: author its levels, append a
 * `SpokeDef` naming the previous spoke in `requiresSpoke`, and pick an
 * `angleDeg` that doesn't collide. No unlock code, no scene code, and no
 * profile migration — progression derives entirely from `clearedLevels`.
 *
 * Level ids are referenced through the level defs rather than as string
 * literals so a rename is a compile error rather than a runtime surprise.
 */
export const SPOKES: readonly SpokeDef[] = [
  {
    id: 'azure-reach',
    name: 'The Azure Reach',
    // Blue is the spoke's colour *on the wheel*. The levels inside keep their
    // own palettes — the Warrens stay violet and the Galleries stay amber,
    // whose name and authored identity depend on that tint.
    accent: 0x4aa3ff,
    missions: [BROOD_WARRENS.id, RESIN_GALLERIES.id, COBALT_COMBS.id],
    boss: HOLLOW_THRONE.id,
    // The first spoke: no gate in front of it.
    angleDeg: 0
  }
];
