import type { ContentDb } from '../sim/types';
import { ENEMIES, GENERATORS } from './enemies';
import { HEROES } from './heroes';

export const CONTENT: ContentDb = {
  heroes: HEROES,
  enemies: ENEMIES,
  generators: GENERATORS
};

export { BROOD_WARRENS } from './levels/broodWarrens';
