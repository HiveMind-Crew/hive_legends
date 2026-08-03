import {
  abilitySpecializationsForHero,
  abilitySpecializationState,
  equippedWeaponId,
  ownedWeapons,
  upgradeCost,
  upgradeLevel,
  UPGRADES,
  weaponsForHero,
  type Profile
} from '../meta/save';
import { PROGRESSION } from '../content/progression';

export type ShopCardStatus = 'available' | 'unaffordable' | 'maxed';

export interface UpgradeShopCard {
  kind: 'upgrade';
  id: string;
  name: string;
  description: string;
  rank: number;
  maxRank: number;
  cost: number | null;
  status: ShopCardStatus;
}

export interface WeaponShopCard {
  kind: 'weapon';
  id: string;
  name: string;
  description: string;
  tier: number;
  cost: number | null;
  owned: boolean;
  equipped: boolean;
  nextPurchase: boolean;
  status: ShopCardStatus;
  ownedCount: number;
  totalCount: number;
}

export type ShopCard = UpgradeShopCard | WeaponShopCard;

export function resultsShopCards(profile: Profile, heroId: string): ShopCard[] {
  const upgradeCards: ShopCard[] = Object.values(UPGRADES).map((def) => {
    const rank = upgradeLevel(profile, def.id);
    const cost = upgradeCost(profile, def.id);
    return {
      kind: 'upgrade',
      id: def.id,
      name: def.name,
      description: def.description,
      rank,
      maxRank: def.maxLevel,
      cost,
      status: cost === null ? 'maxed' : profile.bank >= cost ? 'available' : 'unaffordable'
    };
  });

  const weapons = weaponsForHero(heroId);
  const owned = new Set(ownedWeapons(profile, heroId));
  const next = weapons.find((weapon) => !owned.has(weapon.id));
  const equippedId = equippedWeaponId(profile, heroId);
  const weapon = next ?? weapons[weapons.length - 1];
  if (weapon) {
    upgradeCards.push({
      kind: 'weapon',
      id: weapon.id,
      name: weapon.name,
      description: next
        ? `${weapon.description} · tier ${weapon.tier} purchase`
        : `${weapon.description} · choose an owned tier to equip`,
      tier: weapon.tier,
      cost: next ? weapon.cost : null,
      owned: owned.has(weapon.id),
      equipped: equippedId === weapon.id,
      nextPurchase: Boolean(next),
      status: next ? (profile.bank >= weapon.cost ? 'available' : 'unaffordable') : 'maxed',
      ownedCount: owned.size,
      totalCount: weapons.length
    });
  }
  return upgradeCards;
}

export interface SpecializationShopCard {
  id: string;
  name: string;
  description: string;
  detail: string;
  cost: number;
  status: 'chosen' | 'closed' | 'available' | 'unaffordable';
  chosenId?: string;
  abilityKind: string;
}

export function specializationCards(profile: Profile, heroId: string): SpecializationShopCard[] {
  const defs = abilitySpecializationsForHero(heroId);
  return defs.map((def) => {
    const state = abilitySpecializationState(profile, def.id);
    const chosenId = state.state === 'locked' ? state.chosenId : undefined;
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      detail: specializationDetail(def),
      cost: def.cost,
      status:
        state.state === 'chosen'
          ? 'chosen'
          : state.state === 'locked'
            ? 'closed'
            : state.state === 'purchasable' && state.affordable
              ? 'available'
              : 'unaffordable',
      ...(chosenId ? { chosenId } : {}),
      abilityKind: def.ability.kind
    } satisfies SpecializationShopCard;
  });
}

function specializationDetail(def: ReturnType<typeof abilitySpecializationsForHero>[number]): string {
  if (def.ability.kind !== 'blast') return def.description;
  if (def.ability.shape?.kind === 'faultline') {
    return `Replaces the circular Sunder Slam with a focused ${def.ability.shape.length}×${def.ability.shape.width} line attack.`;
  }
  if (def.ability.aftershock) {
    return `The second burst triggers after ${def.ability.aftershock.delayTicks / 60}s and deals ${def.ability.aftershock.damage} damage.`;
  }
  return def.description;
}

export interface XpProgressViewModel {
  level: number;
  totalXp: number;
  percent: number;
  atCap: boolean;
  label: string;
}

export function xpProgressViewModel(profile: Profile): XpProgressViewModel {
  const level = Math.max(1, levelForXp(profile.xp));
  const cap = PROGRESSION.xpToReach[PROGRESSION.xpToReach.length - 1] ?? 0;
  const next = PROGRESSION.xpToReach[level] ?? cap;
  const start = PROGRESSION.xpToReach[level - 1] ?? 0;
  const percent = next <= start ? 100 : Math.round(((profile.xp - start) / (next - start)) * 100);
  const atCap = profile.xp >= cap;
  return {
    level,
    totalXp: profile.xp,
    percent: Math.max(0, Math.min(100, atCap ? 100 : percent)),
    atCap,
    label: atCap ? `LEVEL ${level} · MAX` : `LEVEL ${level} · ${profile.xp} XP`
  };
}

function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < PROGRESSION.xpToReach.length; i++) {
    if (xp >= (PROGRESSION.xpToReach[i] ?? Infinity)) level = i + 1;
  }
  return level;
}
