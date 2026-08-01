import Phaser from 'phaser';
import { EMPTY_INPUT, type InputCommand } from '../sim/types';
import { mergeCommands, padCommand, type PadSnapshot } from './padMapping';

/**
 * Input devices, reduced to the one thing the sim consumes: an `InputCommand`
 * per player per tick.
 *
 * `MissionScene` holds one `Commander` per reserved player slot. Participation
 * is then an explicit command handled by the deterministic sim (issue #106).
 */
export interface Commander {
  sample(): InputCommand;
}

/**
 * Keyboard → per-tick InputCommand. WASD or arrows to move,
 * Space/J to attack, Shift/K for the hero ability, Q to quaff a potion, and
 * E to hold a teammate revive. Keyboard always owns slot 0.
 */
export class KeyboardCommander implements Commander {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) throw new Error('keyboard input unavailable');
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      j: kb.addKey(Phaser.Input.Keyboard.KeyCodes.J),
      shift: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      potion: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      interact: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    };
  }

  sample(): InputCommand {
    const k = this.keys;
    const left = k.left!.isDown || k.a!.isDown;
    const right = k.right!.isDown || k.d!.isDown;
    const up = k.up!.isDown || k.w!.isDown;
    const down = k.down!.isDown || k.s!.isDown;
    return {
      moveX: (right ? 1 : 0) - (left ? 1 : 0),
      moveY: (down ? 1 : 0) - (up ? 1 : 0),
      attack: k.space!.isDown || k.j!.isDown,
      ability: k.shift!.isDown || k.k!.isDown,
      // Rising-edge so one press spends exactly one potion, even across the
      // several sim ticks a single render frame may step.
      usePotion: Phaser.Input.Keyboard.JustDown(k.potion!),
      join: false,
      leave: false,
      interact: k.interact!.isDown
    };
  }
}

/**
 * Reads one pad as a plain snapshot, or null when that slot is empty.
 *
 * Phaser refreshes its pad list from `navigator.getGamepads()` every update, so
 * a pad connected mid-run simply starts returning a snapshot here — hot-plug
 * needs no event handling of its own.
 */
export function readPad(scene: Phaser.Scene, index: number): PadSnapshot | null {
  const pad = scene.input.gamepad?.getPad(index);
  if (!pad || !pad.connected) return null;
  return {
    axes: pad.axes.map((axis) => axis.getValue()),
    buttons: pad.buttons.map((button) => button.pressed)
  };
}

/** Gamepad → per-tick InputCommand, for one pad slot. */
export class GamepadCommander implements Commander {
  private previous: PadSnapshot | null = null;

  constructor(
    private scene: Phaser.Scene,
    private index = 0
  ) {}

  sample(): InputCommand {
    const pad = readPad(this.scene, this.index);
    const command = padCommand(pad, this.previous);
    this.previous = pad;
    return command;
  }
}

/**
 * One player slot's input. Slot 0 answers to the keyboard *and* pad 0 at once,
 * which is what makes hot-plug a non-event: the keyboard never stops working,
 * and a pad plugged in mid-run starts contributing on its next sampled frame.
 * Later slots are pad-only, because a shared keyboard is not a couch layout.
 */
export class PlayerCommander implements Commander {
  private keyboard: KeyboardCommander | null;
  private gamepad: GamepadCommander;

  constructor(scene: Phaser.Scene, slot: number) {
    this.keyboard = slot === 0 ? new KeyboardCommander(scene) : null;
    this.gamepad = new GamepadCommander(scene, slot);
  }

  sample(): InputCommand {
    const pad = this.gamepad.sample();
    if (!this.keyboard) return pad;
    return mergeCommands(this.keyboard.sample(), pad);
  }
}

/** A commander that never asks for anything; used when a slot has no device. */
export const IDLE_COMMANDER: Commander = { sample: () => EMPTY_INPUT };
