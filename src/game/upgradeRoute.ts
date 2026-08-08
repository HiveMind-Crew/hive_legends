import type { PartyResultPlayer } from './partyResults';

export interface MissionHubReturnTarget {
  scene: 'mission-hub';
  heroId: string;
  levelId: string;
}

export interface RunResultsData {
  mode: 'run';
  victory: boolean;
  players: PartyResultPlayer[];
  ticks: number;
  continuesUsed?: number;
  continueGold?: number;
  heroId: string;
  levelId: string;
}

export interface UpgradeShopData {
  mode: 'shop';
  heroId: string;
  levelId: string;
  returnTo: MissionHubReturnTarget;
}

export type ResultsSceneData = RunResultsData | UpgradeShopData;

export const UPGRADE_ROUTE_LABEL = 'UPGRADES  U/(Y)';

/**
 * Makes the Results shop reachable without inventing a completed run.
 *
 * The discriminant is the safety boundary: shop entries cannot carry rewards,
 * clear time, victory, or party totals, so Results cannot accidentally bank a
 * revisit as though a mission had ended.
 */
export function upgradeShopEntry(heroId: string, levelId: string): UpgradeShopData {
  return {
    mode: 'shop',
    heroId,
    levelId,
    returnTo: { scene: 'mission-hub', heroId, levelId }
  };
}

/** The exact hub state restored by Results back/cancel. */
export function resultsReturnTarget(data: ResultsSceneData): MissionHubReturnTarget {
  if (data.mode === 'shop') return { ...data.returnTo };
  return { scene: 'mission-hub', heroId: data.heroId, levelId: data.levelId };
}
