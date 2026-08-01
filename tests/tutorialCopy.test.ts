import { describe, expect, it } from 'vitest';
import {
  MISSION_CONTROL_ROWS,
  TUTORIAL_IDS,
  missionControlsText,
  tutorialHerald
} from '../src/game/tutorialCopy';

describe('contextual tutorial copy (#97)', () => {
  it('keeps stable, unique save keys for every first-run lesson', () => {
    expect(TUTORIAL_IDS).toEqual(['potion', 'key-gate', 'relic']);
    expect(new Set(TUTORIAL_IDS).size).toBe(TUTORIAL_IDS.length);
  });

  it('teaches the interaction each pickup would otherwise leave implicit', () => {
    expect(tutorialHerald('potion').text).toContain('[Q]');
    expect(tutorialHerald('potion').text).toContain('SCREEN-CLEAR');
    expect(tutorialHerald('key-gate').text).toContain('STAND AGAINST A LOCKED GATE');
    expect(tutorialHerald('relic', 'Swiftwing Sigil').text).toContain('SWIFTWING SIGIL');
    expect(tutorialHerald('relic').text).toContain('FADES WITH TIME');
  });
});

describe('pause control legend (#97)', () => {
  it('lists every mission command for keyboard and gamepad', () => {
    expect(MISSION_CONTROL_ROWS.map((row) => row.action)).toEqual(['MOVE', 'ATTACK', 'ABILITY', 'POTION', 'PAUSE']);
    expect(MISSION_CONTROL_ROWS.every((row) => row.keyboard.length > 0 && row.gamepad.length > 0)).toBe(true);
    expect(missionControlsText()).toContain('SPACE / J');
    expect(missionControlsText()).toContain('LEFT STICK / D-PAD');
  });
});
