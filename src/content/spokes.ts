import type { SpokeDef, TeaserSpokeDef } from '../sim/types';
import { BROOD_WARRENS } from './levels/broodWarrens';
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
    // Third mission pending (issue #55); the content test relaxes to >= 2
    // until it lands, then tightens to exactly 3.
    missions: [BROOD_WARRENS.id, RESIN_GALLERIES.id],
    boss: HOLLOW_THRONE.id,
    // The first spoke: no gate in front of it.
    angleDeg: 0
  }
];

/**
 * Branches the wheel announces but does not yet contain (issue #63).
 *
 * These exist so the hub reads as a wheel rather than a lone line, and so the
 * player can see the game has somewhere to go. Keeping them in content rather
 * than hardcoding a placeholder in `MissionHubScene` means the shape of the
 * wheel stays data, and promoting one to a real spoke is a deliberate edit
 * here instead of a scene change someone has to remember to make.
 *
 * Angles are chosen not to collide with any real spoke's; a content test
 * enforces it across both lists.
 */
export const TEASER_SPOKES: readonly TeaserSpokeDef[] = [
  {
    id: 'ashen-spiral',
    name: 'The Ashen Spiral',
    accent: 0xff7a3c,
    angleDeg: 120,
    tagline: 'Smoke coils from the deep galleries. Something down there is still burning.'
  },
  {
    id: 'glass-hollows',
    name: 'The Glass Hollows',
    accent: 0x8fe0c8,
    angleDeg: 240,
    tagline: 'Where the hive fused to glass, the echoes have not stopped moving.'
  }
];
