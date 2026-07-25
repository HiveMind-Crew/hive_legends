import { PROGRESSION } from '../content/progression';
import { SPOKES } from '../content/spokes';
import { WEAPONS } from '../content/weapons';
import { levelForXp } from '../sim/sim';
import type { AttackDef, HeroDef, HeroModifiers, SpokeDef, WeaponDef } from '../sim/types';

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

// --- The mission wheel (issue #54) ------------------------------------------
//
// Every rule below derives from `Profile.clearedLevels` alone. No progression
// state is stored per spoke, which is what keeps adding a world a pure content
// change and means existing saves never need migrating. See docs/PROGRESSION.md.

/** Why a wheel node can't be entered — the hub renders different copy per reason. */
export type NodeLockReason =
  /** An earlier mission in the same spoke is still uncleared. */
  | 'previous-mission'
  /** It's the boss, and the spoke's missions aren't all cleared. */
  | 'boss-gated'
  /** The whole spoke is shut until the previous spoke's boss falls. */
  | 'spoke-gated';

export type NodeLockState =
  | { state: 'available' }
  | { state: 'cleared' }
  | { state: 'locked'; reason: NodeLockReason };

/** A level's position on the wheel. */
interface WheelNode {
  spoke: SpokeDef;
  /** Index into `spoke.missions`, or -1 for the spoke's boss node. */
  index: number;
  isBoss: boolean;
}

function findSpoke(spokeId: string): SpokeDef | undefined {
  return SPOKES.find((s) => s.id === spokeId);
}

/** Locates a level on the wheel, or null if it belongs to no spoke. */
function findNode(levelId: string): WheelNode | null {
  for (const spoke of SPOKES) {
    const index = spoke.missions.indexOf(levelId);
    if (index >= 0) return { spoke, index, isBoss: false };
    if (spoke.boss === levelId) return { spoke, index: -1, isBoss: true };
  }
  return null;
}

/** The spoke a level belongs to, or undefined if it sits off the wheel. */
export function spokeForLevel(levelId: string): SpokeDef | undefined {
  return findNode(levelId)?.spoke;
}

/**
 * Whether a spoke is open at all. The first spoke (no `requiresSpoke`) always
 * is; every later one waits for the named spoke's boss to fall.
 */
export function isSpokeUnlocked(profile: Profile, spokeId: string): boolean {
  const spoke = findSpoke(spokeId);
  if (!spoke) return false;
  if (!spoke.requiresSpoke) return true;
  const gate = findSpoke(spoke.requiresSpoke);
  if (!gate) return false; // malformed wheel; a content test catches this
  return isLevelCleared(profile, gate.boss);
}

/**
 * Full state of a wheel node: cleared, available, or locked with the reason.
 * A cleared level stays enterable (Results offers a replay), so `cleared` is
 * reported separately rather than folded into `available`.
 *
 * A level that belongs to no spoke reports `available`, preserving the old
 * linear rule's treatment of unknown ids as open.
 */
export function nodeLockState(profile: Profile, levelId: string): NodeLockState {
  if (isLevelCleared(profile, levelId)) return { state: 'cleared' };

  const node = findNode(levelId);
  if (!node) return { state: 'available' };
  if (!isSpokeUnlocked(profile, node.spoke.id)) return { state: 'locked', reason: 'spoke-gated' };

  if (node.isBoss) {
    const allCleared = node.spoke.missions.every((id) => isLevelCleared(profile, id));
    return allCleared ? { state: 'available' } : { state: 'locked', reason: 'boss-gated' };
  }

  // Missions run in sequence: the first is open, each later one waits for the
  // mission before it.
  if (node.index === 0) return { state: 'available' };
  const previous = node.spoke.missions[node.index - 1]!;
  return isLevelCleared(profile, previous) ? { state: 'available' } : { state: 'locked', reason: 'previous-mission' };
}

/**
 * How far through a spoke's missions the player is. Counts missions only —
 * the boss is the reward for finishing them, not a fourth step toward it.
 */
export function spokeProgress(profile: Profile, spokeId: string): { cleared: number; total: number } {
  const spoke = findSpoke(spokeId);
  if (!spoke) return { cleared: 0, total: 0 };
  return {
    cleared: spoke.missions.filter((id) => isLevelCleared(profile, id)).length,
    total: spoke.missions.length
  };
}

/**
 * The node the hub should put its cursor on: the first thing that is playable
 * and not yet done, walking the wheel in order. Once everything is cleared it
 * falls back to the last reachable node so the cursor is never homeless.
 */
export function suggestedNode(profile: Profile): { spokeId: string; levelId: string } {
  let lastReachable: { spokeId: string; levelId: string } | null = null;

  for (const spoke of SPOKES) {
    if (!isSpokeUnlocked(profile, spoke.id)) continue;
    for (const levelId of [...spoke.missions, spoke.boss]) {
      const state = nodeLockState(profile, levelId);
      if (state.state === 'locked') continue;
      if (state.state === 'available') return { spokeId: spoke.id, levelId };
      lastReachable = { spokeId: spoke.id, levelId }; // cleared — remember and keep looking
    }
  }

  // Everything cleared, or a wheel with no reachable node at all.
  return lastReachable ?? { spokeId: SPOKES[0]?.id ?? '', levelId: SPOKES[0]?.missions[0] ?? '' };
}

/**
 * Whether a mission can be entered. Thin wrapper over `nodeLockState`, kept
 * for the pre-wheel call sites; `order` is ignored and goes away with them
 * once `MissionHubScene` lands (issue #57).
 */
export function isLevelUnlocked(profile: Profile, levelId: string, _order?: readonly string[]): boolean {
  return nodeLockState(profile, levelId).state !== 'locked';
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
