import { isSpokeUnlocked, nextTeaser, type NodeLockState, type Profile } from '../meta/save';
import type { TeaserSpokeDef } from '../sim/types';

/**
 * Player-facing copy and presentation decisions for the wheel (issue #56).
 *
 * Kept out of `MissionHubScene` so they can be tested without pulling in
 * Phaser. The scene renders what these return and decides nothing itself —
 * the same split `docs/PROGRESSION.md` describes for the unlock rules.
 */

/**
 * How a whole spoke reads on the wheel. A gated realm dims to the same
 * treatment as an unauthored teaser: #56 asks for "the whole spoke dimmed to a
 * teaser", because a realm you cannot enter yet and a realm that does not exist
 * yet are the same thing from the player's side — somewhere to go later.
 *
 * Unreachable while only one spoke is authored, which is exactly why it is a
 * tested pure function rather than a branch buried in the scene: the day a
 * second realm ships, this is the read that has to already work.
 */
export type SpokeDisplayState = 'open' | 'gated';

export function spokeDisplayState(profile: Profile, spokeId: string): SpokeDisplayState {
  return isSpokeUnlocked(profile, spokeId) ? 'open' : 'gated';
}

/**
 * The line the wheel shows when there is nothing authored left to play, or
 * null while content remains (issue #63).
 *
 * `ResultsScene` announces the end of content on the run that finishes it; the
 * wheel has to keep saying it afterwards, or a returning player sees a board of
 * cleared nodes and no indication whether that is the edge of the game or a
 * bug. Both read from `nextTeaser`, so they can never disagree about whether
 * the wheel is finished.
 */
export function endOfContentCopy(profile: Profile): { teaser: TeaserSpokeDef; line: string } | null {
  const teaser = nextTeaser(profile);
  if (!teaser) return null;
  return { teaser, line: `THE HIVE STILL SPREADS — ${teaser.name.toUpperCase()} AWAITS` };
}

export function statusCopy(lock: NodeLockState): string {
  if (lock.state === 'cleared') return '✓ cleared';
  if (lock.state === 'available') return 'READY';
  switch (lock.reason) {
    case 'previous-mission':
      return 'LOCKED — clear the mission before it';
    case 'boss-gated':
      return 'LOCKED — clear every mission in the realm';
    case 'spoke-gated':
      return 'LOCKED — fell the previous realm’s boss';
  }
}
