import type { PressureDef } from '../sim/types';

/**
 * "The hive rouses" (issue #41) — our adapted answer to the genre's health
 * drain. Rather than starving the player on a clock, dawdling makes the brood
 * *fiercer*: faster, harder-hitting, and pouring out a little quicker.
 *
 * Why potency over headcount: the swarmer node already sits at its alive-cap
 * within seconds (interval 24 / cap 9, see #38), so shortening intervals alone
 * would barely register — and flooding the screen further would blow the
 * ~15-enemy readability budget in docs/design/visual-direction.md.
 *
 * Tuning intent: a competent clear (~20-35 s on the Warrens) never sees stage
 * 1, so this punishes loitering, not skill. Past the grace period it ramps
 * every 15 s and plateaus at stage 5 (+40% speed, +50% damage, spawn intervals
 * at ~44%), which is a real threat but still a fight you can escape by
 * finishing the objective.
 */
export const PRESSURE: PressureDef = {
  gracePeriodTicks: 2400, // 40 s of calm
  intervalTicks: 900, // then a stage every 15 s
  maxStage: 5,
  moveSpeedPerStage: 0.08,
  damagePerStage: 0.1,
  spawnIntervalMult: 0.85
};
