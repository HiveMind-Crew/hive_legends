import { describe, expect, it } from 'vitest';
import { ABILITY_SPECIALIZATIONS, CONTENT } from '../src/content';
import {
  abilitySpecializationState,
  buyAbilitySpecialization,
  defaultProfile,
  loadProfile,
  selectedAbilitySpecialization,
  specializedAbility,
  type Profile
} from '../src/meta/save';

const STORAGE_KEY = 'hive-legends-profile-v1';

function withStoredProfile<T>(stored: unknown, run: () => T): T {
  const items = new Map<string, string>([[STORAGE_KEY, JSON.stringify(stored)]]);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value)
    }
  });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

describe('persistent ability specializations (#108)', () => {
  const faultline = ABILITY_SPECIALIZATIONS['vanguard-faultline']!;
  const aftershock = ABILITY_SPECIALIZATIONS['vanguard-aftershock']!;
  const hero = CONTENT.heroes['vanguard']!;

  it('defaults old saves to no selection without disturbing existing fields', () => {
    const old: Partial<Profile> = { ...defaultProfile(), bank: 347, upgrades: { vitality: 2 } };
    delete old.abilitySpecializations;
    const loaded = withStoredProfile(old, loadProfile);
    expect(loaded.bank).toBe(347);
    expect(loaded.upgrades).toEqual({ vitality: 2 });
    expect(loaded.abilitySpecializations).toEqual({});
    expect(selectedAbilitySpecialization(loaded, hero.id)).toBeUndefined();
    expect(specializedAbility(loaded, hero)).toBeUndefined();
  });

  it('enforces affordability, one purchase, and permanent branch exclusivity', () => {
    const profile = defaultProfile();
    profile.bank = faultline.cost - 1;
    expect(abilitySpecializationState(profile, faultline.id)).toEqual({
      state: 'purchasable',
      cost: faultline.cost,
      affordable: false
    });
    expect(buyAbilitySpecialization(profile, faultline.id)).toBe(false);

    profile.bank = faultline.cost + 20;
    expect(buyAbilitySpecialization(profile, faultline.id)).toBe(true);
    expect(profile.bank).toBe(20);
    expect(selectedAbilitySpecialization(profile, hero.id)).toBe(faultline);
    expect(abilitySpecializationState(profile, faultline.id)).toEqual({ state: 'chosen' });
    expect(abilitySpecializationState(profile, aftershock.id)).toEqual({
      state: 'locked',
      chosenId: faultline.id
    });

    // Repeat input and the sibling branch are both no-ops with no extra spend.
    expect(buyAbilitySpecialization(profile, faultline.id)).toBe(false);
    expect(buyAbilitySpecialization(profile, aftershock.id)).toBe(false);
    expect(profile.bank).toBe(20);
  });

  it('round-trips valid choices and discards corrupt or mismatched saved ids', () => {
    const valid = withStoredProfile(
      { ...defaultProfile(), abilitySpecializations: { [faultline.groupId]: faultline.id } },
      loadProfile
    );
    expect(valid.abilitySpecializations).toEqual({ [faultline.groupId]: faultline.id });

    const corrupt = withStoredProfile(
      {
        ...defaultProfile(),
        abilitySpecializations: {
          [faultline.groupId]: 'no-such-specialization',
          'wrong-group': aftershock.id,
          numeric: 42
        }
      },
      loadProfile
    );
    expect(corrupt.abilitySpecializations).toEqual({});
  });

  it('resolves only the chosen ability for the SimPlayerConfig handoff', () => {
    const profile = defaultProfile();
    profile.bank = aftershock.cost;
    expect(buyAbilitySpecialization(profile, aftershock.id)).toBe(true);
    const resolved = specializedAbility(profile, hero);
    expect(resolved).toBe(aftershock.ability);
    expect(resolved?.kind).toBe(hero.ability.kind);
    expect(resolved).not.toBe(hero.ability);
  });
});
