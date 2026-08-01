import {
  abilitySpecializationsForHero,
  abilitySpecializationState,
  type Profile
} from '../meta/save';

export type SpecializationShopStatus = 'chosen' | 'locked' | 'affordable' | 'unaffordable';

export interface SpecializationShopRow {
  id: string;
  key: string;
  status: SpecializationShopStatus;
  text: string;
}

/**
 * Pure Results-shop copy for a hero's permanent branch. Heroes with no
 * authored pair return no rows, so the scene never advertises a dead control.
 */
export function specializationShopRows(profile: Profile, heroId: string): SpecializationShopRow[] {
  const defs = abilitySpecializationsForHero(heroId);
  return defs.map((def, index) => {
    const state = abilitySpecializationState(profile, def.id);
    const pad = index === 0 ? '↑' : '↓';
    const prefix = `[${index + 5} / Pad ${pad}] ${def.name} — ${def.description}`;
    if (state.state === 'chosen') return { id: def.id, key: String(index + 5), status: 'chosen', text: `${prefix} — CHOSEN` };
    if (state.state === 'locked') {
      const chosen = defs.find((candidate) => candidate.id === state.chosenId);
      return {
        id: def.id,
        key: String(index + 5),
        status: 'locked',
        text: `${prefix} — LOCKED (${chosen?.name ?? 'other branch'} chosen)`
      };
    }
    if (state.state === 'purchasable' && state.affordable) {
      return { id: def.id, key: String(index + 5), status: 'affordable', text: `${prefix} — BUY ${state.cost}g` };
    }
    const missing = state.state === 'purchasable' ? Math.max(0, state.cost - profile.bank) : 0;
    return {
      id: def.id,
      key: String(index + 5),
      status: 'unaffordable',
      text: `${prefix} — LOCKED (need ${missing}g more)`
    };
  });
}
