import Phaser from 'phaser';
import { readPad } from './input';
import { padMenuPresses, type MenuVerb, type PadSnapshot } from './padMapping';

/**
 * Pad → menu actions (issue #98).
 *
 * Every screen already routes its keys through a named handler; this binds the
 * same handlers to pad verbs, so the shell gains a gamepad without any screen
 * gaining a second set of rules. Nothing here decides *what* a verb means —
 * that stays with the scene, next to the key it mirrors.
 */
export type PadMenuHandlers = Partial<Record<MenuVerb, () => void>>;

/**
 * Polls pad 0 on this scene's update and fires handlers on rising edges.
 *
 * Scene-scoped on purpose: a paused scene stops updating, so a scene that
 * launches settings over itself cannot also answer the pad, and the binding
 * dies with the scene rather than outliving a `scene.start`.
 */
export function bindPadMenu(scene: Phaser.Scene, handlers: PadMenuHandlers): void {
  let previous: PadSnapshot | null = null;

  const poll = (): void => {
    const pad = readPad(scene, 0);
    for (const verb of padMenuPresses(pad, previous)) handlers[verb]?.();
    previous = pad;
  };

  scene.events.on(Phaser.Scenes.Events.UPDATE, poll);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.UPDATE, poll);
  });
}
