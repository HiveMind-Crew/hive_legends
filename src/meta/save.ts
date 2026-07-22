import type { HeroDef, HeroModifiers } from '../sim/types';

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
      unlockedHeroes: [...(parsed.unlockedHeroes ?? [])]
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

/** Persists audio preferences without disturbing progression fields. */
export function saveAudioPrefs(volume: number, muted: boolean): void {
  const profile = loadProfile();
  profile.volume = volume;
  profile.muted = muted;
  saveProfile(profile);
}

/** Translates purchased upgrades into sim hero modifiers. */
export function profileModifiers(profile: Profile): HeroModifiers {
  return {
    maxHpBonus: upgradeLevel(profile, 'vitality') * 20,
    damageBonus: upgradeLevel(profile, 'might') * 4
  };
}
