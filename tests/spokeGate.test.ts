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
  ],
  // `src/meta/save.ts` imports both names; mocking only SPOKES leaves the
  // module half-defined and fails confusingly the moment anything here touches
  // an end-of-content path.
  TEASER_SPOKES: []
}));

const {
  defaultProfile,
  isSpokeUnlocked,
  markLevelCleared,
  nextNodeAfter,
  nodeLockState,
  spokeProgress,
  suggestedNode
} = await import('../src/meta/save');

const { spokeDisplayState } = await import('../src/game/hubCopy');

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

/**
 * The wheel's two-spoke presentation and hand-off rules (#56, #57).
 *
 * Neither can be exercised by the real content — one spoke is authored, so a
 * gated realm and a cross-realm "next" are both unreachable today. They are
 * exactly the reads that must already work the day a second realm ships, which
 * is why they live against the fixture rather than going untested until then.
 */
describe('a gated realm on the wheel', () => {
  let profile: Profile;

  beforeEach(() => {
    profile = defaultProfile();
  });

  it('dims to the teaser treatment until its gate falls', () => {
    expect(spokeDisplayState(profile, 'alpha')).toBe('open');
    expect(spokeDisplayState(profile, 'beta')).toBe('gated');

    // Clearing the missions is not enough — the gate is the boss.
    markLevelCleared(profile, 'a-one');
    markLevelCleared(profile, 'a-two');
    expect(spokeDisplayState(profile, 'beta')).toBe('gated');

    markLevelCleared(profile, 'a-boss');
    expect(spokeDisplayState(profile, 'beta')).toBe('open');
  });

  it('an unknown spoke reads as gated rather than throwing', () => {
    expect(spokeDisplayState(profile, 'no-such-spoke')).toBe('gated');
  });

  it('hands "next" across the boundary only once the boss has opened it', () => {
    // Within a realm, "next" is the following node.
    expect(nextNodeAfter(profile, 'a-one')).toBe('a-two');
    expect(nextNodeAfter(profile, 'a-two')).toBe('a-boss');

    // The boss of a realm whose successor is still shut leads nowhere: the
    // flat-order walk would have offered 'b-one' here, into a locked realm.
    expect(nextNodeAfter(profile, 'a-boss')).toBeNull();

    markLevelCleared(profile, 'a-boss');
    expect(nextNodeAfter(profile, 'a-boss')).toBe('b-one');

    // The last authored realm still ends the line.
    expect(nextNodeAfter(profile, 'b-boss')).toBeNull();
  });
});
