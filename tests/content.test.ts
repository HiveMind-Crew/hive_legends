import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS, CONTENT, LEVELS, MISSION_ORDER, SPOKES, TEASER_SPOKES } from '../src/content';
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
    // Every boss needs its own damage-tier frames (issue #25).
    for (const id of Object.keys(CONTENT.bosses)) {
      for (let t = 0; t < 3; t++) expect(TEXTURE_SPECS[`boss-${id}-${t}`], `boss-${id}-${t}`).toBeDefined();
    }
    for (let v = 0; v < 4; v++) expect(TEXTURE_SPECS[`tile-floor-${v}`]).toBeDefined();
    for (const id of Object.keys(CONTENT.props)) expect(TEXTURE_SPECS[`prop-${id}`]).toBeDefined();
  });

  it('every level-authored tile set resolves a complete environment pack', () => {
    for (const level of Object.values(LEVELS)) {
      const tileSet = level.theme?.tileSet;
      if (!tileSet) continue;
      for (const suffix of ['wall', 'wall-inner', 'wall-face']) {
        expect(TEXTURE_SPECS[`tile-${tileSet}-${suffix}`], `${level.id}/${suffix}`).toBeDefined();
      }
      for (let variant = 0; variant < 4; variant++) {
        expect(TEXTURE_SPECS[`tile-${tileSet}-floor-${variant}`], `${level.id}/floor-${variant}`).toBeDefined();
      }
    }
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

/**
 * The mission wheel (issue #53). These pin the structural rules the unlock
 * logic (#54) and the hub scene (#56) are entitled to assume, so a malformed
 * spoke fails here rather than as a blank node or an unreachable boss.
 */
describe('mission wheel', () => {
  it('every spoke references real levels', () => {
    expect(SPOKES.length).toBeGreaterThan(0);
    for (const spoke of SPOKES) {
      for (const id of spoke.missions) {
        expect(LEVELS[id], `${spoke.id} mission ${id}`).toBeDefined();
      }
      expect(LEVELS[spoke.boss], `${spoke.id} boss ${spoke.boss}`).toBeDefined();
    }
  });

  it("a spoke's boss node is a level that actually carries a boss", () => {
    // Capping a spoke with an ordinary map would leave the wheel claiming a
    // boss encounter that plays as a normal mission.
    for (const spoke of SPOKES) {
      expect(LEVELS[spoke.boss]?.boss, `${spoke.id} boss level has a boss`).toBeDefined();
    }
  });

  it('each spoke runs three missions before its boss', () => {
    for (const spoke of SPOKES) {
      expect(spoke.missions.length, `${spoke.id} mission count`).toBe(3);
    }
  });

  it('no level belongs to two spokes, or to one spoke twice', () => {
    const seen = new Map<string, string>();
    for (const spoke of SPOKES) {
      for (const id of [...spoke.missions, spoke.boss]) {
        const owner = seen.get(id);
        expect(owner, `${id} claimed by both ${owner} and ${spoke.id}`).toBeUndefined();
        seen.set(id, spoke.id);
      }
    }
  });

  it('spoke ids and wheel angles are unique, teasers included', () => {
    // Teasers share the wheel with real spokes, so the uniqueness that keeps
    // branches from drawing on top of each other has to span both lists.
    const ids = [...SPOKES.map((s) => s.id), ...TEASER_SPOKES.map((t) => t.id)];
    const angles = [...SPOKES.map((s) => s.angleDeg), ...TEASER_SPOKES.map((t) => t.angleDeg)];
    expect(new Set(ids).size, 'unique ids across spokes and teasers').toBe(ids.length);
    expect(new Set(angles).size, 'unique wheel angles across spokes and teasers').toBe(angles.length);
  });

  it('the wheel announces somewhere still to go', () => {
    // Without a teaser the hub renders a lone line and the game looks finished
    // the moment the first spoke is done (issue #63).
    expect(TEASER_SPOKES.length).toBeGreaterThan(0);
    for (const t of TEASER_SPOKES) {
      expect(t.name.length, `${t.id} name`).toBeGreaterThan(0);
      expect(t.tagline.length, `${t.id} tagline`).toBeGreaterThan(0);
      // A teaser has no nodes by construction; if it grows any it should have
      // become a real SpokeDef instead.
      expect(Object.keys(t).sort()).toEqual(['accent', 'angleDeg', 'id', 'name', 'tagline']);
    }
    expect(CONTENT.teaserSpokes).toBe(TEASER_SPOKES);
  });

  it('the spoke gate graph is well-formed and acyclic', () => {
    const byId = new Map(SPOKES.map((s) => [s.id, s]));
    // Exactly one entry point, or nothing is reachable.
    const roots = SPOKES.filter((s) => !s.requiresSpoke);
    expect(roots.length, 'spokes with no gate').toBe(1);

    for (const spoke of SPOKES) {
      const seen = new Set<string>([spoke.id]);
      let cursor = spoke.requiresSpoke;
      while (cursor !== undefined) {
        expect(byId.has(cursor), `${spoke.id} requires real spoke ${cursor}`).toBe(true);
        expect(seen.has(cursor), `${spoke.id} gate chain cycles at ${cursor}`).toBe(false);
        seen.add(cursor);
        cursor = byId.get(cursor)?.requiresSpoke;
      }
    }
  });

  it('the wheel opens on The Brood Warrens', () => {
    // The e2e bot confirms straight through to a mission from a fresh profile,
    // so the first reachable node must stay the Warrens.
    const first = SPOKES.find((s) => !s.requiresSpoke)!;
    expect(first.missions[0]).toBe(BROOD_WARRENS.id);
  });

  it('MISSION_ORDER stays the flat view of the wheel', () => {
    // The pre-wheel linear flow still reads this; it must keep its old value
    // until those call sites move to the spoke-aware rules (#54, #57).
    expect(MISSION_ORDER).toEqual(['brood-warrens', 'resin-galleries', 'cobalt-combs', 'hollow-throne']);
    expect(MISSION_ORDER).toEqual(SPOKES.flatMap((s) => [...s.missions, s.boss]));
  });

  it('is reachable from ContentDb', () => {
    expect(CONTENT.spokes).toBe(SPOKES);
  });
});
