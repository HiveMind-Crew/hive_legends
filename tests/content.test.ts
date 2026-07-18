import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { ENEMY_FAMILIES, ENEMY_TIERS } from '../src/sim/types';

/**
 * Content-data validity: the enemy visual grammar (issue #7) requires every
 * enemy to reference a real silhouette family and palette tier, because the
 * texture generator composes frames from exactly these keys.
 */
describe('content validity', () => {
  it('every enemy references a valid family and tier', () => {
    const enemies = Object.values(CONTENT.enemies);
    expect(enemies.length).toBeGreaterThan(0);
    for (const def of enemies) {
      expect(ENEMY_FAMILIES, `${def.id} family`).toContain(def.family);
      expect(ENEMY_TIERS, `${def.id} tier`).toContain(def.tier);
    }
  });

  it('every generator spawns a defined enemy', () => {
    for (const def of Object.values(CONTENT.generators)) {
      expect(CONTENT.enemies[def.spawnsEnemyId], `${def.id} spawns`).toBeDefined();
    }
  });
});
