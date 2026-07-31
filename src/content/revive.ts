import type { ReviveDef } from '../sim/types';

/**
 * The arcade continue (issue #99).
 *
 * Dying two rooms from Mireveil after a five-minute fight used to cost the
 * whole run. The genre answer is the continue: die, pay, stand up **where you
 * fell** — not at a checkpoint, and not at the start of the room.
 *
 * Standing up in the middle of the swarm that just killed you is not a second
 * chance, so a continue buys space as well as health: half HP, two and a half
 * seconds of invulnerability, and a shove that clears the ring of enemies
 * standing over the body. Together those are roughly one Sunder Slam's worth
 * of breathing room — enough to move, not enough to fight from.
 *
 * The gold price is authored separately, in `src/content/economy.ts`: this is
 * what a continue does, that is what it costs.
 */
export const REVIVE: ReviveDef = {
  hpFraction: 0.5,
  // 150 ticks = 2.5s, an order above the 40-tick i-frames a normal hit grants.
  invulnTicks: 150,
  // Wider than the Vanguard's reach (68px) so the shove actually opens a gap.
  clearRadius: 120,
  knockback: 320
};
