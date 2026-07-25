import type { ContentDb, LevelDef } from '../sim/types';
import { BOSSES } from './bosses';
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
  pressure: PRESSURE
};

/** Every authored mission, keyed by level id. */
export const LEVELS: Record<string, LevelDef> = {
  [BROOD_WARRENS.id]: BROOD_WARRENS,
  [RESIN_GALLERIES.id]: RESIN_GALLERIES,
  [HOLLOW_THRONE.id]: HOLLOW_THRONE
};

/**
 * Mission order for the hub list and "next mission" flow. The first entry is
 * the e2e Enter-default, so it must stay The Brood Warrens. The finale
 * (The Hollow Throne) caps the realm.
 */
export const MISSION_ORDER: readonly string[] = [BROOD_WARRENS.id, RESIN_GALLERIES.id, HOLLOW_THRONE.id];

export { BROOD_WARRENS } from './levels/broodWarrens';
export { RESIN_GALLERIES } from './levels/resinGalleries';
export { HOLLOW_THRONE } from './levels/hollowThrone';
