import type { NodeLockState } from '../meta/save';

/** Pure geometry and player-facing labels for the mission map. */

export interface HubMapLayout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;
  minRadius: number;
  maxRadius: number;
}

export interface HubPoint {
  x: number;
  y: number;
}

export interface NodeVisual {
  glyph: string;
  stateLabel: string;
}

/** The map leaves room for the route card and controls at every authored size. */
export function hubMapLayout(width: number, height: number): HubMapLayout {
  const left = 40;
  const right = Math.max(left + 1, width - 40);
  const top = 112;
  const bottom = Math.max(top + 320, height - 192);
  const mapHeight = bottom - top;
  const maxRadius = Math.min(190, mapHeight * 0.46);

  return {
    left,
    right,
    top,
    bottom,
    centerX: (left + right) / 2,
    centerY: top + mapHeight * 0.58,
    minRadius: Math.min(58, maxRadius * 0.34),
    maxRadius
  };
}

/** Positions authored cells along their data-authored bearing. */
export function hubNodePosition(angleDeg: number, ordinal: number, count: number, layout: HubMapLayout): HubPoint {
  const progress = count <= 1 ? 0.5 : Math.max(0, Math.min(1, ordinal / (count - 1)));
  const radius = layout.minRadius + (layout.maxRadius - layout.minRadius) * progress;
  const radians = (angleDeg * Math.PI) / 180;
  return {
    x: layout.centerX + Math.sin(radians) * radius,
    y: layout.centerY - Math.cos(radians) * radius
  };
}

/** A teaser terminates inside the map so future realms remain secondary. */
export function hubTeaserPosition(angleDeg: number, layout: HubMapLayout): HubPoint {
  const radians = (angleDeg * Math.PI) / 180;
  const radius = Math.min(144, layout.maxRadius * 0.76);
  return {
    x: layout.centerX + Math.sin(radians) * radius,
    y: layout.centerY - Math.cos(radians) * radius
  };
}

/** Flat-topped hex coordinates suitable for Phaser Graphics fill/stroke calls. */
export function hexPoints(radius: number, centerX = 0, centerY = 0): HubPoint[] {
  return Array.from({ length: 6 }, (_, index) => {
    const radians = Math.PI / 3 * index - Math.PI / 2;
    return { x: centerX + Math.cos(radians) * radius, y: centerY + Math.sin(radians) * radius };
  });
}

export function nodeVisual(lock: NodeLockState, isBoss: boolean): NodeVisual {
  if (lock.state === 'cleared') return { glyph: '✓', stateLabel: isBoss ? 'BOSS CLEARED' : 'CLEARED' };
  if (lock.state === 'available') return { glyph: isBoss ? '☠' : '▶', stateLabel: isBoss ? 'BOSS READY' : 'READY' };
  return { glyph: '▣', stateLabel: isBoss ? 'BOSS LOCKED' : 'LOCKED' };
}

export function nodeNameLabel(levelName: string, ordinal: number, isBoss: boolean): string {
  return isBoss ? `BOSS  ·  ${levelName}` : `MISSION ${ordinal + 1}  ·  ${levelName}`;
}

export function navigationHint(spokeCount: number): string {
  const realmHint = spokeCount > 1 ? '   ←→ / A,D realm' : '';
  return `↑↓ / W,S choose mission${realmHint}   Enter deploy   H hero select   O settings`;
}
