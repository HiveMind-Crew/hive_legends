/**
 * Resolve the environment texture contract from an optional content-authored
 * namespace. Keeping this Phaser-free makes the generic pack/fallback rule
 * directly testable without teaching the renderer about individual realms.
 */
export function floorVariant(i: number, tileSet?: string): string {
  return tileSet ? `tile-${tileSet}-floor-${i}` : `tile-floor-${i}`;
}

export function wallTexture(surface: 'top' | 'inner' | 'face', tileSet?: string): string {
  if (!tileSet) {
    if (surface === 'inner') return 'tile-wall-inner';
    if (surface === 'face') return 'tile-wall-face';
    return 'tile-wall';
  }
  const suffix = surface === 'top' ? 'wall' : `wall-${surface}`;
  return `tile-${tileSet}-${suffix}`;
}
