import { describe, expect, it } from 'vitest';
import { statusCopy } from '../src/game/hubCopy';
import type { NodeLockReason, NodeLockState } from '../src/meta/save';

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
