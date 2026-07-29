import { describe, expect, it } from 'vitest';
import { SPOKES, TEASER_SPOKES } from '../src/content';
import { endOfContentCopy, statusCopy } from '../src/game/hubCopy';
import { defaultProfile, markLevelCleared, type NodeLockReason, type NodeLockState } from '../src/meta/save';

/**
 * Mission hub copy (issue #56). The hub exists to tell the player *why* a node
 * is shut, so every lock reason must produce its own line. `spoke-gated` in
 * particular cannot be reached on screen until a second realm is authored —
 * without this it would ship unverified.
 */
describe('hub status copy', () => {
  const reasons: NodeLockReason[] = ['previous-mission', 'boss-gated', 'spoke-gated'];

  it('reads distinctly for every lock reason', () => {
    const lines = reasons.map((reason) => statusCopy({ state: 'locked', reason }));
    for (const [i, line] of lines.entries()) {
      expect(line, `${reasons[i]} is non-empty`).toBeTruthy();
      expect(line, `${reasons[i]} says it is locked`).toContain('LOCKED');
    }
    // Distinct wording, or the reason carries no information for the player.
    expect(new Set(lines).size, 'each reason reads differently').toBe(reasons.length);
  });

  it('distinguishes cleared from available', () => {
    const cleared = statusCopy({ state: 'cleared' } satisfies NodeLockState);
    const available = statusCopy({ state: 'available' } satisfies NodeLockState);
    expect(cleared).not.toBe(available);
    expect(cleared).not.toContain('LOCKED');
    expect(available).not.toContain('LOCKED');
  });
});

describe('mission hub end-of-content copy (#63)', () => {
  it('stays hidden until the authored wheel is complete', () => {
    expect(endOfContentCopy(defaultProfile())).toBeNull();
  });

  it('names and describes the next teaser after the final boss', () => {
    const profile = defaultProfile();
    for (const id of SPOKES.flatMap((spoke) => [...spoke.missions, spoke.boss])) markLevelCleared(profile, id);
    const copy = endOfContentCopy(profile);
    expect(copy?.teaser).toBe(TEASER_SPOKES[0]);
    expect(copy?.line).toContain(TEASER_SPOKES[0]!.name.toUpperCase());
    expect(copy?.teaser.tagline.length).toBeGreaterThan(0);
  });
});
