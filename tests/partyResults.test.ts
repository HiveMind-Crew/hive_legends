import { describe, expect, it } from 'vitest';
import { partyResultLines, partyResultTotals } from '../src/game/partyResults';

describe('shared-profile party results', () => {
  const players = [
    { slot: 1, heroId: 'vanguard', gold: 7, kills: 2, xp: 12 },
    { slot: 0, heroId: 'vanguard', gold: 5, kills: 3, xp: 18 }
  ];

  it('banks each per-player contribution once', () => {
    expect(partyResultTotals(players)).toEqual({ gold: 12, kills: 5, xp: 30 });
  });

  it('sanitizes negative/fractional scene data at the banking boundary', () => {
    expect(partyResultTotals([{ slot: 0, heroId: 'vanguard', gold: -4, kills: 2.9, xp: 3.8 }])).toEqual({
      gold: 0,
      kills: 2,
      xp: 3
    });
  });

  it('presents stable local slot identities in two columns', () => {
    expect(partyResultLines(players)).toEqual(['P1  5g  3 kills  18 XP        P2  7g  2 kills  12 XP']);
  });
});
