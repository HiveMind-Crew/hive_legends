import { describe, expect, it } from 'vitest';
import {
  HUD_BOSS_STATUS_WIDTH,
  HUD_DESIGN_HEIGHT,
  HUD_DESIGN_WIDTH,
  HUD_PANEL_HEIGHT,
  HUD_PANEL_WIDTH,
  MAX_PLAYERS,
  fittedCanvasSize,
  hudObstruction,
  panelLayout
} from '../src/game/hudLayout';

/**
 * HUD visibility contract (issue #144).
 *
 * The former four-player HUD was a 924x54 strip across the battlefield. These
 * tests pin the replacement's useful guarantees rather than its screenshot:
 * compact panel area, a broad clear centre lane, stable slot ordering, and
 * unchanged logical geometry when Phaser FIT-scales the authored canvas.
 */

describe('HUD panel layout', () => {
  const counts = [1, 2, 3, 4] as const;

  it('keeps a wide gameplay lane open through the worst-case four-player HUD', () => {
    const full = panelLayout(MAX_PLAYERS, HUD_DESIGN_WIDTH);
    expect(full.placements).toEqual([
      { x: 10, y: 6 },
      { x: 738, y: 6 },
      { x: 10, y: 54 },
      { x: 738, y: 54 }
    ]);
    expect(full.width).toBe(HUD_PANEL_WIDTH);
    expect(full.height).toBe(HUD_PANEL_HEIGHT);
    expect(full.centerClearWidth, 'more than half the battlefield remains clear').toBeGreaterThan(
      HUD_DESIGN_WIDTH / 2
    );
    expect(full.centerClearWidth, 'the finale status also fits between the panel columns').toBeGreaterThan(
      HUD_BOSS_STATUS_WIDTH
    );
  });

  it.each(counts)('lays %i player(s) inside the authored canvas without changing panel density', (count) => {
    const layout = panelLayout(count, HUD_DESIGN_WIDTH);
    expect(layout.placements).toHaveLength(count);
    expect(layout.width).toBe(HUD_PANEL_WIDTH);
    expect(layout.height).toBe(HUD_PANEL_HEIGHT);

    for (const placement of layout.placements) {
      expect(placement.x).toBeGreaterThanOrEqual(0);
      expect(placement.y).toBeGreaterThanOrEqual(0);
      expect(placement.x + layout.width).toBeLessThanOrEqual(HUD_DESIGN_WIDTH);
      expect(placement.y + layout.height).toBeLessThanOrEqual(HUD_DESIGN_HEIGHT);
    }
  });

  it('keeps slot order stable as panels alternate between the two columns', () => {
    const { placements } = panelLayout(4, HUD_DESIGN_WIDTH);
    expect(placements[0]!.x).toBe(placements[2]!.x);
    expect(placements[1]!.x).toBe(placements[3]!.x);
    expect(placements[0]!.y).toBe(placements[1]!.y);
    expect(placements[2]!.y).toBe(placements[3]!.y);
    expect(placements[2]!.y).toBeGreaterThan(placements[0]!.y);
  });

  it('clamps a nonsense party size rather than drawing nothing or a fifth slot', () => {
    expect(panelLayout(0, HUD_DESIGN_WIDTH).placements).toHaveLength(1);
    expect(panelLayout(-3, HUD_DESIGN_WIDTH).placements).toHaveLength(1);
    expect(panelLayout(99, HUD_DESIGN_WIDTH).placements).toHaveLength(MAX_PLAYERS);
    expect(panelLayout(2.7, HUD_DESIGN_WIDTH).placements, 'a fractional count floors').toHaveLength(2);
  });
});

describe('HUD gameplay obstruction budget', () => {
  it('materially reduces worst-case coverage from the legacy four-panel bar', () => {
    const full = hudObstruction(MAX_PLAYERS);
    // Legacy: four 225x54 panels plus its 340x24 objective plate. This numeric
    // comparison is deliberate: restoring that old geometry must fail here.
    const legacyArea = 4 * 225 * 54 + 340 * 24;
    expect(full.area).toBeLessThanOrEqual(legacyArea * 0.75);
    expect(full.fraction).toBeLessThan(0.061);
    expect(full.centerClearWidth).toBeGreaterThan(HUD_DESIGN_WIDTH / 2);
    expect(full.deepestPanelEdge).toBeLessThan(100);
  });

  it('never spends more screen area as inactive slots disappear', () => {
    const areas = [1, 2, 3, 4].map((count) => hudObstruction(count).area);
    expect(areas).toEqual([...areas].sort((a, b) => a - b));
    expect(areas[0]).toBeLessThan(areas[3]! / 2);
  });
});

describe('HUD under fixed-canvas FIT scaling', () => {
  it.each([
    { width: 1024, height: 640 },
    { width: HUD_DESIGN_WIDTH, height: HUD_DESIGN_HEIGHT },
    { width: 1600, height: 1000 }
  ])('preserves the authored 4:3 canvas in a $width x $height viewport', ({ width, height }) => {
    const fitted = fittedCanvasSize(width, height);
    expect(fitted.width).toBeLessThanOrEqual(width);
    expect(fitted.height).toBeLessThanOrEqual(height);
    expect(fitted.width / fitted.height).toBeCloseTo(HUD_DESIGN_WIDTH / HUD_DESIGN_HEIGHT, 8);

    // Uniform scaling preserves the conservative HUD coverage fraction.
    const scale = fitted.width / HUD_DESIGN_WIDTH;
    const logical = hudObstruction(4);
    const cssCoverage = (logical.area * scale * scale) / (fitted.width * fitted.height);
    expect(cssCoverage).toBeCloseTo(logical.fraction, 8);
  });
});
