import type { ContentDb } from '../sim/types';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';
import { PROPS } from './props';
import { WEAPONS } from './weapons';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  enemies: ENEMIES,
  generators: GENERATORS,
  props: PROPS,
  weapons: WEAPONS
};

export { BROOD_WARRENS } from './levels/broodWarrens';
