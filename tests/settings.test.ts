import { describe, expect, it } from 'vitest';
import { clampMasterVolume, masterVolumePercent, stepMasterVolume } from '../src/game/settings';

describe('settings model', () => {
  it('steps master volume in stable ten-percent increments', () => {
    expect(stepMasterVolume(0.7, -1)).toBe(0.6);
    expect(stepMasterVolume(0.6, 1)).toBe(0.7);
  });

  it('clamps volume adjustments to the supported range', () => {
    expect(stepMasterVolume(0, -1)).toBe(0);
    expect(stepMasterVolume(1, 1)).toBe(1);
    expect(clampMasterVolume(-3)).toBe(0);
    expect(clampMasterVolume(4)).toBe(1);
  });

  it('formats clamped volume as an integer percentage', () => {
    expect(masterVolumePercent(0.74)).toBe(74);
    expect(masterVolumePercent(2)).toBe(100);
  });
});
