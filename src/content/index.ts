import type { ContentDb } from '../sim/types';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';
import { POWERUPS } from './powerups';
import { PROPS } from './props';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  enemies: ENEMIES,
  generators: GENERATORS,
  props: PROPS,
  powerups: POWERUPS
};

export { BROOD_WARRENS } from './levels/broodWarrens';
