import type { PropDef } from '../sim/types';

/** Breakable props: reward aggression with loot. One hit shatters them. */
export const PROPS: Record<string, PropDef> = {
  'resin-husk': {
    id: 'resin-husk',
    name: 'Resin Husk',
    maxHp: 1,
    radius: 9,
    dropKind: 'gold',
    dropMin: 4,
    dropMax: 9
  },
  'amber-clutch': {
    id: 'amber-clutch',
    name: 'Amber Clutch',
    maxHp: 1,
    radius: 9,
    dropKind: 'health',
    dropMin: 10,
    dropMax: 20
  }
};
