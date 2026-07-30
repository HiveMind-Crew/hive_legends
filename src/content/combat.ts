import type { CombatDef } from '../sim/types';

/**
 * Shared combat constants — the numbers every hero attack is tuned *against*,
 * rather than numbers any single hero owns. Previously module constants in
 * `src/sim/sim.ts`; they belong here under the "gameplay numbers are data"
 * rule, and the invariant tests in `tests/combat.test.ts` need to read them.
 *
 * See docs/COMBAT.md for how these interact with hero attack cadence.
 */
export const COMBAT: CombatDef = {
  // A generous 0.5 s of i-frames after any hit, so a player caught inside a
  // crowd is never chain-damaged to death without a chance to walk out.
  playerHitInvulnTicks: 30,
  // Every landed hit freezes an enemy for this long — it stops steering, can't
  // open an attack, and a committed windup pauses mid-telegraph. This is the
  // ceiling that hero fire rate is measured against: an attack whose cooldown
  // is <= this value re-applies hitstun before the previous one lapses and
  // locks a single target out of the fight permanently. See the "Cadence vs
  // hitstun" section of docs/COMBAT.md.
  enemyHitstunTicks: 10,
  // Knockback bleeds off ~15% per tick, so a 260-impulse shove reads as a
  // short, punchy shunt rather than a long slide.
  knockbackDecay: 0.85,
  // Prefer the half of a generator's spawn ring opposite the nearest player.
  // Six seeded samples make a fallback rare while preserving wall safety.
  generatorSpawnExclusionArcDeg: 180
};
