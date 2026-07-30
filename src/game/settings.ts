/** Phaser-free settings rules shared by the settings scene and unit tests. */

export const MASTER_VOLUME_STEP = 0.1;

export function clampMasterVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
}

export function stepMasterVolume(volume: number, direction: -1 | 1): number {
  const stepped = clampMasterVolume(volume) + direction * MASTER_VOLUME_STEP;
  // Decimal rounding keeps repeated 0.1 steps stable for persistence and copy.
  return Math.round(clampMasterVolume(stepped) * 10) / 10;
}

export function masterVolumePercent(volume: number): number {
  return Math.round(clampMasterVolume(volume) * 100);
}
