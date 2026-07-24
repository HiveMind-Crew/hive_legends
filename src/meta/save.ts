import { PROGRESSION } from '../content/progression';
import { WEAPONS } from '../content/weapons';
import { levelForXp } from '../sim/sim';
import type { AttackDef, HeroDef, HeroModifiers, WeaponDef } from '../sim/types';

/**
 * Persistent meta-progression, stored in localStorage. Mission gold is
 * banked on completion and spent on permanent upgrades between missions.
 */

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  maxLevel: number;
  baseCost: number;
  costMultiplier: number;
}

export const UPGRADES: Record<string, UpgradeDef> = {
  vitality: {
    id: 'vitality',
    name: 'Hearthstone Vigor',
    description: '+20 Max Health per rank',
    maxLevel: 5,
    baseCost: 50,
    costMultiplier: 2
  },
  might: {
    id: 'might',
    name: 'Sharpened Edge',
    description: '+4 Damage per rank',
    maxLevel: 5,
    baseCost: 60,
    costMultiplier: 2
  }
};

export interface Profile {
  bank: number;
  upgrades: Record<string, number>;
  missionsCompleted: number;
  bestClearTicks: number | null;
  /** Ids of heroes recruited with gold (mission-gated heroes still need the clears). */
  unlockedHeroes: string[];
  /** Ids of levels the player has cleared at least once (mission unlock gate). */
  clearedLevels: string[];
  /**
   * Per-hero weapon ownership and equipped tier, keyed by hero id. Tier 1 is
   * always owned implicitly; only purchased tiers are stored. An absent hero
   * entry (or an unset `equipped`) means the base weapon is equipped.
   */
  weapons: Record<string, { owned: string[]; equipped?: string }>;
  /** Total XP banked across runs; drives the hero's starting level (#46). */
  xp: number;
  /** Master audio volume 0..1. */
  volume: number;
  muted: boolean;
}

const STORAGE_KEY = 'hive-legends-profile-v1';

export function defaultProfile(): Profile {
  return {
    bank: 0,
    upgrades: {},
    missionsCompleted: 0,
    bestClearTicks: null,
    unlockedHeroes: [],
    clearedLevels: [],
    weapons: {},
    xp: 0,
    volume: 0.7,
    muted: false
  };
}

export function loadProfile(): Profile {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      ...defaultProfile(),
      ...parsed,
      upgrades: { ...(parsed.upgrades ?? {}) },
      unlockedHeroes: [...(parsed.unlockedHeroes ?? [])],
      clearedLevels: [...(parsed.clearedLevels ?? [])],
      weapons: { ...(parsed.weapons ?? {}) }
    };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: Profile): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage unavailable (private mode etc.) — progression is session-only.
  }
}

export function upgradeLevel(profile: Profile, upgradeId: string): number {
  return profile.upgrades[upgradeId] ?? 0;
}

/** Cost of the next rank, or null if maxed. */
export function upgradeCost(profile: Profile, upgradeId: string): number | null {
  const def = UPGRADES[upgradeId];
  if (!def) return null;
  const level = upgradeLevel(profile, upgradeId);
  if (level >= def.maxLevel) return null;
  return def.baseCost * Math.pow(def.costMultiplier, level);
}

/** Attempts a purchase, mutating and persisting the profile. */
export function buyUpgrade(profile: Profile, upgradeId: string): boolean {
  const cost = upgradeCost(profile, upgradeId);
  if (cost === null || profile.bank < cost) return false;
  profile.bank -= cost;
  profile.upgrades[upgradeId] = upgradeLevel(profile, upgradeId) + 1;
  saveProfile(profile);
  return true;
}

// ---------------------------------------------------------------------------
// Hero recruitment (hero-select unlocks)
// ---------------------------------------------------------------------------

/** Recruitment status of a hero for a given profile. */
export type HeroLockState =
  | { state: 'unlocked' }
  | { state: 'mission-locked'; missionsNeeded: number }
  | { state: 'purchasable'; cost: number; affordable: boolean };

