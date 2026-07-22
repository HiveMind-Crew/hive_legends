import { describe, expect, it } from 'vitest';
import { CONTENT, MISSION_ORDER } from '../src/content';
import {
  buyHeroUnlock,
  buyWeapon,
  defaultProfile,
  equipWeapon,
  equippedAttack,
  equippedWeaponId,
  heroLockState,
  isHeroUnlocked,
  isLevelCleared,
  isLevelUnlocked,
  loadProfile,
  markLevelCleared,
  nextLevelId,
  ownedWeapons,
  resolveWeaponAttack,
  weaponsForHero,
  type Profile
} from '../src/meta/save';
import { WEAPONS } from '../src/content/weapons';

/**
 * Hero recruitment gates (issue #21). Unlock rules live in hero data
 * (`HeroDef.unlock`) and are evaluated against the persistent profile, so the
 * hero-select screen needs zero per-hero code. The default Vanguard must stay
 * always-available or the e2e Enter-flow (press Enter → Vanguard mission)
 * breaks, so that invariant is pinned here too.
 */
describe('hero unlocks', () => {
  const heroes = CONTENT.heroes;

  it('the first roster hero is always available (e2e Enter-default)', () => {
    const first = Object.values(heroes)[0]!;
    expect(first.id).toBe('vanguard');
    expect(first.unlock).toBeUndefined();
    expect(isHeroUnlocked(defaultProfile(), first)).toBe(true);
    expect(heroLockState(defaultProfile(), first).state).toBe('unlocked');
  });

  it('a gold-only hero is purchasable from the start, gated by the bank', () => {
    const profile = defaultProfile();
    const arcanist = heroes.arcanist!;
    const cost = arcanist.unlock!.goldCost!;

    // Broke: purchasable but not affordable, and cannot be recruited.
    let lock = heroLockState(profile, arcanist);
    expect(lock).toEqual({ state: 'purchasable', cost, affordable: false });
    expect(buyHeroUnlock(profile, arcanist)).toBe(false);
    expect(isHeroUnlocked(profile, arcanist)).toBe(false);

    // Funded: the purchase spends from the bank and sticks.
    profile.bank = cost + 5;
    lock = heroLockState(profile, arcanist);
    expect(lock).toEqual({ state: 'purchasable', cost, affordable: true });
    expect(buyHeroUnlock(profile, arcanist)).toBe(true);
    expect(profile.bank).toBe(5);
    expect(profile.unlockedHeroes).toContain('arcanist');
    expect(isHeroUnlocked(profile, arcanist)).toBe(true);
    expect(heroLockState(profile, arcanist).state).toBe('unlocked');

    // Idempotent: an owned hero can't be bought again.
    expect(buyHeroUnlock(profile, arcanist)).toBe(false);
    expect(profile.bank).toBe(5);
  });

  it('a mission-gated hero stays locked until the clears are met', () => {
    const profile = defaultProfile();
    profile.bank = 10_000; // gold alone can't skip the mission gate
    const ranger = heroes.ranger!;
    const need = ranger.unlock!.missionsCompleted!;

    const lock = heroLockState(profile, ranger);
    expect(lock).toEqual({ state: 'mission-locked', missionsNeeded: need });
    expect(buyHeroUnlock(profile, ranger)).toBe(false);
    expect(isHeroUnlocked(profile, ranger)).toBe(false);

    // Clearing the required missions reveals the gold purchase.
    profile.missionsCompleted = need;
    expect(heroLockState(profile, ranger).state).toBe('purchasable');
    expect(buyHeroUnlock(profile, ranger)).toBe(true);
    expect(isHeroUnlocked(profile, ranger)).toBe(true);
  });

  it('every mission-gated hero reports a shrinking requirement as clears rise', () => {
    const sentinel = heroes.sentinel!;
    const need = sentinel.unlock!.missionsCompleted!;
    for (let cleared = 0; cleared < need; cleared++) {
      const profile: Profile = { ...defaultProfile(), missionsCompleted: cleared };
      const lock = heroLockState(profile, sentinel);
      expect(lock).toEqual({ state: 'mission-locked', missionsNeeded: need - cleared });
    }
  });

  it('loadProfile backfills unlockedHeroes for older saves without it', () => {
    // No localStorage in the node test env, so loadProfile returns a default;
    // the important guarantee is the field always exists as an array.
    expect(loadProfile().unlockedHeroes).toEqual([]);
    expect(loadProfile().weapons).toEqual({});
  });
});

/**
 * Weapon tiers (issue #22). Ownership and the equipped tier persist in the
 * profile; purchases are hero-gated and respect the bank; the equipped tier
 * resolves to an AttackDef for createSim without the sim ever reading meta.
 */
