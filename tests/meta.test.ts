import { describe, expect, it } from 'vitest';
import { CONTENT, MISSION_ORDER, SPOKES, TEASER_SPOKES } from '../src/content';
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
  isSpokeUnlocked,
  isWheelComplete,
  nextTeaser,
  nodeLockState,
  spokeForLevel,
  spokeProgress,
  suggestedNode,
  loadProfile,
  bankXp,
  markLevelCleared,
  nextNodeAfter,
  ownedWeapons,
  profileLevel,
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
    // Cadence is the field no Vanguard tier overrides — the track buys damage
    // and reach, never swing speed.
    expect(attack.kind === 'melee' && attack.damage).toBe(WEAPONS['vanguard-t3']!.attackOverrides.damage);
    expect(WEAPONS['vanguard-t3']!.attackOverrides.cooldownTicks, 'cadence stays a base field').toBeUndefined();
    expect(attack.cooldownTicks).toBe(hero.attack.cooldownTicks);
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

  it('nextNodeAfter walks the wheel and stops at the end', () => {
    const profile = defaultProfile();
    expect(nextNodeAfter(profile, first)).toBe(second ?? null);
    expect(nextNodeAfter(profile, MISSION_ORDER[MISSION_ORDER.length - 1]!)).toBeNull();
    expect(nextNodeAfter(profile, 'does-not-exist')).toBeNull();
  });

  it('nextNodeAfter offers the next realm only once its boss has opened it', () => {
    // The flat order gave the right answer here by luck — clearing a boss is
    // exactly what unlocks the spoke behind it. The spoke-aware rule has to be
    // right on purpose, so assert the boss of the last authored spoke leads
    // nowhere rather than into an unauthored realm. `tests/spokeGate.test.ts`
    // covers the two-spoke hand-off against a fixture.
    const profile = defaultProfile();
    const lastSpoke = SPOKES[SPOKES.length - 1]!;
    for (const id of [...lastSpoke.missions, lastSpoke.boss]) markLevelCleared(profile, id);
    expect(nextNodeAfter(profile, lastSpoke.boss)).toBeNull();
  });

  it('loadProfile backfills clearedLevels for older saves', () => {
    expect(loadProfile().clearedLevels).toEqual([]);
  });
});

/** Hero levelling persistence (issue #46). */
describe('banked XP and hero level', () => {
  it('a fresh profile starts at level 1 with no XP', () => {
    const profile = defaultProfile();
    expect(profile.xp).toBe(0);
    expect(profileLevel(profile)).toBe(1);
  });

  it('banking XP raises the level once the curve threshold is crossed', () => {
    const profile = defaultProfile();
    const toLevel2 = CONTENT.progression.xpToReach[1]!;
    bankXp(profile, toLevel2 - 1);
    expect(profileLevel(profile)).toBe(1);
    bankXp(profile, 1);
    expect(profile.xp).toBe(toLevel2);
    expect(profileLevel(profile)).toBe(2);
  });

  it('banking ignores non-positive amounts', () => {
    const profile = defaultProfile();
    bankXp(profile, 0);
    bankXp(profile, -50);
    expect(profile.xp).toBe(0);
  });

  it('loadProfile backfills xp for older saves', () => {
    expect(loadProfile().xp).toBe(0);
  });
});

/**
 * The mission wheel (issue #54). A spoke runs its missions in sequence and
 * caps them with a boss; every rule here derives from `clearedLevels`, so
 * these also stand as the guarantee that no save migration is ever needed.
 */
