/**
 * First-run teaching and the in-mission control legend (issue #97).
 *
 * Kept Phaser-free so the wording and binding reference can be tested without
 * booting a scene. Tutorial ids are stable save-data keys: changing the copy
 * must not make an already-seen lesson appear new again.
 */

export const TUTORIAL_IDS = ['potion', 'key-gate', 'relic'] as const;
export type TutorialId = (typeof TUTORIAL_IDS)[number];

export interface TutorialHerald {
  text: string;
  color: string;
}

/** The one-time Herald line for a newly discovered mission mechanic. */
export function tutorialHerald(id: TutorialId, relicName = 'POWER RELIC'): TutorialHerald {
  switch (id) {
    case 'potion':
      return { text: 'HIVE-FIRE DRAUGHT — [Q] QUAFFS A SCREEN-CLEAR', color: '#7be08a' };
    case 'key-gate':
      return { text: 'KEY TAKEN — STAND AGAINST A LOCKED GATE TO OPEN IT', color: '#e6c34a' };
    case 'relic':
      return { text: `${relicName.toUpperCase()} RELIC — ITS POWER FADES WITH TIME`, color: '#bdf4ff' };
  }
}

export interface MissionControlRow {
  action: string;
  keyboard: string;
  gamepad: string;
}

/** Gameplay bindings shown whenever a run is paused. */
export const MISSION_CONTROL_ROWS: readonly MissionControlRow[] = [
  { action: 'MOVE', keyboard: 'ARROWS / WASD', gamepad: 'LEFT STICK / D-PAD' },
  { action: 'ATTACK', keyboard: 'SPACE / J', gamepad: 'A / RT' },
  { action: 'ABILITY', keyboard: 'SHIFT / K', gamepad: 'X / RB' },
  { action: 'POTION', keyboard: 'Q', gamepad: 'Y' },
  { action: 'PAUSE', keyboard: 'ESC', gamepad: 'START' }
];

/** Monospace columns for the pause overlay. */
export function missionControlsText(): string {
  return MISSION_CONTROL_ROWS.map(
    ({ action, keyboard, gamepad }) => `${action.padEnd(9)}${keyboard.padEnd(22)}${gamepad}`
  ).join('\n');
}
