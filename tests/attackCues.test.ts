import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import { WEAPONS } from '../src/content/weapons';
import { enemyAttackCue, heroAttackCue } from '../src/game/attackCues';
import type { AttackDef } from '../src/sim/types';

function attackAtTier(heroId: string, tier: 1 | 3): AttackDef {
  const hero = CONTENT.heroes[heroId]!;
  const weapon = WEAPONS[`${heroId}-t${tier}`]!;
  return { ...hero.attack, ...weapon.attackOverrides } as AttackDef;
}

describe('attack presentation vocabulary (#80)', () => {
  it('gives each hero weapon family a distinguishable voice', () => {
    const voices = Object.values(CONTENT.heroes).map((hero) =>
      heroAttackCue(hero.id, hero.attack.kind, hero.attack.damage).voice
    );
    expect(new Set(voices)).toHaveLength(voices.length);
  });

  it('makes every tier-3 weapon audibly heavier than its tier-1 version', () => {
    for (const hero of Object.values(CONTENT.heroes)) {
      const base = attackAtTier(hero.id, 1);
      const top = attackAtTier(hero.id, 3);
      expect(
        heroAttackCue(hero.id, top.kind, top.damage).heft,
        `${hero.id} presentation heft`
      ).toBeGreaterThan(heroAttackCue(hero.id, base.kind, base.damage).heft);
    }
  });

  it('distinguishes the four shipped enemy releases by family and shape', () => {
    const voices = [
      enemyAttackCue('skitter', 'pounce', 7).voice,
      enemyAttackCue('husk', 'contact', 16).voice,
      enemyAttackCue('spitter', 'volley', 8).voice,
      enemyAttackCue('husk', 'line', 24).voice
    ];
    expect(new Set(voices)).toHaveLength(voices.length);
  });
});
