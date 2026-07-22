import { describe, expect, it } from 'vitest';
import { BROOD_WARRENS } from '../../src/content';
import { circleHitsWall, moveCircle, tileCenter, validateLevel } from '../../src/sim/level';

describe('level validation', () => {
  it('brood warrens is a well-formed level', () => {
    expect(validateLevel(BROOD_WARRENS)).toEqual([]);
  });

  it('level border is fully walled', () => {
    const rows = BROOD_WARRENS.walls;
    const w = rows[0]!.length;
    expect(rows[0]).toBe('#'.repeat(w));
    expect(rows[rows.length - 1]).toBe('#'.repeat(w));
    for (const row of rows) {
      expect(row[0]).toBe('#');
      expect(row[w - 1]).toBe('#');
    }
  });
});

describe('collision', () => {
  it('detects circle overlap with wall tiles', () => {
    // Tile (0,0) is a border wall.
    expect(circleHitsWall(BROOD_WARRENS, { x: 40, y: 40 }, 12)).toBe(true);
    const openTile = tileCenter(BROOD_WARRENS, 4, 3);
    expect(circleHitsWall(BROOD_WARRENS, openTile, 12)).toBe(false);
  });

  it('blocks movement into walls and allows sliding', () => {
    const pos = tileCenter(BROOD_WARRENS, 1, 7); // adjacent to the west border, open above/below
    const startY = pos.y;
    moveCircle(BROOD_WARRENS, pos, 12, -100, 10);
    expect(pos.x).toBeGreaterThanOrEqual(32 + 12); // never inside the border wall
    expect(pos.y).toBe(startY + 10); // y-axis movement still applied
  });
});
