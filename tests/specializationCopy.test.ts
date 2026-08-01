import { describe, expect, it } from 'vitest';
import { ABILITY_SPECIALIZATIONS } from '../src/content';
import { buyAbilitySpecialization, defaultProfile } from '../src/meta/save';
import { specializationShopRows } from '../src/game/specializationCopy';

describe('Results ability-specialization copy', () => {
  const faultline = ABILITY_SPECIALIZATIONS['vanguard-faultline']!;

  it('shows affordability, then chosen and mutually locked states', () => {
    const profile = defaultProfile();
    profile.bank = faultline.cost - 1;
    let rows = specializationShopRows(profile, 'vanguard');
    expect(rows.map((row) => row.status)).toEqual(['unaffordable', 'unaffordable']);
    expect(rows[0]!.text).toContain('LOCKED (need 1g more)');

    profile.bank = faultline.cost;
    rows = specializationShopRows(profile, 'vanguard');
    expect(rows.map((row) => row.status)).toEqual(['affordable', 'affordable']);
    expect(rows.map((row) => row.key)).toEqual(['5', '6']);

    expect(buyAbilitySpecialization(profile, faultline.id)).toBe(true);
    rows = specializationShopRows(profile, 'vanguard');
    expect(rows.map((row) => row.status)).toEqual(['chosen', 'locked']);
    expect(rows[0]!.text).toContain('CHOSEN');
    expect(rows[1]!.text).toContain(`LOCKED (${faultline.name} chosen)`);
  });

  it('does not expose dead specialization controls for unsupported heroes', () => {
    expect(specializationShopRows(defaultProfile(), 'arcanist')).toEqual([]);
    expect(specializationShopRows(defaultProfile(), 'ranger')).toEqual([]);
    expect(specializationShopRows(defaultProfile(), 'sentinel')).toEqual([]);
  });
});
