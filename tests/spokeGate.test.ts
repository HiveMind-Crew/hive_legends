import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Spoke gating (issue #54) — the rule that opens a world once the previous
 * world's boss falls. Only one spoke is authored today, so the real content
 * cannot exercise this; the wheel is mocked with a two-spoke fixture instead.
 *
 * This is the rule that has to hold *before* a second spoke ships, because the
 * moment one does, a bug here either locks players out of content they earned
 * or hands them a world they haven't reached.
 */
vi.mock('../src/content/spokes', () => ({
  SPOKES: [
    {
      id: 'alpha',
      name: 'Alpha Reach',
      accent: 0x4aa3ff,
      missions: ['a-one', 'a-two'],
      boss: 'a-boss',
      angleDeg: 0
    },
    {
      id: 'beta',
      name: 'Beta Reach',
      accent: 0xff8844,
      missions: ['b-one', 'b-two'],
      boss: 'b-boss',
      requiresSpoke: 'alpha',
      angleDeg: 90
    }
  ]
}));

const {
  defaultProfile,
  isSpokeUnlocked,
  markLevelCleared,
  nodeLockState,
  spokeProgress,
  suggestedNode
} = await import('../src/meta/save');

type Profile = ReturnType<typeof defaultProfile>;

const BETA_NODES = ['b-one', 'b-two', 'b-boss'];

describe('spoke gating', () => {
  let profile: Profile;

  beforeEach(() => {
    profile = defaultProfile();
  });

  it('the first spoke is open and the second is shut on a fresh profile', () => {
    expect(isSpokeUnlocked(profile, 'alpha')).toBe(true);
    expect(isSpokeUnlocked(profile, 'beta')).toBe(false);
    for (const id of BETA_NODES) {
      expect(nodeLockState(profile, id), id).toEqual({ state: 'locked', reason: 'spoke-gated' });
    }
  });

  it('clearing the first spoke’s missions is not enough — the boss must fall', () => {
    markLevelCleared(profile, 'a-one');
    markLevelCleared(profile, 'a-two');
    // Alpha's boss is now available, but Beta stays shut behind it.
    expect(nodeLockState(profile, 'a-boss')).toEqual({ state: 'available' });
    expect(isSpokeUnlocked(profile, 'beta')).toBe(false);
    expect(nodeLockState(profile, 'b-one')).toEqual({ state: 'locked', reason: 'spoke-gated' });
  });

  it('felling the boss opens the next spoke, first mission first', () => {
    markLevelCleared(profile, 'a-one');
    markLevelCleared(profile, 'a-two');
    markLevelCleared(profile, 'a-boss');

    expect(isSpokeUnlocked(profile, 'beta')).toBe(true);
    expect(nodeLockState(profile, 'b-one')).toEqual({ state: 'available' });
    // Opening the spoke does not open all of it: sequencing still applies.
    expect(nodeLockState(profile, 'b-two')).toEqual({ state: 'locked', reason: 'previous-mission' });
    expect(nodeLockState(profile, 'b-boss')).toEqual({ state: 'locked', reason: 'boss-gated' });
  });

  it('the lock reason distinguishes a shut world from an unplayed mission', () => {
    // Same node, different story depending on how far along the player is —
    // the hub renders different copy for each.
    expect(nodeLockState(profile, 'b-two')).toEqual({ state: 'locked', reason: 'spoke-gated' });
    markLevelCleared(profile, 'a-one');
    markLevelCleared(profile, 'a-two');
    markLevelCleared(profile, 'a-boss');
    expect(nodeLockState(profile, 'b-two')).toEqual({ state: 'locked', reason: 'previous-mission' });
  });

  it('suggestedNode walks into the next spoke once the previous one is done', () => {
    expect(suggestedNode(profile)).toEqual({ spokeId: 'alpha', levelId: 'a-one' });

    markLevelCleared(profile, 'a-one');
    markLevelCleared(profile, 'a-two');
    expect(suggestedNode(profile)).toEqual({ spokeId: 'alpha', levelId: 'a-boss' });

    markLevelCleared(profile, 'a-boss');
    expect(suggestedNode(profile)).toEqual({ spokeId: 'beta', levelId: 'b-one' });
  });

  it('spokeProgress is reported per spoke, not across the wheel', () => {
    markLevelCleared(profile, 'a-one');
    expect(spokeProgress(profile, 'alpha')).toEqual({ cleared: 1, total: 2 });
    expect(spokeProgress(profile, 'beta')).toEqual({ cleared: 0, total: 2 });
  });
});
