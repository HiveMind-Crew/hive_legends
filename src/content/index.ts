import type { ContentDb, LevelDef } from '../sim/types';
import { ABILITY_SPECIALIZATIONS } from './abilitySpecializations';
import { BOSSES } from './bosses';
import { COMBAT } from './combat';
import { ENEMIES, GENERATORS } from './enemies';
import { ECONOMY } from './economy';
import { HEROES } from './heroes';
import { BROOD_WARRENS } from './levels/broodWarrens';
import { COBALT_COMBS } from './levels/cobaltCombs';
import { HOLLOW_THRONE } from './levels/hollowThrone';
import { RESIN_GALLERIES } from './levels/resinGalleries';
import { POTION } from './potions';
import { POWERUPS } from './powerups';
import { PRESSURE } from './pressure';
import { PROGRESSION } from './progression';
import { PROPS } from './props';
import { REVIVE } from './revive';
import { SPOKES, TEASER_SPOKES } from './spokes';
import { WEAPONS } from './weapons';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  abilitySpecializations: ABILITY_SPECIALIZATIONS,
  enemies: ENEMIES,
  generators: GENERATORS,
  props: PROPS,
  weapons: WEAPONS,
  powerups: POWERUPS,
  potion: POTION,
  bosses: BOSSES,
  progression: PROGRESSION,
  pressure: PRESSURE,
  combat: COMBAT,
  economy: ECONOMY,
  revive: REVIVE,
  spokes: SPOKES,
  teaserSpokes: TEASER_SPOKES
};

/** Every authored mission, keyed by level id. */
export const LEVELS: Record<string, LevelDef> = {
  [BROOD_WARRENS.id]: BROOD_WARRENS,
  [RESIN_GALLERIES.id]: RESIN_GALLERIES,
  [COBALT_COMBS.id]: COBALT_COMBS,
  [HOLLOW_THRONE.id]: HOLLOW_THRONE
};

/**
 * Flat mission order, derived from the wheel (issue #53): each spoke's
 * missions in sequence, then its boss. The first entry is the e2e
 * Enter-default, so the first spoke's first mission must stay The Brood
 * Warrens — a content test enforces it.
 *
 * The hub navigates the wheel directly; this flat view survives for the
 * places that still want a linear reading of it — `ResultsScene` asking
 * `nextLevelId` what follows a clear, and the content/level tests. Prefer the
 * spoke-aware rules in `src/meta/save.ts` for anything new.
 */
export const MISSION_ORDER: readonly string[] = SPOKES.flatMap((s) => [...s.missions, s.boss]);

export { SPOKES, TEASER_SPOKES } from './spokes';
export { BROOD_WARRENS } from './levels/broodWarrens';
export { RESIN_GALLERIES } from './levels/resinGalleries';
export { COBALT_COMBS } from './levels/cobaltCombs';
export { HOLLOW_THRONE } from './levels/hollowThrone';
export { ECONOMY, firstClearBonus } from './economy';
export { ABILITY_SPECIALIZATIONS } from './abilitySpecializations';
