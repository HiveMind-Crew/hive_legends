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
  firstClearBossBonus: 250
};

/** The one-time bounty for clearing an authored level for the first time. */
export function firstClearBonus(level: LevelDef): number {
  return level.boss ? ECONOMY.firstClearBossBonus : ECONOMY.firstClearMissionBonus;
}
