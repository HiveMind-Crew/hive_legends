import { describe, expect, it } from 'vitest';
import { firstClearBonus, LEVELS } from '../src/content';
import { defaultProfile, markLevelCleared } from '../src/meta/save';
import { missionHubItems } from '../src/game/hubViewModel';

describe('mission hub view model', () => {
  it('keeps locked rows readable before selection and owns detail metadata', () => {
    const profile = defaultProfile();
    const items = missionHubItems(profile);
    const boss = items.find((item) => item.levelId === 'hollow-throne')!;
    expect(boss.state).toBe('locked');
    expect(boss.rowCopy).toContain('clear every mission in the realm');
    expect(boss.name).toBe('The Hollow Throne');
    expect(boss.biomeLabel).toBe('THRONE · BONE AND BROOD');
    expect(boss.threatRating).toBe(4);
    expect(boss.encounters.length).toBeGreaterThan(0);
    expect(boss.description.length).toBeGreaterThan(0);
  });

  it('derives first-clear bounty from the authored economy and preserves route order', () => {
    const profile = defaultProfile();
    const items = missionHubItems(profile);
    expect(items.map((item) => item.levelId)).toEqual(['brood-warrens', 'resin-galleries', 'cobalt-combs', 'hollow-throne']);
    expect(items[0]!.firstClearBounty).toBe(firstClearBonus(LEVELS['brood-warrens']!));
    markLevelCleared(profile, 'brood-warrens');
    expect(missionHubItems(profile)[1]!.state).toBe('available');
  });
});