/** Whether the hero's mission gate (if any) has been satisfied. */
function missionGateMet(profile: Profile, hero: HeroDef): boolean {
  return profile.missionsCompleted >= (hero.unlock?.missionsCompleted ?? 0);
}

/** True once a hero is fully recruited and can be taken into a mission. */
export function isHeroUnlocked(profile: Profile, hero: HeroDef): boolean {
  if (!hero.unlock) return true; // always-available heroes (the default Vanguard)
  if (!missionGateMet(profile, hero)) return false;
  if (hero.unlock.goldCost && !profile.unlockedHeroes.includes(hero.id)) return false;
  return true;
}

/** Full lock state for rendering the hero-select card and its requirement text. */
export function heroLockState(profile: Profile, hero: HeroDef): HeroLockState {
  if (isHeroUnlocked(profile, hero)) return { state: 'unlocked' };
  if (!missionGateMet(profile, hero)) {
    const missionsNeeded = (hero.unlock?.missionsCompleted ?? 0) - profile.missionsCompleted;
    return { state: 'mission-locked', missionsNeeded };
  }
  // Mission gate met, so the remaining gate is the gold purchase.
  const cost = hero.unlock?.goldCost ?? 0;
  return { state: 'purchasable', cost, affordable: profile.bank >= cost };
}

/**
 * Attempts to recruit a purchasable hero, spending from the bank and
 * persisting. Returns false if the hero isn't purchasable or gold is short.
 */
export function buyHeroUnlock(profile: Profile, hero: HeroDef): boolean {
  const lock = heroLockState(profile, hero);
  if (lock.state !== 'purchasable' || !lock.affordable) return false;
  profile.bank -= lock.cost;
  if (!profile.unlockedHeroes.includes(hero.id)) profile.unlockedHeroes.push(hero.id);
  saveProfile(profile);
  return true;
}

// ---------------------------------------------------------------------------
// Mission progression (issue #24)
// ---------------------------------------------------------------------------

/** Whether a level has been cleared at least once. */
export function isLevelCleared(profile: Profile, levelId: string): boolean {
  return profile.clearedLevels.includes(levelId);
}

/**
 * Whether a mission is available to play. The first mission in `order` is
 * always open (the e2e Enter-default); every later one unlocks once the
 * mission before it in the order has been cleared.
 */
export function isLevelUnlocked(profile: Profile, levelId: string, order: readonly string[]): boolean {
  const idx = order.indexOf(levelId);
  if (idx <= 0) return true; // first mission (or an unknown id) is always open
  return isLevelCleared(profile, order[idx - 1]!);
}

/** Records a level clear (idempotent) and persists. */
export function markLevelCleared(profile: Profile, levelId: string): void {
  if (!profile.clearedLevels.includes(levelId)) {
    profile.clearedLevels.push(levelId);
    saveProfile(profile);
  }
}

/** The next mission after `levelId` in `order`, or null if it's the last. */
export function nextLevelId(levelId: string, order: readonly string[]): string | null {
  const idx = order.indexOf(levelId);
  if (idx < 0 || idx + 1 >= order.length) return null;
  return order[idx + 1]!;
}

// ---------------------------------------------------------------------------
// Weapon tiers (issue #22)
// ---------------------------------------------------------------------------

/** Every weapon for a hero, ordered by tier (tier 1 = built-in kit first). */
export function weaponsForHero(heroId: string): WeaponDef[] {
  return Object.values(WEAPONS)
    .filter((w) => w.heroId === heroId)
    .sort((a, b) => a.tier - b.tier);
}

/** The hero's tier-1 (base kit) weapon, which is always owned. */
export function baseWeapon(heroId: string): WeaponDef | undefined {
  return weaponsForHero(heroId).find((w) => w.tier === 1);
}

/** Ids of weapons the profile owns for a hero (tier 1 is always included). */
export function ownedWeapons(profile: Profile, heroId: string): string[] {
  const base = baseWeapon(heroId);
  const stored = profile.weapons[heroId]?.owned ?? [];
  const ids = new Set<string>(stored.filter((id) => WEAPONS[id]?.heroId === heroId));
  if (base) ids.add(base.id);
  // Preserve tier order for stable display.
  return weaponsForHero(heroId)
    .filter((w) => ids.has(w.id))
    .map((w) => w.id);
}