describe('wheel progression', () => {
  const spoke = SPOKES[0]!;
  const missions = spoke.missions;
  const boss = spoke.boss;

  it('a fresh profile opens only the first mission', () => {
    const profile = defaultProfile();
    expect(nodeLockState(profile, missions[0]!)).toEqual({ state: 'available' });
    for (const id of missions.slice(1)) {
      expect(nodeLockState(profile, id), id).toEqual({ state: 'locked', reason: 'previous-mission' });
    }
    expect(nodeLockState(profile, boss)).toEqual({ state: 'locked', reason: 'boss-gated' });
  });

  it('clearing a mission opens exactly the next one, never the boss', () => {
    const profile = defaultProfile();
    for (let i = 0; i < missions.length - 1; i++) {
      markLevelCleared(profile, missions[i]!);
      expect(nodeLockState(profile, missions[i]!), `${missions[i]} cleared`).toEqual({ state: 'cleared' });
      expect(nodeLockState(profile, missions[i + 1]!), `${missions[i + 1]} opened`).toEqual({ state: 'available' });
      // The boss stays shut while any mission is outstanding.
      expect(nodeLockState(profile, boss), 'boss still gated').toEqual({ state: 'locked', reason: 'boss-gated' });
    }
  });

  it('the boss opens once every mission in the spoke is cleared', () => {
    const profile = defaultProfile();
    for (const id of missions) markLevelCleared(profile, id);
    expect(nodeLockState(profile, boss)).toEqual({ state: 'available' });
  });

  it('a cleared level stays enterable, so Results can offer a replay', () => {
    const profile = defaultProfile();
    markLevelCleared(profile, missions[0]!);
    expect(nodeLockState(profile, missions[0]!).state).toBe('cleared');
    expect(isLevelUnlocked(profile, missions[0]!)).toBe(true);
  });

  it('the only authored spoke is open from the start', () => {
    expect(isSpokeUnlocked(defaultProfile(), spoke.id)).toBe(true);
    expect(isSpokeUnlocked(defaultProfile(), 'no-such-spoke')).toBe(false);
  });

  it('spokeProgress counts missions, not the boss', () => {
    const profile = defaultProfile();
    expect(spokeProgress(profile, spoke.id)).toEqual({ cleared: 0, total: missions.length });
    markLevelCleared(profile, missions[0]!);
    expect(spokeProgress(profile, spoke.id)).toEqual({ cleared: 1, total: missions.length });
    // Felling the boss doesn't inflate the mission count.
    markLevelCleared(profile, boss);
    expect(spokeProgress(profile, spoke.id).cleared).toBe(1);
  });

  it('spokeForLevel maps a level back to its branch', () => {
    expect(spokeForLevel(missions[0]!)?.id).toBe(spoke.id);
    expect(spokeForLevel(boss)?.id).toBe(spoke.id);
    expect(spokeForLevel('does-not-exist')).toBeUndefined();
  });

  it('suggestedNode tracks the next thing to play', () => {
    const profile = defaultProfile();
    expect(suggestedNode(profile)).toEqual({ spokeId: spoke.id, levelId: missions[0] });

    markLevelCleared(profile, missions[0]!);
    expect(suggestedNode(profile).levelId).toBe(missions[1]);

    for (const id of missions) markLevelCleared(profile, id);
    expect(suggestedNode(profile).levelId, 'boss once the missions are done').toBe(boss);

    // Nothing left: the cursor parks on the last reachable node, never nowhere.
    markLevelCleared(profile, boss);
    expect(suggestedNode(profile).levelId).toBe(boss);
  });

  it('reads identically to the pre-wheel linear rule for existing saves', () => {
    // A profile written by the shipped build carries only cleared level ids.
    // Under the wheel it must resolve to the same open missions, or players
    // would lose access to realms they had already earned.
    const profile = { ...defaultProfile(), clearedLevels: ['brood-warrens'] };
    expect(isLevelUnlocked(profile, 'brood-warrens', MISSION_ORDER)).toBe(true);
    expect(isLevelUnlocked(profile, 'resin-galleries', MISSION_ORDER)).toBe(true);
    expect(isLevelCleared(profile, 'brood-warrens')).toBe(true);
  });
});

/**
 * End of authored content (issue #63). Clearing the last boss should name what
 * is coming rather than going quiet. The rule lives here rather than in
 * ResultsScene so it can be tested; the scene only renders what it returns.
 */
describe('end of authored content', () => {
  const everyNode = SPOKES.flatMap((s) => [...s.missions, s.boss]);

  it('is not reached while any node is outstanding', () => {
    const profile = defaultProfile();
    expect(isWheelComplete(profile)).toBe(false);
    expect(nextTeaser(profile)).toBeUndefined();

    // Clear everything except the final boss — still not the end.
    for (const id of everyNode.slice(0, -1)) markLevelCleared(profile, id);
    expect(isWheelComplete(profile)).toBe(false);
    expect(nextTeaser(profile)).toBeUndefined();
  });

  it('offers the first teaser once every node is cleared', () => {
    const profile = defaultProfile();
    for (const id of everyNode) markLevelCleared(profile, id);
    expect(isWheelComplete(profile)).toBe(true);
    expect(nextTeaser(profile)).toBe(TEASER_SPOKES[0]);
  });

  it('a teaser is never a playable destination', () => {
    // Teasers exist to be looked at. Nothing should route a mission at one, so
    // no teaser id may collide with an authored level.
    const profile = defaultProfile();
    for (const id of everyNode) markLevelCleared(profile, id);
    const teaser = nextTeaser(profile)!;
    expect(CONTENT.spokes.some((s) => s.id === teaser.id)).toBe(false);
    expect(everyNode).not.toContain(teaser.id);
  });
});
