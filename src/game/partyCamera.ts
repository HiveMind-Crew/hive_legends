import type { Vec2 } from '../sim/types';

/** Party camera rule (issue #106), kept Phaser-free for boundary tests. */
export const PARTY_CAMERA = Object.freeze({
  soloZoom: 1.25,
  minZoom: 0.75,
  padding: 96,
  soloLookahead: 36
});

export interface CameraPartyMember {
  pos: Vec2;
  facing: Vec2;
}

export interface PartyCameraTarget extends Vec2 {
  zoom: number;
}

/**
 * Solo is pixel-equivalent to the old facing-lookahead camera. With multiple
 * living heroes, follow the extremes' midpoint and choose the largest zoom
 * that fits their bounding box plus authored padding, clamped at 0.75×.
 */
export function partyCameraTarget(
  players: readonly CameraPartyMember[],
  viewportWidth: number,
  viewportHeight: number
): PartyCameraTarget | null {
  if (players.length === 0) return null;
  if (players.length === 1) {
    const player = players[0]!;
    return {
      x: player.pos.x + player.facing.x * PARTY_CAMERA.soloLookahead,
      y: player.pos.y + player.facing.y * PARTY_CAMERA.soloLookahead,
      zoom: PARTY_CAMERA.soloZoom
    };
  }

  const xs = players.map((p) => p.pos.x);
  const ys = players.map((p) => p.pos.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const worldWidth = Math.max(1, maxX - minX + PARTY_CAMERA.padding * 2);
  const worldHeight = Math.max(1, maxY - minY + PARTY_CAMERA.padding * 2);
  const fitZoom = Math.min(viewportWidth / worldWidth, viewportHeight / worldHeight);
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    zoom: Math.max(PARTY_CAMERA.minZoom, Math.min(PARTY_CAMERA.soloZoom, fitZoom))
  };
}
