import type { NodeLockState } from '../meta/save';

/**
 * Player-facing copy for a wheel node's state (issue #56).
 *
 * Kept out of `MissionHubScene` so it can be tested without pulling in Phaser.
 * Every lock reason reads differently — that is the whole point of
 * `nodeLockState` returning a reason rather than a bare boolean, since "clear
 * the mission before it", "clear every mission in the realm" and "fell the
 * previous realm's boss" ask the player to do three different things.
 */
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
