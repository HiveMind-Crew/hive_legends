import type { ProgressionDef } from '../sim/types';

/**
 * Hero levelling (issue #46). XP is earned from kills and objectives during a
 * mission and banked between runs; crossing a threshold levels the hero up
 * mid-fight. This is the *earned* counterpart to the *bought* gold upgrades in
 * src/meta/save.ts — the two stack.
 *
 * The curve is deliberately front-loaded: the first couple of levels land
 * inside the opening mission so a new player feels growth immediately, then it
 * stretches out. `xpToReach[i]` is the total XP needed for level i + 1, so
 * index 0 is level 1 at 0 XP.
 *
 * Level 10 is the ceiling and stays the ceiling (issue #103): the archetypes in
 * docs/COMBAT.md are tuned against base kits, and a curve that keeps paying max
 * HP and damage forever eventually flattens the differences between them. What
 * changes past the cap is that XP stops vanishing — it converts to gold at
 * `capOverflowGoldPerXp`, so a veteran's replay still pays into the roster.
 */
export const PROGRESSION: ProgressionDef = {
  // Levels 1..10. Totals, not per-level deltas.
  xpToReach: [0, 60, 160, 320, 560, 900, 1360, 1960, 2720, 3660],
  // Applied per level gained, on top of the hero's base kit and any upgrades.
  maxHpPerLevel: 8,
  damagePerLevel: 2,
  // A Warrens clear earns ~286 XP, so a capped replay pays ~71g: worth having,
  // well short of the 150g first-clear bounty a fresh realm still pays.
  capOverflowGoldPerXp: 0.25
};
