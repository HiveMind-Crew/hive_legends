import { describe, expect, it } from 'vitest';
import { CONTENT, MISSION_ORDER, SPOKES, TEASER_SPOKES } from '../src/content';
import {
  bestClearTicks,
  buyContinue,
  buyHeroUnlock,
  continueCost,
  buyWeapon,
  defaultProfile,
  fastestClear,
  recordClearTicks,
  equipWeapon,
  equippedAttack,
  equippedWeaponId,
  heroLockState,
  isHeroUnlocked,
  isLevelCleared,
  isMaxLevel,
  MAX_HERO_LEVEL,
  XP_CAP,
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
  markHeroMastery,
  masteredHeroes,
  nextLevelId,
  ownedWeapons,
  profileLevel,
  resetProfile,
  resolveWeaponAttack,
  weaponsForHero,
  type Profile
} from '../src/meta/save';
import { WEAPONS } from '../src/content/weapons';

describe('profile reset', () => {
  it('restores every profile field to its default', () => {
    expect(resetProfile()).toEqual(defaultProfile());
  });
});

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

  it('nextLevelId walks the order and stops at the end', () => {
    expect(nextLevelId(first, MISSION_ORDER)).toBe(second ?? null);
    expect(nextLevelId(MISSION_ORDER[MISSION_ORDER.length - 1]!, MISSION_ORDER)).toBeNull();
    expect(nextLevelId('does-not-exist', MISSION_ORDER)).toBeNull();
  });

  it('loadProfile backfills clearedLevels for older saves', () => {
    expect(loadProfile().clearedLevels).toEqual([]);
    expect(loadProfile().mastery).toEqual({});
  });

  it('records one mastery seal per hero and level', () => {
    const profile = defaultProfile();
    expect(markHeroMastery(profile, first, 'vanguard')).toBe(true);
    expect(markHeroMastery(profile, first, 'vanguard')).toBe(false);
    expect(markHeroMastery(profile, first, 'ranger')).toBe(true);
    expect(masteredHeroes(profile, first)).toEqual(['vanguard', 'ranger']);
    expect(masteredHeroes(profile, 'another-level')).toEqual([]);
  });
});

/**
 * Per-realm clear records (issue #100). The field was written and never read
 * for four realms' worth of development, so the guarantees pinned here are the
 * ones that make it a feature rather than a number in a file: it is keyed by
 * level, it only ever falls, and a save written before this existed still
 * loads.
 */
describe('clear-time records', () => {
  const first = MISSION_ORDER[0]!;
  const second = MISSION_ORDER[1] ?? 'another-level';

  it('a fresh profile holds no records', () => {
    const profile = defaultProfile();
    expect(profile.bestClearTicks).toEqual({});
    expect(bestClearTicks(profile, first)).toBeNull();
    expect(fastestClear(profile)).toBeNull();
  });

  it('a first clear sets a record without claiming one was beaten', () => {
    const profile = defaultProfile();
    const result = recordClearTicks(profile, first, 1574);
    expect(result).toEqual({ best: 1574, previous: null, improved: false });
    expect(bestClearTicks(profile, first)).toBe(1574);
  });

  it('keeps the fastest run and reports a beaten record', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, first, 1574);

    const slower = recordClearTicks(profile, first, 2000);
    expect(slower.improved).toBe(false);
    expect(slower.best).toBe(1574);
    expect(bestClearTicks(profile, first), 'a slow run never overwrites a record').toBe(1574);

    const faster = recordClearTicks(profile, first, 1200);
    expect(faster).toEqual({ best: 1200, previous: 1574, improved: true });
    expect(bestClearTicks(profile, first)).toBe(1200);
  });

  it('records are per level, so realms never overwrite each other', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, first, 1574);
    recordClearTicks(profile, second, 900);
    expect(bestClearTicks(profile, first)).toBe(1574);
    expect(bestClearTicks(profile, second)).toBe(900);
  });

  it('ignores a nonsense duration rather than storing it', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, first, 1574);
    expect(recordClearTicks(profile, first, 0).best).toBe(1574);
    expect(recordClearTicks(profile, first, Number.NaN).best).toBe(1574);
    expect(bestClearTicks(profile, first)).toBe(1574);
  });

  it('fastestClear names the single quickest realm', () => {
    const profile = defaultProfile();
    recordClearTicks(profile, first, 1574);
    recordClearTicks(profile, second, 900);
    expect(fastestClear(profile)).toEqual({ levelId: second, ticks: 900 });
  });

  it('resolves a tie to wheel order so the headline does not flicker', () => {
    const a = defaultProfile();
    recordClearTicks(a, first, 1000);
    recordClearTicks(a, second, 1000);
    const b = defaultProfile();
    recordClearTicks(b, second, 1000);
    recordClearTicks(b, first, 1000);
    expect(fastestClear(a)).toEqual(fastestClear(b));
    expect(fastestClear(a)?.levelId).toBe(first);
  });
});