export function isWeaponOwned(profile: Profile, weaponId: string): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  return ownedWeapons(profile, def.heroId).includes(weaponId);
}

/** The equipped weapon id for a hero, defaulting to the base kit. */
export function equippedWeaponId(profile: Profile, heroId: string): string {
  const equipped = profile.weapons[heroId]?.equipped;
  if (equipped && isWeaponOwned(profile, equipped)) return equipped;
  return baseWeapon(heroId)?.id ?? '';
}

export function equippedWeapon(profile: Profile, heroId: string): WeaponDef | undefined {
  return WEAPONS[equippedWeaponId(profile, heroId)];
}

function ensureWeaponEntry(profile: Profile, heroId: string): { owned: string[]; equipped?: string } {
  const entry = profile.weapons[heroId] ?? { owned: [] };
  profile.weapons[heroId] = entry;
  return entry;
}

/**
 * Buys a weapon tier for its hero, spending from the bank and persisting.
 * Returns false when the weapon is unknown, already owned, or unaffordable.
 * Weapons are hero-gated by construction (a WeaponDef names its hero), so a
 * purchase can only ever add to that hero's own track.
 */
export function buyWeapon(profile: Profile, weaponId: string): boolean {
  const def = WEAPONS[weaponId];
  if (!def) return false;
  if (isWeaponOwned(profile, weaponId)) return false;
  if (profile.bank < def.cost) return false;
  profile.bank -= def.cost;
  const entry = ensureWeaponEntry(profile, def.heroId);
  if (!entry.owned.includes(weaponId)) entry.owned.push(weaponId);
  entry.equipped = weaponId; // auto-equip a fresh purchase
  saveProfile(profile);
  return true;
}

/** Equips an owned weapon for its hero. Returns false if not owned. */
export function equipWeapon(profile: Profile, weaponId: string): boolean {
  const def = WEAPONS[weaponId];
  if (!def || !isWeaponOwned(profile, weaponId)) return false;
  ensureWeaponEntry(profile, def.heroId).equipped = weaponId;
  saveProfile(profile);
  return true;
}

/**
 * Resolves the hero's base attack merged with a weapon's tier overrides into a
 * concrete AttackDef. The weapon's `kind` never changes (overrides omit it),
 * so the merged shape stays a valid AttackDef for the hero's attack kind.
 */
export function resolveWeaponAttack(hero: HeroDef, weapon: WeaponDef | undefined): AttackDef {
  if (!weapon) return hero.attack;
  return { ...hero.attack, ...weapon.attackOverrides } as AttackDef;
}

/**
 * The equipped-weapon attack to hand to `createSim` for a hero, or undefined
 * when the base kit is equipped (so the sim just uses `hero.attack`).
 */
export function equippedAttack(profile: Profile, hero: HeroDef): AttackDef | undefined {
  const weapon = equippedWeapon(profile, hero.id);
  if (!weapon || weapon.tier === 1) return undefined;
  return resolveWeaponAttack(hero, weapon);
}

/** Persists audio preferences without disturbing progression fields. */
export function saveAudioPrefs(volume: number, muted: boolean): void {
  const profile = loadProfile();
  profile.volume = volume;
  profile.muted = muted;
  saveProfile(profile);
}

// ---------------------------------------------------------------------------
// Hero levelling (issue #46)
// ---------------------------------------------------------------------------

/** The hero level the banked XP currently buys. */
export function profileLevel(profile: Profile): number {
  return levelForXp(PROGRESSION, profile.xp);
}

/** Banks XP earned in a mission (idempotent per call) and persists. */
export function bankXp(profile: Profile, earned: number): void {
  if (earned <= 0) return;
  profile.xp += earned;
  saveProfile(profile);
}

/** Translates purchased upgrades into sim hero modifiers. */
export function profileModifiers(profile: Profile): HeroModifiers {
  return {
    maxHpBonus: upgradeLevel(profile, 'vitality') * 20,
    damageBonus: upgradeLevel(profile, 'might') * 4
  };
}
