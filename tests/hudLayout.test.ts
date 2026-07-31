import { describe, expect, it } from 'vitest';
import { BASE_PANEL_W, MAX_PLAYERS, anchorOffset, panelLayout } from '../src/game/hudLayout';

/**
 * HUD top-bar geometry (issue #96).
 *
 * The bar used to draw four fixed panels and dim the three nobody was playing,
 * spending most of a 960px screen advertising co-op. Panels now come from the
 * live player count.
 *
 * The load-bearing guarantee is not "solo looks better" — it is that the layout
 * still *derives* from the party size, so reintroducing players when local
 * co-op lands is data, not a rewrite. The four-player case is pinned against
 * the geometry the old fixed layout hardcoded, because that is the case no one
 * can see on screen today.
 */

/** The shipping canvas; the old layout's constants were written against it. */
const SCREEN = 960;
const GAP = 8;

describe('HUD panel layout', () => {
  const counts = [1, 2, 3, 4] as const;

  it('gives one player a panel wider than the authored design, centred', () => {
    const solo = panelLayout(1, SCREEN);
    expect(solo.xs).toHaveLength(1);
    expect(solo.width, 'solo gets more bar than a quarter of it').toBeGreaterThan(BASE_PANEL_W);
    const centre = solo.xs[0]! + solo.width / 2;
    expect(centre).toBeCloseTo(SCREEN / 2, 0);
  });

  it('reproduces the old fixed four-panel geometry exactly', () => {
    // 4 x 225 + 3 x 8 = 924, inset 18 either side of a 960px screen. Pinned so
    // that landing co-op does not silently move a layout nobody can see today.
    const full = panelLayout(MAX_PLAYERS, SCREEN);
    expect(full.width).toBe(BASE_PANEL_W);
    expect(full.xs).toEqual([18, 251, 484, 717]);
  });

  it.each(counts)('lays %i player(s) out evenly and inside the screen', (count) => {
    const { width, xs, gap } = panelLayout(count, SCREEN);
    expect(xs).toHaveLength(count);
    expect(gap).toBe(GAP);

    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!, 'panels are evenly spaced').toBe(width + GAP);
    }
    expect(xs[0], 'the row starts on screen').toBeGreaterThanOrEqual(0);
    expect(xs[xs.length - 1]! + width, 'and ends on screen').toBeLessThanOrEqual(SCREEN);

    const rowCentre = (xs[0]! + xs[xs.length - 1]! + width) / 2;
    expect(rowCentre, 'the row is centred').toBeCloseTo(SCREEN / 2, 0);
  });

  it('never shrinks a panel below the width its contents were authored for', () => {
    for (const count of counts) {
      expect(panelLayout(count, SCREEN).width).toBeGreaterThanOrEqual(BASE_PANEL_W);
    }
  });

  it('caps how far a small party stretches a panel', () => {
    // Letting one player take the whole bar leaves the readout's clusters
    // marooned at either end. The cap is what keeps it dense.
    const solo = panelLayout(1, SCREEN);
    expect(solo.width, 'well short of the full bar').toBeLessThan(SCREEN - 36);
    expect(solo.xs[0], 'so there is clean background either side').toBeGreaterThan(0);
  });

  it('clamps a nonsense party size rather than drawing nothing', () => {
    expect(panelLayout(0, SCREEN).xs).toHaveLength(1);
    expect(panelLayout(-3, SCREEN).xs).toHaveLength(1);
    expect(panelLayout(99, SCREEN).xs).toHaveLength(MAX_PLAYERS);
    expect(panelLayout(2.7, SCREEN).xs, 'a fractional count floors').toHaveLength(2);
  });

  it('survives a narrower screen without running off it', () => {
    const narrow = panelLayout(1, 400);
    expect(narrow.xs[0]).toBeGreaterThanOrEqual(0);
    expect(narrow.width).toBeGreaterThanOrEqual(BASE_PANEL_W);
  });
});

describe('panel content anchoring', () => {
  it('leaves the authored design untouched at its own width', () => {
    // Every offset is zero here, which is why the four-player bar is
    // pixel-identical to what it always was.
    for (const anchor of ['left', 'center', 'right'] as const) {
      expect(anchorOffset(anchor, BASE_PANEL_W), anchor).toBe(0);
    }
  });

  it('spreads the three clusters as the panel grows', () => {
    const w = BASE_PANEL_W + 200;
    expect(anchorOffset('left', w), 'identity stays on the left edge').toBe(0);
    expect(anchorOffset('center', w), 'tallies take half the slack').toBe(100);
    expect(anchorOffset('right', w), 'meters ride the right edge').toBe(200);
  });
});