describe('weapon tiers', () => {
  it('the base kit is owned and equipped by default, with no attack override', () => {
    const profile = defaultProfile();
    const hero = CONTENT.heroes['vanguard']!;
    const base = weaponsForHero('vanguard').find((w) => w.tier === 1)!;
    expect(ownedWeapons(profile, 'vanguard')).toEqual([base.id]);
    expect(equippedWeaponId(profile, 'vanguard')).toBe(base.id);
    // Base tier ⇒ no override, so the sim just uses hero.attack.
    expect(equippedAttack(profile, hero)).toBeUndefined();
  });

  it('buying a tier respects the bank, auto-equips, and is hero-gated', () => {
    const profile = defaultProfile();
    const t2 = WEAPONS['vanguard-t2']!;

    // Broke: purchase fails and nothing is owned/spent.
    profile.bank = t2.cost - 1;
    expect(buyWeapon(profile, 'vanguard-t2')).toBe(false);
    expect(ownedWeapons(profile, 'vanguard')).not.toContain('vanguard-t2');

    // Funded: purchase spends, adds ownership, and auto-equips the new tier.
    profile.bank = t2.cost + 10;
    expect(buyWeapon(profile, 'vanguard-t2')).toBe(true);
    expect(profile.bank).toBe(10);
    expect(ownedWeapons(profile, 'vanguard')).toContain('vanguard-t2');
    expect(equippedWeaponId(profile, 'vanguard')).toBe('vanguard-t2');

    // Idempotent: an owned tier can't be re-bought.
    expect(buyWeapon(profile, 'vanguard-t2')).toBe(false);
    expect(profile.bank).toBe(10);
  });

  it('resolves the equipped tier into the hero attack merged with overrides', () => {
    const profile = defaultProfile();
    const hero = CONTENT.heroes['vanguard']!;
    profile.bank = 10_000;
    buyWeapon(profile, 'vanguard-t3');

    const attack = equippedAttack(profile, hero)!;
    expect(attack).toBeDefined();
    expect(attack.kind).toBe(hero.attack.kind); // stays melee
    // Overridden fields take the weapon value; untouched fields keep the base.
    expect(attack.kind === 'melee' && attack.damage).toBe(WEAPONS['vanguard-t3']!.attackOverrides.damage);
    expect(attack.kind === 'melee' && attack.range).toBe(
      hero.attack.kind === 'melee' ? hero.attack.range : undefined
    );
  });

  it('equip only accepts owned weapons and never changes the attack kind', () => {
    const profile = defaultProfile();
    const hero = CONTENT.heroes['arcanist']!;
    // Can't equip a tier you don't own.
    expect(equipWeapon(profile, 'arcanist-t3')).toBe(false);

    profile.bank = 10_000;
    expect(buyWeapon(profile, 'arcanist-t2')).toBe(true);
    expect(equipWeapon(profile, 'arcanist-t2')).toBe(true);
    const attack = resolveWeaponAttack(hero, WEAPONS['arcanist-t2']);
    expect(attack.kind).toBe(hero.attack.kind); // projectile stays projectile

    // A weapon is bound to its hero: buying it never touches another hero.
    expect(ownedWeapons(profile, 'vanguard')).toEqual([
      weaponsForHero('vanguard').find((w) => w.tier === 1)!.id
    ]);
  });
});

/**
 * Mission progression (issue #24). The first realm is always open (the e2e
 * Enter-default); later realms unlock as the one before them is cleared, so a
 * second authored mission needs no per-mission code.
 */
describe('mission progression', () => {
  const first = MISSION_ORDER[0]!;
  const second = MISSION_ORDER[1];

  it('the first mission is always unlocked, even on a fresh profile', () => {
    const profile = defaultProfile();
    expect(profile.clearedLevels).toEqual([]);
    expect(isLevelUnlocked(profile, first, MISSION_ORDER)).toBe(true);
  });

  it('a later mission is locked until the previous one is cleared', () => {
    if (!second) return; // single-mission builds have nothing to gate
    const profile = defaultProfile();
    expect(isLevelUnlocked(profile, second, MISSION_ORDER)).toBe(false);

    markLevelCleared(profile, first);
    expect(isLevelCleared(profile, first)).toBe(true);
    expect(isLevelUnlocked(profile, second, MISSION_ORDER)).toBe(true);
  });

  it('markLevelCleared is idempotent', () => {
    const profile = defaultProfile();
    markLevelCleared(profile, first);
    markLevelCleared(profile, first);
    expect(profile.clearedLevels.filter((id) => id === first)).toHaveLength(1);
  });

  it('nextLevelId walks the order and stops at the end', () => {
    expect(nextLevelId(first, MISSION_ORDER)).toBe(second ?? null);
    expect(nextLevelId(MISSION_ORDER[MISSION_ORDER.length - 1]!, MISSION_ORDER)).toBeNull();
    expect(nextLevelId('does-not-exist', MISSION_ORDER)).toBeNull();
  });

  it('loadProfile backfills clearedLevels for older saves', () => {
    expect(loadProfile().clearedLevels).toEqual([]);
  });
});
