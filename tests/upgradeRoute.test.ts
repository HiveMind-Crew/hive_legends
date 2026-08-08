import { describe, expect, it } from 'vitest';
import { resultsReturnTarget, upgradeShopEntry, UPGRADE_ROUTE_LABEL, type ResultsSceneData } from '../src/game/upgradeRoute';

describe('upgrade route', () => {
  it('creates an explicit shop-only entry with no run-result fields', () => {
    const entry = upgradeShopEntry('ranger', 'resin-galleries');

    expect(entry).toEqual({
      mode: 'shop',
      heroId: 'ranger',
      levelId: 'resin-galleries',
      returnTo: { scene: 'mission-hub', heroId: 'ranger', levelId: 'resin-galleries' }
    });
    expect(entry).not.toHaveProperty('victory');
    expect(entry).not.toHaveProperty('players');
    expect(entry).not.toHaveProperty('ticks');
    expect(UPGRADE_ROUTE_LABEL).toContain('UPGRADES');
  });

  it('restores the shop origin rather than deriving a new hub selection', () => {
    const entry = upgradeShopEntry('sentinel', 'cobalt-combs');
    expect(resultsReturnTarget(entry)).toEqual({
      scene: 'mission-hub',
      heroId: 'sentinel',
      levelId: 'cobalt-combs'
    });
  });

  it('returns a completed run to its own hero and level', () => {
    const entry: ResultsSceneData = {
      mode: 'run',
      victory: true,
      players: [],
      ticks: 900,
      heroId: 'vanguard',
      levelId: 'brood-warrens'
    };

    expect(resultsReturnTarget(entry)).toEqual({
      scene: 'mission-hub',
      heroId: 'vanguard',
      levelId: 'brood-warrens'
    });
  });
});
