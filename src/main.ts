import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { HeroSelectScene } from './game/scenes/HeroSelectScene';
import { HudScene } from './game/scenes/HudScene';
import { MissionHubScene } from './game/scenes/MissionHubScene';
import { MissionScene } from './game/scenes/MissionScene';
import { ResultsScene } from './game/scenes/ResultsScene';
import { SettingsScene } from './game/scenes/SettingsScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // The one place the design resolution is written down. Every scene reads it
  // back through `this.scale.width`/`height` rather than repeating the numbers
  // (issue #94), so changing it here is the whole change.
  width: 960,
  height: 720,
  // FIT letterboxes the fixed 960x720 design resolution into whatever viewport
  // it is given: the game stays fully visible in a window smaller than its
  // native size and fills a larger one, while every scene keeps laying out
  // against a constant 960x720. RESIZE would hand scenes a varying logical
  // size, which the fixed HUD layout is not built for.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  backgroundColor: '#0a0a12',
  pixelArt: true,
  // Phaser's gamepad plugin is off by default (issue #98). A couch co-op
  // brawler cannot ship without it, and the plugin refreshes its pad list from
  // `navigator.getGamepads()` every update, so hot-plug costs nothing extra.
  input: { gamepad: true },
  // Flow: boot → hero select → the wheel → mission (HudScene runs alongside)
  // → results, which returns through the wheel.
  scene: [BootScene, HeroSelectScene, MissionHubScene, MissionScene, HudScene, ResultsScene, SettingsScene]
});
