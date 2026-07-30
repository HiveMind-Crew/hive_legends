import type Phaser from 'phaser';

/**
 * The fullscreen toggle (issue #94).
 *
 * F rather than F11, which the browser owns and which we cannot intercept.
 * The Fullscreen API only works from a user gesture, and a keydown is one, so
 * the request has to originate here rather than from any scene lifecycle hook.
 *
 * Bind this in exactly one scene per running set: `MissionScene` and
 * `HudScene` are live at the same time, and binding both would toggle twice
 * per press and cancel itself out.
 */
export const FULLSCREEN_HINT = 'Fullscreen F';

export function bindFullscreenToggle(scene: Phaser.Scene): void {
  scene.input.keyboard?.on('keydown-F', () => {
    // `scale.fullscreen.available` is false headless (and in the e2e run), in
    // which case this is a no-op rather than an error.
    if (!scene.scale.fullscreen.available) return;
    if (scene.scale.isFullscreen) scene.scale.stopFullscreen();
    else scene.scale.startFullscreen();
  });
}
