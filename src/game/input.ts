import Phaser from 'phaser';
import type { InputCommand } from '../sim/types';

/**
 * Keyboard → per-tick InputCommand. WASD or arrows to move,
 * Space/J to attack, Shift/K for the hero ability.
 */
export class KeyboardCommander {
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
      k: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K)
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
      ability: k.shift!.isDown || k.k!.isDown
    };
  }
}
