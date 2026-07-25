import type { ContentDb, LevelDef } from '../sim/types';
import { BOSSES } from './bosses';
import { COMBAT } from './combat';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';
import { BROOD_WARRENS } from './levels/broodWarrens';
import { HOLLOW_THRONE } from './levels/hollowThrone';
import { RESIN_GALLERIES } from './levels/resinGalleries';
import { POTION } from './potions';
import { POWERUPS } from './powerups';
import { PRESSURE } from './pressure';
import { PROGRESSION } from './progression';
import { PROPS } from './props';
import { SPOKES } from './spokes';
import { WEAPONS } from './weapons';

export const CONTENT: ContentDb = {
  heroes: HEROES,
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
  spokes: SPOKES
};

/** Every authored mission, keyed by level id. */
export const LEVELS: Record<string, LevelDef> = {
  [BROOD_WARRENS.id]: BROOD_WARRENS,
  [RESIN_GALLERIES.id]: RESIN_GALLERIES,
  [HOLLOW_THRONE.id]: HOLLOW_THRONE
};

/**
 * Flat mission order, derived from the wheel (issue #53): each spoke's
 * missions in sequence, then its boss. The first entry is the e2e
 * Enter-default, so the first spoke's first mission must stay The Brood
 * Warrens — a content test enforces it.
 *
 * This is a compatibility view for the pre-wheel linear flow
 * (`isLevelUnlocked`, `nextLevelId`, the hero-select mission panel). It goes
 * away once `MissionHubScene` lands and those call sites move to the
 * spoke-aware rules — see issues #54 and #57.
 */
export const MISSION_ORDER: readonly string[] = SPOKES.flatMap((s) => [...s.missions, s.boss]);

export { SPOKES } from './spokes';
export { BROOD_WARRENS } from './levels/broodWarrens';
export { RESIN_GALLERIES } from './levels/resinGalleries';
export { HOLLOW_THRONE } from './levels/hollowThrone';
