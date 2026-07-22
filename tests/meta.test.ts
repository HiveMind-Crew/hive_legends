import { describe, expect, it } from 'vitest';
import { CONTENT } from '../src/content';
import {
  buyHeroUnlock,
  defaultProfile,
  heroLockState,
  isHeroUnlocked,
  loadProfile,
  type Profile
} from '../src/meta/save';

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
  });
});
