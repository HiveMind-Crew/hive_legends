import { describe, expect, it } from 'vitest';
import { hexPoints, hubMapLayout, hubNodePosition, navigationHint, nodeNameLabel, nodeVisual } from '../src/game/hubLayout';

describe('mission map presentation helpers', () => {
  it('keeps authored cells inside the map while preserving their spoke bearing', () => {
    const layout = hubMapLayout(960, 720);
    const first = hubNodePosition(0, 0, 4, layout);
    const boss = hubNodePosition(0, 3, 4, layout);
    const branch = hubNodePosition(120, 0, 4, layout);

    expect(first.x).toBe(layout.centerX);
    expect(first.y).toBeLessThan(layout.centerY);
    expect(boss.y).toBeLessThan(first.y);
    expect(branch.x).toBeGreaterThan(layout.centerX);
    expect(branch.y).toBeGreaterThan(layout.centerY);
    expect(boss.y - 40).toBeGreaterThanOrEqual(layout.top - 40);
  });

  it('uses a six-sided cell and exposes mission identity independent of state', () => {
    expect(hexPoints(24)).toHaveLength(6);
    expect(nodeNameLabel('The Brood Warrens', 0, false)).toBe('MISSION 1  ·  The Brood Warrens');
    expect(nodeNameLabel('The Hollow Throne', 3, true)).toBe('BOSS  ·  The Hollow Throne');
  });

  it('combines glyph and copy for every node state, including bosses', () => {
    expect(nodeVisual({ state: 'available' }, false)).toEqual({ glyph: '▶', stateLabel: 'READY' });
    expect(nodeVisual({ state: 'cleared' }, false)).toEqual({ glyph: '✓', stateLabel: 'CLEARED' });
    expect(nodeVisual({ state: 'locked', reason: 'boss-gated' }, true)).toEqual({ glyph: '▣', stateLabel: 'BOSS LOCKED' });
    expect(nodeVisual({ state: 'available' }, true)).toEqual({ glyph: '☠', stateLabel: 'BOSS READY' });
  });

  it('only advertises realm switching when authored spokes support it', () => {
    expect(navigationHint(1)).not.toContain('realm');
    expect(navigationHint(2)).toContain('←→ / A,D realm');
  });
});
