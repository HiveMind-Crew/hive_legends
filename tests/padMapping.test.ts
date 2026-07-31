import { describe, expect, it } from 'vitest';
import {
  mergeCommands,
  padCommand,
  padMenuPresses,
  PAD_BUTTON,
  quantiseAxis,
  STICK_DEADZONE,
  type PadSnapshot
} from '../src/game/padMapping';
import { EMPTY_INPUT } from '../src/sim/types';

/** A resting pad, with named buttons pressed and axes set on top. */
function pad(overrides: { axes?: number[]; press?: (keyof typeof PAD_BUTTON)[] } = {}): PadSnapshot {
  const buttons = new Array<boolean>(16).fill(false);
  for (const name of overrides.press ?? []) buttons[PAD_BUTTON[name]] = true;
  return { axes: overrides.axes ?? [0, 0, 0, 0], buttons };
}

/**
 * Gamepad mapping (issue #98). The load-bearing decision here is that the
 * stick is quantised to the sim's existing integer input contract rather than
 * widening it — see the module comment and docs/TESTING.md.
 */
describe('stick quantisation', () => {
  it('ignores drift inside the deadzone and commits outside it', () => {
    expect(quantiseAxis(0)).toBe(0);
    expect(quantiseAxis(STICK_DEADZONE - 0.01)).toBe(0);
    expect(quantiseAxis(-STICK_DEADZONE + 0.01)).toBe(0);
    expect(quantiseAxis(STICK_DEADZONE)).toBe(1);
    expect(quantiseAxis(-1)).toBe(-1);
  });

  it('never produces a value the sim contract does not accept', () => {
    for (const value of [-1, -0.9, -0.5, -0.2, 0, 0.2, 0.5, 0.9, 1, Number.NaN]) {
      expect([-1, 0, 1]).toContain(quantiseAxis(value));
    }
  });
});

describe('pad → InputCommand', () => {
  it('is empty with no pad connected', () => {
    expect(padCommand(null, null)).toEqual(EMPTY_INPUT);
  });

  it('walks from the left stick', () => {
    const command = padCommand(pad({ axes: [-0.8, 0.95, 0, 0] }), null);
    expect(command.moveX).toBe(-1);
    expect(command.moveY).toBe(1);
  });

  it('falls back to the d-pad when the stick is centred', () => {
    const command = padCommand(pad({ press: ['dpadLeft', 'dpadUp'] }), null);
    expect(command.moveX).toBe(-1);
    expect(command.moveY).toBe(-1);
  });

  it('prefers the stick when both are pushed', () => {
    const command = padCommand(pad({ axes: [1, 0, 0, 0], press: ['dpadLeft'] }), null);
    expect(command.moveX).toBe(1);
  });

  it('maps attack and ability to their face buttons and triggers', () => {
    expect(padCommand(pad({ press: ['a'] }), null).attack).toBe(true);
    expect(padCommand(pad({ press: ['rt'] }), null).attack).toBe(true);
    expect(padCommand(pad({ press: ['x'] }), null).ability).toBe(true);
    expect(padCommand(pad({ press: ['rb'] }), null).ability).toBe(true);
  });

  it('spends one potion per press, not per frame held', () => {
    const held = pad({ press: ['y'] });
    expect(padCommand(held, pad()).usePotion).toBe(true); // pressed
    expect(padCommand(held, held).usePotion).toBe(false); // still held
  });

  it('ignores a button already down when sampling starts', () => {
    // No previous frame: the press belongs to whatever screen came before.
    expect(padCommand(pad({ press: ['y'] }), null).usePotion).toBe(false);
  });
});

describe('merging devices', () => {
  it('lets either device move, attack or quaff for the same hero', () => {
    const keyboard = { ...EMPTY_INPUT, moveX: 1 as const, attack: true };
    const gamepad = { ...EMPTY_INPUT, moveY: -1 as const, usePotion: true };
    expect(mergeCommands(keyboard, gamepad)).toEqual({
      moveX: 1,
      moveY: -1,
      attack: true,
      ability: false,
      usePotion: true
    });
  });

  it('keeps opposed directions inside the contract', () => {
    const left = { ...EMPTY_INPUT, moveX: -1 as const };
    const right = { ...EMPTY_INPUT, moveX: 1 as const };
    expect(mergeCommands(left, right).moveX).toBe(0);
  });
});

describe('menu verbs', () => {
  it('fires on the press, not for every frame the button is held', () => {
    const confirm = pad({ press: ['a'] });
    expect(padMenuPresses(confirm, pad())).toEqual(['confirm']);
    expect(padMenuPresses(confirm, confirm)).toEqual([]);
  });

  it('treats a stick push as a single direction press', () => {
    const down = pad({ axes: [0, 1, 0, 0] });
    expect(padMenuPresses(down, pad())).toEqual(['down']);
    expect(padMenuPresses(down, down)).toEqual([]);
  });

  it('reads the d-pad as the same directions as the stick', () => {
    expect(padMenuPresses(pad({ press: ['dpadRight'] }), pad())).toEqual(['right']);
  });

  it('names each remaining verb its own button', () => {
    const resting = pad();
    expect(padMenuPresses(pad({ press: ['b'] }), resting)).toEqual(['cancel']);
    expect(padMenuPresses(pad({ press: ['x'] }), resting)).toEqual(['alt']);
    expect(padMenuPresses(pad({ press: ['y'] }), resting)).toEqual(['alt2']);
    expect(padMenuPresses(pad({ press: ['lb'] }), resting)).toEqual(['shoulderLeft']);
    expect(padMenuPresses(pad({ press: ['rb'] }), resting)).toEqual(['shoulderRight']);
    expect(padMenuPresses(pad({ press: ['start'] }), resting)).toEqual(['menu']);
    expect(padMenuPresses(pad({ press: ['back'] }), resting)).toEqual(['back']);
  });

  it('swallows a button carried in from the previous screen', () => {
    // The A press that confirmed the last screen must not confirm this one.
    expect(padMenuPresses(pad({ press: ['a'] }), null)).toEqual([]);
  });

  it('reports nothing without a pad', () => {
    expect(padMenuPresses(null, pad({ press: ['a'] }))).toEqual([]);
  });
});
