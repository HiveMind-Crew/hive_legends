import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT } from '../src/content';
import { TEXTURE_SPECS } from '../src/game/textureSpecs';
import { DECOR_KINDS, ENEMY_FAMILIES, ENEMY_TIERS } from '../src/sim/types';

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

  it('level props and decor reference defined content', () => {
    for (const pr of BROOD_WARRENS.props ?? []) {
      expect(CONTENT.props[pr.typeId], `prop ${pr.typeId}`).toBeDefined();
    }
    for (const d of BROOD_WARRENS.decor ?? []) {
      expect(DECOR_KINDS, `decor ${d.kind}`).toContain(d.kind);
    }
    expect(BROOD_WARRENS.props?.length ?? 0).toBeGreaterThan(0);
    expect(BROOD_WARRENS.decor?.length ?? 0).toBeGreaterThan(0);
  });

  it('the texture spec table covers every composed frame family', () => {
    // Hero: 8 directions x 3 poses + portrait alias.
    for (let dir = 0; dir < 8; dir++) {
      for (const pose of ['w0', 'w1', 'atk']) {
        expect(TEXTURE_SPECS[`hero-vanguard-${dir}-${pose}`]).toBeDefined();
      }
    }
    expect(TEXTURE_SPECS['hero-vanguard']).toBeDefined();
    // Enemies: family x tier x frame.
    for (const family of ENEMY_FAMILIES) {
      for (const tier of ENEMY_TIERS) {
        for (const frame of ['w0', 'w1', 'windup']) {
          expect(TEXTURE_SPECS[`enemy-${family}-${tier}-${frame}`]).toBeDefined();
        }
      }
    }
    // Damage-tier and variant sets, plus every prop in content.
    for (let t = 0; t < 3; t++) expect(TEXTURE_SPECS[`generator-brood-node-${t}`]).toBeDefined();
    for (let v = 0; v < 4; v++) expect(TEXTURE_SPECS[`tile-floor-${v}`]).toBeDefined();
    for (const id of Object.keys(CONTENT.props)) expect(TEXTURE_SPECS[`prop-${id}`]).toBeDefined();
  });

  it('every weapon references a real hero and is well-formed', () => {
    const weapons = Object.values(CONTENT.weapons);
    expect(weapons.length).toBeGreaterThan(0);
    const meleeFields = new Set(['damage', 'range', 'arcDeg', 'knockback', 'cooldownTicks']);
    const projFields = new Set(['damage', 'speed', 'radius', 'range', 'cooldownTicks', 'pierce', 'knockback']);
    for (const [id, w] of Object.entries(CONTENT.weapons)) {
      expect(id, 'map key matches def id').toBe(w.id);
      const hero = CONTENT.heroes[w.heroId];
      expect(hero, `${id} references a real hero`).toBeDefined();
      expect([1, 2, 3], `${id} tier`).toContain(w.tier);
      expect(w.cost, `${id} cost`).toBeGreaterThanOrEqual(0);
      // Overrides may only touch fields of the hero's own attack kind, and
      // never change the `kind` itself.
      const allowed = hero!.attack.kind === 'melee' ? meleeFields : projFields;
      for (const key of Object.keys(w.attackOverrides)) {
        expect(allowed, `${id} overrides ${key} for a ${hero!.attack.kind} attack`).toContain(key);
      }
    }
  });

  it('every hero has exactly one tier-1 (free base kit) weapon', () => {
    for (const heroId of Object.keys(CONTENT.heroes)) {
      const tiers = Object.values(CONTENT.weapons)
        .filter((w) => w.heroId === heroId)
        .map((w) => w.tier);
      const tier1 = Object.values(CONTENT.weapons).filter((w) => w.heroId === heroId && w.tier === 1);
      expect(tier1.length, `${heroId} tier-1 count`).toBe(1);
      expect(tier1[0]!.cost, `${heroId} base kit is free`).toBe(0);
      // No duplicate tiers within a hero's track.
      expect(new Set(tiers).size, `${heroId} unique tiers`).toBe(tiers.length);
    }
  });
});
