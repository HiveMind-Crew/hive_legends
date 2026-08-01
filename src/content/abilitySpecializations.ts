import type { AbilitySpecializationDef, BlastAbilityDef } from '../sim/types';
import { HEROES } from './heroes';

const SUNDER_SLAM = HEROES['vanguard']!.ability as BlastAbilityDef;

/**
 * Permanent ability branches, keyed by stable save ids.
 *
 * M2's first specialization slice is complete for the Vanguard. Heroes absent
 * from this table have no shop row or dead control. To extend the roster,
 * author exactly two definitions for one hero under one stable group id and
 * provide a same-kind resolved ability for each branch.
 */
export const ABILITY_SPECIALIZATIONS: Record<string, AbilitySpecializationDef> = {
  'vanguard-faultline': {
    id: 'vanguard-faultline',
    heroId: 'vanguard',
    groupId: 'vanguard-sunder-slam',
    name: 'Faultline Drive',
    description: 'Rips a narrow line far ahead instead of bursting around you.',
    cost: 180,
    ability: {
      ...SUNDER_SLAM,
      id: 'sunder-slam-faultline',
      name: 'Faultline Drive',
      shape: { kind: 'faultline', length: 230, width: 64 }
    }
  },
  'vanguard-aftershock': {
    id: 'vanguard-aftershock',
    heroId: 'vanguard',
    groupId: 'vanguard-sunder-slam',
    name: 'Echoing Crater',
    description: 'Bursts again at the cast point after a short delay.',
    cost: 180,
    ability: {
      ...SUNDER_SLAM,
      id: 'sunder-slam-aftershock',
      name: 'Echoing Crater',
      aftershock: { delayTicks: 36, damage: 22, radius: 90, knockback: 260 }
    }
  }
};
