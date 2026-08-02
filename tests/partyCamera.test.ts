import { describe, expect, it } from 'vitest';
import { PARTY_CAMERA, partyCameraTarget } from '../src/game/partyCamera';

describe('party camera geometry', () => {
  it('preserves the old solo facing-lookahead camera exactly', () => {
    expect(partyCameraTarget([{ pos: { x: 100, y: 200 }, facing: { x: 1, y: 0 } }], 960, 720)).toEqual({
      x: 136,
      y: 200,
      zoom: 1.25
    });
  });

  it('centres party extremes without depending on input order', () => {
    const a = { pos: { x: 100, y: 200 }, facing: { x: 1, y: 0 } };
    const b = { pos: { x: 800, y: 400 }, facing: { x: -1, y: 0 } };
    const forward = partyCameraTarget([a, b], 960, 720)!;
    const reverse = partyCameraTarget([b, a], 960, 720)!;
    expect(forward).toEqual(reverse);
    expect(forward.x).toBe(450);
    expect(forward.y).toBe(300);
    expect(forward.zoom).toBeLessThan(PARTY_CAMERA.soloZoom);
  });

  it('clamps very spread parties and never zooms in past solo', () => {
    const facing = { x: 0, y: 1 };
    expect(partyCameraTarget([{ pos: { x: 0, y: 0 }, facing }, { pos: { x: 5000, y: 0 }, facing }], 960, 720)?.zoom).toBe(
      PARTY_CAMERA.minZoom
    );
    expect(partyCameraTarget([{ pos: { x: 10, y: 10 }, facing }, { pos: { x: 11, y: 11 }, facing }], 960, 720)?.zoom).toBe(
      PARTY_CAMERA.soloZoom
    );
  });

  it('has no target when the whole joined party is down', () => {
    expect(partyCameraTarget([], 960, 720)).toBeNull();
  });
});
