import { describe, expect, it } from 'vitest';
import { heroLevelCopy, xpResultCopy } from '../src/game/xpCopy';
import { bankXp, defaultProfile, MAX_HERO_LEVEL, XP_CAP } from '../src/meta/save';

/**
 * Level-cap wording (issue #103). The defect these guard against is silence:
 * a capped hero used to read exactly like one still climbing.
 */
describe('hero level copy', () => {
  it('tags the cap and nothing else', () => {
    expect(heroLevelCopy(7, false)).toBe('Lv 7');
    expect(heroLevelCopy(MAX_HERO_LEVEL, true)).toBe(`Lv ${MAX_HERO_LEVEL} MAX`);
  });
});

describe('results XP copy', () => {
  it('reads as plain progress below the cap', () => {
    const profile = defaultProfile();
    const result = bankXp(profile, 286);
    const line = xpResultCopy(286, result);
    expect(line).toBe(`XP earned: 286    Hero level: ${result.level}`);
    expect(result.level).toBeLessThan(MAX_HERO_LEVEL);
    expect(line).not.toContain('MAX');
  });

  it('names both halves of the run that reaches the cap', () => {
    const profile = defaultProfile();
    bankXp(profile, XP_CAP - 100);
    const result = bankXp(profile, 300);
    expect(xpResultCopy(300, result)).toBe(
      `XP earned: 300 (100 to level, 200 → ${result.gold}g)    Hero level: ${MAX_HERO_LEVEL} (MAX)`
    );
  });

  it('calls a capped run what it is: a gold dividend', () => {
    const profile = defaultProfile();
    bankXp(profile, XP_CAP);
    const result = bankXp(profile, 286);
    expect(xpResultCopy(286, result)).toBe(
      `XP earned: 286 → ${result.gold}g veteran's dividend    Hero level: ${MAX_HERO_LEVEL} (MAX)`
    );
  });

  it('drops the dividend clause when the payout rounds to nothing', () => {
    const profile = defaultProfile();
    bankXp(profile, XP_CAP);
    const result = bankXp(profile, 2);
    expect(result.gold).toBe(0);
    expect(xpResultCopy(2, result)).toBe(`XP earned: 2    Hero level: ${MAX_HERO_LEVEL} (MAX)`);
  });
});
