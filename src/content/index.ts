import type { ContentDb } from '../sim/types';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';
import { PROPS } from './props';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  enemies: ENEMIES,
  generators: GENERATORS,
  props: PROPS
};

export { BROOD_WARRENS } from './levels/broodWarrens';
