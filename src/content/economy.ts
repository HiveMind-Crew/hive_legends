import type { EconomyDef, LevelDef } from '../sim/types';

/**
 * Completion-forward mission rewards (issue #102).
 *
 * A first trip through authored content should fund a complete build for one
 * hero without requiring a replay. Gold found in the level remains valuable,
 * but these bounties make the baseline payout predictable even when a player
 * misses a secret room or leaves props behind.
 */
export const ECONOMY: EconomyDef = {
  firstClearMissionBonus: 150,
  firstClearBossBonus: 250,
  // The arcade continue (issue #99). The first one costs about a third of a
  // mission's modelled income and each further one in the same run costs that
  // much again, so a bad patch is recoverable and a bad run is not free.
  continueBaseCost: 150,
  continueCostStep: 150
};

/** The one-time bounty for clearing an authored level for the first time. */
export function firstClearBonus(level: LevelDef): number {
  return level.boss ? ECONOMY.firstClearBossBonus : ECONOMY.firstClearMissionBonus;
}
