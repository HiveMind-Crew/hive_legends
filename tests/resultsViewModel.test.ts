import { describe, expect, it } from 'vitest';
import { ABILITY_SPECIALIZATIONS } from '../src/content';
import { buyAbilitySpecialization, defaultProfile } from '../src/meta/save';
import { resultsNavigationActions, resultsShopCards, specializationCards, xpProgressViewModel } from '../src/game/resultsViewModel';

describe('results view models', () => {
  it('encodes affordability, rank, and max states without prose parsing', () => {
    const profile = defaultProfile();
    const cards = resultsShopCards(profile, 'vanguard');
    expect(cards.slice(0, 2).map((card) => card.status)).toEqual(['unaffordable', 'unaffordable']);
    profile.bank = 80;
    expect(resultsShopCards(profile, 'vanguard')[0]).toMatchObject({ status: 'available', rank: 0, cost: 80 });
    profile.upgrades.vitality = 5;
    expect(resultsShopCards(profile, 'vanguard')[0]).toMatchObject({ status: 'maxed', rank: 5, cost: null });
  });

  it('keeps the weapon card data-driven across purchase and equip states', () => {
    const profile = defaultProfile();
    profile.bank = 90;
    expect(resultsShopCards(profile, 'vanguard').at(-1)).toMatchObject({ id: 'vanguard-t2', nextPurchase: true, status: 'available' });
  });

  it('models specialization confirmation choices as available, chosen, and closed', () => {
    const profile = defaultProfile();
    const faultline = ABILITY_SPECIALIZATIONS['vanguard-faultline']!;
    profile.bank = faultline.cost;
    expect(specializationCards(profile, 'vanguard').map((card) => card.status)).toEqual(['available', 'available']);
    expect(buyAbilitySpecialization(profile, faultline.id)).toBe(true);
    expect(specializationCards(profile, 'vanguard').map((card) => card.status)).toEqual(['chosen', 'closed']);
  });

  it('computes visible XP progress with a cap state', () => {
    const profile = defaultProfile();
    profile.xp = 160;
    expect(xpProgressViewModel(profile)).toMatchObject({ level: 3, percent: 0, atCap: false });
    profile.xp = 99999;
    expect(xpProgressViewModel(profile)).toMatchObject({ atCap: true, percent: 100 });
  });

  it('names every results destination and keeps next-mission context subordinate', () => {
    expect(resultsNavigationActions('The Resin Galleries')).toEqual([
      {
        id: 'mission-select',
        label: 'MISSION SELECT',
        detail: 'NEXT MISSION  ·  THE RESIN GALLERIES',
        shortcut: 'N',
        glyph: '◆'
      },
      {
        id: 'replay',
        label: 'REPLAY',
        detail: 'RUN THIS MISSION AGAIN',
        shortcut: 'R',
        glyph: '↻'
      },
      {
        id: 'hero-select',
        label: 'HERO SELECT',
        detail: 'CHANGE YOUR HERO',
        shortcut: 'H',
        glyph: '◇'
      }
    ]);
  });

  it('still identifies Mission Select when there is no next mission', () => {
    expect(resultsNavigationActions()[0]).toMatchObject({
      id: 'mission-select',
      label: 'MISSION SELECT',
      detail: 'REVIEW THE MISSION MAP'
    });
  });
});
