import type { ContentDb, LevelDef } from '../sim/types';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';
import { BROOD_WARRENS } from './levels/broodWarrens';
import { RESIN_GALLERIES } from './levels/resinGalleries';
import { POTION } from './potions';
import { POWERUPS } from './powerups';
import { PROPS } from './props';
import { WEAPONS } from './weapons';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  enemies: ENEMIES,
  generators: GENERATORS,
  props: PROPS,
  weapons: WEAPONS,
  powerups: POWERUPS,
  potion: POTION
};

/** Every authored mission, keyed by level id. */
export const LEVELS: Record<string, LevelDef> = {
  [BROOD_WARRENS.id]: BROOD_WARRENS,
  [RESIN_GALLERIES.id]: RESIN_GALLERIES
};

/**
 * Mission order for the hub list and "next mission" flow. The first entry is
 * the e2e Enter-default, so it must stay The Brood Warrens.
 */
export const MISSION_ORDER: readonly string[] = [BROOD_WARRENS.id, RESIN_GALLERIES.id];

export { BROOD_WARRENS } from './levels/broodWarrens';
export { RESIN_GALLERIES } from './levels/resinGalleries';
