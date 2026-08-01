import { EMPTY_INPUT, type InputCommand } from '../sim/types';

/**
 * Gamepad → `InputCommand` and → menu verbs (issue #98).
 *
 * Phaser-free and pure so both mappings are unit-testable without a browser or
 * a physical pad (the `hudLayout` / `hubCopy` precedent). `src/game/input.ts`
 * adapts Phaser's gamepad plugin into the `PadSnapshot` shape below; nothing
 * else in the game touches a `Phaser.Input.Gamepad.Gamepad`.
 *
 * **The stick is quantised, deliberately.** `InputCommand.moveX/moveY` are
 * integers in {-1,0,1} and the sim's determinism regression hashes state built
 * from them. Widening the contract to a float is a sim-visible change that
 * would re-baseline `hashState`; issue #98 recommends quantising first, so an
 * axis past `STICK_DEADZONE` reads exactly like the matching key. Analogue
 * speed is a separate, deliberate change — see docs/TESTING.md.
 */

/** Button indices in the W3C "standard" gamepad mapping. */
export const PAD_BUTTON = {
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  dpadUp: 12,
  dpadDown: 13,
  dpadLeft: 14,
  dpadRight: 15
} as const;

/**
 * One frame of a pad, reduced to what the game reads: the two sticks' axes and
 * pressed/not for each button. Deliberately not Phaser's `Gamepad` — this is
 * the boundary that keeps the mapping testable.
 */
export interface PadSnapshot {
  axes: readonly number[];
  buttons: readonly boolean[];
}

/**
 * How far a stick must travel before it counts as a direction. Wide enough
 * that a resting stick with drift never walks the hero, narrow enough that a
 * deliberate flick registers before the stick bottoms out.
 */
export const STICK_DEADZONE = 0.4;

/** A stick axis as the integer the sim's input contract accepts. */
export function quantiseAxis(value: number): -1 | 0 | 1 {
  if (!Number.isFinite(value) || Math.abs(value) < STICK_DEADZONE) return 0;
  return value > 0 ? 1 : -1;
}

function held(pad: PadSnapshot, index: number): boolean {
  return pad.buttons[index] === true;
}

function pressed(pad: PadSnapshot, previous: PadSnapshot | null, index: number): boolean {
  return previous !== null && held(pad, index) && !held(previous, index);
}

/** Left stick, or the d-pad when the stick is centred. */
function padMove(pad: PadSnapshot): { moveX: -1 | 0 | 1; moveY: -1 | 0 | 1 } {
  const stickX = quantiseAxis(pad.axes[0] ?? 0);
  const stickY = quantiseAxis(pad.axes[1] ?? 0);
  const dpadX = (held(pad, PAD_BUTTON.dpadRight) ? 1 : 0) - (held(pad, PAD_BUTTON.dpadLeft) ? 1 : 0);
  const dpadY = (held(pad, PAD_BUTTON.dpadDown) ? 1 : 0) - (held(pad, PAD_BUTTON.dpadUp) ? 1 : 0);
  return {
    moveX: (stickX !== 0 ? stickX : dpadX) as -1 | 0 | 1,
    moveY: (stickY !== 0 ? stickY : dpadY) as -1 | 0 | 1
  };
}

/**
 * One tick of play from a pad. `previous` supplies the rising edge for the
 * potion, which must spend exactly one potion per press however many sim ticks
 * a render frame steps — the same reason the keyboard path uses `JustDown`.
 *
 * A null `previous` means there is no earlier frame to compare against — the
 * first sample after a scene starts or a pad is plugged in — and reports no
 * edge at all. A button already down at that moment was pressed for the screen
 * before, and must be released and pressed again to count here.
 */
export function padCommand(pad: PadSnapshot | null, previous: PadSnapshot | null): InputCommand {
  if (!pad) return EMPTY_INPUT;
  return {
    ...padMove(pad),
    attack: held(pad, PAD_BUTTON.a) || held(pad, PAD_BUTTON.rt),
    ability: held(pad, PAD_BUTTON.x) || held(pad, PAD_BUTTON.rb),
    usePotion: pressed(pad, previous, PAD_BUTTON.y),
    join: pressed(pad, previous, PAD_BUTTON.start),
    leave: pressed(pad, previous, PAD_BUTTON.back),
    interact: held(pad, PAD_BUTTON.b)
  };
}

/** Two commands ORed together, so keyboard and pad can drive one hero. */
export function mergeCommands(a: InputCommand, b: InputCommand): InputCommand {
  const clamp = (value: number): -1 | 0 | 1 => (value > 0 ? 1 : value < 0 ? -1 : 0);
  return {
    moveX: clamp(a.moveX + b.moveX),
    moveY: clamp(a.moveY + b.moveY),
    attack: a.attack || b.attack,
    ability: a.ability || b.ability,
    usePotion: a.usePotion || b.usePotion,
    join: a.join || b.join,
    leave: a.leave || b.leave,
    interact: a.interact || b.interact
  };
}

/**
 * Menu vocabulary. Scenes bind these to the same handlers their keys already
 * call, so a pad drives the shell without any screen growing a second set of
 * rules: `confirm` is Enter, `cancel` is the screen's way back, `alt`/`alt2`
 * and the shoulders are its remaining verbs, `menu` opens settings or pauses.
 */
export const MENU_VERBS = [
  'up',
  'down',
  'left',
  'right',
  'confirm',
  'cancel',
  'alt',
  'alt2',
  'shoulderLeft',
  'shoulderRight',
  'menu',
  'back'
] as const;

export type MenuVerb = (typeof MENU_VERBS)[number];

/** Whether each verb is held this frame. Directions read stick *or* d-pad. */
function verbsHeld(pad: PadSnapshot): Record<MenuVerb, boolean> {
  const move = padMove(pad);
  return {
    up: move.moveY < 0,
    down: move.moveY > 0,
    left: move.moveX < 0,
    right: move.moveX > 0,
    confirm: held(pad, PAD_BUTTON.a),
    cancel: held(pad, PAD_BUTTON.b),
    alt: held(pad, PAD_BUTTON.x),
    alt2: held(pad, PAD_BUTTON.y),
    shoulderLeft: held(pad, PAD_BUTTON.lb),
    shoulderRight: held(pad, PAD_BUTTON.rb),
    menu: held(pad, PAD_BUTTON.start),
    back: held(pad, PAD_BUTTON.back)
  };
}

/**
 * Verbs that went down this frame. Menus want presses, not holds — a held
 * stick must not scroll the wheel every frame — so everything here is a rising
 * edge against the previous snapshot.
 *
 * As with `padCommand`, a null `previous` reports nothing: the first frame of
 * a screen only establishes the baseline. That is what stops the A button that
 * confirmed the *last* screen from confirming this one too, which with a
 * one-frame scene handover would otherwise skip straight through.
 */
export function padMenuPresses(pad: PadSnapshot | null, previous: PadSnapshot | null): MenuVerb[] {
  if (!pad || !previous) return [];
  const now = verbsHeld(pad);
  const before = verbsHeld(previous);
  return MENU_VERBS.filter((verb) => now[verb] && !before[verb]);
}
