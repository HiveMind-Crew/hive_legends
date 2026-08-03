import { CONTENT, firstClearBonus, LEVELS } from '../content';
import {
  bestClearTicks,
  masteredHeroes,
  nodeLockState,
  spokeProgress,
  type NodeLockReason,
  type NodeLockState,
  type Profile
} from '../meta/save';
import { statusCopy } from './hubCopy';

export interface MissionHubItem {
  levelId: string;
  spokeId: string;
  spokeName: string;
  ordinal: number;
  isBoss: boolean;
  name: string;
  state: NodeLockState['state'];
  lockReason?: NodeLockReason;
  rowCopy: string;
  biomeLabel: string;
  threatRating: number;
  threatLabel: string;
  encounters: readonly string[];
  description: string;
  firstClearBounty: number;
  bestTicks: number | null;
  masteryCount: number;
  masteryTotal: number;
}

/** The complete authored route, flattened in content order for one cursor. */
export function missionHubItems(profile: Profile): MissionHubItem[] {
  const masteryTotal = Object.keys(CONTENT.heroes).length;
  return CONTENT.spokes.flatMap((spoke) =>
    [...spoke.missions, spoke.boss].map((levelId, ordinal) => {
      const level = LEVELS[levelId]!;
      const lock = nodeLockState(profile, levelId);
      return {
        levelId,
        spokeId: spoke.id,
        spokeName: spoke.name,
        ordinal,
        isBoss: levelId === spoke.boss,
        name: level.name,
        state: lock.state,
        ...(lock.state === 'locked' ? { lockReason: lock.reason } : {}),
        rowCopy: statusCopy(lock),
        biomeLabel: level.mission.biomeLabel,
        threatRating: level.mission.threatRating,
        threatLabel: level.mission.threatLabel,
        encounters: level.mission.encounters,
        description: level.mission.description,
        firstClearBounty: firstClearBonus(level),
        bestTicks: bestClearTicks(profile, levelId),
        masteryCount: masteredHeroes(profile, levelId).length,
        masteryTotal
      } satisfies MissionHubItem;
    })
  );
}

export function spokeProgressCopy(profile: Profile, spokeId: string): string {
  const progress = spokeProgress(profile, spokeId);
  return `${progress.cleared}/${progress.total} MISSIONS CLEARED`;
}
