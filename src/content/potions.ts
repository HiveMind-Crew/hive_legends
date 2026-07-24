import type { PotionDef } from '../sim/types';

/**
 * The screen-clear consumable (issue #41). One original relic: the Hive-Fire
 * Draught, a hoarded panic button that detonates in a wide self-centered burst
 * — enough to wipe a skitterling swarm (40 HP) and heavily wound a Brood Node.
 * Scarce by design (a mission authors only one or two), so the choice of *when*
 * to spend it is the risk/reward. Numbers live here, not in engine code.
 */
export const POTION: PotionDef = {
  name: 'Hive-Fire Draught',
  damage: 60,
  radius: 190,
  knockback: 320
};