/**
 * The pre-#100 profile stored one global `bestClearTicks: number | null`. It
 * names no level, so it cannot be migrated into the per-level map — but it must
 * not survive as a bare number either, or every reader indexes a primitive.
 */
describe('clear-record migration from a pre-#100 save', () => {
  const KEY = 'hive-legends-profile-v1';

  function withStoredProfile<T>(stored: unknown, run: () => T): T {
    const items = new Map<string, string>([[KEY, JSON.stringify(stored)]]);
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => items.get(k) ?? null,
        setItem: (k: string, v: string) => void items.set(k, v)
      }
    });
    try {
      return run();
    } finally {
      if (original) Object.defineProperty(globalThis, 'localStorage', original);
      else delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  }

  it('drops a legacy global record and leaves the rest of the save intact', () => {
    const loaded = withStoredProfile(
      { ...defaultProfile(), bank: 340, clearedLevels: ['brood-warrens'], bestClearTicks: 1074 },
      loadProfile
    );
    expect(loaded.bestClearTicks).toEqual({});
    expect(loaded.bank, 'the rest of the profile is untouched').toBe(340);
    expect(loaded.clearedLevels).toEqual(['brood-warrens']);
    // And the migrated profile records normally from here on.
    expect(recordClearTicks(loaded, 'brood-warrens', 1074)).toEqual({
      best: 1074,
      previous: null,
      improved: false
    });
  });

  it('tolerates the older null and a missing field alike', () => {
    expect(withStoredProfile({ ...defaultProfile(), bestClearTicks: null }, loadProfile).bestClearTicks).toEqual({});
    const withoutField: Partial<Profile> = defaultProfile();
    delete withoutField.bestClearTicks;
    expect(withStoredProfile(withoutField, loadProfile).bestClearTicks).toEqual({});
  });

  it('round-trips per-level records and discards corrupt entries', () => {
    const loaded = withStoredProfile(
      { ...defaultProfile(), bestClearTicks: { 'brood-warrens': 1074, 'resin-galleries': -5, 'cobalt-combs': 'fast' } },
      loadProfile
    );
    expect(loaded.bestClearTicks).toEqual({ 'brood-warrens': 1074 });
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
 * The level cap (issue #103). XP past level 10 used to accumulate forever with
 * nothing to show for it; it now converts to gold and the profile stops
 * growing, which is what makes repeated banking idempotent.
 */
describe('the hero level cap', () => {
  const rate = CONTENT.progression.capOverflowGoldPerXp;

  it('caps the level and the stored XP at the top of the curve', () => {
    const profile = defaultProfile();
    const result = bankXp(profile, XP_CAP + 1000);
    expect(profile.xp).toBe(XP_CAP);
    expect(profileLevel(profile)).toBe(MAX_HERO_LEVEL);
    expect(isMaxLevel(profile)).toBe(true);
    expect(result.level).toBe(MAX_HERO_LEVEL);
    expect(result.atCap).toBe(true);
  });

  it('splits a run that crosses the cap into levelling XP and gold', () => {
    const profile = defaultProfile();
    bankXp(profile, XP_CAP - 100);
    const bank = profile.bank;

    const result = bankXp(profile, 300);
    expect(result.applied).toBe(100); // the last 100 XP the curve could sell
    expect(result.overflow).toBe(200);
    expect(result.gold).toBe(Math.floor(200 * rate));
    expect(profile.bank).toBe(bank + result.gold);
    expect(profile.xp).toBe(XP_CAP);
  });

  it('pays a capped hero entirely in gold, run after run', () => {
    const profile = defaultProfile();
    bankXp(profile, XP_CAP);
    expect(profile.bank).toBe(0);

    const first = bankXp(profile, 286); // a bot clear of the Warrens
    const second = bankXp(profile, 286);
    expect(first).toEqual(second); // no drift: the cap is a steady state
    expect(first.applied).toBe(0);
    expect(first.gold).toBe(Math.floor(286 * rate));
    expect(profile.bank).toBe(first.gold * 2);
    expect(profile.xp).toBe(XP_CAP);
  });

  it('pays out XP a pre-cap save had already banked past the curve', () => {
    // A profile written before this change: dead XP sitting above the cap.
    const profile: Profile = { ...defaultProfile(), xp: XP_CAP + 400 };
    const result = bankXp(profile, 0);
    expect(result.overflow).toBe(400);
    expect(result.gold).toBe(Math.floor(400 * rate));
    expect(profile.xp).toBe(XP_CAP);
    expect(profile.bank).toBe(result.gold);

    // And it is paid exactly once.
    expect(bankXp(profile, 0)).toEqual({ applied: 0, overflow: 0, gold: 0, level: MAX_HERO_LEVEL, atCap: true });
  });

  it('leaves a hero below the cap untouched by the dividend', () => {
    const profile = defaultProfile();
    const result = bankXp(profile, 100);
    expect(result).toEqual({ applied: 100, overflow: 0, gold: 0, level: profileLevel(profile), atCap: false });
    expect(profile.bank).toBe(0);
  });

  it('the cap constants agree with the authored curve', () => {
    const curve = CONTENT.progression.xpToReach;
    expect(MAX_HERO_LEVEL).toBe(curve.length);
    expect(XP_CAP).toBe(curve[curve.length - 1]);
  });
});

/**
 * The arcade continue (issue #99). The price escalates within a run, so the
 * first fall is recoverable and the fourth is a decision.
 */
describe('continues', () => {
  const base = CONTENT.economy.continueBaseCost;
  const step = CONTENT.economy.continueCostStep;

  it('prices the first continue at the authored base and escalates from there', () => {
    expect(continueCost(0)).toBe(base);
    expect(continueCost(1)).toBe(base + step);
    expect(continueCost(3)).toBe(base + step * 3);
  });

  it('treats nonsense counts as a first continue rather than a discount', () => {
    expect(continueCost(-5)).toBe(base);
    expect(continueCost(0.9)).toBe(base);
  });

  it('spends the bank, and only when the bank covers it', () => {
    const profile = defaultProfile();
    profile.bank = base;
    expect(buyContinue(profile, 0)).toBe(true);
    expect(profile.bank).toBe(0);

    // The second one costs more, and the empty bank cannot pay for it.
    expect(buyContinue(profile, 1)).toBe(false);
    expect(profile.bank).toBe(0); // a refused continue charges nothing
  });

  it('charges the escalated price on a later continue', () => {
    const profile = defaultProfile();
    profile.bank = 10_000;
    buyContinue(profile, 0);
    buyContinue(profile, 1);
    buyContinue(profile, 2);
    expect(profile.bank).toBe(10_000 - (base + (base + step) + (base + step * 2)));
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
