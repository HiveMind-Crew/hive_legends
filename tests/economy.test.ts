import { describe, expect, it } from 'vitest';
import { renderEconomyTables, staticLevelGold, upgradeTrackCost } from '../scripts/economyTables';
import { CONTENT, firstClearBonus, LEVELS, MISSION_ORDER } from '../src/content';
import { UPGRADES } from '../src/meta/save';

describe('completion-forward economy (#102)', () => {
  it('pays the authored mission and boss first-clear bounties', () => {
    expect(firstClearBonus(LEVELS['brood-warrens']!)).toBe(CONTENT.economy.firstClearMissionBonus);
    expect(firstClearBonus(LEVELS['hollow-throne']!)).toBe(CONTENT.economy.firstClearBossBonus);
  });

  it('one modeled pass funds shared upgrades and a starter hero full weapon track', () => {
    const firstPassIncome = MISSION_ORDER.reduce((sum, levelId) => {
      const level = LEVELS[levelId]!;
      return sum + staticLevelGold(level, CONTENT) + firstClearBonus(level);
    }, 0);
    const sharedUpgrades = Object.values(UPGRADES).reduce(
      (sum, upgrade) => sum + upgradeTrackCost(upgrade),
      0
    );
    const starterWeapons = Object.values(CONTENT.weapons)
      .filter((weapon) => weapon.heroId === 'vanguard')
      .reduce((sum, weapon) => sum + weapon.cost, 0);

    expect(firstPassIncome).toBeGreaterThanOrEqual(sharedUpgrades + starterWeapons);
  });

  it('keeps full-roster completion below two modeled passes', () => {
    const report = renderEconomyTables(LEVELS, CONTENT, UPGRADES);
    const ratio = Number(report.match(/income: \*\*(\d+\.\d+)×\*\*/)![1]);
    expect(ratio).toBeLessThan(2);
  });
});
