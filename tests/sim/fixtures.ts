import type { Sim } from '../../src/sim/sim';

/** Restores always-active arena semantics for tests focused on other mechanics. */
export function activateAllObjectives(sim: Sim): Sim {
  for (const generator of sim.state.generators) generator.active = true;
  if (sim.state.boss) sim.state.boss.active = true;
  for (const encounter of sim.state.encounters) {
    encounter.active = true;
    encounter.cleared = true;
    encounter.activatedTick = 0;
    encounter.clearedTick = 0;
  }
  return sim;
}
